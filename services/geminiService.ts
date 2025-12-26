import { GoogleGenAI } from "@google/genai";
import { VehicleSpecs, RoutePlanResponse, Location, RouteOptions, RouteOption } from "../types";

// --- VALIDATION HELPERS ---
const isValidNumber = (num: any): boolean => {
  return typeof num === 'number' && !isNaN(num) && Number.isFinite(num);
};

const SAFE_LAT = 40.4168; // Madrid Sol
const SAFE_LNG = -3.7038;

// Parseo ultra-seguro de coordenadas
const parseCoordinate = (value: any, fallback: number): number => {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) return fallback; // Prevent array erroneously passed
  
  if (typeof value === 'number') {
    return isValidNumber(value) ? value : fallback;
  }

  if (typeof value === 'string') {
     try {
       // Elimina todo lo que no sea digito, punto, coma o signo menos
       const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.').trim();
       if (!cleaned) return fallback;
       
       const parsed = parseFloat(cleaned);
       return isValidNumber(parsed) ? parsed : fallback;
     } catch (e) {
       return fallback;
     }
  }
  return fallback;
};

// Función para eliminar duplicados exactos consecutivos
const removeDuplicateCoords = (coords: [number, number][]): [number, number][] => {
  if (coords.length === 0) return coords;
  
  const result: [number, number][] = [coords[0]];
  
  for (let i = 1; i < coords.length; i++) {
    const prev = result[result.length - 1];
    const curr = coords[i];
    
    // Solo agregar si es diferente al anterior (con tolerancia mínima)
    if (Math.abs(prev[0] - curr[0]) > 0.00001 || Math.abs(prev[1] - curr[1]) > 0.00001) {
      result.push(curr);
    }
  }
  
  return result;
};

// Validación estricta de coordenadas
const validateAndCleanCoord = (coord: any): [number, number] | null => {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  
  // Explicit casting to number to avoid any hidden types
  const lat = Number(coord[0]);
  const lng = Number(coord[1]);
  
  if (!isValidNumber(lat) || !isValidNumber(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  
  return [lat, lng];
};

// --- OSRM SERVICE ---
const fetchRoadGeometry = async (waypoints: {lat: number, lng: number}[]): Promise<[number, number][]> => {
  // 1. Filtrado previo estricto
  const validWaypoints = (waypoints || []).filter(wp => 
    wp && isValidNumber(wp.lat) && isValidNumber(wp.lng) &&
    wp.lat >= -90 && wp.lat <= 90 && wp.lng >= -180 && wp.lng <= 180
  );

  if (validWaypoints.length < 2) return [];

  // 2. Sampling para evitar URLs gigantes
  const maxWaypoints = 20;
  let sampling = validWaypoints;
  if (validWaypoints.length > maxWaypoints) {
    const step = Math.ceil(validWaypoints.length / maxWaypoints);
    sampling = validWaypoints.filter((_, i) => i === 0 || i === validWaypoints.length - 1 || i % step === 0);
  }

  const coordinatesString = sampling
    .map(p => `${p.lng},${p.lat}`)
    .join(';');

  const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesString}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("OSRM Failed");
    const data = await response.json();
    
    // 3. Validación de respuesta OSRM
    if (data.routes?.[0]?.geometry?.coordinates && Array.isArray(data.routes[0].geometry.coordinates)) {
       const rawCoords = data.routes[0].geometry.coordinates;
       const cleanCoords: [number, number][] = [];
       
       for (const c of rawCoords) {
         // OSRM devuelve [lon, lat], Leaflet quiere [lat, lon]
         const validated = validateAndCleanCoord([c[1], c[0]]);
         if (validated) {
           cleanCoords.push(validated);
         }
       }
       
       // Eliminar duplicados consecutivos
       const deduplicated = removeDuplicateCoords(cleanCoords);
       return deduplicated.length > 0 ? deduplicated : validWaypoints.map(p => [p.lat, p.lng]);
    }
    return validWaypoints.map(p => [p.lat, p.lng]);
  } catch (e) {
    console.warn("OSRM fallback:", e);
    return validWaypoints.map(p => [p.lat, p.lng]);
  }
};

export const planBusRoute = async (
  origin: string,
  destination: string,
  specs: VehicleSpecs,
  options: RouteOptions,
  userLocation?: Location
): Promise<RoutePlanResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-2.0-flash-exp"; 

  // Preparar ubicación de usuario segura
  let safeUserLat = SAFE_LAT;
  let safeUserLng = SAFE_LNG;
  let hasUserLocation = false;

  // Paranoid check for user location
  if (userLocation && isValidNumber(userLocation.latitude) && isValidNumber(userLocation.longitude)) {
    safeUserLat = Number(userLocation.latitude);
    safeUserLng = Number(userLocation.longitude);
    hasUserLocation = true;
  }

  // Injectar coordenadas si el usuario dice "mi ubicación"
  let finalOrigin = origin;
  const normalizedOrigin = origin.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (hasUserLocation && (normalizedOrigin.includes("ubicacion") || normalizedOrigin.includes("aqui"))) {
      finalOrigin = `${safeUserLat}, ${safeUserLng}`;
  }

  const systemInstruction = `
    Eres un API JSON estricto para rutas de autobús.
    Retorna JSON puro. Sin markdown.
    Usa Google Maps para validar.
    
    JSON Schema:
    {
      "routes": [
        {
          "id": "string",
          "label": "string",
          "isRecommended": boolean,
          "summary": {
             "totalDistance": "string",
             "totalDuration": "string",
             "trafficCondition": "fluid" | "moderate" | "heavy",
             "tollRoads": boolean,
             "trafficNote": "string"
          },
          "hazards": ["string"],
          "steps": [
            {
               "maneuver": "straight" | "turn-left" | "turn-right" | "roundabout" | "exit" | "merge" | "end",
               "instruction": "string",
               "distance": "string",
               "start_location": { "lat": number, "lng": number },
               "hazardWarning": "string"
            }
          ]
        }
      ]
    }
  `;

  const prompt = `
    Ruta para Autocar ${specs.name} (Al:${specs.height}m, An:${specs.width}m, L:${specs.length}m, P:${specs.weight}t).
    Origen: "${finalOrigin}"
    Destino: "${destination}"
    Modo: ${options.isScenic ? "TURISTICO/ESCENICO" : "RAPIDO/EFICIENTE"}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: "application/json",
        tools: [{ googleMaps: {} }],
        ...(hasUserLocation ? {
            toolConfig: { retrievalConfig: { latLng: { latitude: safeUserLat, longitude: safeUserLng } } }
        } : {})
      }
    });

    const groundingChunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as any;
    let routes: RouteOption[] = [];

    try {
      // Limpieza de JSON string
      let text = response.text || "{}";
      text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
          text = text.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(text);
      const rawRoutes = Array.isArray(parsed.routes) ? parsed.routes : [];
      
      if (rawRoutes.length === 0) throw new Error("No routes in JSON");

      routes = await Promise.all(rawRoutes.map(async (route: any) => {
          let lastValidLat = safeUserLat;
          let lastValidLng = safeUserLng;

          const sanitizedSteps = (Array.isArray(route.steps) ? route.steps : []).map((step: any) => {
              // Safe access to step properties
              if (!step) return null;

              const rawLat = step.start_location?.lat ?? step.start_location?.latitude;
              const rawLng = step.start_location?.lng ?? step.start_location?.longitude;

              const lat = parseCoordinate(rawLat, lastValidLat);
              const lng = parseCoordinate(rawLng, lastValidLng);
              
              // Validar rango de coordenadas
              const validLat = (lat >= -90 && lat <= 90) ? lat : lastValidLat;
              const validLng = (lng >= -180 && lng <= 180) ? lng : lastValidLng;
              
              if (isValidNumber(validLat) && isValidNumber(validLng)) {
                  lastValidLat = validLat;
                  lastValidLng = validLng;
              }

              return {
                  ...step,
                  maneuver: step.maneuver || 'straight',
                  instruction: step.instruction || "",
                  distance: step.distance || "",
                  start_location: { lat: validLat, lng: validLng }
              };
          }).filter(Boolean); // Filter out null steps

          // Si no hay pasos validos, crear uno dummy
          if (sanitizedSteps.length === 0) {
             sanitizedSteps.push({
                 maneuver: "start",
                 instruction: "Inicio",
                 distance: "0 m",
                 start_location: { lat: safeUserLat, lng: safeUserLng }
             });
          }

          // Obtener geometria detallada
          const waypoints = sanitizedSteps.map((s: any) => s.start_location);
          let path: [number, number][] = [];
          
          if (waypoints.length >= 2) {
             path = await fetchRoadGeometry(waypoints);
          }
          
          // Si OSRM falló, usar lineas rectas entre pasos
          if (path.length < 2) {
             path = waypoints.map((p: any) => [p.lat, p.lng]);
          }

          // Validación final del path con limpieza estricta
          const cleanPath: [number, number][] = [];
          for (const coord of path) {
            const validated = validateAndCleanCoord(coord);
            if (validated) {
              cleanPath.push(validated);
            }
          }
          
          // Eliminar duplicados exactos consecutivos
          const deduplicatedPath = removeDuplicateCoords(cleanPath);
          
          // Fallback absoluto si el path está vacío
          if (deduplicatedPath.length === 0) {
             deduplicatedPath.push([safeUserLat, safeUserLng]);
             deduplicatedPath.push([safeUserLat + 0.001, safeUserLng + 0.001]);
          }

          return {
              id: route.id || Math.random().toString(36),
              label: route.label || "Ruta",
              isRecommended: !!route.isRecommended,
              summary: {
                totalDistance: route.summary?.totalDistance || "-",
                totalDuration: route.summary?.totalDuration || "-",
                trafficCondition: route.summary?.trafficCondition || "fluid",
                trafficNote: route.summary?.trafficNote,
                tollRoads: !!route.summary?.tollRoads
              },
              hazards: Array.isArray(route.hazards) ? route.hazards : [],
              steps: sanitizedSteps,
              path: deduplicatedPath
          };
      }));

    } catch (e) {
      console.error("Parsing error", e);
      // Fallback Route en caso de error de parseo
      routes = [{
        id: "fallback",
        label: "Ruta Directa (Error)",
        isRecommended: false,
        summary: { totalDistance: "?", totalDuration: "?", trafficCondition: "moderate" },
        steps: [{ 
            maneuver: "start", 
            instruction: "Error calculando ruta detallada. Dirígete al destino.", 
            distance: "0 m",
            start_location: { lat: safeUserLat, lng: safeUserLng }
        }],
        path: [[safeUserLat, safeUserLng], [safeUserLat + 0.001, safeUserLng + 0.001]],
        hazards: []
      }];
    }

    return { routes, groundingChunks };

  } catch (error) {
    console.error("API Error", error);
    throw error;
  }
};