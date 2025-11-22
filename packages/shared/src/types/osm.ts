// OpenStreetMap types for geocoding and feature search

export interface GeocodeRequest {
  query: string;
  limit?: number;
  country?: string;
  language?: string;
}

export interface GeocodeResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  boundingbox: [string, string, string, string]; // [south, north, west, east]
}

export interface ReverseGeocodeRequest {
  lat: number;
  lon: number;
  zoom?: number;
  language?: string;
}

export interface ReverseGeocodeResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
    postcode?: string;
  };
  type: string;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface OSMFeature {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
  geometry?: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
}

export interface FeatureSearchRequest {
  featureType: string;
  boundingBox?: BoundingBox;
  center?: { lat: number; lon: number };
  radiusKm?: number;
  limit?: number;
  tags?: Record<string, string>;
}

export interface FeatureSearchResult {
  features: OSMFeature[];
  totalCount: number;
}

// Map visualization types for OSM features
export interface OSMMapFeature {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  featureType?: string; // warehouse, building, etc.
}

export interface OSMFeatureLayer {
  id: string;
  name: string;
  features: OSMMapFeature[];
  visible: boolean;
  color?: string;
}
