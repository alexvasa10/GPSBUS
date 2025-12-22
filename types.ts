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

// New Navigation Structures
export type ManeuverType = 'straight' | 'turn-left' | 'turn-right' | 'slight-left' | 'slight-right' | 'u-turn' | 'roundabout' | 'merge' | 'exit' | 'start' | 'end';

export interface NavigationStep {
  instruction: string;
  distance: string;
  maneuver: ManeuverType;
  hazardWarning?: string; // Specific warnings for the bus (e.g., "Low bridge 4.0m ahead")
  start_location?: Coordinates; // Added for Map plotting
  end_location?: Coordinates;   // Added for Map plotting
}

export interface TripSummary {
  totalDistance: string;
  totalDuration: string;
  trafficCondition: 'fluid' | 'moderate' | 'heavy' | 'accident';
  trafficNote?: string;
  tollRoads?: boolean; // New
}

// Represents a single route option (Fastest, Scenic, etc.)
export interface RouteOption {
  id: string;
  label: string; // e.g., "Más rápida", "Sin peajes"
  summary: TripSummary;
  steps: NavigationStep[];
  path: [number, number][]; // High resolution coordinates for the map line
  hazards: string[];
  isRecommended?: boolean;
}

export interface RoutePlanResponse {
  routes: RouteOption[]; // Now returns an array of options
  groundingChunks: GroundingChunk[];
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri: string;
    title: string;
    placeAnswerSources?: {
      reviewSnippets?: {
        text: string;
      }[];
    }[];
  };
}

export enum AppState {
  VEHICLE_SETUP,
  ROUTE_INPUT,
  ROUTE_SELECTION, // New State
  NAVIGATION
}