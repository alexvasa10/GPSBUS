import { GoogleGenAI } from "@google/genai";
import { VehicleSpecs, RoutePlanResponse, Location, RouteOptions, RouteOption } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper para validar números estrictamente
const isValidNumber = (num: any): boolean => {
  return typeof num === 'number' && !isNaN(num) && isFinite(num);
};

// Helper seguro para parsear coordenadas con fallback y limpieza de strings
const parseCoordinate = (value: any, fallback: number): number => {
  if (value === null || value === undefined) return fallback;
  
  // Si ya es número y es válido
  if (typeof value === 'number' && isValidNumber(value)) {
    return value;
  }

  // Si viene como string, limpiar posibles errores de formato (ej: "40,123" -> "40.123")
  if (typeof value === 'string') {
     const cleaned = value.replace(',', '.').trim();
     const parsed = parseFloat(cleaned);
     if (isValidNumber(parsed)) {
       return parsed;
     }
  }
  
  // Si no se pudo obtener un número válido, usar fallback
  return fallback;
};

// Helper para normalizar texto (quitar acentos y minúsculas)
const normalizeText = (text: string): string => {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// --- OSRM INTEGRATION FOR ROAD GEOMETRY ---
const fetchRoadGeometry = async (waypoints: {lat: number, lng: number}[]): Promise<[number, number][]> => {
  if (waypoints.length < 2) return [];

  // OSRM expects {lon},{lat} separated by ;
  // We limit to roughly 20 waypoints to prevent URL length issues and server load, 
  // taking key points evenly distributed.
  const maxWaypoints = 20;
  let sampling = waypoints;
  
  if (waypoints.length > maxWaypoints) {
    const step = Math.ceil(waypoints.length / maxWaypoints);
    sampling = waypoints.filter((_, i) => i === 0 || i === waypoints.length - 1 || i % step === 0);
  }

  const coordinatesString = sampling
    .map(p => `${p.lng},${p.lat}`)
    .join(';');

  const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesString}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("OSRM Failed");
    const data = await response.json();
    
    if (data.routes && data.routes[0] && data.routes[0].geometry) {
       // OSRM returns [lon, lat], Leaflet needs [lat, lon]
       return data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
    }
    return [];
  } catch (e) {
    console.warn("Could not fetch road geometry, falling back to straight lines", e);
    // Fallback: just return the waypoints as the path
    return waypoints.map(p => [p.lat, p.lng]);
  }
};


export const planBusRoute = async (
  origin: string,
  destination: string,
  specs: VehicleSpecs,
  options: RouteOptions,
  userLocation?: Location
): Promise<RoutePlanResponse> => {
  // Using a stable model alias suitable for tools
  const modelId = "gemini-2.0-flash-exp"; 

  // Instrucción mejorada para rutas escénicas vs eficiencia
  const scenicInstruction = options.isScenic 
    ? "MODO TURISMO ACTIVO: Debes generar obligatoriamente una opción etiquetada como 'Ruta Escénica'. Esta ruta debe evitar autopistas monótonas y priorizar carreteras secundarias AMPLIAS y seguras con vistas panorámicas (montaña, costa, bosque) y bajo tráfico. IMPORTANTE: Verifica doblemente las restricciones de altura/peso para no enviar el autobús por pueblos estrechos."
    : "Modo Estándar: Prioriza la eficiencia, el menor tiempo de llegada y el uso de autopistas principales.";

  // Coordenadas por defecto (Madrid - Puerta del Sol) para fallbacks seguros
  const DEFAULT_LAT = 40.4168;
  const DEFAULT_LNG = -3.7038;

  let safeUserLat = DEFAULT_LAT;
  let safeUserLng = DEFAULT_LNG;
  let hasUserLocation = false;

  if (userLocation && isValidNumber(userLocation.latitude) && isValidNumber(userLocation.longitude)) {
    safeUserLat = userLocation.latitude;
    safeUserLng = userLocation.longitude;
    hasUserLocation = true;
  }

  let finalOrigin = origin;
  const normalizedOrigin = normalizeText(origin);
  const locationKeywords = ["ubicacion", "location", "posicion", "aqui", "mi zona", "actual"];
  
  if (hasUserLocation && locationKeywords.some(kw => normalizedOrigin.includes(kw))) {
      finalOrigin = `Coordenadas GPS: ${safeUserLat}, ${safeUserLng}`;
  }

  const systemInstruction = `
    Eres un API JSON estricto para un navegador GPS de autobuses profesionales.
    Tu trabajo es recibir origen/destino y devolver una lista de rutas en formato JSON puro.
    
    REGLAS CRÍTICAS DE SEGURIDAD:
    1. Usa la herramienta Google Maps para validar la existencia de las carreteras.
    2. IMPORTANTE: El vehículo es PESADO y GRANDE. Evita terminantemente cascos históricos, calles estrechas o giros agudos imposibles para un autobús.
    3. Si no encuentras rutas específicas para "Autobús", usa rutas de "Coche" pero INCLUYE ALERTAS CRÍTICAS en el array 'hazards' si hay riesgo de altura o peso.
    
    FORMATO DE RESPUESTA:
    1. NUNCA devuelvas texto conversacional. SOLO JSON.
    2. NUNCA devuelvas una lista de rutas vacía. Si falla la búsqueda exacta, estima una ruta directa viable.
    3. Si se pide 'Ruta Escénica', una de las opciones debe tener "label": "Ruta Escénica [Descripción]" y priorizar el paisaje sobre el tiempo.
    
    ESTRUCTURA JSON OBLIGATORIA:
    {
      "routes": [
        {
          "id": "ruta_1",
          "label": "Nombre corto (ej. Por A-6 o Ruta Escénica Costera)",
          "isRecommended": boolean,
          "summary": {
            "totalDistance": "ej. 15 km",
            "totalDuration": "ej. 20 min",
            "trafficCondition": "fluid" | "moderate" | "heavy",
            "tollRoads": boolean,
            "trafficNote": "nota corta de tráfico o paisaje"
          },
          "hazards": ["Texto alerta"],
          "steps": [
            {
              "maneuver": "straight" | "turn-left" | "turn-right" | "roundabout" | "exit" | "start" | "end",
              "instruction": "Instrucción visual corta",
              "distance": "distancia del paso",
              "start_location": { "lat": number, "lng": number },
              "hazardWarning": "aviso opcional (ej. Puente bajo 4.0m)"
            }
          ]
        }
      ]
    }
  `;

  const prompt = `
    Origen: "${finalOrigin}"
    Destino: "${destination}"
    Vehículo: ${specs.name} (Alto:${specs.height}m, Ancho:${specs.width}m, Peso:${specs.weight}t).
    Estrategia de Ruta: ${scenicInstruction}
    
    Genera 2 o 3 opciones de ruta variadas.
    Si es ruta escénica, destaca en 'trafficNote' qué paisaje se ve (ej. "Vistas a la sierra").
    Asegúrate de incluir coordenadas lat/lng precisas extraídas de Google Maps para cada paso.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.4, // Reduce creativity to encourage strict JSON
        tools: [{ googleMaps: {} }],
        ...(hasUserLocation ? {
            toolConfig: {
              retrievalConfig: {
                  latLng: {
                    latitude: safeUserLat,
                    longitude: safeUserLng
                  }
              }
            }
        } : {})
      }
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    let routes: RouteOption[] = [];

    try {
      let text = response.text || "{}";
      // Aggressive cleanup for Markdown blocks
      text = text.replace(/```json/gi, "").replace(/```/g, "").replace(/code_output/gi, "").trim();
      
      // Extract JSON object if embedded in text
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
          text = text.substring(firstBrace, lastBrace + 1);
      }

      let parsed: any = {};
      try {
        parsed = JSON.parse(text);
      } catch (parseError) {
        console.warn("JSON parse failed. Raw text:", text);
        throw parseError;
      }

      // Handle cases where model returns array directly or wrapped object
      const rawRoutes = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.routes) ? parsed.routes : []);
      
      if (rawRoutes.length === 0) {
        throw new Error("No routes found in JSON response");
      }
      
      // Process routes in parallel to fetch geometries
      routes = await Promise.all(rawRoutes.map(async (route: any) => {
          let lastValidLat = safeUserLat;
          let lastValidLng = safeUserLng;
          
          const rawSteps = Array.isArray(route.steps) ? route.steps : [];
          
          const sanitizedSteps = rawSteps.map((step: any) => {
              const rawLat = step.start_location?.lat ?? step.start_location?.latitude;
              const rawLng = step.start_location?.lng ?? step.start_location?.longitude;

              const lat = parseCoordinate(rawLat, lastValidLat);
              const lng = parseCoordinate(rawLng, lastValidLng);
              
              lastValidLat = lat;
              lastValidLng = lng;

              return {
                  ...step,
                  maneuver: step.maneuver || 'straight', // default maneuver
                  instruction: step.instruction || "Continúa",
                  distance: step.distance || "",
                  start_location: { lat, lng }
              };
          });

          // Ensure start step
          if (sanitizedSteps.length === 0) {
            sanitizedSteps.push({
                maneuver: "start",
                instruction: "Iniciando ruta...",
                distance: "0 m",
                start_location: { lat: safeUserLat, lng: safeUserLng }
            });
          }

          // --- FETCH DETAILED GEOMETRY ---
          // Extract waypoints from steps to query OSRM
          const waypoints = sanitizedSteps.map((s: any) => s.start_location);
          let path: [number, number][] = [];
          
          if (waypoints.length >= 2) {
             path = await fetchRoadGeometry(waypoints);
          } else {
             path = waypoints.map((p: any) => [p.lat, p.lng]);
          }

          return {
              id: route.id || `route_${Math.random().toString(36).substr(2, 9)}`,
              label: route.label || "Ruta Sugerida",
              isRecommended: !!route.isRecommended,
              summary: {
                totalDistance: route.summary?.totalDistance || "Calculando...",
                totalDuration: route.summary?.totalDuration || "Calculando...",
                trafficCondition: route.summary?.trafficCondition || "fluid",
                trafficNote: route.summary?.trafficNote,
                tollRoads: !!route.summary?.tollRoads
              },
              hazards: Array.isArray(route.hazards) ? route.hazards : [],
              steps: sanitizedSteps,
              path: path
          };
      }));

    } catch (e) {
      console.warn("Error parsing Gemini response, using fallback.", e);
      
      // If prompt contained origin/dest, we can try to make a dummy line
      routes = [{
        id: "fallback",
        label: "Ruta Directa (Estimada)",
        isRecommended: true,
        summary: { 
            totalDistance: "Distancia aprox.", 
            totalDuration: "Tiempo aprox.", 
            trafficCondition: "moderate",
            trafficNote: "Ruta generada sin detalles de tráfico"
        },
        steps: [{ 
            maneuver: "start", 
            instruction: `Dirígete hacia el destino. (Detalles no disponibles)`, 
            distance: "0 m",
            start_location: { lat: safeUserLat, lng: safeUserLng }
        }],
        path: [[safeUserLat, safeUserLng], [safeUserLat + 0.01, safeUserLng + 0.01]], // Small diagonal line so map doesn't crash
        hazards: ["Conexión de ruta limitada - Verifica señales"]
      }];
    }
    
    return {
      routes,
      groundingChunks
    };

  } catch (error) {
    console.error("Critical error in Gemini Service:", error);
    throw new Error("No se pudo conectar con el servicio de navegación.");
  }
};