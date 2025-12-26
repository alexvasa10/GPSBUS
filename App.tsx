
import React, { useState, useEffect } from 'react';
import VehicleSetup from './components/VehicleSetup';
import RouteInput from './components/RouteInput';
import RouteResult from './components/RouteResult';
import RouteSelection from './components/RouteSelection';
import { VehicleSpecs, AppState, RoutePlanResponse, Location, RouteOptions, RouteOption } from './types';
import { planBusRoute } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.VEHICLE_SETUP);
  const [specs, setSpecs] = useState<VehicleSpecs | null>(null);
  
  // Data for the entire trip plan (all routes)
  const [routePlan, setRoutePlan] = useState<RoutePlanResponse | null>(null);
  // The specific route selected by the user for navigation
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);

  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<Location | undefined>(undefined);

  useEffect(() => {
    // Attempt to get location on mount for better initial context
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Strict check for finite numbers
          if (Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
            setUserLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            });
          }
        },
        (err) => console.warn("Location permission denied on mount", err)
      );
    }
  }, []);

  const handleLocationUpdate = (loc: Location) => {
    // Re-verify before setting state
    if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
      setUserLocation(loc);
    }
  };

  const handleVehicleSelect = (selectedSpecs: VehicleSpecs) => {
    setSpecs(selectedSpecs);
    setAppState(AppState.ROUTE_INPUT);
  };

  const handleRoutePlan = async (origin: string, destination: string, options: RouteOptions) => {
    if (!specs) return;
    setLoading(true);
    try {
      const result = await planBusRoute(origin, destination, specs, options, userLocation);
      setRoutePlan(result);
      setAppState(AppState.ROUTE_SELECTION);
    } catch (error) {
      console.error(error);
      alert("Error generando la ruta. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleRouteSelection = (route: RouteOption) => {
    setSelectedRoute(route);
    setAppState(AppState.NAVIGATION);
  };

  const resetRoute = () => {
    setRoutePlan(null);
    setSelectedRoute(null);
    setAppState(AppState.ROUTE_INPUT);
  };

  // If in navigation mode, hide standard header to maximize screen space
  if (appState === AppState.NAVIGATION && selectedRoute) {
    return (
       <div className="h-screen w-screen overflow-hidden bg-gray-100">
          <RouteResult route={selectedRoute} onReset={resetRoute} />
       </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#f0f4f7] text-gray-800 font-sans overflow-hidden">
      {/* Top Bar - Waze Style */}
      <header className="bg-white shadow-sm z-50 shrink-0">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
             <div className="bg-blue-400 p-2 rounded-xl shadow-sm text-white">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
             </div>
             <h1 className="text-xl font-black tracking-tight text-gray-800 waze-font">Bus<span className="text-blue-500">Waze</span></h1>
          </div>
          
          {specs && (
             <div 
                onClick={() => setAppState(AppState.VEHICLE_SETUP)}
                className="flex items-center space-x-2 bg-gray-100 px-3 py-1.5 rounded-full cursor-pointer hover:bg-gray-200 transition-colors"
             >
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span className="font-bold text-sm text-gray-700 hidden sm:block">{specs.name}</span>
             </div>
          )}
        </div>
      </header>

      {/* Main Content - Flexible based on state */}
      <main className={`flex-1 relative ${appState === AppState.ROUTE_INPUT ? 'w-full p-0' : 'max-w-4xl mx-auto w-full px-4 py-8 overflow-y-auto'}`}>
        {appState === AppState.VEHICLE_SETUP && (
          <VehicleSetup onSave={handleVehicleSelect} />
        )}

        {appState === AppState.ROUTE_INPUT && (
            <RouteInput 
              onPlan={handleRoutePlan} 
              isLoading={loading} 
              onLocationUpdate={handleLocationUpdate}
            />
        )}

        {appState === AppState.ROUTE_SELECTION && routePlan && (
           <RouteSelection 
              routes={routePlan.routes} 
              onSelectRoute={handleRouteSelection} 
              onCancel={resetRoute} 
           />
        )}
      </main>
    </div>
  );
};

export default App;
