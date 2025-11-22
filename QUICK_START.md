# SkyFi MCP Quick Start Guide

Get started with the integrated OSM + SkyFi satellite imagery platform in 5 minutes!

---

## 🚀 Starting the System

### 1. Start All Services (Recommended)

Open 3 terminal windows:

```bash
# Terminal 1: MCP Server (Port 3000)
pnpm --filter @skyfi-mcp/mcp dev

# Terminal 2: Backend API (Port 3001)
pnpm --filter @skyfi-mcp/backend dev

# Terminal 3: Frontend UI (Port 5173)
pnpm --filter @skyfi-mcp/frontend dev
```

### 2. Access the Application

Open your browser to: **http://localhost:5173**

You should see:
- 🗺️ An interactive map (centered on Austin, TX by default)
- 💬 A chat button in the bottom-right corner

---

## 💬 Example Conversations

### 🏭 Find Industrial Facilities

```
You: "Find warehouses in Austin, Texas"

Result:
- Map shows blue markers for each warehouse
- Click any marker to see details (name, size, coordinates, tags)
- Chat shows count: "I found 23 warehouses..."
```

### 💰 Get Satellite Imagery Pricing

```
You: "What's the pricing for the largest warehouse?"

Result:
- AOI rectangle drawn around the warehouse
- Pricing displayed for different resolutions
- Rectangle shows pricing info in popup
```

### 🛰️ Order Satellite Imagery

```
You: "Order HIGH resolution SAR imagery for that warehouse"

Result:
- Feasibility check performed
- Order placed if available
- Order ID and details provided
```

### 📡 Set Up Monitoring

```
You: "Monitor this location for changes monthly"

Result:
- Monitor created
- AOI rectangle turns orange (active monitoring)
- Webhook configured for notifications
```

---

## 🗺️ What You Can Search For

### Supported Feature Types

**Industrial:**
- `warehouse` - Distribution centers, storage facilities
- `factory` - Manufacturing facilities
- `industrial` - General industrial areas

**Energy:**
- `solar_farm` - Solar panel installations
- `wind_farm` - Wind turbine farms
- `power` - Power plants and substations

**Infrastructure:**
- `building` - General buildings
- `highway` - Major roads and highways
- `bridge` - Bridges
- `airport` - Airports

**Agriculture:**
- `farm` - Agricultural land
- `vineyard` - Vineyards
- `orchard` - Orchards

### Example Queries

```
"Find warehouses in Austin"
"Show me solar farms near Phoenix"
"Find all wind farms in Texas within 50km of Dallas"
"Locate factories in Detroit"
"Find airports near Los Angeles"
```

---

## 🎯 Complete Workflow Example

### Scenario: Monitoring Warehouse Expansion

**Step 1: Discovery**
```
You: "Find warehouses within 10km of downtown Seattle"
```
→ Map shows 45 warehouse markers

**Step 2: Selection**
```
You: "Show me pricing for the 5 largest warehouses"
```
→ 5 AOI rectangles appear with pricing

**Step 3: Verification**
```
You: "Check feasibility for SAR imagery on warehouse #3"
```
→ Detailed feasibility report with capture windows

**Step 4: Order**
```
You: "Order HIGH resolution SAR imagery for that warehouse"
```
→ Order placed, order ID provided

**Step 5: Monitoring**
```
You: "Set up monthly monitoring for this location"
```
→ Monitor created, automatic notifications enabled

**Result:** Complete workflow from discovery to ongoing monitoring in 5 natural language queries!

---

## 🔧 Common Operations

### Clear the Map
```
"Clear all markers"
"Clear rectangles"
"Start over"
```

### Change Location
```
"Show me [city name]"
"Go to [location]"
"Center on [coordinates]"
```

### Zoom Control
```
"Zoom in"
"Zoom out"
"Show street level view"
```

### Get Information
```
"What resolutions are available?"
"What's the pricing for [location]?"
"Show me my recent orders"
"List my active monitors"
```

---

## 📊 Understanding the Map

### Visual Elements

**🔵 Blue Markers**
- OSM features (warehouses, buildings, etc.)
- Click for detailed information
- Hover for quick name display

**🟦 Blue Rectangles**
- Areas of Interest (AOIs) for satellite imagery
- Show pricing and availability
- Used for ordering imagery

**🟧 Orange Rectangles**
- Active monitoring areas
- Receiving automatic updates
- New imagery notifications enabled

### Marker Popups

Click any marker to see:
- **Name**: Feature name from OSM
- **Type**: Building/warehouse/solar farm/etc.
- **Coordinates**: Precise lat/lon
- **Tags**: OSM metadata (up to 10 tags)

### Rectangle Popups

Click any rectangle to see:
- **AOI Details**: Name, description, coordinates
- **Satellite Info**: Availability, pricing, resolution
- **Monitoring Status**: Active/inactive
- **Actions**: Order or monitor buttons

---

## 🎓 Tips & Best Practices

### For Better Search Results

1. **Be Specific with Location**
   - ✅ "Find warehouses in Austin, Texas"
   - ❌ "Find warehouses" (too vague)

2. **Use Reasonable Search Radius**
   - ✅ "within 5km" for cities
   - ✅ "within 20km" for regions
   - ❌ "within 100km" (may be too many results)

3. **Refine Your Search**
   - Start broad: "Find warehouses in Austin"
   - Then narrow: "Show the 5 largest"
   - Then act: "Price the largest one"

### For Cost-Effective Imagery

1. **Start with HIGH Resolution**
   - Good quality for most use cases
   - 3-5x cheaper than SUPER HIGH
   - Sufficient for monitoring changes

2. **Use SAR for Reliability**
   - Weather-independent (works through clouds)
   - Year-round availability
   - Consistent capture opportunities

3. **Bulk Orders for Savings**
   - "Price all 10 locations" gets better rates
   - Use bulk operations for multiple sites
   - Combine orders when possible

### For Ongoing Monitoring

1. **Set Up Monitors Early**
   - Get historical baseline first
   - Set up before changes expected
   - Monthly cadence for most use cases

2. **Use Appropriate Resolution**
   - HIGH for general monitoring
   - SUPER HIGH for detailed analysis
   - ULTRA HIGH only when necessary

3. **Configure Webhooks**
   - Get instant notifications
   - Automate downstream processing
   - Integrate with your systems

---

## 🐛 Troubleshooting

### Map Not Loading
- Check that all 3 services are running
- Verify ports: MCP (3000), Backend (3001), Frontend (5173)
- Check browser console for errors

### No Search Results
- Verify location spelling
- Try broader search radius
- Use more general feature type

### Can't See Markers
- Wait for chat response to complete
- Check if map is zoomed too far out
- Try "zoom to fit all markers"

### Pricing Not Available
- Some regions may not have coverage
- Try different resolution
- Check SkyFi API key configuration

### Tool Calls Failing
- Verify MCP server is running
- Check API keys in `.env`
- Review backend console logs

---

## 🔗 Related Documentation

- **OSM_SKYFI_DEMO.md** - Comprehensive demo script
- **OSM_INTEGRATION_IMPLEMENTATION.md** - Technical details
- **MCP_DEMO.md** - Original MCP tools demo
- **BULK_OPERATIONS.md** - Bulk operations guide

---

## 🎉 You're Ready!

Start with a simple query:

```
"Find warehouses in [your city]"
```

The system will:
1. Search OpenStreetMap
2. Display results on the map
3. Let you interact and get satellite imagery

**Have fun exploring!** 🚀🛰️
