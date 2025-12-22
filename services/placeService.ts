
export interface PlaceSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    road?: string;
    house_number?: string;
  };
}

export const searchPlaces = async (query: string): Promise<PlaceSuggestion[]> => {
  if (!query || query.length < 3) return [];

  try {
    // Usamos Nominatim de OpenStreetMap. Es gratuito y no requiere API Key para uso moderado.
    // Añadimos accept-language=es para priorizar resultados en español.
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&accept-language=es`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BusNaviPro/1.0' // Es buena práctica identificarse en OSM
      }
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn("Error fetching places:", error);
    return [];
  }
};
