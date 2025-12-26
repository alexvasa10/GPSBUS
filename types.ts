export interface VehicleSpecs {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  cargoType: 'general' | 'peligrosa' | 'animales' | 'fragil';
}

export interface RouteOptions {
  isScenic: boolean;
}

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type ManeuverType = 'straight' | 'turn-left' | 'turn-right' | 'slight-left' | 'slight-right' | 'u-turn' | 'roundabout' | 'merge' | 'exit' | 'start' | 'end';

export interface NavigationStep {
  instruction: string;
  distance: string;
  maneuver: ManeuverType;
  hazardWarning?: string;
  start_location?: Coordinates; 
  end_location?: Coordinates;   
}

export interface TripSummary {
  totalDistance: string;
  totalDuration: string;
  trafficCondition: 'fluid' | 'moderate' | 'heavy' | 'accident';
  trafficNote?: string;
  tollRoads?: boolean;
}

export interface RouteOption {
  id: string;
  label: string;
  summary: TripSummary;
  steps: NavigationStep[];
  path: [number, number][];
  hazards: string[];
  isRecommended?: boolean;
}

export interface RoutePlanResponse {
  routes: RouteOption[]; 
  groundingChunks: any[]; // Relaxed type
}

export interface GroundingChunk {
  web?: { uri?: string; title?: string; };
  maps?: { uri?: string; title?: string; placeAnswerSources?: any; };
}

export enum AppState {
  VEHICLE_SETUP,
  ROUTE_INPUT,
  ROUTE_SELECTION,
  NAVIGATION
}