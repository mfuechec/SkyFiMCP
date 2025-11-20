// Quick test of OSM functionality
import { geocodeLocation, reverseGeocode, findFeaturesNearby } from './packages/mcp/src/tools/osm';

async function testOSM() {
  console.log('🗺️  Testing OSM Integration\n');

  // Test 1: Geocoding
  console.log('1️⃣  Geocoding "Phoenix, Arizona"...');
  const geocodeResult = await geocodeLocation({
    address: 'Phoenix, Arizona',
    limit: 1,
  });
  console.log(JSON.stringify(geocodeResult, null, 2));
  console.log('');

  // Test 2: Reverse Geocoding
  if (geocodeResult.success && geocodeResult.results && geocodeResult.results.length > 0) {
    const { latitude, longitude } = geocodeResult.results[0];
    console.log(`2️⃣  Reverse geocoding (${latitude}, ${longitude})...`);
    const reverseResult = await reverseGeocode({ latitude, longitude });
    console.log(JSON.stringify(reverseResult, null, 2));
    console.log('');

    // Test 3: Find nearby warehouses
    console.log('3️⃣  Finding warehouses within 25km...');
    const searchResult = await findFeaturesNearby({
      latitude,
      longitude,
      radiusKm: 25,
      featureType: 'warehouse',
      limit: 5,
    });
    console.log(JSON.stringify(searchResult, null, 2));
  }

  console.log('\n✅ OSM Integration Test Complete!');
}

testOSM().catch(console.error);
