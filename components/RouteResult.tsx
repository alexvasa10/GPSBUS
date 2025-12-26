import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RouteOption } from '../types';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// --- CONFIGURACIÓN SEGURA ---
const SAFE_CENTER: [number, number] = [40.4168, -3.7038];
const DEFAULT_ZOOM = 18; // Zoom más cercano para navegación

// Función robusta para verificar coordenadas
const isValidCoord = (coord: any): coord is [number, number] => {
  if (!Array.isArray(coord) || coord.length !== 2) return false;
  
  const lat = Number(coord[0]);
  const lng = Number(coord[1]);
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) && 
    !isNaN(lng) &&
    Number.isFinite(lat) && 
    Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
};

// Icono del autobús dinámico con rotación
const createBusIcon = (heading: number) => L.divIcon({
  className: 'bus-icon-dynamic',
  html: `<div style="
    transform: rotate(${heading}deg); 
    transition: transform 0.5s ease;
    width: 48px; 
    height: 48px; 
    display: flex; 
    justify-content: center; 
    align-items: center;
    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));
  ">
    <div style="
      background: #1a73e8;
      border: 3px solid white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      justify-content: center;
      align-items: center;
    ">
      <span style="font-size: 20px; display: block; margin-bottom: 2px;">🚌</span>
    </div>
    <!-- Arrow indicating direction -->
    <div style="
      position: absolute;
      top: -5px;
      left: 50%;
      transform: translateX(-50%);
      width: 0; 
      height: 0; 
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 8px solid #1a73e8;
    "></div>
  </div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24]
});

// Safe Marker Wrapper
const SafeMarker = ({ pos, heading }: { pos: [number, number], heading: number }) => {
  if (!isValidCoord(pos)) return null;
  // Usamos useMemo para no recrear el icono en cada render si el heading no cambia drásticamente
  const icon = useMemo(() => createBusIcon(heading), [heading]);
  return <Marker position={pos} icon={icon} zIndexOffset={1000} />;
};

// Componente lógico de Navegación
const NavigationController = ({ 
  currentPos, 
  heading, 
  isTracking, 
  setIsTracking 
}: { 
  currentPos: [number, number], 
  heading: number,
  isTracking: boolean,
  setIsTracking: (v: boolean) => void
}) => {
  const map = useMap();
  const firstRun = useRef(true);

  // Detectar arrastre manual para desactivar seguimiento
  useMapEvents({
    dragstart: () => {
      setIsTracking(false);
    }
  });

  useEffect(() => {
    if (isValidCoord(currentPos) && isTracking) {
      // Si es la primera carga, hacemos setView instantáneo, si no, flyTo suave
      if (firstRun.current) {
        map.setView(currentPos, DEFAULT_ZOOM);
        firstRun.current = false;
      } else {
        map.flyTo(currentPos, DEFAULT_ZOOM, {
          animate: true,
          duration: 1 // 1 segundo de animación para suavizar el movimiento GPS
        });
      }
    }
  }, [currentPos, isTracking, map]);

  return null;
};

const RouteResult: React.FC<{ route: RouteOption; onReset: () => void }> = ({ route, onReset }) => {
  // Estado de navegación en tiempo real
  const [currentPos, setCurrentPos] = useState<[number, number]>(SAFE_CENTER);
  const [heading, setHeading] = useState(0);
  const [isTracking, setIsTracking] = useState(true); // Empezar siguiendo al usuario
  const [speed, setSpeed] = useState<number | null>(0);

  // Limpieza inicial de la ruta (Estática)
  const cleanPath = useMemo(() => {
    if (!route?.path || !Array.isArray(route.path)) return [SAFE_CENTER];
    const validCoords = route.path
      .filter(isValidCoord)
      .map(p => [Number(p[0]), Number(p[1])] as [number, number]);
    return validCoords.length > 0 ? validCoords : [SAFE_CENTER];
  }, [route]);

  // Inicializar posición
  useEffect(() => {
    if (cleanPath.length > 0 && isValidCoord(cleanPath[0])) {
      setCurrentPos(cleanPath[0]);
    }
  }, []); // Solo al montar

  // 📡 GEOLOCALIZACIÓN EN TIEMPO REAL
  useEffect(() => {
    if (!navigator.geolocation) return;

    const geoId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading: gpsHeading, speed: gpsSpeed } = pos.coords;
        
        if (isValidCoord([latitude, longitude])) {
          setCurrentPos([latitude, longitude]);
          
          // Solo actualizar rotación si hay movimiento significativo o el GPS da datos
          if (gpsHeading !== null && !isNaN(gpsHeading)) {
            setHeading(gpsHeading);
          }
          
          setSpeed(gpsSpeed ? (gpsSpeed * 3.6) : 0); // m/s a km/h
        }
      },
      (err) => console.warn('GPS Error:', err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );

    return () => navigator.geolocation.clearWatch(geoId);
  }, []);

  if (!route) return null;

  return (
    <div className="h-full w-full relative bg-gray-100">
      {/* MAPA */}
      <MapContainer 
        center={currentPos} 
        zoom={DEFAULT_ZOOM} 
        zoomControl={false} 
        className="h-full w-full z-0"
      >
        <TileLayer 
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          attribution="&copy; Google Maps"
        />
        
        <Polyline 
          positions={cleanPath} 
          color="#1a73e8" 
          weight={8} 
          opacity={0.6} 
        />
        
        {/* Autobús en tiempo real */}
        <SafeMarker pos={currentPos} heading={heading} />

        {/* Controlador del mapa */}
        <NavigationController 
          currentPos={currentPos} 
          heading={heading} 
          isTracking={isTracking}
          setIsTracking={setIsTracking}
        />
      </MapContainer>

      {/* Botón RE-CENTRAR (Aparece si dejas de seguir) */}
      {!isTracking && (
        <button 
          onClick={() => setIsTracking(true)}
          className="absolute bottom-32 right-4 z-[1000] bg-white text-blue-600 p-4 rounded-full shadow-xl border-2 border-blue-100 animate-fade-in"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* HUD SUPERIOR */}
      <div className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none">
        <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-xl shadow-blue-900/20 flex items-center gap-4">
           <div className="bg-white/20 p-2 rounded-lg">
             <span className="text-2xl">⬆️</span>
           </div>
           <div>
             <div className="text-[10px] font-bold opacity-80 uppercase tracking-wider">Próxima Maniobra</div>
             <div className="text-xl font-black leading-tight">
               {route.steps?.[0]?.instruction || "Sigue la ruta"}
             </div>
           </div>
        </div>
      </div>

      {/* HUD INFERIOR */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white p-5 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pb-8">
        <div className="flex justify-between items-end mb-6">
           <div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-black text-gray-800 tabular-nums tracking-tighter">
                  {Math.round(speed || 0)}
                </h3>
                <span className="text-sm font-bold text-gray-400">km/h</span>
              </div>
              <p className="text-green-600 font-bold text-sm mt-1">
                {route.summary?.totalDuration || '-- min'} restante
              </p>
           </div>
           
           <button 
              onClick={onReset} 
              className="bg-red-50 hover:bg-red-100 text-red-500 p-3 rounded-xl transition-colors"
           >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
           </button>
        </div>
        
        {/* Barra de progreso visual (Fake) */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
           <div className="h-full bg-green-500 w-[10%] rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

export default RouteResult;