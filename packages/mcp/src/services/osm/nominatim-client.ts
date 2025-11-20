// Nominatim API client for geocoding and reverse geocoding
import axios, { AxiosInstance } from 'axios';
import type {
  GeocodeRequest,
  GeocodeResult,
  ReverseGeocodeRequest,
  ReverseGeocodeResult,
} from '@skyfi-mcp/shared';
import { osmCache } from './cache';

export interface NominatimConfig {
  baseURL?: string;
  userAgent?: string;
  timeout?: number;
  rateLimitMs?: number;
  useCache?: boolean;
}

export class NominatimClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private rateLimitMs: number;
  private userAgent: string;
  private useCache: boolean;

  constructor(config: NominatimConfig = {}) {
    this.userAgent = config.userAgent || 'SkyFi-MCP/1.0';
    this.rateLimitMs = config.rateLimitMs || 1000; // Nominatim requires 1 req/sec
    this.useCache = config.useCache ?? true;

    this.client = axios.create({
      baseURL: config.baseURL || 'https://nominatim.openstreetmap.org',
      timeout: config.timeout || 10000,
      headers: {
        'User-Agent': this.userAgent,
      },
    });
  }

  /**
   * Rate limiting: Wait to ensure we don't exceed 1 request per second
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(request: GeocodeRequest): Promise<GeocodeResult[]> {
    // Check cache first
    if (this.useCache) {
      const cached = osmCache.get<GeocodeResult[]>('geocode', request);
      if (cached) {
        return cached;
      }
    }

    await this.enforceRateLimit();

    try {
      const response = await this.client.get<GeocodeResult[]>('/search', {
        params: {
          q: request.query,
          format: 'json',
          addressdetails: 1,
          limit: request.limit || 1,
          countrycodes: request.country,
          'accept-language': request.language || 'en',
        },
      });

      // Cache the result
      if (this.useCache) {
        osmCache.set('geocode', request, response.data);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Nominatim geocoding failed: ${error.response?.data?.error || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Reverse geocode coordinates to an address
   */
  async reverseGeocode(
    request: ReverseGeocodeRequest
  ): Promise<ReverseGeocodeResult> {
    // Check cache first
    if (this.useCache) {
      const cached = osmCache.get<ReverseGeocodeResult>('reverse', request);
      if (cached) {
        return cached;
      }
    }

    await this.enforceRateLimit();

    try {
      const response = await this.client.get<ReverseGeocodeResult>('/reverse', {
        params: {
          lat: request.lat,
          lon: request.lon,
          format: 'json',
          addressdetails: 1,
          zoom: request.zoom || 18,
          'accept-language': request.language || 'en',
        },
      });

      // Cache the result
      if (this.useCache) {
        osmCache.set('reverse', request, response.data);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Nominatim reverse geocoding failed: ${error.response?.data?.error || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Batch geocode multiple addresses
   * Note: This respects rate limits by processing sequentially
   */
  async batchGeocode(queries: string[]): Promise<GeocodeResult[][]> {
    const results: GeocodeResult[][] = [];

    for (const query of queries) {
      const result = await this.geocode({ query });
      results.push(result);
    }

    return results;
  }

  /**
   * Batch reverse geocode multiple coordinates
   * Note: This respects rate limits by processing sequentially
   */
  async batchReverseGeocode(
    coordinates: Array<{ lat: number; lon: number }>
  ): Promise<ReverseGeocodeResult[]> {
    const results: ReverseGeocodeResult[] = [];

    for (const coord of coordinates) {
      const result = await this.reverseGeocode(coord);
      results.push(result);
    }

    return results;
  }
}

// Export singleton instance
export const nominatimClient = new NominatimClient();
