import React, { useState, useEffect, useMemo } from 'react';
import { RouteOptions, Location } from '../types';
import AutocompleteInput from './AutocompleteInput';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PlaceSuggestion } from '../services/placeService';

// Icons fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const SAFE_CENTER: [number, number] = [40.4168, -3.7038];

// Validación estricta de números
const isSafeNum = (val: any): val is number => {
  return typeof val === 'number' && !isNaN(val) && Number.isFinite(val);
};

// Validación estricta de coordenadas
const isValidCoord = (coord: any): coord is [number, number] => {
  return Array.isArray(coord) && 
         coord.length === 2 && 
         isSafeNum(coord[0]) && 
         isSafeNum(coord[1]) &&
         coord[0] >= -90 && coord[0] <= 90 &&
         coord[1] >= -180 && coord[1] <= 180;
};

// Safe Map Centerer with Error Boundary logic
const MapRecenter = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    if (isValidCoord(center)) {
      // Use a slight timeout to ensure map is ready in strict mode
      const timeoutId = setTimeout(() => {
         try {
           if (map) map.flyTo(center, 14, { duration: 1.5 });
         } catch (e) {
           console.warn('Map flyTo failed:', e);
         }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [center, map]);
  return null;
};

// Safe Marker Wrapper
const SafeMarker = ({ pos }: { pos: [number, number] }) => {
  if (!isValidCoord(pos)) {
    return null;
  }
  return <Marker position={pos} />;
};

interface Props {
  onPlan: (origin: string, destination: string, options: RouteOptions) => void;
  isLoading: boolean;
  onLocationUpdate?: (location: Location) => void;
}

const RouteInput: React.FC<Props> = ({ onPlan, isLoading, onLocationUpdate }) => {
  const [origin, setOrigin] = useState('Mi ubicación actual');
  const [destination, setDestination] = useState('');
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);
  
  // Centro del mapa siempre válido
  const mapCenter = useMemo((): [number, number] => {
    if (userPos && isValidCoord(userPos)) {
      return userPos;
    }
    return SAFE_CENTER;
  }, [userPos]);

  useEffect(() => {
    if (!locationRequested && navigator.geolocation) {
      setLocationRequested(true);
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          
          // Validación ESTRICTA antes de actualizar estado
          if (isSafeNum(latitude) && isSafeNum(longitude) &&
              latitude >= -90 && latitude <= 90 &&
              longitude >= -180 && longitude <= 180) {
            
            const validPos: [number, number] = [latitude, longitude];
            setUserPos(validPos);
            
            if (onLocationUpdate) {
              onLocationUpdate({ latitude, longitude });
            }
          } else {
            console.warn('Invalid coordinates received:', { latitude, longitude });
            // Do not set invalid userPos, keep default
          }
        }, 
        (error) => {
          console.log('Location denied or error:', error.message);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000, 
          maximumAge: 0 
        }
      );
    }
  }, [locationRequested, onLocationUpdate]);

  const handleLocationSelect = (p: PlaceSuggestion, type: 'origin' | 'destination') => {
      // Update text
      if (type === 'origin') setOrigin(p.display_name);
      else setDestination(p.display_name);

      // Update map center if coordinates are available
      const lat = parseFloat(p.lat);
      const lon = parseFloat(p.lon);
      
      if (isSafeNum(lat) && isSafeNum(lon)) {
          setUserPos([lat, lon]);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (destination.trim()) {
      onPlan(origin, destination, { isScenic: false });
    }
  };

  return (
    <div className="h-full w-full relative bg-gray-100">
      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={SAFE_CENTER} 
          zoom={13} 
          zoomControl={false} 
          className="h-full w-full"
        >
          <TileLayer 
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            attribution="&copy; Google Maps"
          />
          <SafeMarker pos={mapCenter} />
          <MapRecenter center={mapCenter} />
        </MapContainer>
      </div>

      <div className="absolute top-0 left-0 right-0 z-10 flex justify-center p-6 pointer-events-none">
        <form 
          onSubmit={handleSubmit} 
          className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-6 w-full max-w-md pointer-events-auto space-y-4 border border-white/50"
        >
          <AutocompleteInput 
            value={origin} 
            onChange={setOrigin} 
            placeholder="Origen" 
            iconColor="blue" 
            enableCurrentLocation={true}
            onLocationSelect={(p) => handleLocationSelect(p, 'origin')}
          />
          <AutocompleteInput 
            value={destination} 
            onChange={setDestination} 
            placeholder="Destino" 
            iconColor="pink" 
            onLocationSelect={(p) => handleLocationSelect(p, 'destination')}
          />
          
          <button 
            type="submit" 
            disabled={isLoading || !destination.trim()}
            className="w-full bg-[#1a73e8] text-white font-black text-lg py-4 rounded-2xl shadow-lg hover:bg-blue-600 disabled:bg-gray-300 transition-all transform hover:scale-[1.01] disabled:transform-none"
          >
            {isLoading ? 'Calculando...' : 'Ir ahora'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RouteInput;