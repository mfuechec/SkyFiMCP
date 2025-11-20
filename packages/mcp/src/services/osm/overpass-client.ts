// Overpass API client for OSM feature search
import axios, { AxiosInstance } from 'axios';
import type { BoundingBox, OSMFeature, FeatureSearchRequest } from '@skyfi-mcp/shared';
import { osmCache } from './cache';

export interface OverpassConfig {
  baseURL?: string;
  timeout?: number;
  useCache?: boolean;
}

export class OverpassClient {
  private client: AxiosInstance;
  private useCache: boolean;

  constructor(config: OverpassConfig = {}) {
    this.useCache = config.useCache ?? true;

    this.client = axios.create({
      baseURL: config.baseURL || 'https://overpass-api.de/api',
      timeout: config.timeout || 30000, // 30s for complex queries
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Build Overpass QL query for feature search
   */
  private buildQuery(request: FeatureSearchRequest): string {
    const { featureType, boundingBox, center, radiusKm, limit, tags } = request;

    let query = '[out:json][timeout:25];';

    // Determine search area
    if (boundingBox) {
      const bbox = `${boundingBox.south},${boundingBox.west},${boundingBox.north},${boundingBox.east}`;

      // Build query based on feature type
      if (featureType === 'warehouse') {
        query += `(
          way["building"="warehouse"](${bbox});
          way["building"="industrial"]["industrial"="warehouse"](${bbox});
        );`;
      } else if (featureType === 'solar_farm') {
        query += `(
          way["generator:source"="solar"](${bbox});
          way["power"="plant"]["plant:source"="solar"](${bbox});
        );`;
      } else if (featureType === 'wind_farm') {
        query += `(
          way["generator:source"="wind"](${bbox});
          way["power"="plant"]["plant:source"="wind"](${bbox});
        );`;
      } else if (featureType === 'building') {
        query += `way["building"](${bbox});`;
      } else if (featureType === 'highway') {
        query += `way["highway"](${bbox});`;
      } else {
        // Generic search by tag
        query += `way["${featureType}"](${bbox});`;
      }
    } else if (center && radiusKm) {
      const radiusMeters = radiusKm * 1000;
      const around = `(around:${radiusMeters},${center.lat},${center.lon})`;

      if (featureType === 'warehouse') {
        query += `(
          way["building"="warehouse"]${around};
          way["building"="industrial"]["industrial"="warehouse"]${around};
        );`;
      } else {
        query += `way["${featureType}"]${around};`;
      }
    } else {
      throw new Error('Either boundingBox or (center + radiusKm) must be provided');
    }

    // Add custom tag filters
    if (tags) {
      // This is simplified - in production you'd want more sophisticated tag filtering
    }

    // Output format
    query += 'out geom;';

    return query;
  }

  /**
   * Execute Overpass query
   */
  async executeQuery(query: string): Promise<OSMFeature[]> {
    try {
      const response = await this.client.post<{
        elements: any[];
      }>('/interpreter', `data=${encodeURIComponent(query)}`);

      // Transform Overpass response to our OSMFeature format
      const features: OSMFeature[] = response.data.elements.map((element) => {
        const feature: OSMFeature = {
          type: element.type as 'node' | 'way' | 'relation',
          id: element.id,
          tags: element.tags || {},
        };

        if (element.type === 'node') {
          feature.lat = element.lat;
          feature.lon = element.lon;
        } else if (element.type === 'way' || element.type === 'relation') {
          // Calculate center from geometry
          if (element.center) {
            feature.center = {
              lat: element.center.lat,
              lon: element.center.lon,
            };
          } else if (element.geometry && element.geometry.length > 0) {
            // Calculate centroid
            const lats = element.geometry.map((p: any) => p.lat);
            const lons = element.geometry.map((p: any) => p.lon);
            feature.center = {
              lat: lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
              lon: lons.reduce((a: number, b: number) => a + b, 0) / lons.length,
            };
          }

          // Store geometry
          if (element.geometry) {
            feature.geometry = {
              type: element.type === 'way' ? 'LineString' : 'Polygon',
              coordinates: element.geometry.map((p: any) => [p.lon, p.lat]),
            };
          }
        }

        return feature;
      });

      return features;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Overpass query failed: ${error.response?.data?.remark || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Search for features
   */
  async searchFeatures(request: FeatureSearchRequest): Promise<OSMFeature[]> {
    // Check cache
    if (this.useCache) {
      const cached = osmCache.get<OSMFeature[]>('overpass', request);
      if (cached) {
        return cached.slice(0, request.limit);
      }
    }

    // Build and execute query
    const query = this.buildQuery(request);
    let features = await this.executeQuery(query);

    // Apply limit
    if (request.limit && features.length > request.limit) {
      features = features.slice(0, request.limit);
    }

    // Cache results
    if (this.useCache) {
      osmCache.set('overpass', request, features);
    }

    return features;
  }

  /**
   * Find warehouses in an area
   */
  async findWarehouses(bbox: BoundingBox, limit?: number): Promise<OSMFeature[]> {
    return this.searchFeatures({
      featureType: 'warehouse',
      boundingBox: bbox,
      limit,
    });
  }

  /**
   * Find solar farms in an area
   */
  async findSolarFarms(bbox: BoundingBox, limit?: number): Promise<OSMFeature[]> {
    return this.searchFeatures({
      featureType: 'solar_farm',
      boundingBox: bbox,
      limit,
    });
  }

  /**
   * Find features near a point
   */
  async findNearby(
    lat: number,
    lon: number,
    radiusKm: number,
    featureType: string,
    limit?: number
  ): Promise<OSMFeature[]> {
    return this.searchFeatures({
      featureType,
      center: { lat, lon },
      radiusKm,
      limit,
    });
  }
}

// Export singleton
export const overpassClient = new OverpassClient();
