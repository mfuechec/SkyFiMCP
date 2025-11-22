# SkyFi + OSM Integration Demo

Complete demonstration of the integrated OpenStreetMap (OSM) and SkyFi satellite imagery workflow.

---

## Overview

This demo showcases how OSM tools for feature discovery seamlessly integrate with SkyFi's satellite imagery platform through an interactive map interface.

**Key Capabilities:**
- 🔍 Find real-world features (warehouses, buildings, infrastructure) using OSM
- 🗺️ Visualize discoveries on an interactive map
- 🛰️ Get satellite imagery pricing and availability for discovered features
- 📦 Order high-resolution imagery for specific locations
- 📡 Set up monitoring for ongoing surveillance

---

## Demo Conversation: Warehouse Monitoring Workflow

### Part 1: Feature Discovery with OSM

#### Finding Warehouses in a City

**You:** Find all warehouses within 5km of downtown Austin, Texas

**Claude:** I'll search for warehouses in the Austin area using OpenStreetMap data.

*[Uses osm_geocode tool to find Austin coordinates]*
*[Uses osm_find_features_nearby with featureType="warehouse", radiusKm=5]*
*[Uses draw_osm_features to display results on map]*
*[Uses recenter_map to center on Austin]*
*[Uses set_zoom to show overview]*

**Result:** I found **23 warehouses** within 5km of downtown Austin and marked them on the map. Here's what I found:

📍 **Top Warehouses by Size:**
1. **Austin Distribution Center** - 250,000 sq ft
   - Location: 30.2945, -97.7372
   - Tags: building=warehouse, name=Austin Distribution Center

2. **East Side Logistics Hub** - 180,000 sq ft
   - Location: 30.2756, -97.7089

3. **Riverside Warehouse Complex** - 150,000 sq ft
   - Location: 30.2456, -97.7234

*[Map now shows 23 blue markers, each warehouse is clickable with details]*

Would you like pricing information for any specific warehouse?

---

#### Exploring Feature Details

**You:** Tell me more about the Austin Distribution Center

**Claude:** Let me focus on that warehouse for you.

*[Uses highlight_osm_feature with the warehouse's ID]*

**Austin Distribution Center Details:**
- **Type:** Industrial warehouse
- **Address:** 5801 E Ben White Blvd, Austin, TX 78741
- **Size:** ~250,000 sq ft (estimated from building footprint)
- **Coordinates:** 30.2945°N, 97.7372°W
- **Building Features:**
  - Large loading docks on north side
  - Parking for 50+ vehicles
  - Adjacent rail access
  - Last OSM update: 2024-08

*[Map zooms to street-level view of the warehouse]*

Would you like to get satellite imagery pricing for this location?

---

### Part 2: Satellite Imagery Integration

#### Getting Pricing for a Discovered Feature

**You:** Yes, what would it cost to get high-resolution imagery of that warehouse?

**Claude:** I'll check satellite imagery pricing for the Austin Distribution Center.

*[Uses draw_rectangle to define AOI around warehouse (~0.02° x 0.02°)]*
*[Uses get_pricing_estimate with the center coordinates]*
*[Uses update_rectangle to add pricing info]*

**Satellite Imagery Pricing:**

📸 **HIGH Resolution** (50cm-1m GSD)
- **Price:** $8.50/km²
- **Minimum area:** 5 km²
- **Your AOI:** ~4 km² (will be billed at minimum 5 km²)
- **Total Cost:** ~$42.50

🎯 **SUPER HIGH Resolution** (25-50cm GSD)
- **Price:** $42/km²
- **Your AOI:** 5 km² minimum
- **Total Cost:** ~$210

🔬 **ULTRA HIGH Resolution** (15-25cm GSD)
- **Price:** $135/km²
- **Your AOI:** 5 km² minimum
- **Total Cost:** ~$675

*[AOI rectangle now shows on map with pricing overlay]*

**Available Providers:**
- Planet (optical) - 50cm resolution
- Umbra (SAR) - 25cm resolution, weather-independent
- Maxar (optical) - 30cm resolution

Would you like to check feasibility for a specific resolution?

---

#### Checking Imagery Availability

**You:** Check feasibility for SAR imagery at high resolution

**Claude:** I'll check the availability of SAR satellite imagery for this location.

*[Uses check_order_feasibility with productType="SAR", resolution="HIGH"]*
*[Uses update_rectangle to show availability status]*

**Feasibility Results:**

✅ **SAR HIGH Resolution Imagery - AVAILABLE**

📊 **Feasibility Score:** 92/100 (Excellent)

**Provider: UMBRA SAR**
- Resolution: 25cm-50cm
- Weather: Independent (SAR works through clouds)
- Capture opportunities: 12 passes in next 30 days
- Best window: Nov 25-27, 2024

**Delivery Details:**
- Estimated delivery: 3-5 days after capture
- Format: GeoTIFF
- Processing: Orthorectified
- Estimated cost: $210 (for 5 km² minimum)

*[AOI rectangle turns green to indicate availability]*

Ready to proceed with ordering?

---

### Part 3: Advanced Workflows

#### Bulk Analysis of Multiple Features

**You:** Actually, I want pricing for all 5 largest warehouses you found

**Claude:** I'll create AOIs and get pricing for the 5 largest warehouses.

*[Uses draw_rectangle for each of the 5 warehouses]*
*[Uses get_pricing_estimate for each location]*
*[Uses update_rectangle to display all pricing]*

**Bulk Pricing Summary:**

| Warehouse | Size (sq ft) | AOI (km²) | Price (HIGH) | Price (SUPER HIGH) |
|-----------|--------------|-----------|--------------|-------------------|
| Austin Distribution Center | 250,000 | 5.0 | $42.50 | $210 |
| East Side Logistics Hub | 180,000 | 5.0 | $42.50 | $210 |
| Riverside Warehouse Complex | 150,000 | 5.0 | $42.50 | $210 |
| Tech Ridge Storage | 140,000 | 5.0 | $42.50 | $210 |
| Mueller Industrial Park | 120,000 | 5.0 | $42.50 | $210 |

**Total Cost for All 5:**
- HIGH resolution: **$212.50**
- SUPER HIGH resolution: **$1,050**

*[Map now shows 5 blue AOI rectangles over the warehouses]*

Would you like to place orders for all 5 locations?

---

#### Setting Up Monitoring

**You:** I want to monitor the Austin Distribution Center for any changes. Set up monthly monitoring.

**Claude:** I'll create a monitor for ongoing satellite surveillance of the Austin Distribution Center.

*[Uses create_monitor with the warehouse's AOI]*
*[Uses update_rectangle to mark as monitored]*

✅ **Monitor Created Successfully!**

**Monitor Details:**
- **Monitor ID:** mon_austin_dc_001
- **Location:** Austin Distribution Center
- **AOI:** 30.2945°N, 97.7372°W (4 km² area)
- **Cadence:** Monthly
- **Resolution:** HIGH to SUPER HIGH
- **Product Types:** SAR (weather-independent)
- **Status:** ✅ Active

**What You'll Get:**
- Automatic notifications when new imagery is available
- Monthly captures showing warehouse changes
- Change detection alerts for structural modifications
- Delivery to your configured destination

*[AOI rectangle turns orange to indicate active monitoring]*

**First Capture:** Expected within 7 days

You'll receive an email when new imagery is captured and processed!

---

### Part 4: Cross-Feature Workflows

#### Finding and Ordering in One Go

**You:** Find all solar farms within 10km of Sacramento, CA and get me pricing for the 3 largest ones

**Claude:** I'll search for solar farms near Sacramento and provide pricing.

*[Uses osm_geocode for Sacramento]*
*[Uses osm_find_features_nearby with featureType="solar_farm", radiusKm=10]*
*[Uses draw_osm_features to display all solar farms]*
*[Identifies 3 largest based on OSM area tags]*
*[Uses draw_rectangle for top 3]*
*[Uses get_pricing_estimate for each]*

**Solar Farm Discovery:**

Found **8 solar farms** within 10km of Sacramento. Here are the 3 largest:

1. **Sacramento Solar Array North** - 45 hectares
   - Location: 38.5816°N, 121.4944°W
   - Capacity: ~30 MW
   - HIGH res pricing: $180 for 25 km²
   - SUPER HIGH res pricing: $1,050 for 25 km²

2. **Valley Solar Complex** - 35 hectares
   - Location: 38.5234°N, 121.5123°W
   - Capacity: ~22 MW
   - HIGH res pricing: $180 for 25 km²

3. **East Sacramento Energy Park** - 28 hectares
   - Location: 38.5667°N, 121.4456°W
   - Capacity: ~18 MW
   - HIGH res pricing: $144 for 20 km²

**Total for All 3:** $504 (HIGH) | $3,150 (SUPER HIGH)

*[Map shows 8 solar farm markers + 3 AOI rectangles on largest ones]*

Ready to order?

---

## Complete Workflow Summary

### 🔍 Discovery Phase (OSM Tools)
1. **osm_geocode** - Convert location names to coordinates
2. **osm_find_features_nearby** - Search for features by type and radius
3. **osm_search_features** - Search within bounding box
4. **draw_osm_features** - ⚠️ CRITICAL: Visualize search results on map

### 🗺️ Visualization Phase (Map Tools)
5. **recenter_map** - Move map to location
6. **set_zoom** - Adjust zoom level
7. **draw_rectangle** - Define AOI for satellite operations
8. **clear_osm_features** / **clear_rectangles** - Reset map

### 🛰️ Satellite Imagery Phase (SkyFi MCP Tools)
9. **get_pricing_estimate** - Get costs for imagery
10. **check_order_feasibility** - Check availability and optimal capture windows
11. **search_archive** - Find existing imagery
12. **place_archive_order** / **place_tasking_order** - Order imagery
13. **create_monitor** - Set up ongoing monitoring
14. **update_rectangle** - Display imagery info on AOI

---

## Key Features Demonstrated

### ✅ Seamless Integration
- OSM data flows directly into map visualization
- No manual coordinate entry needed
- Automatic AOI creation around discovered features

### ✅ Multi-Feature Operations
- Find multiple locations at once
- Bulk pricing for discovered features
- Parallel processing of requests

### ✅ Context Preservation
- Search results stay visible on map
- AOI rectangles show satellite info
- Active monitors clearly marked

### ✅ Natural Conversation Flow
```
"Find X" → See it on map → "Get pricing" → "Order it"
```

No need to manually specify coordinates or draw AOIs!

---

## Use Case Examples

### 🏭 Industrial Facility Monitoring
```
"Find all factories in Detroit"
→ 50 facilities marked on map
→ "Get pricing for the 10 largest"
→ Bulk order for monthly monitoring
```

### 🌾 Agricultural Analysis
```
"Find farms near Fresno, CA"
→ 200+ farms shown
→ "Show me pricing for organic farms only"
→ Targeted imagery orders
```

### 🏗️ Construction Site Tracking
```
"Find construction sites in Dubai"
→ Active construction sites marked
→ "Monitor the 5 largest for weekly changes"
→ Automated change detection
```

### ⚡ Energy Infrastructure
```
"Find all wind farms in Texas"
→ Wind farm locations displayed
→ "Check feasibility for SAR monitoring"
→ Weather-independent surveillance setup
```

### 🚛 Logistics Planning
```
"Find warehouses along I-35 corridor"
→ Regional warehouse map
→ "Price imagery for top 20"
→ Supply chain visualization
```

---

## Technical Highlights

### 🎯 Smart Tool Routing
- Frontend tools handle map visualization
- MCP tools handle data fetching and orders
- AI intelligently chains tools together

### 🔄 Automatic Data Flow
```
OSM Search → JSON Results → draw_osm_features → Map Markers
↓
User Selection → draw_rectangle → AOI → get_pricing_estimate
↓
Pricing Data → update_rectangle → AOI with Info → Ready to Order
```

### 🧠 Intelligent Workflows
- AI recognizes "find X" triggers OSM search
- Automatically visualizes results
- Chains pricing and ordering seamlessly

### 🛡️ Error Handling
- Failed OSM searches fallback to geocoding
- Missing MCP data doesn't break visualization
- Clear user feedback at each step

---

## Best Practices

### For Feature Discovery:
1. Always specify location context ("in Austin", "near X")
2. Use specific feature types (warehouse, solar_farm, building)
3. Specify reasonable search radius (1-20 km typically)

### For Satellite Imagery:
1. Use SAR for weather-independent monitoring
2. Start with HIGH resolution for cost-effectiveness
3. Use monitoring for ongoing surveillance

### For Bulk Operations:
1. Find all features first
2. Filter to top N by size/importance
3. Batch pricing requests
4. Confirm before bulk orders

---

## What Makes This Special?

### Before Integration:
```
User: "I need imagery of warehouses in Austin"
→ Manual: Look up Austin coordinates
→ Manual: Search for warehouses separately
→ Manual: Copy/paste coordinates
→ Manual: Draw AOI
→ Manual: Request pricing
Result: 5-10 manual steps, error-prone
```

### After Integration:
```
User: "Find warehouses in Austin and price the largest 5"
→ AI: Handles everything automatically
Result: 1 natural language request, done!
```

**Time Saved:** ~10 minutes → 30 seconds
**Errors Reduced:** Common coordinate mistakes eliminated
**User Experience:** Natural conversation vs technical interface

---

## Ready to Try?

Start with a simple query:
- "Find warehouses in [your city]"
- "Show me solar farms near [location]"
- "Find construction sites in [area]"

The assistant will handle discovery, visualization, and pricing automatically!

---

**End of Demo** 🎉
