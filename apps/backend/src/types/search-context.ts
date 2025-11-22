// Search context types for iterative query refinement

export interface SearchContext {
  // Location information
  location?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };

  // Search parameters
  resolution?: string;
  productType?: string;

  // Date range filtering
  dateRange?: {
    start: string;
    end: string;
  };

  // Price filtering
  maxPrice?: number;
  minPrice?: number;

  // Coverage area
  area?: number;
  cloudCover?: number;

  // Query tracking
  lastQuery: string;
  queryHistory: string[];

  // Results caching
  lastResults?: any[];

  // Metadata
  createdAt: string;
  updatedAt: string;
  sessionId: string;
}

export interface SearchContextUpdate {
  location?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  resolution?: string;
  productType?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  maxPrice?: number;
  minPrice?: number;
  area?: number;
  cloudCover?: number;
}
