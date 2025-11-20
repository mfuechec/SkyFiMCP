// Geocoding MCP tool
import { z } from 'zod';
import { nominatimClient } from '../../services/osm';

export const geocodeLocationSchema = z.object({
  address: z.string().describe('Address or place name to geocode'),
  limit: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe('Maximum number of results (default: 1)'),
  country: z
    .string()
    .optional()
    .describe('ISO 3166-1 alpha-2 country code to limit results (e.g., "us", "uk")'),
});

export type GeocodeLocationInput = z.infer<typeof geocodeLocationSchema>;

export async function geocodeLocation(input: GeocodeLocationInput) {
  try {
    const results = await nominatimClient.geocode({
      query: input.address,
      limit: input.limit,
      country: input.country,
    });

    if (results.length === 0) {
      return {
        success: false,
        error: `No results found for address: ${input.address}`,
      };
    }

    // Format results for MCP response
    const formatted = results.map((result) => ({
      displayName: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      type: result.type,
      importance: result.importance,
      address: result.address,
      boundingBox: {
        south: parseFloat(result.boundingbox[0]),
        north: parseFloat(result.boundingbox[1]),
        west: parseFloat(result.boundingbox[2]),
        east: parseFloat(result.boundingbox[3]),
      },
    }));

    return {
      success: true,
      results: formatted,
      count: formatted.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export const reverseGeocodeSchema = z.object({
  latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
  longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
  zoom: z
    .number()
    .min(3)
    .max(18)
    .optional()
    .describe('Zoom level for detail (3-18, default: 18)'),
});

export type ReverseGeocodeInput = z.infer<typeof reverseGeocodeSchema>;

export async function reverseGeocode(input: ReverseGeocodeInput) {
  try {
    const result = await nominatimClient.reverseGeocode({
      lat: input.latitude,
      lon: input.longitude,
      zoom: input.zoom,
    });

    return {
      success: true,
      displayName: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      type: result.type,
      address: {
        houseNumber: result.address.house_number,
        road: result.address.road,
        suburb: result.address.suburb,
        city: result.address.city,
        county: result.address.county,
        state: result.address.state,
        country: result.address.country,
        countryCode: result.address.country_code,
        postcode: result.address.postcode,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
