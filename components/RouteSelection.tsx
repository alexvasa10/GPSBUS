import React, { useState } from 'react';
import { RouteOption } from '../types';

interface Props {
  routes: RouteOption[];
  onSelectRoute: (route: RouteOption) => void;
  onCancel: () => void;
}

const RouteSelection: React.FC<Props> = ({ routes, onSelectRoute, onCancel }) => {
  // Guard clause for empty routes
  if (!routes || routes.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-80px)] md:h-auto items-center justify-center p-8 animate-slide-up">
         <div className="text-4xl mb-4">😕</div>
         <h2 className="text-xl font-bold text-gray-800 mb-2">No se encontraron rutas</h2>
         <p className="text-gray-500 text-center mb-6">No pudimos calcular una ruta válida para tu vehículo. Intenta cambiar el destino.</p>
         <button 
           onClick={onCancel}
           className="px-6 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-colors"
         >
           Volver
         </button>
      </div>
    );
  }

  const [selectedId, setSelectedId] = useState<string>(routes[0].id);

  const selectedRoute = routes.find(r => r.id === selectedId) || routes[0];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] md:h-auto animate-slide-up">
      <div className="px-4 mb-4">
         <h2 className="text-2xl font-black text-gray-800 waze-font">Rutas Sugeridas</h2>
         <p className="text-gray-500 text-sm">Basado en tu vehículo y tráfico actual</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-20">
        {routes.map((route) => {
          const isSelected = selectedRoute.id === route.id;
          return (
            <div
              key={route.id}
              onClick={() => setSelectedId(route.id)}
              className={`relative p-5 rounded-3xl border-2 cursor-pointer transition-all duration-200 shadow-sm ${
                isSelected 
                  ? 'bg-blue-50 border-blue-500 shadow-blue-200 ring-1 ring-blue-500 transform scale-[1.01]' 
                  : 'bg-white border-gray-100 hover:border-gray-300'
              }`}
            >
              {route.isRecommended && (
                <div className="absolute -top-3 left-4 bg-green-400 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                  Recomendada
                </div>
              )}
              
              <div className="flex justify-between items-start mb-2">
                 <div>
                    <h3 className={`font-bold text-lg ${isSelected ? 'text-blue-600' : 'text-gray-800'}`}>
                      {route.label}
                    </h3>
                    <div className="flex items-center space-x-2 mt-1">
                        <span className={`text-3xl font-black tracking-tight ${isSelected ? 'text-blue-600' : 'text-gray-800'}`}>
                           {route.summary.totalDuration}
                        </span>
                        <span className="text-sm font-semibold text-gray-400">
                           ({route.summary.totalDistance})
                        </span>
                    </div>
                 </div>
                 
                 {/* Traffic Indicator */}
                 <div className={`h-3 w-3 rounded-full shadow-inner ${
                    route.summary.trafficCondition === 'fluid' ? 'bg-green-400' :
                    route.summary.trafficCondition === 'moderate' ? 'bg-yellow-400' :
                    'bg-red-500'
                 }`} title={`Tráfico: ${route.summary.trafficCondition}`}></div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-3">
                 {route.summary.tollRoads && (
                    <span className="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-700 text-xs font-bold border border-yellow-200">
                       💰 Peajes
                    </span>
                 )}
                 {route.hazards.length > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold border border-red-200">
                       ⚠️ {route.hazards.length} Avisos
                    </span>
                 )}
                 {!route.summary.tollRoads && (
                    <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold">
                       Sin Peajes
                    </span>
                 )}
              </div>
              
              {isSelected && route.summary.trafficNote && (
                 <div className="mt-3 text-xs text-gray-500 font-medium italic border-t border-blue-100 pt-2">
                    "ℹ️ {route.summary.trafficNote}"
                 </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent md:static md:bg-none">
        <div className="max-w-md mx-auto flex gap-3">
           <button 
             onClick={onCancel}
             className="px-6 py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-colors"
           >
             Cancelar
           </button>
           <button 
             onClick={() => onSelectRoute(selectedRoute)}
             className="flex-1 py-4 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-black text-lg shadow-xl shadow-blue-500/30 flex items-center justify-center space-x-2 transition-transform active:scale-95"
           >
             <span>Iniciar {selectedRoute.label}</span>
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
             </svg>
           </button>
        </div>
      </div>
    </div>
  );
};

export default RouteSelection;