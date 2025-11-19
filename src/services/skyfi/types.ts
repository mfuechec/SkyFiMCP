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

// ==================== Archive Search ====================

// Search request - matches /archives POST
export interface SearchArchiveRequest {
  aoi: string; // WKT POLYGON format
  fromDate?: string; // ISO 8601 format
  toDate?: string; // ISO 8601 format
  maxCloudCoveragePercent?: number;
  maxOffNadirAngle?: number;
  resolutions?: string[];
  productTypes?: string[];
  providers?: string[];
  openData?: boolean;
  pageSize?: number;
}

// Archive result from search
export interface ArchiveResult {
  archiveId: string;
  provider: string;
  constellation?: string;
  productType: string;
  platformResolution?: number;
  resolution: string;
  captureTimestamp: string;
  cloudCoveragePercent?: number;
  offNadirAngle?: number;
  footprint: string; // WKT format
  minSquareKms?: number;
  maxSquareKms?: number;
  priceForOneSquareKm?: number;
  deliveryTimeHours?: number;
  thumbnailUrls?: {
    small?: string;
    medium?: string;
    large?: string;
  };
  gsd?: number;
}

// Search response
export interface SearchArchiveResponse {
  archives: ArchiveResult[];
  total: number;
  nextPage?: string;
}

// ==================== Pricing ====================

// Pricing request - matches /pricing POST
export interface PricingRequest {
  aoi?: string; // WKT POLYGON format
}

// Pricing response
export interface PricingResponse {
  productTypes: Record<string, unknown>;
  // Full product/provider matrix with pricing details
}

// ==================== Feasibility ====================

// Feasibility request - matches /feasibility POST
export interface FeasibilityRequest {
  aoi: string; // WKT POLYGON format
  startDate?: string;
  endDate?: string;
  productType?: string;
  resolution?: number;
}

// Feasibility response
export interface FeasibilityResponse {
  feasibilityId?: string;
  status?: string;
  feasible?: boolean;
  reason?: string;
  alternatives?: string[];
  passPredictions?: Array<{
    satellite: string;
    passTime: string;
    offNadir: number;
  }>;
}

// ==================== Orders ====================

// Archive order request - matches /order-archive POST
export interface PlaceArchiveOrderRequest {
  aoi: string; // WKT POLYGON format
  archiveId: string;
  deliveryDriver: 'S3' | 'GS' | 'AZURE';
  deliveryParams: {
    bucket: string;
    credentials?: Record<string, string>;
    path?: string;
  };
  metadata?: Record<string, unknown>;
  webhook_url?: string;
}

// Tasking order request - matches /order-tasking POST
export interface PlaceTaskingOrderRequest {
  aoi: string; // WKT POLYGON format
  windowStart: string; // ISO 8601
  windowEnd: string; // ISO 8601
  productType: string;
  resolution: string;
  priorityItem?: string;
  maxCloudCoveragePercent?: number;
  maxOffNadirAngle?: number;
  deliveryDriver: 'S3' | 'GS' | 'AZURE';
  deliveryParams: {
    bucket: string;
    credentials?: Record<string, string>;
    path?: string;
  };
  metadata?: Record<string, unknown>;
  webhookUrl?: string;
  requiredProvider?: string;
  provider_window_id?: string;
}

// Order status
export type OrderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DELIVERED';

// Order response
export interface Order {
  id: string;
  orderType: 'ARCHIVE' | 'TASKING';
  ownerId?: string;
  status: OrderStatus;
  aoi?: string;
  archiveId?: string;
  deliveryDriver?: string;
  deliveryParams?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  price?: number;
  currency?: string;
  estimatedDelivery?: string;
  progress?: number;
  deliverables?: string[];
  errorMessage?: string;
}

// Order list request
export interface ListOrdersRequest {
  type?: 'ARCHIVE' | 'TASKING';
}

// Order list response
export interface ListOrdersResponse {
  orders: Order[];
  total?: number;
  hasMore?: boolean;
}

// ==================== Notifications/Monitors ====================

// Notification request - matches /notifications POST
export interface CreateMonitorRequest {
  aoi: string; // WKT POLYGON format
  gsdMin?: number;
  gsdMax?: number;
  productType?: string;
  webhookUrl: string;
}

// Notification/Monitor response
export interface Monitor {
  id: string;
  status: 'active' | 'paused' | 'deleted';
  aoi: string; // WKT format
  gsdMin?: number;
  gsdMax?: number;
  productType?: string;
  webhookUrl: string;
  createdAt?: string;
  lastTriggered?: string;
  triggerCount?: number;
}

// List monitors response
export interface ListMonitorsResponse {
  notifications: Monitor[];
  total?: number;
}

// ==================== API Error ====================

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
