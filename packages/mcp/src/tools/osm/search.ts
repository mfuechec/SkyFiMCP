// Feature search MCP tools
import { z } from 'zod';
import { overpassClient } from '../../services/osm';
import type { BoundingBox } from '@skyfi-mcp/shared';

export const findFeaturesByTypeSchema = z.object({
  featureType: z
    .enum(['warehouse', 'solar_farm', 'wind_farm', 'building', 'highway'])
    .describe('Type of feature to search for'),
  boundingBox: z
    .object({
      north: z.number().min(-90).max(90),
      south: z.number().min(-90).max(90),
      east: z.number().min(-180).max(180),
      west: z.number().min(-180).max(180),
    })
    .describe('Geographic bounding box for search area'),
  limit: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe('Maximum number of results (default: 100)'),
});

export type FindFeaturesByTypeInput = z.infer<typeof findFeaturesByTypeSchema>;

export async function findFeaturesByType(input: FindFeaturesByTypeInput) {
  try {
    const features = await overpassClient.searchFeatures({
      featureType: input.featureType,
      boundingBox: input.boundingBox as BoundingBox,
      limit: input.limit || 100,
    });

    return {
      success: true,
      features: features.map((f) => ({
        id: `${f.type}/${f.id}`,
        type: f.type,
        center: f.center || (f.lat && f.lon ? { lat: f.lat, lon: f.lon } : null),
        tags: f.tags,
        name: f.tags.name || f.tags['addr:housenumber']
          ? `${f.tags['addr:housenumber']} ${f.tags['addr:street']}`
          : 'Unnamed',
      })),
      count: features.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export const findFeaturesNearbySchema = z.object({
  latitude: z.number().min(-90).max(90).describe('Center latitude'),
  longitude: z.number().min(-180).max(180).describe('Center longitude'),
  radiusKm: z.number().min(0.1).max(100).describe('Search radius in kilometers'),
  featureType: z
    .string()
    .describe('Type of feature to search for (e.g., warehouse, building, highway)'),
  limit: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe('Maximum number of results (default: 100)'),
});

export type FindFeaturesNearbyInput = z.infer<typeof findFeaturesNearbySchema>;

export async function findFeaturesNearby(input: FindFeaturesNearbyInput) {
  try {
    const features = await overpassClient.findNearby(
      input.latitude,
      input.longitude,
      input.radiusKm,
      input.featureType,
      input.limit || 100
    );

    return {
      success: true,
      center: { lat: input.latitude, lon: input.longitude },
      radiusKm: input.radiusKm,
      features: features.map((f) => ({
        id: `${f.type}/${f.id}`,
        type: f.type,
        center: f.center || (f.lat && f.lon ? { lat: f.lat, lon: f.lon } : null),
        tags: f.tags,
        name: f.tags.name || 'Unnamed',
      })),
      count: features.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
