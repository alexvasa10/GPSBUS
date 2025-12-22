import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RouteOption, ManeuverType } from '../types';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// --- CONSTANTS ---
const SAFE_DEFAULT_CENTER: [number, number] = [40.4168, -3.7038];

// --- MATH HELPERS (Geometría Esférica) ---
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

const isSafeNumber = (val: any): val is number => 
  typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);

const isSafeCoordinate = (coords: any): coords is [number, number] => 
  Array.isArray(coords) && coords.length === 2 && isSafeNumber(coords[0]) && isSafeNumber(coords[1]);

// Force invalid coordinates to a safe default to prevent crashes
const sanitizeCoordinate = (coords: any): [number, number] => {
  if (isSafeCoordinate(coords)) return coords;
  return SAFE_DEFAULT_CENTER;
};

// Distancia exacta entre dos coordenadas (Haversine) - Safe Version
const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  if (!isSafeNumber(lat1) || !isSafeNumber(lng1) || !isSafeNumber(lat2) || !isSafeNumber(lng2)) return 0;
  
  const R = 6371e3; // Radio tierra metros
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            
  // Clamp 'a' to [0, 1] to avoid Math.sqrt(negative) due to float precision
  const clampedA = Math.min(1, Math.max(0, a));
  
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  return R * c;
};

// Ángulo de dirección para rotar el icono (Bearing)
const getBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  if (!isSafeNumber(lat1) || !isSafeNumber(lng1) || !isSafeNumber(lat2) || !isSafeNumber(lng2)) return 0;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
};

// --- AUDIO ENGINE (TTS) ---
const speak = (text: string, priority: boolean = false) => {
  if (!window.speechSynthesis) return;
  
  // Clean text for speech (remove visuals cues like emojis if any)
  const cleanText = text.replace(/⚠️|🛑|✅/g, '');

  if (priority) {
    window.speechSynthesis.cancel();
  }
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'es-ES';
  utterance.rate = 1.05; 
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
};

const getManeuverText = (type: ManeuverType): string => {
    switch (type) {
        case 'turn-left': return "girar a la izquierda";
        case 'turn-right': return "girar a la derecha";
        case 'slight-left': return "mantente a la izquierda";
        case 'slight-right': return "mantente a la derecha";
        case 'u-turn': return "dar media vuelta";
        case 'roundabout': return "entrar en la rotonda";
        case 'exit': return "tomar la salida";
        case 'merge': return "incorporarte";
        case 'end': return "llegar al destino";
        default: return "continuar";
    }
};

// --- LEAFLET CONFIG ---
const createRotatedBusIcon = (rotation: number) => {
  const safeRotation = isSafeNumber(rotation) ? rotation : 0;
  return L.divIcon({
    className: 'custom-bus-icon',
    html: `<div style="
      transform: rotate(${safeRotation}deg); 
      transition: transform 0.1s linear; 
      display: flex; 
      justify-content: center; 
      align-items: center;
      width: 56px; height: 56px;
    ">
       <img src="https://cdn-icons-png.flaticon.com/512/3448/3448339.png" style="width: 100%; height: 100%; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.4));" />
    </div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28] 
  });
};

// --- SUB-COMPONENTES MEMOIZADOS ---

const RouteLine = React.memo(({ positions }: { positions: [number, number][] }) => {
  if (!positions || positions.length === 0) return null;
  const validPositions = positions.filter(p => isSafeCoordinate(p));
  if (validPositions.length < 2) return null;

  return (
    <>
      <Polyline positions={validPositions} color="#000" weight={14} opacity={0.2} lineCap="round" lineJoin="round" />
      <Polyline positions={validPositions} color="#3b82f6" weight={10} opacity={1} lineCap="round" lineJoin="round" />
      <Polyline positions={validPositions} color="#ffffff" weight={2} opacity={0.5} lineCap="round" lineJoin="round" dashArray="10, 20" />
    </>
  );
});

const BusMarker = React.memo(({ position, rotation }: { position: [number, number], rotation: number }) => {
  if (!isSafeCoordinate(position)) return null;
  const icon = useMemo(() => createRotatedBusIcon(rotation), [rotation]);
  return <Marker position={position} icon={icon} zIndexOffset={9999} />;
});

// Calculate appropriate zoom level based on speed (km/h)
const getDynamicZoom = (speedKmh: number) => {
  if (speedKmh < 30) return 18; // Slow/Stopped: High detail
  if (speedKmh < 60) return 17; // City: Moderate detail
  if (speedKmh < 90) return 16; // Fast road: See ahead
  return 15; // Highway: Max view ahead
};

const MapController = React.memo(({ center, isDriving, heading, speed }: { center: [number, number], isDriving: boolean, heading: number, speed: number }) => {
  const map = useMap();
  const initialized = useRef(false);

  // Initial View & Resize Fix
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (!initialized.current && isSafeCoordinate(center)) {
        try {
          map.setView(center, 15);
          initialized.current = true;
        } catch (e) {
          // Silent catch
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [map, center]);

  // Tracking View with Dynamic Zoom
  useEffect(() => {
    if (isDriving && isSafeCoordinate(center)) {
      try {
        const targetZoom = getDynamicZoom(speed);
        map.setView(center, targetZoom, { 
          animate: true,
          duration: 1.0 
        });
      } catch (e) {
         // Prevent Leaflet error
      }
    }
  }, [map, center, isDriving, speed]);

  return null;
});

const ManeuverIcon: React.FC<{ type: ManeuverType; className?: string }> = ({ type, className = "w-12 h-12" }) => {
   const getPath = () => {
      switch (type) {
        case 'turn-left': return "M10 19l-7-7m0 0l7-7m-7 7h18";
        case 'turn-right': return "M14 5l7 7m0 0l-7 7m7-7H3";
        case 'slight-left': return "M16 19l-4-4m0 0l4-4m-4 4h8m-12 4l-4-4 4-4";
        case 'slight-right': return "M8 5l4 4m0 0l-4 4m4-4H4m12-4l4 4-4 4";
        case 'u-turn': return "M4 4v5a3 3 0 003 3h10a3 3 0 003-3V4";
        case 'roundabout': return "M4 4v5a3 3 0 003 3h10a3 3 0 003-3V4"; 
        case 'exit': return "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1";
        case 'merge': return "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4";
        case 'end': return "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z";
        default: return "M5 10l7-7m0 0l7 7m-7-7v18"; // Straight default
      }
   };
   
   const rotateStyle = type === 'slight-left' ? { transform: 'rotate(45deg)' } : 
                       type === 'slight-right' ? { transform: 'rotate(-45deg)' } : {};

   return (
     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d={getPath()} style={rotateStyle} />
     </svg>
   );
};

interface Props {
  route: RouteOption;
  onReset: () => void;
}

// --- MAIN COMPONENT ---
const RouteResult: React.FC<Props> = ({ route, onReset }) => {
  const steps = route.steps || [];
  
  const [stepIndex, setStepIndex] = useState(0);
  const [isDriving, setIsDriving] = useState(false);
  const [gpsMode, setGpsMode] = useState<'simulated' | 'real'>('simulated');
  const [distanceToNext, setDistanceToNext] = useState<number>(0);
  
  const [vehiclePos, setVehiclePos] = useState<[number, number]>(SAFE_DEFAULT_CENTER);
  const [heading, setHeading] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  
  // Simulation Refs
  const reqRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  
  // Real GPS Refs
  const watchIdRef = useRef<number | null>(null);
  
  // Announcement Refs (Using Set to track multiple announcements per step)
  const announcedRef = useRef<Set<string>>(new Set());

  const routePoints = useMemo(() => {
    let points: [number, number][] = [];
    if (route.path && route.path.length > 2) {
      points = route.path.filter(isSafeCoordinate);
    } else {
      steps.forEach(s => {
         const lat = Number(s.start_location?.lat);
         const lng = Number(s.start_location?.lng);
         if(isSafeNumber(lat) && isSafeNumber(lng)) {
             points.push([lat, lng]);
         }
      });
    }
    if (points.length === 0) points.push([...SAFE_DEFAULT_CENTER]);
    return points;
  }, [route.path, steps]);

  useEffect(() => {
    if (routePoints.length > 0 && isSafeCoordinate(routePoints[0])) {
      setVehiclePos(routePoints[0]);
    }
  }, [routePoints]);

  // --- LOGICA DE NAVEGACIÓN COMPARTIDA ---
  const checkNavigationLogic = (currentLat: number, currentLng: number) => {
    if (stepIndex < steps.length - 1) {
       const nextStep = steps[stepIndex + 1];
       const nLat = Number(nextStep.start_location?.lat);
       const nLng = Number(nextStep.start_location?.lng);
       
       if (isSafeNumber(nLat) && isSafeNumber(nLng)) {
          const distMeters = Math.round(getDistance(currentLat, currentLng, nLat, nLng));
          
          if (isSafeNumber(distMeters)) {
             setDistanceToNext(distMeters);

             const stepId = `step-${stepIndex}`;
             const maneuverText = getManeuverText(nextStep.maneuver);

             // 1. HAZARD WARNINGS (Highest Priority)
             if (nextStep.hazardWarning) {
                 // Early Warning (800m)
                 if (distMeters <= 800 && distMeters > 700 && !announcedRef.current.has(`${stepId}-haz-early`)) {
                     speak(`Atención en ruta. ${nextStep.hazardWarning}`, true);
                     announcedRef.current.add(`${stepId}-haz-early`);
                 }
                 // Critical Warning (200m)
                 if (distMeters <= 200 && distMeters > 150 && !announcedRef.current.has(`${stepId}-haz-crit`)) {
                     speak(`¡Precaución! ${nextStep.hazardWarning}`, true);
                     announcedRef.current.add(`${stepId}-haz-crit`);
                 }
             }

             // 2. NAVIGATION INSTRUCTIONS
             // Distant Warning (500m)
             if (distMeters <= 500 && distMeters > 450 && !announcedRef.current.has(`${stepId}-500m`)) {
                 speak(`En 500 metros, ${maneuverText}. ${nextStep.instruction}`);
                 announcedRef.current.add(`${stepId}-500m`);
             }

             // Preparation Warning (200m)
             if (distMeters <= 200 && distMeters > 150 && !announcedRef.current.has(`${stepId}-200m`)) {
                 speak(`A 200 metros, prepárate para ${maneuverText}`);
                 announcedRef.current.add(`${stepId}-200m`);
             }

             // Immediate Action (50m)
             if (distMeters <= 50 && distMeters > 30 && !announcedRef.current.has(`${stepId}-now`)) {
                 speak(`${maneuverText} ahora`);
                 announcedRef.current.add(`${stepId}-now`);
             }

             // TRIGGER NEXT STEP
             // Reduced threshold to 25m for better precision
             if (distMeters < 25) {
                setStepIndex(prev => prev + 1);
                // Note: We don't clear announcedRef here immediately as we might need history,
                // but since we key by stepIndex, it's fine.
                const audio = new Audio('https://actions.google.com/sounds/v1/cartoon/pop.ogg');
                audio.volume = 0.3;
                audio.play().catch(() => {});
             }
          }
       }
    } else {
        setDistanceToNext(0);
        if (stepIndex === steps.length - 1 && !announcedRef.current.has('finished')) {
             speak("Has llegado a tu destino.");
             announcedRef.current.add('finished');
             setIsDriving(false);
        }
    }
  };

  // --- MODO SIMULACIÓN ---
  const simulateFrame = () => {
    if (routePoints.length < 2) return;
    
    if (!isSafeNumber(progressRef.current)) {
        progressRef.current = 0;
    }

    if (progressRef.current >= routePoints.length - 1.001) {
      setIsDriving(false);
      setSpeed(0);
      return;
    }

    const curIdx = Math.floor(progressRef.current);
    const nextIdx = curIdx + 1;
    
    if (curIdx < 0 || nextIdx >= routePoints.length) {
        progressRef.current = Math.min(Math.max(0, curIdx), routePoints.length - 1);
        return;
    }

    const p1 = routePoints[curIdx];
    const p2 = routePoints[nextIdx];

    if (!isSafeCoordinate(p1) || !isSafeCoordinate(p2)) {
      progressRef.current = nextIdx;
      reqRef.current = requestAnimationFrame(simulateFrame);
      return;
    }

    const segmentLen = getDistance(p1[0], p1[1], p2[0], p2[1]);
    
    // Smooth speed adjustment
    const targetSpeedKmh = segmentLen > 100 ? 90 : segmentLen > 50 ? 60 : 30;
    
    setSpeed(prev => {
        if (!isSafeNumber(prev)) return 0;
        const nextSpeed = prev + (targetSpeedKmh - prev) * 0.05;
        return isSafeNumber(nextSpeed) ? nextSpeed : 0;
    });

    const currentSpeed = Math.max(speed, 10); 
    const frameDist = (currentSpeed / 3.6) / 60; 
    const advanceFraction = (isSafeNumber(segmentLen) && segmentLen > 0.1) ? frameDist / segmentLen : 1; 

    if (isSafeNumber(advanceFraction)) {
        progressRef.current += advanceFraction;
    } else {
        progressRef.current += 0.01;
    }

    const localT = progressRef.current - curIdx;
    const newLat = Number(p1[0]) + (Number(p2[0]) - Number(p1[0])) * localT;
    const newLng = Number(p1[1]) + (Number(p2[1]) - Number(p1[1])) * localT;

    if (isSafeNumber(newLat) && isSafeNumber(newLng)) {
       setVehiclePos([newLat, newLng]);
       const newHeading = getBearing(p1[0], p1[1], p2[0], p2[1]);
       if (isSafeNumber(newHeading)) setHeading(newHeading);
       
       checkNavigationLogic(newLat, newLng);
    }

    reqRef.current = requestAnimationFrame(simulateFrame);
  };

  // --- MODO GPS REAL ---
  const startRealGPS = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta GPS.");
      setGpsMode('simulated');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading: gpsHeading, speed: gpsSpeed, accuracy } = pos.coords;
        setGpsAccuracy(isSafeNumber(accuracy) ? accuracy : null);
        
        if (isSafeNumber(latitude) && isSafeNumber(longitude)) {
           setVehiclePos([latitude, longitude]);
           if (isSafeNumber(gpsHeading)) setHeading(gpsHeading);
           if (isSafeNumber(gpsSpeed)) setSpeed(gpsSpeed * 3.6);
           checkNavigationLogic(latitude, longitude);
        }
      },
      (err) => {
        console.warn("Error GPS:", err);
        speak("Se perdió la señal GPS.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000
      }
    );
    watchIdRef.current = id;
    speak("GPS Conectado. Iniciando guía.");
  };

  // Lifecycle
  useEffect(() => {
    if (isDriving) {
      if (gpsMode === 'simulated') {
        reqRef.current = requestAnimationFrame(simulateFrame);
      } else {
        startRealGPS();
      }
    } else {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    return () => { 
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isDriving, gpsMode, routePoints, stepIndex, speed]); 

  const startDrive = (mode: 'simulated' | 'real') => {
    setGpsMode(mode);
    setIsDriving(true);
    setGpsAccuracy(null);
    if (steps.length > 0) {
      speak(`Iniciando ruta. ${steps[0].instruction}`);
    }
  };

  const stopDrive = () => {
    setIsDriving(false);
    setGpsAccuracy(null);
    window.speechSynthesis.cancel();
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  };

  const openNativeMaps = () => {
    const destination = steps[steps.length - 1]?.end_location 
       ? `${steps[steps.length - 1].end_location?.lat},${steps[steps.length - 1].end_location?.lng}` 
       : "";
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const currentStep = steps[stepIndex] || { maneuver: 'start', instruction: 'Calculando...', distance: '' };
  
  const safePos: [number, number] = useMemo(() => {
     return sanitizeCoordinate(vehiclePos);
  }, [vehiclePos]);

  return (
    <div className="relative h-full w-full bg-gray-900 overflow-hidden font-sans select-none">
      
      {/* MAP LAYER */}
      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={SAFE_DEFAULT_CENTER} 
          zoom={15} 
          zoomControl={false} 
          attributionControl={false}
          className="w-full h-full"
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
            maxNativeZoom={19}
            maxZoom={20}
          />
          <MapController center={safePos} isDriving={isDriving} heading={heading} speed={speed} />
          {/* Draw the high resolution path from OSRM */}
          <RouteLine positions={routePoints} />
          <BusMarker position={safePos} rotation={heading} />
        </MapContainer>
      </div>

      {/* TOP INSTRUCTIONS */}
      <div className={`absolute top-0 left-0 right-0 z-20 transition-all duration-500 transform ${isDriving ? 'translate-y-0' : 'translate-y-2'}`}>
         <div className="bg-slate-900 text-white px-5 py-4 rounded-b-3xl shadow-2xl mx-2 flex items-center justify-between min-h-[120px] border-b-4 border-slate-800">
            <div className="bg-yellow-400 text-slate-900 p-3 rounded-2xl shadow-lg mr-4 shrink-0">
               <ManeuverIcon type={currentStep.maneuver} className="w-12 h-12" />
            </div>

            <div className="flex-1 overflow-hidden">
               <div className="flex items-baseline space-x-2">
                 <span className="text-4xl font-black tracking-tighter">{isDriving ? distanceToNext : currentStep.distance}</span>
                 <span className="text-lg font-bold text-gray-400">{isDriving ? 'm' : ''}</span>
               </div>
               <div className="text-xl font-bold leading-tight text-white mt-1 truncate">
                 {currentStep.instruction}
               </div>
            </div>
         </div>

         {currentStep.hazardWarning && (
            <div className="mx-4 mt-2 bg-red-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center justify-center border-2 border-white animate-pulse">
               <span className="font-black uppercase tracking-wide text-sm">⚠️ {currentStep.hazardWarning}</span>
            </div>
         )}
      </div>

      {/* GPS STATUS */}
      {isDriving && gpsMode === 'real' && (
         <div className={`absolute top-40 right-4 z-20 bg-black/50 backdrop-blur px-3 py-1 rounded-full border flex items-center transition-colors duration-500 ${
             !gpsAccuracy || gpsAccuracy < 20 ? 'border-green-500/50' : 
             gpsAccuracy < 50 ? 'border-yellow-500/50' : 'border-red-500/50'
         }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse mr-2 ${
                 !gpsAccuracy || gpsAccuracy < 20 ? 'bg-green-500' : 
                 gpsAccuracy < 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}></div>
            <span className="text-xs text-white font-mono">
                GPS LIVE {gpsAccuracy ? `(±${Math.round(gpsAccuracy)}m)` : ''}
            </span>
         </div>
      )}

      {/* BOTTOM CONTROLS */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-6 px-4 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent pt-20 pointer-events-none">
         <div className="flex items-end justify-between pointer-events-auto gap-2">
            
            <div className="bg-white rounded-2xl p-3 shadow-xl min-w-[90px] hidden md:block">
               <div className="text-xs text-gray-400 font-bold uppercase mb-1">Destino</div>
               <div className="text-sm font-bold text-green-500">
                  {route.summary.totalDuration}
               </div>
            </div>

            {isDriving && (
              <div className="bg-white/90 backdrop-blur-md rounded-full w-20 h-20 flex flex-col items-center justify-center border-4 border-gray-100 shadow-2xl mb-2">
                 <span className="text-3xl font-black text-slate-800 leading-none">{Math.round(speed)}</span>
                 <span className="text-[9px] font-bold text-gray-400 uppercase">km/h</span>
              </div>
            )}

            {isDriving ? (
               <div className="flex flex-col gap-2">
                  <button 
                    onClick={openNativeMaps}
                    className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-full shadow-lg flex items-center justify-center"
                    title="Abrir en Google Maps"
                  >
                     <img src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg" className="w-6 h-6" alt="GMaps" />
                  </button>
                  <button 
                    onClick={stopDrive}
                    className="bg-red-500 hover:bg-red-600 text-white rounded-2xl p-4 shadow-xl font-black text-sm"
                  >
                    SALIR
                  </button>
               </div>
            ) : (
              <div className="flex gap-2 w-full">
                 <button 
                   onClick={() => startDrive('simulated')}
                   className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-2xl p-4 shadow-xl font-bold text-sm"
                 >
                   Simulación
                 </button>
                 <button 
                   onClick={() => startDrive('real')}
                   className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl p-4 shadow-xl font-bold flex items-center justify-center gap-2 text-sm"
                 >
                   <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                   Navegar GPS
                 </button>
              </div>
            )}
         </div>

         {!isDriving && (
           <button onClick={onReset} className="w-full mt-4 bg-white/10 backdrop-blur text-white font-bold py-3 rounded-xl hover:bg-white/20 transition-colors pointer-events-auto border border-white/20 text-sm">
             Cancelar Ruta
           </button>
         )}
      </div>

    </div>
  );
};

export default RouteResult;