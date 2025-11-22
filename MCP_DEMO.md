# SkyFi MCP Demo Conversation

This document shows a sample conversation demonstrating the full capabilities of the SkyFi MCP server when used with Claude, including the powerful bulk operations feature for processing multiple locations.

---

## Demo Conversation

### Part 1: Single Location Workflow

#### Initial Search Request

**You:** I need satellite imagery of the Golden Gate Bridge in San Francisco. Can you help me find what's available?

**Claude:** I'll help you search for satellite imagery of the Golden Gate Bridge. Let me first find the exact coordinates and then search the archive.

*[Uses osm_geocode tool]*
*[Uses search_archive tool]*

I found several archive images available for the Golden Gate Bridge area! Here are the top results:

1. **Planet SkySat** (Archive ID: abc123)
   - Captured: 2024-10-15
   - Resolution: 50cm
   - Cloud coverage: 5%
   - Price: $15/km²

2. **Umbra SAR** (Archive ID: xyz789)
   - Captured: 2024-10-20
   - Resolution: 25cm
   - Cloud coverage: N/A (SAR)
   - Price: $42/km²

Would you like more details about any of these images?

---

### Getting Detailed Information

**You:** Tell me more about that first Planet image, and are there more results I haven't seen yet?

**Claude:** Let me get the detailed information and check for additional results.

*[Uses get_archive tool with archiveId: abc123]*
*[Uses get_archives_page tool with pagination hash]*

**Detailed info for Planet SkySat image:**
- Archive ID: abc123
- Constellation: SkySat
- Product Type: DAY
- Resolution: SUPER HIGH (50cm)
- Capture Date: 2024-10-15T18:45:23Z
- Off-Nadir Angle: 12.3°
- Min Area: 5 km²
- Max Area: 500 km²
- Delivery Time: 24 hours
- Thumbnails available: Small, Medium, Large

**Additional archive results (Page 2):**

3. **Planet RapidEye** - 5m resolution, $8/km²
4. **Planet PlanetScope** - 3m resolution, $12/km²

There are 12 total results available. Would you like to see more or proceed with ordering one?

---

### Pricing Calculation

**You:** The SkySat image looks good. What would it cost to order a 2km x 2km area around the bridge?

**Claude:** Let me calculate the exact pricing for that area.

*[Uses pricing tool with AOI]*

For a 2km x 2km area (4 km²) with the SkySat 50cm imagery:
- Base price: $15/km²
- Total area: 4 km²
- **Estimated cost: $60**
- Delivery time: 24 hours
- Format: GeoTIFF

The area meets the minimum requirement (5 km² min) so you'd actually be charged for 5 km² = **$75 total**.

Would you like me to proceed with the order? I'll need your delivery destination (S3, Google Cloud Storage, or Azure).

---

### Feasibility Check

**You:** Not ready to order yet. Can you check if it's feasible to get a fresh capture next week instead?

**Claude:** I'll check the feasibility of a new tasking capture for that area next week.

*[Uses check_feasibility tool]*

**Tasking Feasibility Results:**

📊 **Overall Feasibility Score: 78/100** (Good)

**Weather Forecast:**
- Weather Score: 85/100
- Expected cloud coverage next week: 15-25%
- Best capture window: Nov 25-27

**Provider Availability:**
1. **Planet SkySat**
   - Score: 82/100
   - Status: Available
   - Opportunities: 3 passes per day
   - Best window: Nov 26, 10:15 AM PST

2. **Umbra SAR**
   - Score: 95/100
   - Status: Available
   - Opportunities: 2 passes per day
   - Note: Weather-independent (SAR)

For 50cm SkySat imagery, the estimated cost would be **$180** (tasking premium over archive). Would you like me to proceed with a tasking order?

---

### Setting Up Monitoring

**You:** Actually, can you set up monitoring for this area so I get notified when new imagery becomes available?

**Claude:** I'll set up an area monitor for the Golden Gate Bridge to notify you of new imagery.

*[Uses create_monitor tool]*

✅ **Monitor Created Successfully!**

- Monitor ID: mon_98765
- Location: Golden Gate Bridge, San Francisco
- AOI: POLYGON (...)
- Resolution range: 25-100cm (HIGH to SUPER HIGH)
- Product types: DAY, SAR
- Status: Active
- Webhook: (your notification endpoint)

You'll receive notifications whenever new satellite imagery matching your criteria becomes available for this area. The monitor will check daily for new archive additions.

Would you like to set up monitors for any other locations?

---

### Listing Monitors and Orders

**You:** Perfect! One more thing - show me all my active monitors and any recent notifications.

**Claude:** Let me fetch your monitors and check for notifications.

*[Uses list_monitors tool]*
*[Uses list_orders tool]*

**Active Monitors: 3**

1. **Golden Gate Bridge, SF** (mon_98765)
   - Created: Today
   - Last triggered: Never
   - Trigger count: 0

2. **Manhattan, NYC** (mon_45678)
   - Created: 2 weeks ago
   - Last triggered: 3 days ago
   - Trigger count: 5

3. **Tokyo Bay, Japan** (mon_12345)
   - Created: 1 month ago
   - Last triggered: Yesterday
   - Trigger count: 12

**Recent Orders: 2**

1. **Archive Order** - Manhattan (COMPLETED)
   - Delivered 2 days ago

2. **Tasking Order** - Tokyo (IN PROGRESS)
   - Expected delivery: Nov 28

Would you like to view details for any of these?

---

### Part 2: Bulk Operations for Multiple Locations

## Tools Demonstrated

This conversation showcases the following SkyFi MCP tools:

### Location & Search
- ✅ `osm_geocode` - Convert location names to coordinates
- ✅ `search_archive` - Search available satellite imagery
- ✅ `get_archives_page` - Paginate through search results
- ✅ `get_archive` - Get detailed information about specific images

### Pricing & Feasibility
- ✅ `get_pricing` - Calculate costs for imagery orders
- ✅ `check_feasibility` - Check tasking feasibility and weather

### 🆕 Bulk Operations (Featured in Demo!)
- ✅ `bulk_feasibility_check` - Check feasibility for up to 100 locations simultaneously
- ✅ `bulk_order_with_confirmation` - Place orders for multiple locations with progress tracking

### Orders & Monitoring
- ✅ `create_monitor` - Set up area monitoring for new imagery
- ✅ `list_monitors` - View all active monitors
- ✅ `list_orders` - Check order history and status

### Additional Available Tools
- `place_archive_order` - Order existing archive imagery
- `place_tasking_order` - Request new satellite capture
- `get_order` - Get details for a specific order
- `update_monitor` - Modify existing monitors
- `delete_monitor` - Remove monitors

#### Bulk Feasibility Check

**You:** Actually, we're expanding! We now need satellite imagery for all 50 of our retail store locations across the country. Can you check feasibility for all of them at once?

**Claude:** Absolutely! I can process all 50 locations in a single bulk operation. Let me use the bulk feasibility check with SAR imagery for weather-independent reliability and HIGH resolution.

First, I'll need the coordinates for each store location. Do you have them available?

**You:** Yes, here's our store list [provides JSON with 50 store locations]

**Claude:** Perfect! Processing bulk feasibility check for all 50 stores...

*[Uses bulk_feasibility_check tool with 50 locations]*

```
Processing: 10/50 completed (9 feasible, 1 failed)...
Processing: 25/50 completed (23 feasible, 2 failed)...
Processing: 50/50 completed (47 feasible, 3 failed)...
```

**Bulk Feasibility Results:**

📊 **Summary:**
- **Total locations:** 50
- ✅ **Feasible:** 47 (94%)
- ⚠️ **Low feasibility:** 2 (4%)
- ❌ **Errors:** 1 (2%)
- **Average feasibility score:** 0.92/1.00
- **Average weather score:** 1.00 (SAR is weather-independent!)
- **Total capture opportunities:** 1,504

**Breakdown by Region:**
- West Coast (12 stores): 100% feasible, avg 32 opportunities each
- Midwest (18 stores): 94% feasible, avg 31 opportunities each
- East Coast (15 stores): 93% feasible, avg 30 opportunities each
- South (5 stores): 80% feasible, avg 28 opportunities each

**Top Locations by Opportunity Count:**
1. 🏆 Store #023 (Dallas, TX) - 35 opportunities, score 0.95
2. 🥈 Store #015 (Chicago, IL) - 34 opportunities, score 0.93
3. 🥉 Store #008 (Miami, FL) - 33 opportunities, score 0.94

**Locations Needing Attention:**
- ⚠️ Store #042 (Remote Alaska) - Low feasibility (0.15) - Limited satellite coverage due to extreme latitude
- ⚠️ Store #037 (Grand Canyon area, AZ) - Low feasibility (0.22) - Challenging imaging angle
- ❌ Store #019 (coordinates error) - Invalid WKT format in location data

**Recommended Actions:**
- Proceed with ordering for 47 feasible locations
- Consider optical imagery for Alaska store during summer months
- Verify coordinates for Store #019 and recheck

Would you like me to proceed with bulk ordering for the 47 feasible locations?

---

#### Bulk Order Placement

**You:** Yes, please order imagery for all 47 feasible stores. Deliver to s3://retail-monitoring/monthly-captures/

**Claude:** I'll prepare the bulk order. Let me calculate the total cost first:

**Cost Breakdown:**
- 47 locations × SAR HIGH resolution
- Average order size: 10 km² per location
- Price: ~$400 per location
- **Estimated Total: $18,800**

**Delivery Details:**
- Destination: `s3://retail-monitoring/monthly-captures/`
- Format: GeoTIFF
- Timeline: 30-60 days for all captures
- Notifications: Webhooks will be sent as each order completes

⚠️ **This will place 47 REAL orders and charge your account $18,800.**

Please confirm by typing **"CONFIRM BULK ORDER"** to proceed.

**You:** CONFIRM BULK ORDER

**Claude:** Confirmed! Processing bulk orders for 47 locations...

*[Uses bulk_order_with_confirmation tool with confirmation token]*

```
Placing orders: 10/47 completed (10 successful)...
Placing orders: 25/47 completed (25 successful)...
Placing orders: 47/47 completed (47 successful)...
```

✅ **Bulk Order Successfully Completed!**

**Summary:**
- ✅ Orders placed: **47**
- ✅ Successful: **47 (100%)**
- ❌ Failed: **0**
- 💰 **Total cost: $18,765** (slightly under estimate due to exact area calculations)

**Order Details:**
- **Order IDs:** order-abc101 through order-abc147
- **Delivery bucket:** `s3://retail-monitoring/monthly-captures/`
- **Status:** All orders are now in processing queue
- **Provider:** UMBRA (SAR specialist)
- **Resolution:** HIGH (0.5m-1m GSD)

**What Happens Next:**
1. Orders are queued with satellite provider (UMBRA)
2. Satellites will capture imagery during next available passes
3. Imagery processed and delivered to your S3 bucket
4. Webhook notifications sent as each order completes
5. You can track individual order status anytime

**Tracking Your Orders:**
You can check status of any order with:
- `get_order_status` - Check specific order
- `list_orders` - View all your orders

Would you like me to set up monitoring for these 47 locations to automatically get new imagery monthly?

---

#### Setting Up Ongoing Monitoring

**You:** Yes! Can you set up monthly monitoring for all stores?

**Claude:** I'll create monitors for all 47 stores. However, monitors are set up individually, so let me create a few key ones to show you:

*[Uses create_monitor tool for top 3 stores]*

✅ **Monitors Created for Top Priority Stores:**

1. **Dallas Store Monitor** (mon-dal-001)
   - Triggers on new SAR HIGH imagery
   - Webhook: Your notification endpoint
   - Status: Active

2. **Chicago Store Monitor** (mon-chi-002)
   - Same configuration
   - Status: Active

3. **Miami Store Monitor** (mon-mia-003)
   - Same configuration
   - Status: Active

For the remaining 44 stores, I recommend using the SkyFi dashboard to bulk-create monitors, or I can create them individually if you'd like to proceed one-by-one.

---

### Part 3: Order Management

#### Checking Order Status

**You:** Perfect! One more thing - show me all my active monitors and any recent notifications.

**Claude:** Let me fetch your monitors and check for notifications.

*[Uses list_monitors tool]*
*[Uses list_orders tool]*

**Active Monitors: 3**

1. **Dallas Store, TX** (mon-dal-001)
   - Created: Today
   - Last triggered: Never
   - Trigger count: 0

2. **Chicago Store, IL** (mon-chi-002)
   - Created: Today
   - Last triggered: Never
   - Trigger count: 0

3. **Miami Store, FL** (mon-mia-003)
   - Created: Today
   - Last triggered: Never
   - Trigger count: 0

**Recent Orders: 49**

*Bulk Orders (Latest):*
- 47 orders from today's bulk operation - Status: **PROCESSING**
- Average completion: 0% (just submitted)

*Previous Orders:*
1. **Archive Order** - Golden Gate Bridge (COMPLETED)
   - Delivered 2 days ago

2. **Tasking Order** - Sample location (IN PROGRESS)
   - Expected delivery: Nov 28

All 47 bulk orders are processing smoothly. You'll receive notifications as imagery is captured!

---

## Complete Workflow

This demo shows the complete satellite imagery workflow:

### Single Location Workflow (Part 1)
1. **Discovery** - Find and search for available imagery
2. **Analysis** - Get detailed information and pricing
3. **Planning** - Check feasibility for future captures
4. **Automation** - Set up monitoring for ongoing needs

### 🆕 Multi-Location Workflow (Part 2) - **Featured!**
5. **Bulk Feasibility** - Check 50 locations simultaneously (94% feasible!)
6. **Bulk Ordering** - Place 47 orders in one operation ($18,765 total)
7. **Progress Tracking** - Real-time updates during batch processing
8. **Error Handling** - Graceful per-location failures without stopping batch

### Order Management (Part 3)
9. **Status Tracking** - Monitor all 47 orders
10. **History Review** - View past and current orders

---

## Key Highlights

### 🚀 Bulk Operations Power
- **50 locations checked** in ~25 seconds
- **47 orders placed** in ~50 seconds
- **Zero manual intervention** - fully automated
- **Per-location error handling** - failures don't stop the batch
- **Real-time progress** - see exactly what's happening

### 💡 Smart Recommendations
- Automatic feasibility scoring (0.92 average!)
- Weather analysis (SAR = 1.00 score, weather-independent)
- Opportunity counting (1,504 total capture windows)
- Cost estimation before ordering
- Alternative suggestions for infeasible locations

### 🛡️ Safety Features
- **Confirmation tokens required** for bulk orders
- **Cost preview** before placing orders
- **Individual order tracking** with unique IDs
- **Webhook notifications** for completion
- **Graceful error handling** with detailed messages

All 16 MCP tools work together to provide a seamless satellite imagery experience through natural language conversation with Claude!
