// SkyFi API types (will be shared between MCP, backend, and frontend)

export interface FeasibilityRequest {
  latitude: number;
  longitude: number;
  resolution?: number;
  start_date?: string;
  end_date?: string;
}

export interface PricingRequest {
  latitude: number;
  longitude: number;
  resolution?: number;
  area_sqkm?: number;
}

export interface OrderRequest {
  latitude: number;
  longitude: number;
  resolution: number;
  name?: string;
}

export interface ImageResult {
  id: string;
  status: string;
  url?: string;
  created_at: string;
}
