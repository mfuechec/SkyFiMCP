# Bulk Operations Guide

This guide demonstrates how to use the SkyFi MCP bulk operations tools to process feasibility checks and place orders for multiple locations simultaneously.

## Overview

The bulk operations feature allows you to:
- Check feasibility for up to 100 locations in a single request
- Place orders for multiple locations with progress tracking
- Handle errors gracefully on a per-location basis
- Monitor progress in real-time

## Features

### Bulk Feasibility Check (`bulk_feasibility_check`)

Process feasibility checks for multiple locations with:
- **Sequential processing** to avoid rate limiting
- **Progress tracking** with callbacks
- **Error handling** per location without stopping the entire batch
- **Summary statistics** including success/failure counts and average scores

### Bulk Order Placement (`bulk_order_with_confirmation`)

Place imagery orders for multiple locations with:
- **Confirmation tokens** required for safety
- **Progress updates** during processing
- **Individual error handling** per location
- **Order ID tracking** for all successful placements

## Usage Examples

### Example 1: Check Feasibility for Multiple Retail Locations

```javascript
// Using the MCP tool via Claude
const result = await bulk_feasibility_check({
  locations: [
    {
      id: "store-001",
      name: "Austin Store",
      location: "POINT(-97.7431 30.2672)"
    },
    {
      id: "store-002",
      name: "Denver Store",
      location: "POINT(-104.9903 39.7392)"
    },
    {
      id: "store-003",
      name: "Portland Store",
      location: "POINT(-122.6784 45.5231)"
    }
  ],
  productType: "SAR",
  resolution: "HIGH",
  startDate: "2025-01-20",
  endDate: "2025-03-20",
  requiredProvider: "UMBRA"
});
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "feasible": 3,
    "infeasible": 0,
    "errors": 0,
    "averageScores": {
      "feasibility": 0.92,
      "weather": 1.0
    },
    "totalOpportunities": 95
  },
  "results": [
    {
      "locationId": "store-001",
      "locationName": "Austin Store",
      "feasible": true,
      "feasibilityScore": 0.95,
      "weatherScore": 1.0,
      "opportunityCount": 32
    },
    {
      "locationId": "store-002",
      "locationName": "Denver Store",
      "feasible": true,
      "feasibilityScore": 0.90,
      "weatherScore": 1.0,
      "opportunityCount": 30
    },
    {
      "locationId": "store-003",
      "locationName": "Portland Store",
      "feasible": true,
      "feasibilityScore": 0.91,
      "weatherScore": 1.0,
      "opportunityCount": 33
    }
  ]
}
```

### Example 2: Place Bulk Orders After Feasibility Check

```javascript
// First, confirm with user and get confirmation token
const userConfirmed = "USER_CONFIRMED_2025_01_20_12_30";

// Place orders for all feasible locations
const orderResult = await bulk_order_with_confirmation({
  locations: [
    {
      id: "store-001",
      name: "Austin Store",
      location: "POINT(-97.7431 30.2672)"
    },
    {
      id: "store-002",
      name: "Denver Store",
      location: "POINT(-104.9903 39.7392)"
    },
    {
      id: "store-003",
      name: "Portland Store",
      location: "POINT(-122.6784 45.5231)"
    }
  ],
  productType: "SAR",
  resolution: "HIGH",
  startDate: "2025-01-20",
  endDate: "2025-03-20",
  confirmationToken: userConfirmed,
  deliveryConfig: {
    bucket: "s3://my-company-satellite-data",
    path: "stores/imagery/"
  },
  requiredProvider: "UMBRA"
});
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "successful": 3,
    "failed": 0,
    "orderIds": [
      "order-abc123",
      "order-def456",
      "order-ghi789"
    ]
  },
  "results": [
    {
      "locationId": "store-001",
      "locationName": "Austin Store",
      "success": true,
      "orderId": "order-abc123"
    },
    {
      "locationId": "store-002",
      "locationName": "Denver Store",
      "success": true,
      "orderId": "order-def456"
    },
    {
      "locationId": "store-003",
      "locationName": "Portland Store",
      "success": true,
      "orderId": "order-ghi789"
    }
  ]
}
```

### Example 3: Handling Errors Gracefully

```javascript
// Some locations may fail without stopping the entire batch
const result = await bulk_feasibility_check({
  locations: [
    {
      id: "valid-location",
      location: "POINT(-122.4194 37.7749)" // Valid
    },
    {
      id: "invalid-location",
      location: "POINT(invalid coords)" // Invalid WKT
    },
    {
      id: "another-valid",
      location: "POINT(-74.0060 40.7128)" // Valid
    }
  ],
  productType: "SAR",
  resolution: "HIGH",
  startDate: "2025-01-20",
  endDate: "2025-03-20"
});
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "feasible": 2,
    "infeasible": 0,
    "errors": 1
  },
  "results": [
    {
      "locationId": "valid-location",
      "feasible": true,
      "feasibilityScore": 0.95,
      "weatherScore": 1.0,
      "opportunityCount": 32
    },
    {
      "locationId": "invalid-location",
      "feasible": false,
      "feasibilityScore": 0,
      "weatherScore": 0,
      "opportunityCount": 0,
      "error": {
        "code": "INVALID_WKT",
        "message": "Invalid WKT format"
      }
    },
    {
      "locationId": "another-valid",
      "feasible": true,
      "feasibilityScore": 0.93,
      "weatherScore": 1.0,
      "opportunityCount": 31
    }
  ]
}
```

## Conversational Examples with Claude

### Example 1: Asset Monitoring

**User:** I need to check if we can get satellite imagery for all 50 of our warehouse locations. Can you help?

**Claude:** I'll use the bulk feasibility check to process all 50 warehouse locations. First, I need the coordinates for each warehouse. Do you have them in a spreadsheet or database?

**User:** [Provides CSV with locations]

**Claude:** Perfect! Let me check feasibility for all 50 locations using SAR imagery (weather-independent) with HIGH resolution for a 2-month capture window.

*[Uses `bulk_feasibility_check` tool]*

Great news! Out of 50 warehouses:
- ✅ **47 locations are feasible** with an average of 31 capture opportunities each
- ⚠️ **2 locations have low feasibility** (poor satellite coverage)
- ❌ **1 location had an error** (invalid coordinates)

Average feasibility score: **0.91** (excellent!)

Would you like me to proceed with ordering imagery for the 47 feasible locations?

### Example 2: Infrastructure Development Tracking

**User:** We're tracking construction progress at 25 sites. Can you order monthly imagery for all of them?

**Claude:** I can help with that! To proceed with bulk ordering for 25 construction sites, I need:

1. Confirmation that you want to place 25 real orders (this will charge your account)
2. The delivery bucket for the imagery
3. Your preferred product type and resolution

What settings would you like for the imagery?

**User:** Yes, use SAR HIGH resolution, deliver to s3://construction-monitoring/monthly/

**Claude:** Perfect! Let me first check feasibility for all 25 sites to confirm we can capture imagery...

*[Uses `bulk_feasibility_check`]*

All 25 sites are feasible! Estimated total: ~$12,500 for the batch.

Please confirm you want to proceed with 25 orders by typing "CONFIRM"

**User:** CONFIRM

**Claude:** *[Uses `bulk_order_with_confirmation` with token]*

✅ **Successfully placed 25 orders!**

Order IDs: order-001 through order-025
Estimated delivery: 30-60 days
Total cost: $12,480

All orders are being processed. You can track them individually or receive webhook notifications when imagery is ready.

## Best Practices

### 1. Always Check Feasibility First
```javascript
// ✅ Good: Check before ordering
const feasibility = await bulk_feasibility_check({...});
// Review results, then order only feasible locations

const orders = await bulk_order_with_confirmation({
  locations: feasibility.results
    .filter(r => r.feasible)
    .map(r => locations.find(l => l.id === r.locationId))
});
```

### 2. Use Meaningful Location IDs
```javascript
// ✅ Good: Descriptive IDs
{
  id: "warehouse-austin-tx-001",
  name: "Austin Distribution Center",
  location: "POINT(-97.7431 30.2672)",
  metadata: {
    address: "123 Tech Blvd, Austin, TX",
    buildingSize: "50000 sqft"
  }
}

// ❌ Avoid: Generic IDs
{
  id: "loc1",
  location: "POINT(-97.7431 30.2672)"
}
```

### 3. Use SAR for Reliable Feasibility
```javascript
// ✅ Recommended: SAR + HIGH resolution
{
  productType: "SAR",
  resolution: "HIGH",
  requiredProvider: "UMBRA"
  // Typically 0.95+ feasibility score, 30+ opportunities
}

// ⚠️ Less reliable: Optical imagery
{
  productType: "DAY",
  resolution: "VERY HIGH"
  // Weather-dependent, variable feasibility
}
```

### 4. Extend Capture Windows
```javascript
// ✅ Good: 2-month window
{
  startDate: "2025-01-20",
  endDate: "2025-03-20" // 60 days
}

// ❌ Avoid: Short windows
{
  startDate: "2025-01-20",
  endDate: "2025-01-27" // Only 7 days
}
```

### 5. Batch Processing Limits
- **Maximum 100 locations per request**
- For larger batches, split into multiple requests:

```javascript
// Process 250 locations in 3 batches
const batch1 = locations.slice(0, 100);
const batch2 = locations.slice(100, 200);
const batch3 = locations.slice(200, 250);

const results1 = await bulk_feasibility_check({ locations: batch1, ... });
const results2 = await bulk_feasibility_check({ locations: batch2, ... });
const results3 = await bulk_feasibility_check({ locations: batch3, ... });

const allResults = [...results1.results, ...results2.results, ...results3.results];
```

## Progress Tracking

Bulk operations provide real-time progress updates:

```json
{
  "total": 50,
  "completed": 25,
  "pending": 25,
  "successful": 23,
  "failed": 2,
  "currentLocation": "warehouse-austin-tx-015"
}
```

Progress is logged during execution and included in the final response.

## Error Handling

### Common Errors

1. **Invalid WKT Format**
```json
{
  "error": {
    "code": "INVALID_WKT",
    "message": "Invalid WKT POLYGON format"
  }
}
```

2. **Rate Limiting**
- Bulk operations include automatic delays (250ms between feasibility checks, 500ms between orders)
- No action needed - handled automatically

3. **Insufficient Funds**
```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Account balance insufficient for order"
  }
}
```

4. **Missing Confirmation Token**
```json
{
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "Bulk ordering requires explicit user confirmation"
  }
}
```

## Performance

- **Feasibility checks**: ~4 locations/second (with rate limiting)
- **Order placement**: ~2 locations/second (with rate limiting)
- **100 locations**: ~25 seconds for feasibility, ~50 seconds for orders

## Limitations

- Maximum 100 locations per request
- Sequential processing (not parallel) to respect API rate limits
- Requires valid SkyFi API key with sufficient permissions
- Orders require explicit confirmation tokens

## Integration with Other Tools

Bulk operations work seamlessly with other SkyFi MCP tools:

```javascript
// 1. Use OSM to find locations
const warehouses = await find_features_by_type({
  featureType: "warehouse",
  boundingBox: "..."
});

// 2. Bulk check feasibility
const feasibility = await bulk_feasibility_check({
  locations: warehouses.map(w => ({
    id: w.id,
    name: w.name,
    location: `POINT(${w.lon} ${w.lat})`
  })),
  ...
});

// 3. Order imagery for feasible locations
const orders = await bulk_order_with_confirmation({
  locations: feasibility.results
    .filter(r => r.feasible && r.feasibilityScore > 0.8)
    .map(r => ...),
  ...
});

// 4. Monitor order status
for (const orderId of orders.summary.orderIds) {
  const status = await get_order_status({ orderId });
  console.log(`Order ${orderId}: ${status.status}`);
}
```

## See Also

- [Individual Tool Documentation](api/README.md)
- [Order Management Guide](ORDER_MANAGEMENT.md)
- [Feasibility Check Guide](FEASIBILITY.md)
- [MCP Demo](../MCP_DEMO.md)
