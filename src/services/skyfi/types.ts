/**
 * SkyFi API Types
 * TypeScript interfaces for SkyFi API requests and responses
 */

// GeoJSON types
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export type GeoJSON = GeoJSONPoint | GeoJSONPolygon;

// Image types
export type ImageType = 'optical' | 'sar' | 'multispectral' | 'hyperspectral';

// Search request
export interface SearchArchiveRequest {
  location: string | GeoJSON;
  dateRange?: {
    start: string;
    end: string;
  };
  resolution?: string;
  imageType?: ImageType;
  openDataOnly?: boolean;
  limit?: number;
}

// Image result from search
export interface ImageResult {
  id: string;
  provider: string;
  captureDate: string;
  resolution: string;
  imageType: ImageType;
  price: number;
  currency: string;
  previewUrl: string;
  bounds: GeoJSON;
  cloudCoverage?: number;
  metadata?: Record<string, unknown>;
}

// Search response
export interface SearchArchiveResponse {
  results: ImageResult[];
  total: number;
  hasMore: boolean;
}

// Pricing request
export interface PricingRequest {
  imageId?: string;
  taskingRequest?: TaskingRequest;
}

// Tasking request (for new imagery capture)
export interface TaskingRequest {
  location: GeoJSON;
  resolution: string;
  captureDate?: string;
  imageType?: ImageType;
}

// Pricing response
export interface PricingResponse {
  price: number;
  currency: string;
  breakdown?: {
    basePrice: number;
    processingFee?: number;
    deliveryFee?: number;
  };
  minimumAoi?: number;
  provider: string;
  estimatedDelivery?: string;
}

// Feasibility check response
export interface FeasibilityResponse {
  feasible: boolean;
  reason?: string;
  alternatives?: string[];
}

// Order request
export interface PlaceOrderRequest {
  imageId?: string;
  taskingRequest?: TaskingRequest;
  deliveryOptions?: {
    cloudStorage?: string;
    format?: string;
  };
  userConfirmationToken: string;
}

// Order status
export type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

// Order response
export interface Order {
  id: string;
  status: OrderStatus;
  imageId?: string;
  taskingRequest?: TaskingRequest;
  price: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  estimatedDelivery?: string;
  downloadUrls?: string[];
  errorMessage?: string;
  progress?: number;
}

// Order list request
export interface ListOrdersRequest {
  limit?: number;
  offset?: number;
  status?: OrderStatus;
  dateRange?: {
    start: string;
    end: string;
  };
}

// Order list response
export interface ListOrdersResponse {
  orders: Order[];
  total: number;
  hasMore: boolean;
}

// Monitor request
export interface CreateMonitorRequest {
  location: GeoJSON;
  criteria: {
    resolution?: string;
    imageType?: ImageType;
    frequency?: string;
  };
  webhookUrl: string;
  notificationPreferences?: {
    onNewImagery?: boolean;
    onPriceChange?: boolean;
  };
}

// Monitor response
export interface Monitor {
  id: string;
  status: 'active' | 'paused' | 'deleted';
  location: GeoJSON;
  criteria: {
    resolution?: string;
    imageType?: ImageType;
    frequency?: string;
  };
  webhookUrl: string;
  createdAt: string;
  lastTriggered?: string;
}

// List monitors response
export interface ListMonitorsResponse {
  monitors: Monitor[];
  total: number;
}

// API error response
export interface SkyFiApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Client configuration
export interface SkyFiClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}
