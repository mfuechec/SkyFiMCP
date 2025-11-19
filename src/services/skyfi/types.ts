/**
 * SkyFi API Types
 * TypeScript interfaces for SkyFi API requests and responses
 * Based on SkyFi Platform API OpenAPI specification
 */

// GeoJSON types (for internal use and conversion)
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

// Search request - uses WKT format for AOI
export interface SearchArchiveRequest {
  aoi: string; // WKT POLYGON format
  dateFrom?: string;
  dateTo?: string;
  resolutionFrom?: number;
  resolutionTo?: number;
  cloudCoverFrom?: number;
  cloudCoverTo?: number;
  offNadirFrom?: number;
  offNadirTo?: number;
  sunElevationFrom?: number;
  sunElevationTo?: number;
  openDataOnly?: boolean;
  pageSize?: number;
  cursor?: string;
}

// Archive image result from search
export interface ArchiveResult {
  id: string;
  archiveId: string;
  provider: string;
  captureDate: string;
  resolution: number;
  cloudCover?: number;
  offNadir?: number;
  sunElevation?: number;
  preview?: string;
  thumbnail?: string;
  aoi: string; // WKT format
  aoiArea?: number;
  metadata?: Record<string, unknown>;
}

// Search response
export interface SearchArchiveResponse {
  results: ArchiveResult[];
  total: number;
  cursor?: string;
  hasMore: boolean;
}

// Pricing request
export interface PricingRequest {
  aoi: string; // WKT POLYGON format
  products?: string[];
  resolutions?: number[];
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
  priceMatrix?: Array<{
    product: string;
    resolution: number;
    price: number;
    currency: string;
  }>;
}

// Feasibility request
export interface FeasibilityRequest {
  aoi: string; // WKT POLYGON format
  dateFrom?: string;
  dateTo?: string;
  resolution?: number;
}

// Feasibility check response
export interface FeasibilityResponse {
  feasible: boolean;
  feasibilityId?: string;
  reason?: string;
  alternatives?: string[];
  passPredictions?: Array<{
    satellite: string;
    passTime: string;
    offNadir: number;
  }>;
}

// Tasking request (for new imagery capture)
export interface TaskingRequest {
  aoi: string; // WKT POLYGON format
  dateFrom: string;
  dateTo: string;
  resolution?: number;
  cloudCoverMax?: number;
  offNadirMax?: number;
  priority?: 'standard' | 'priority' | 'urgent';
}

// Archive order request
export interface PlaceArchiveOrderRequest {
  archiveId: string;
  deliveryConfig?: {
    bucket?: string;
    path?: string;
  };
}

// Tasking order request
export interface PlaceTaskingOrderRequest {
  aoi: string; // WKT POLYGON format
  dateFrom: string;
  dateTo: string;
  resolution?: number;
  cloudCoverMax?: number;
  offNadirMax?: number;
  priority?: 'standard' | 'priority' | 'urgent';
  deliveryConfig?: {
    bucket?: string;
    path?: string;
  };
}

// Legacy interface for backwards compatibility
export interface PlaceOrderRequest {
  imageId?: string;
  archiveId?: string;
  taskingRequest?: TaskingRequest;
  deliveryOptions?: {
    cloudStorage?: string;
    format?: string;
  };
  userConfirmationToken?: string;
}

// Order status
export type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'delivered';

// Order response
export interface Order {
  id: string;
  orderId: string;
  status: OrderStatus;
  type: 'archive' | 'tasking';
  archiveId?: string;
  aoi?: string;
  price?: number;
  currency?: string;
  createdAt: string;
  updatedAt: string;
  estimatedDelivery?: string;
  deliverables?: Array<{
    type: string;
    url?: string;
    status: string;
  }>;
  errorMessage?: string;
  progress?: number;
}

// Order list request
export interface ListOrdersRequest {
  limit?: number;
  offset?: number;
  type?: 'archive' | 'tasking';
  status?: OrderStatus;
}

// Order list response
export interface ListOrdersResponse {
  orders: Order[];
  total: number;
  hasMore: boolean;
}

// Notification/Monitor request (API calls them "notifications")
export interface CreateMonitorRequest {
  aoi: string; // WKT POLYGON format
  filters?: {
    resolutionMax?: number;
    cloudCoverMax?: number;
    offNadirMax?: number;
  };
  webhookUrl: string;
  name?: string;
}

// Monitor/Notification response
export interface Monitor {
  id: string;
  notificationId: string;
  status: 'active' | 'paused' | 'deleted';
  aoi: string; // WKT format
  filters?: {
    resolutionMax?: number;
    cloudCoverMax?: number;
    offNadirMax?: number;
  };
  webhookUrl: string;
  name?: string;
  createdAt: string;
  lastTriggered?: string;
  triggerCount?: number;
}

// List monitors response
export interface ListMonitorsResponse {
  monitors: Monitor[];
  total: number;
  hasMore?: boolean;
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

// ==================== Utility Functions ====================

/**
 * Convert GeoJSON to WKT POLYGON format
 */
export function geoJSONToWKT(geojson: GeoJSON): string {
  if (geojson.type === 'Point') {
    const [lon, lat] = geojson.coordinates;
    // Create a small bounding box around the point (approx 100m)
    const delta = 0.001; // roughly 100m at equator
    return `POLYGON ((${lon - delta} ${lat - delta}, ${lon + delta} ${lat - delta}, ${lon + delta} ${lat + delta}, ${lon - delta} ${lat + delta}, ${lon - delta} ${lat - delta}))`;
  } else if (geojson.type === 'Polygon') {
    const ring = geojson.coordinates[0];
    const coords = ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
    return `POLYGON ((${coords}))`;
  }
  throw new Error(`Unsupported GeoJSON type: ${(geojson as GeoJSON).type}`);
}

/**
 * Parse WKT POLYGON to GeoJSON
 */
export function wktToGeoJSON(wkt: string): GeoJSONPolygon {
  const match = wkt.match(/POLYGON\s*\(\(([^)]+)\)\)/i);
  if (!match) {
    throw new Error('Invalid WKT POLYGON format');
  }

  const coordsStr = match[1];
  const coordinates = coordsStr.split(',').map(pair => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lon, lat] as [number, number];
  });

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
}
