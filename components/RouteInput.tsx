
import React, { useState, useEffect } from 'react';
import { RouteOptions, Location } from '../types';
import AutocompleteInput from './AutocompleteInput';
import { PlaceSuggestion } from '../services/placeService';

interface Props {
  onPlan: (origin: string, destination: string, options: RouteOptions) => void;
  isLoading: boolean;
  onLocationUpdate?: (location: Location) => void;
}

const RouteInput: React.FC<Props> = ({ onPlan, isLoading, onLocationUpdate }) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [useCurrentLoc, setUseCurrentLoc] = useState(false);
  const [isScenic, setIsScenic] = useState(false);

  useEffect(() => {
    if (useCurrentLoc) {
      setOrigin("Mi ubicación actual");
    }
  }, [useCurrentLoc]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (origin && destination) {
      onPlan(origin, destination, { isScenic });
    }
  };

  const handleGeolocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUseCurrentLoc(true);
          // Pass the fresh location up to App component
          if (onLocationUpdate) {
            onLocationUpdate({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          }
        },
        (error) => {
          alert("No se pudo obtener la ubicación. Verifica los permisos de tu navegador.");
        }
      );
    } else {
      alert("La geolocalización no es soportada por este navegador.");
    }
  };

  // Optional: If we wanted to pass exact coordinates to the parent, we could handle 
  // onLocationSelect here, but the current planBusRoute uses string addresses 
  // + userLocation override. For now, text selection is sufficient for Gemini.
  const handleOriginSelect = (place: PlaceSuggestion) => {
      setUseCurrentLoc(false);
      // We could store the lat/lon if we wanted precise routing start point 
      // without relying on Gemini to geocode it again.
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-gray-100 animate-slide-up">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Origin Input with Autocomplete */}
        <AutocompleteInput 
          value={origin}
          onChange={(val) => {
            setOrigin(val);
            if (val !== "Mi ubicación actual") setUseCurrentLoc(false);
          }}
          placeholder="¿De dónde sales?"
          iconColor="blue"
          onLocationSelect={handleOriginSelect}
          rightElement={
            <button 
              type="button"
              onClick={handleGeolocation}
              className="text-blue-400 hover:text-blue-600 transition-colors p-2"
              title="Usar mi ubicación"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </button>
          }
        />

        {/* Connector Line */}
        <div className="pl-5 -my-2 relative z-0">
           <div className="h-6 w-0.5 bg-gray-200"></div>
        </div>

        {/* Destination Input with Autocomplete */}
        <AutocompleteInput 
          value={destination}
          onChange={setDestination}
          placeholder="¿A dónde vas?"
          iconColor="pink"
        />

        {/* Options */}
        <div className="bg-white pt-2 pb-2">
           <label className="flex items-center space-x-3 cursor-pointer p-2 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={isScenic}
                  onChange={(e) => setIsScenic(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
              </div>
              <div className="flex items-center text-sm font-bold text-gray-600">
                <span className="mr-2">🛤️</span>
                Ruta Escénica
              </div>
           </label>
        </div>

        <button
          type="submit"
          disabled={isLoading || !origin || !destination}
          className={`w-full font-black text-lg py-4 rounded-2xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center space-x-2 ${
            isLoading 
              ? 'bg-gray-200 cursor-not-allowed text-gray-400' 
              : 'bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/30'
          }`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Calculando ruta...</span>
            </>
          ) : (
            <>
              <span>¡Vámonos!</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default RouteInput;
