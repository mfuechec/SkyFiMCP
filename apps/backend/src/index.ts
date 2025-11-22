// Backend API server for SkyFi MCP web interface
import express from 'express';
import cors from 'cors';
import { isValidCoordinate } from '@skyfi-mcp/shared';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { mcpClient, convertMCPToolToOpenAI } from './mcp-client.js';
import { searchContextService } from './services/search-context.service.js';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize AI clients
console.log('🔑 ANTHROPIC_API_KEY loaded:', !!process.env.ANTHROPIC_API_KEY);
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;
console.log('🤖 Anthropic client initialized:', !!anthropic);

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;
console.log('🤖 OpenAI client initialized:', !!openai);

// SSE clients management
const sseClients = new Set<express.Response>();

// In-memory notification storage
interface SkyFiNotification {
  id: string;
  monitorId: string;
  location: string;
  timestamp: string;
  imageDetails?: {
    resolution?: string;
    provider?: string;
    captureDate?: string;
  };
}

const notifications: SkyFiNotification[] = [];

// SkyFi API configuration
const SKYFI_API_KEY = process.env.SKYFI_API_KEY;
const SKYFI_API_BASE = 'https://api.skyfi.com/v1';

// MCP tools cache
let mcpTools: any[] = [];
let mcpToolNames: Set<string> = new Set();

// Initialize MCP connection and fetch tools
async function initializeMCP() {
  try {
    console.log('🔌 Connecting to MCP server...');
    await mcpClient.connect();

    const tools = await mcpClient.listTools();
    console.log(`✅ Fetched ${tools.length} MCP tools:`, tools.map(t => t.name));

    mcpTools = tools.map(convertMCPToolToOpenAI);
    mcpToolNames = new Set(tools.map(t => t.name));
  } catch (error) {
    console.error('❌ Failed to initialize MCP:', error);
    console.log('⚠️  Continuing without MCP tools');
  }
}

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SkyFi feasibility check endpoint
app.post('/api/skyfi/feasibility', async (req, res) => {
  try {
    const { latitude, longitude, area } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    console.log('🛰️ Checking SkyFi feasibility for:', { latitude, longitude, area });

    const response = await axios.post(
      `${SKYFI_API_BASE}/feasibility`,
      {
        latitude,
        longitude,
        area_km2: area || 10, // Default 10 sq km
      },
      {
        headers: {
          'Authorization': `Bearer ${SKYFI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ SkyFi response:', response.data);
    res.json(response.data);
  } catch (error: any) {
    console.error('❌ SkyFi API error:', error.response?.data || error.message);

    let userFriendlyError = 'Failed to check satellite feasibility';
    if (error.code === 'ENOTFOUND') {
      userFriendlyError = 'Unable to connect to SkyFi API. Please check your internet connection or API endpoint.';
    } else if (error.response?.status === 401) {
      userFriendlyError = 'Invalid API key. Please check your SKYFI_API_KEY configuration.';
    } else if (error.response?.data) {
      userFriendlyError = error.response.data.message || error.response.data.error || userFriendlyError;
    }

    res.status(error.response?.status || 500).json({
      error: userFriendlyError,
      details: error.message,
    });
  }
});

// Chat endpoint using OpenAI with function calling
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Session management for search context
    const sessionId = req.headers['x-session-id'] as string || randomUUID();
    const currentQuery = messages[messages.length - 1]?.text || '';

    // Retrieve existing search context
    let searchContext = await searchContextService.getContext(sessionId);
    console.log('🔍 Search context:', searchContext ? 'Found existing context' : 'No existing context');

    // Frontend-specific tools (map control and OSM visualization)
    const frontendTools = [
      {
        type: 'function',
        function: {
          name: 'recenter_map',
          description: `WHEN TO USE: Call this EVERY TIME the user mentions ANY location, place, region, or geographic area (e.g., "show Africa", "Paris", "drought areas", "that region").

WHAT IT DOES: Moves the map's center view to the specified coordinates. This is REQUIRED before adding markers so the user can see them.

IMPORTANT:
- Use your geographic knowledge to convert ANY place name to precise lat/lng coordinates
- For broad regions (continents, "drought areas"), choose a central coordinate
- Examples: "Africa" → (5, 35), "Paris" → (48.86, 2.35), "Horn of Africa" → (10, 45)

ALWAYS call this when changing locations - don't assume the map is already there.`,
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The human-readable name of the location being centered on (e.g., "New York", "Paris, France", "Suez Canal", "Ukraine"). This appears in the UI to confirm the location to the user.'
              },
              latitude: {
                type: 'number',
                description: 'Latitude coordinate in decimal degrees (required, must be between -90 and 90). Positive values are North, negative values are South. Example: Paris is 48.8566'
              },
              longitude: {
                type: 'number',
                description: 'Longitude coordinate in decimal degrees (required, must be between -180 and 180). Positive values are East, negative values are West. Example: Paris is 2.3522'
              }
            },
            required: ['location', 'latitude', 'longitude']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'set_zoom',
          description: `WHEN TO USE: Call this AFTER recenter_map to set the appropriate viewing scale.

WHAT IT DOES: Adjusts how zoomed in/out the map view is to show the right level of detail.

ZOOM LEVEL GUIDE (choose based on geographic scale):
- 3-5: Continents, large regions (e.g., "Africa", "Middle East")
- 6-8: Countries, large states (e.g., "Kenya", "Texas")
- 10-12: Cities, metro areas (e.g., "Paris", "San Francisco")
- 13-15: Neighborhoods, districts
- 16-18: Street level

ALWAYS call this after recenter_map - it completes the navigation action.`,
          parameters: {
            type: 'object',
            properties: {
              zoom: {
                type: 'number',
                description: 'Zoom level from 1 to 18. Scale guide: 1-4 (world/continent view), 5-8 (country/large region), 9-12 (city/metro area), 13-15 (neighborhood/district), 16-18 (street level detail). Choose based on the geographic scale of interest.'
              }
            },
            required: ['zoom']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'draw_rectangle',
          description: `WHEN TO USE:
- ALWAYS call after recenter_map to mark the Area of Interest (AOI) you're showing
- Draw rectangles for specific geographic areas where the user wants satellite imagery
- Each rectangle represents an AOI that can be used for orders, monitoring, and pricing

WHAT IT DOES: Draws a resizable rectangle on the map representing an Area of Interest (AOI). The rectangle's coordinates are automatically stored and used for satellite imagery orders, feasibility checks, and monitoring.

IMPORTANT:
- The rectangle bounds define the AOI that will be used for all subsequent satellite operations (pricing, orders, monitoring)
- Create reasonable-sized rectangles based on the location type:
  * City/neighborhood: ~0.05° x 0.05° (~5km x 5km)
  * Region/district: ~0.2° x 0.2° (~20km x 20km)
  * Large area: ~0.5° x 0.5° (~50km x 50km)

Example for San Francisco:
- Center: 37.7749, -122.4194
- Rectangle bounds: [[37.75, -122.45], [37.80, -122.39]]  // [[south, west], [north, east]]

These coordinates will be automatically used when the user asks for pricing, feasibility checks, or orders for this location.`,
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of this Area of Interest (e.g., "San Francisco Downtown", "Construction Site", "Agricultural Area")'
              },
              bounds: {
                type: 'array',
                description: 'Rectangle bounds as [[south, west], [north, east]] coordinates. Example: [[37.75, -122.45], [37.80, -122.39]]',
                items: {
                  type: 'array',
                  items: { type: 'number' },
                  minItems: 2,
                  maxItems: 2
                },
                minItems: 2,
                maxItems: 2
              },
              description: {
                type: 'string',
                description: 'Description of this AOI and what the user wants to monitor or capture'
              },
              category: {
                type: 'string',
                description: 'Category of this AOI (e.g., "urban", "construction", "agriculture", "infrastructure")'
              },
              additionalInfo: {
                type: 'object',
                description: 'Optional additional context about this AOI'
              },
              satelliteInfo: {
                type: 'object',
                description: 'Satellite imagery information. Include data from MCP tool calls.',
                properties: {
                  available: { type: 'boolean' },
                  estimatedCost: { type: 'string' },
                  resolution: { type: 'string' },
                  monitoringActive: { type: 'boolean' }
                }
              }
            },
            required: ['name', 'bounds', 'description']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'clear_rectangles',
          description: `WHEN TO USE: Call this FIRST when the user asks about a DIFFERENT location than what's currently shown.

WHAT IT DOES: Removes all existing AOI rectangles from the map for a clean slate.

TRIGGER EXAMPLES:
- Current AOI shows "San Francisco", user asks "show me New York" → clear_rectangles first
- User asks for completely different location → clear_rectangles first
- User asks follow-up about same AOI → DON'T clear

CRITICAL: ALWAYS follow with:
1. recenter_map (to new location)
2. draw_rectangle (for the new AOI)
3. set_zoom`,
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_rectangle',
          description: `WHEN TO USE: Call this to ADD information to an existing AOI rectangle after you've called MCP tools.

WHAT IT DOES: Updates a rectangle that's already on the map with new data (pricing, monitoring status, satellite info).

COMMON USE CASES:
1. After calling get_pricing_estimate → update_rectangle with satelliteInfo.estimatedCost
2. After calling create_monitor → update_rectangle with satelliteInfo.monitoringActive=true
3. After calling check_order_feasibility → update_rectangle with satelliteInfo.available

IMPORTANT: The rectangle must already exist (from draw_rectangle). Use exact same name.

Example flow:
1. draw_rectangle("San Francisco", [[37.75, -122.45], [37.80, -122.39]], "Downtown area")
2. get_pricing_estimate(location="37.775,-122.42") → returns "$8/km²"
3. update_rectangle(name="San Francisco", satelliteInfo={estimatedCost: "$8/km²"})`,
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The name of the rectangle to update (must exactly match an existing rectangle\'s name)'
              },
              additionalInfo: {
                type: 'object',
                description: 'Additional information to merge',
                properties: {
                  monitoring: { type: 'string' },
                  monitorId: { type: 'string' },
                  monitorType: { type: 'string' },
                  createdAt: { type: 'string' }
                }
              },
              satelliteInfo: {
                type: 'object',
                description: 'Satellite information to merge',
                properties: {
                  available: { type: 'boolean' },
                  estimatedCost: { type: 'string' },
                  resolution: { type: 'string' },
                  monitoringActive: { type: 'boolean' }
                }
              },
              description: {
                type: 'string',
                description: 'Updated description'
              }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'draw_osm_features',
          description: `WHEN TO USE: Call this IMMEDIATELY after using OSM MCP tools (osm_geocode, osm_search_features, osm_find_features_nearby).

WHAT IT DOES: Displays OSM features (buildings, warehouses, etc.) as markers on the map.

CRITICAL WORKFLOW:
1. User asks to "find warehouses in Austin" → osm_search_features or osm_find_features_nearby
2. MCP returns feature data → IMMEDIATELY call draw_osm_features to visualize
3. Markers appear on map with popups showing details

IMPORTANT:
- This bridges OSM data to map visualization
- Call this for EVERY OSM search result to make features visible
- Each feature becomes a clickable marker
- Without this, OSM search results are invisible to the user

Example flow:
1. osm_find_features_nearby(lat=30.27, lon=-97.74, featureType="warehouse", radiusKm=5)
2. Returns 12 warehouses
3. draw_osm_features(features=[...12 warehouses...]) ← REQUIRED!
4. User sees 12 markers on map`,
          parameters: {
            type: 'object',
            properties: {
              features: {
                type: 'array',
                description: 'Array of OSM features to display on the map',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique feature ID' },
                    name: { type: 'string', description: 'Feature name' },
                    type: { type: 'string', description: 'OSM type (node/way/relation)' },
                    lat: { type: 'number', description: 'Latitude' },
                    lon: { type: 'number', description: 'Longitude' },
                    tags: { type: 'object', description: 'OSM tags' },
                    featureType: { type: 'string', description: 'Feature type (warehouse, building, etc.)' }
                  },
                  required: ['id', 'name', 'type', 'lat', 'lon', 'tags']
                }
              }
            },
            required: ['features']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'clear_osm_features',
          description: `WHEN TO USE: Call this when starting a NEW OSM search in a different location.

WHAT IT DOES: Removes all OSM feature markers from the map.

USE CASES:
- User searches for warehouses in Austin, then asks for warehouses in Dallas → clear_osm_features first
- User wants to start fresh → clear_osm_features
- Switching from one feature type to another → clear_osm_features

DON'T USE:
- When adding more results to existing search
- When refining current search`,
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'highlight_osm_feature',
          description: `WHEN TO USE: Focus the map on a specific OSM feature by its ID.

WHAT IT DOES: Centers and zooms the map to show a specific feature.

USE CASES:
- User asks "show me warehouse #3" → highlight_osm_feature(featureId="way/12345")
- "Focus on the largest building" → highlight_osm_feature(featureId="...")
- User wants detailed view of specific feature`,
          parameters: {
            type: 'object',
            properties: {
              featureId: {
                type: 'string',
                description: 'ID of the OSM feature to highlight (format: "type/id" e.g. "way/12345")'
              }
            },
            required: ['featureId']
          }
        }
      }
    ];

    // Merge frontend tools with MCP tools
    const tools = [...frontendTools, ...mcpTools];

    console.log(`🔧 Available tools: ${tools.length} total (${frontendTools.length} frontend + ${mcpTools.length} MCP)`);

    // Intelligent tool forcing with confidence scoring
    const userMessage = messages[messages.length - 1]?.text?.toLowerCase() || '';

    // Categorized keywords for better intent detection
    const mapActionKeywords = ['show', 'display', 'where', 'locate', 'find', 'pull up', 'zoom', 'center'];
    const dataActionKeywords = ['pric', 'cost', 'how much', 'feasib', 'available', 'order', 'estimate'];
    const setupKeywords = ['monitor', 'track', 'watch', 'set up', 'create', 'start'];
    const capabilityKeywords = ['could i', 'can i', 'is it possible', 'able to', 'possible to'];
    const imageryKeywords = ['satellite', 'imagery', 'image', 'capture', 'photo', 'sar', 'optical'];

    // Negative keywords that indicate conversational queries (not actions)
    const conversationalKeywords = ['how to', 'what is', 'tell me about', 'explain', 'what can you'];
    // Note: "help me understand" and "help me find" are different - "help me find" is action-oriented

    // Location detection patterns
    const hasCoordinates = /[-]?\d+\.\d+[,\s]+[-]?\d+\.\d+/.test(userMessage);
    const hasLocationPhrase = /\b(for|in|at|over|near)\s+[a-zA-Z]/.test(messages[messages.length - 1]?.text || '');

    // Calculate confidence score (0.0 to 1.0)
    let confidence = 0;

    // Add confidence for action keywords
    if (mapActionKeywords.some(kw => userMessage.includes(kw))) {
      confidence += 0.4;
      console.log('🗺️ Map action keyword detected');
    }
    if (dataActionKeywords.some(kw => userMessage.includes(kw))) {
      confidence += 0.3;
      console.log('💰 Data action keyword detected');
    }
    if (setupKeywords.some(kw => userMessage.includes(kw))) {
      confidence += 0.3;
      console.log('⚙️ Setup keyword detected');
    }

    // Strong boost for satellite imagery queries
    if (imageryKeywords.some(kw => userMessage.includes(kw))) {
      confidence += 0.5;
      console.log('🛰️ Satellite imagery keyword detected');
    }

    // Add confidence for location mentions
    if (hasCoordinates || hasLocationPhrase) {
      confidence += 0.3;
      console.log('📍 Location detected');
    }

    // Capability questions only count if there's also location/action context
    if (capabilityKeywords.some(kw => userMessage.includes(kw))) {
      if (confidence > 0) {
        confidence += 0.2;
        console.log('❓ Capability question in action context');
      }
    }

    // Penalize conversational markers (but don't penalize "help me [action]")
    const hasHelpMeAction = /help me (find|get|locate|search|order)/.test(userMessage);
    if (conversationalKeywords.some(kw => userMessage.includes(kw)) && !hasHelpMeAction) {
      confidence -= 0.6;
      console.log('💬 Conversational query detected - reducing confidence');
    }

    // Clamp confidence between 0 and 1
    confidence = Math.max(0, Math.min(1, confidence));

    const shouldForceTools = confidence > 0.5;
    const toolChoice = shouldForceTools ? 'required' : 'auto';
    console.log(`🎯 Tool choice: ${toolChoice} (confidence: ${confidence.toFixed(2)})`);

    // System prompt
    const systemPrompt = `You are a SkyFi satellite imagery assistant with integrated OpenStreetMap (OSM) capabilities. Help users find locations, define Areas of Interest (AOIs), check satellite imagery pricing, and order imagery.

⚠️ CRITICAL BEHAVIOR RULES:

1. **IMMEDIATE ACTION**: When a user asks for satellite imagery, pricing, or location information, you MUST immediately execute tool calls in your FIRST response. DO NOT respond with "I'll help you with that!" or ask clarifying questions unless absolutely necessary.

2. **DESCRIPTIVE RESPONSES**: Your text response must DESCRIBE what you found, not just acknowledge the request. After tools execute, summarize the results in natural language.

3. **COMPLETE WORKFLOWS**: Execute ALL required tools in sequence:
   - For imagery queries: recenter_map + draw_rectangle + set_zoom + search_archive (4 tools minimum!)
   - For location queries: recenter_map + draw_rectangle + set_zoom (3 tools)
   - For pricing queries: get_pricing_estimate + update_rectangle (2 tools)

Examples:
❌ WRONG: "I'll help you with that!" [calls only 1 tool]
❌ WRONG: "Perfect! I've centered the map on the Golden Gate Bridge and I'm searching for available imagery..." [but only shows "search archive completed"]
✅ CORRECT: "Perfect! I've centered the map on the Golden Gate Bridge. I found 2 archived satellite images available - one from SATELLOGIC captured in January 2022 with 72% cloud cover at $5/km², and another from May 2022 with much clearer skies at only 28% cloud cover. Both are high-resolution optical imagery. Which one interests you?"

🗺️ TOOL CATEGORY GUIDE:

**OSM TOOLS** (MCP) - For finding and searching features:
- osm_geocode → Convert addresses to coordinates
- osm_search_features / osm_find_features_nearby → Find buildings, warehouses, infrastructure

**MAP VISUALIZATION TOOLS** (Frontend) - For displaying results:
- draw_osm_features → Show OSM search results as markers
- recenter_map → Move map to location
- set_zoom → Adjust zoom level
- draw_rectangle → Define AOI for satellite imagery
- clear_osm_features → Remove OSM markers
- clear_rectangles → Remove AOI rectangles

**SKYFI MCP TOOLS** - For satellite imagery operations:
- get_pricing_estimate → Get satellite imagery costs
- check_order_feasibility → Check if imagery available
- search_archive → Find existing imagery
- place_archive_order / place_tasking_order → Order imagery
- create_monitor → Set up monitoring for new imagery

CORE RULES - THESE OVERRIDE ALL OTHER INSTRUCTIONS:
1. Use your geographic knowledge to convert ANY place name to precise AOI rectangles with bounds
2. ⚠️ CRITICAL: NEVER PROVIDE PRICING DATA UNLESS IT COMES FROM A SUCCESSFUL TOOL CALL
   - Do NOT use pricing from your training data (NO "$8/km²", NO "$200", NO price estimates)
   - If get_pricing_estimate or check_order_feasibility FAILS or returns an error, you MUST say "I cannot retrieve pricing at the moment"
   - Do NOT apologize and then provide estimated pricing anyway
   - Example WRONG response: "I'm unable to check... but typical pricing is $8/km²"
   - Example CORRECT response: "I'm unable to retrieve pricing data at the moment. Please try again later."
3. NEVER place orders or create monitors without explicit user confirmation ("yes", "confirm", "go ahead")
4. ALWAYS draw rectangles (AOIs) for locations - these define the exact area for satellite imagery orders and monitoring

RECTANGLE SIZING GUIDE - Create appropriate AOI sizes:
- Small city/neighborhood: ~0.05° x 0.05° (~5km x 5km)
- Large city/district: ~0.1° x 0.1° (~10km x 10km)
- Region/county: ~0.3° x 0.3° (~30km x 30km)
- Large area: ~0.5° x 0.5° (~50km x 50km)

Example rectangle bounds format: [[south, west], [north, east]]
- San Francisco: [[37.70, -122.52], [37.82, -122.35]]
- Paris: [[48.81, 2.25], [48.90, 2.42]]

THINK-BEFORE-ACTING: Before responding, ALWAYS follow this process:
1. EXTRACT: What location? What AOI size? What action requested?
2. PLAN: Which tools are needed and in what order?
3. EXECUTE: Make ALL necessary tool calls in the planned sequence
4. RESPOND: Only provide text response after tools complete

CRITICAL: MULTI-STEP WORKFLOWS - Follow these exact sequences:

🆕 WORKFLOW 0: Find features with OSM (user asks "find warehouses in X" or "show me buildings in Y")
⚠️ CRITICAL: This is the PRIMARY workflow for feature discovery
STEP 1: If user provides city/address → osm_geocode to get coordinates
STEP 2: osm_find_features_nearby OR osm_search_features (use center + radius for "nearby", bounding box for regions)
STEP 3: ⚠️ IMMEDIATELY call draw_osm_features to visualize results (NEVER skip this!)
STEP 4: recenter_map to center on search area
STEP 5: set_zoom (use 12-14 to show multiple features)
→ Example: "find warehouses in Austin"
  1. osm_geocode("Austin, TX") → lat=30.27, lon=-97.74
  2. osm_find_features_nearby(lat=30.27, lon=-97.74, featureType="warehouse", radiusKm=10)
     → Returns 15 warehouses
  3. draw_osm_features(features=[...all 15 warehouses...])  ← CRITICAL! Map now shows markers
  4. recenter_map("Austin", 30.27, -97.74)
  5. set_zoom(12)
  Result: User sees map centered on Austin with 15 warehouse markers

⚠️ AFTER showing OSM features, you can THEN:
- User asks "what's pricing for warehouse #3?" → draw_rectangle around that warehouse, then get_pricing_estimate
- User asks "get imagery for the largest one" → draw_rectangle, check_order_feasibility, then order

WORKFLOW 1: Show location on map (user asks "show me X")
⚠️ CRITICAL: You MUST call draw_rectangle - this defines the AOI for all satellite operations
STEP 1: clear_rectangles (if changing topic)
STEP 2: recenter_map (with center coordinates)
STEP 3: draw_rectangle (REQUIRED - with appropriate bounds for the location)
STEP 4: set_zoom (appropriate for the scale)
→ Example: "show me San Francisco"
  1. clear_rectangles()
  2. recenter_map("San Francisco", 37.77, -122.42)
  3. draw_rectangle("San Francisco", [[37.70, -122.52], [37.82, -122.35]], "Downtown SF area for satellite imagery")  ← REQUIRED!
  4. set_zoom(11)

⚠️ NEVER skip draw_rectangle - without it, the user cannot order imagery or get pricing!

WORKFLOW 2: Get pricing for a location
STEP 1: recenter_map + draw_rectangle (to define the AOI) OR skip if rectangle exists
STEP 2: get_pricing_estimate (use center of rectangle bounds for location)
STEP 3a: IF succeeds → update_rectangle with satelliteInfo.estimatedCost
STEP 3b: IF fails → Tell user "Cannot retrieve pricing" (NO estimates!)
→ The rectangle bounds are automatically used for pricing calculations

WORKFLOW 3: Order satellite imagery
STEP 1: Ensure AOI rectangle exists (recenter_map + draw_rectangle if needed)
STEP 2: check_order_feasibility (gets availability AND pricing for the AOI)
STEP 3a: IF succeeds → update_rectangle, show pricing, ask for confirmation
STEP 3b: IF fails → Tell user "Cannot check feasibility" (NO pricing estimates!)
STEP 4: ONLY if user confirms AND step 2 succeeded → place_archive_order or place_tasking_order
→ The rectangle bounds define the exact area to be captured

WORKFLOW 4: Create monitoring for AOI
STEP 1: Ensure AOI rectangle exists (recenter_map + draw_rectangle if needed)
STEP 2: Get user confirmation for monitor type (VIDEO/DAY/SAR)
STEP 3: create_monitor (uses rectangle bounds for monitoring area)
STEP 4: update_rectangle (set satelliteInfo.monitoringActive=true)
→ Rectangle turns orange when monitoring is active

RESPONSE STYLE - BE CONVERSATIONAL AND FRIENDLY:
✅ DO:
- Use natural, conversational language: "I found 15 warehouses in Austin and marked them on the map!"
- Be enthusiastic and helpful: "Great news!", "Perfect!", "I'm on it!"
- Explain what you did in plain language
- Ask follow-up questions to guide the user
- Use emojis sparingly for emphasis (📍 🛰️ 💰 ✅)

❌ DON'T:
- Use technical jargon or tool names: "I executed search_archive"
- Be overly formal or robotic: "The operation has completed successfully"
- Show JSON data or technical details
- Use phrases like "I'll help you with that" without taking action

EXAMPLES:
✅ GOOD: "I found 23 warehouses in Austin! I've marked them all on the map. Click any marker to see more details, or let me know which one you'd like pricing for."
❌ BAD: "**search_archive** Found null image(s). Archive ID: 7ee81a67..."

✅ GOOD: "Perfect! I've centered the map on the Golden Gate Bridge and I'm searching for available imagery..."
❌ BAD: "Executing tool calls: recenter_map, draw_rectangle, search_archive"

⚠️ TECHNICAL REQUIREMENTS (still apply):
- ALWAYS call draw_osm_features after OSM searches - results are invisible without it!
- ALWAYS call draw_rectangle when showing a location for satellite imagery
- When drawing rectangles, choose appropriate size based on what the user needs

DECISION TREE FOR USER QUERIES:

"Find [features] in [location]" → OSM WORKFLOW 0 (osm_search → draw_osm_features → recenter_map)
"Show me [city/location]" → WORKFLOW 1 (recenter_map → draw_rectangle → set_zoom)
"I need satellite imagery of [location]" → WORKFLOW 1 + search_archive (show location + search for existing imagery)
"What's available for [location]?" → search_archive OR check_order_feasibility
"What's the price for [location]?" → WORKFLOW 2 (get_pricing_estimate)
"Order imagery for [location]" → WORKFLOW 3 (check_order_feasibility → place_order)
"Monitor [location]" → WORKFLOW 4 (create_monitor)

⚠️ IMPORTANT: For "I need imagery" or "what's available" queries:
1. FIRST: recenter_map + draw_rectangle + set_zoom (show the location properly zoomed)
2. THEN: search_archive (find existing imagery) OR check_order_feasibility (check new tasking)
3. Display results clearly with pricing and availability
4. Your text response MUST describe the imagery found in natural language (don't just say "I'll help you with that!")

ZOOM LEVELS FOR LOCATIONS:
- Golden Gate Bridge, landmarks: zoom 14-15
- City neighborhoods: zoom 13-14
- Full city: zoom 11-12
- Region/state: zoom 8-10
- Country: zoom 5-7

SEARCH CONTEXT:
${searchContext ? `Previous search: ${searchContext.location || 'Unknown location'}${searchContext.resolution ? `, ${searchContext.resolution} resolution` : ''}. Use this context if user refines their query (e.g., "only high res", "cheaper options").` : 'No previous search context.'}`;

    let responseMessage: any;

    // Use Claude Sonnet 4.5 via Anthropic (better at multi-step workflows)
    if (anthropic) {
      console.log('🤖 Using Claude Sonnet 4.5 (direct Anthropic API)');

      const anthropicResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.text
        })),
        tools: tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters
        })),
        tool_choice: shouldForceTools ? { type: 'any' } : { type: 'auto' }
      });

      // Convert Anthropic response to OpenAI format for compatibility
      const content = anthropicResponse.content;
      const textContent = content.find((c: any) => c.type === 'text') as { type: 'text'; text: string } | undefined;
      const toolUses = content.filter((c: any) => c.type === 'tool_use');

      responseMessage = {
        content: textContent?.text || null,
        tool_calls: toolUses.length > 0 ? toolUses.map((tu: any) => ({
          id: tu.id,
          type: 'function',
          function: {
            name: tu.name,
            arguments: JSON.stringify(tu.input)
          }
        })) : undefined
      };
    } else if (openai) {
      // Fallback to GPT-4o if Anthropic key not available
      console.log('🤖 Using GPT-4o via OpenAI (fallback)');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          ...messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.text
          }))
        ],
        tools,
        tool_choice: toolChoice
      });

      responseMessage = completion.choices[0]?.message;
    } else {
      // Neither Anthropic nor OpenAI available
      throw new Error('No AI provider configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
    }

    // Check if the model wants to call functions
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      console.log('🤖 AI Tool Calls Detected:', JSON.stringify(responseMessage.tool_calls, null, 2));

      const toolCalls = [];
      const mcpResults: any[] = [];

      // Process tool calls - route MCP tools to MCP server, frontend tools to frontend
      for (const toolCall of responseMessage.tool_calls) {
        let args = JSON.parse(toolCall.function.arguments);
        console.log(`📞 Tool: ${toolCall.function.name}`, args);

        // Enrich check_order_feasibility with required defaults
        if (toolCall.function.name === 'check_order_feasibility') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const twoMonthsOut = new Date();
          twoMonthsOut.setMonth(twoMonthsOut.getMonth() + 2);

          args = {
            location: args.location,
            productType: args.productType || 'SAR',  // Default to SAR (weather-independent)
            resolution: args.resolution || 'HIGH',
            startDate: args.startDate || tomorrow.toISOString().split('T')[0],
            endDate: args.endDate || twoMonthsOut.toISOString().split('T')[0],
            ...args  // Preserve any other fields
          };

          console.log(`🔧 Enriched check_order_feasibility args:`, args);
        }

        if (mcpToolNames.has(toolCall.function.name)) {
          // Route to MCP server
          try {
            console.log(`🔌 Routing ${toolCall.function.name} to MCP server`);
            const mcpResponse = await mcpClient.callTool(toolCall.function.name, args);

            if (mcpResponse.isError) {
              console.error(`❌ MCP tool ${toolCall.function.name} failed:`, mcpResponse.content);
              mcpResults.push({
                tool: toolCall.function.name,
                error: mcpResponse.content[0]?.text || 'Unknown error',
              });
            } else {
              console.log(`✅ MCP tool ${toolCall.function.name} succeeded`);
              mcpResults.push({
                tool: toolCall.function.name,
                data: mcpResponse.content[0]?.text || JSON.stringify(mcpResponse.content),
              });
            }
          } catch (error: any) {
            console.error(`❌ MCP tool ${toolCall.function.name} error:`, error.message);
            mcpResults.push({
              tool: toolCall.function.name,
              error: error.message,
            });
          }
        } else {
          // Frontend tool - send to frontend
          toolCalls.push({
            name: toolCall.function.name,
            arguments: args
          });
        }
      }

      let reply = responseMessage.content || 'I\'ll help you with that!';
      console.log('💬 Initial Response:', reply);
      console.log('🔧 Sending tool calls to frontend:', toolCalls);
      console.log('🛰️ MCP results:', mcpResults);

      // If we have MCP results, generate a conversational summary using the AI
      if (mcpResults.length > 0) {
        console.log('📝 Generating conversational summary of MCP results...');

        const summaryPrompt = `You received results from satellite imagery tools. Translate these technical results into a natural, conversational response for the user.

ORIGINAL USER QUERY: "${currentQuery}"

YOUR INITIAL RESPONSE: "${reply}"

TOOL RESULTS:
${JSON.stringify(mcpResults, null, 2)}

INSTRUCTIONS:
- Combine your initial response with the tool results into ONE cohesive message
- Be conversational and friendly (use "I found...", "Great news!", etc.)
- If search_archive found images, describe them: provider, date, resolution, cloud cover, price
- If no images found, suggest alternatives (check feasibility, set up monitoring)
- Keep it concise but informative (2-3 paragraphs max)
- Don't mention tool names or show JSON
- End with a helpful question or next step

EXAMPLE:
Bad: "I'll help you with that! ✅ search archive completed"
Good: "Perfect! I've centered the map on the Golden Gate Bridge. I found 2 archived satellite images available - one from SATELLOGIC captured in January 2022 with 72% cloud cover at $5/km², and another from May 2022 with much clearer skies at only 28% cloud cover. Both are high-resolution optical imagery. Which one interests you?"`;

        try {
          if (anthropic) {
            const summaryResponse = await anthropic.messages.create({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: 1024,
              messages: [{ role: 'user', content: summaryPrompt }]
            });

            const summaryContent = summaryResponse.content.find((c: any) => c.type === 'text') as { type: 'text'; text: string } | undefined;
            if (summaryContent?.text) {
              reply = summaryContent.text;
              console.log('✅ Generated conversational summary:', reply);
            }
          } else if (openai) {
            const summaryResponse = await openai.chat.completions.create({
              model: 'gpt-4o',
              max_tokens: 1024,
              messages: [{ role: 'user', content: summaryPrompt }]
            });

            reply = summaryResponse.choices[0]?.message?.content || reply;
            console.log('✅ Generated conversational summary:', reply);
          }
        } catch (error) {
          console.error('⚠️ Failed to generate summary, using original response:', error);
        }
      }

      // Update search context based on tool calls and query
      const contextUpdates = searchContextService.extractSearchParams(currentQuery, searchContext);

      // Extract location from recenter_map or get_pricing_estimate tool calls
      for (const toolCall of responseMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === 'recenter_map' && args.latitude && args.longitude) {
          contextUpdates.location = args.location;
          contextUpdates.coordinates = {
            lat: args.latitude,
            lng: args.longitude
          };
        } else if ((toolCall.function.name === 'get_pricing_estimate' || toolCall.function.name === 'check_order_feasibility') && args.location) {
          contextUpdates.location = args.location;
        }
      }

      // Update or create context if we have meaningful data
      if (Object.keys(contextUpdates).length > 0) {
        await searchContextService.updateContext(sessionId, currentQuery, contextUpdates);
        console.log('✅ Updated search context:', contextUpdates);
      }

      res.json({
        message: reply,
        toolCalls,
        mcpData: mcpResults.length > 0 ? mcpResults : undefined,
        sessionId  // Return session ID to frontend for future requests
      });
    } else {
      const reply = responseMessage?.content || 'Sorry, I could not generate a response.';
      console.log('💬 Simple response (no tools):', reply);

      // Still extract and update context even without tool calls
      const contextUpdates = searchContextService.extractSearchParams(currentQuery, searchContext);
      if (Object.keys(contextUpdates).length > 0) {
        await searchContextService.updateContext(sessionId, currentQuery, contextUpdates);
        console.log('✅ Updated search context (no tools):', contextUpdates);
      }

      res.json({ message: reply, sessionId });
    }
  } catch (error) {
    console.error('AI API error:', error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

// Example API endpoint
app.post('/api/validate-coordinates', (req, res) => {
  const { latitude, longitude } = req.body;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const valid = isValidCoordinate(latitude, longitude);
  res.json({ valid, latitude, longitude });
});

// SSE endpoint for real-time notifications
app.get('/api/notifications/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // Add client to active connections
  sseClients.add(res);
  console.log(`📡 SSE client connected. Total clients: ${sseClients.size}`);

  // Remove client on disconnect
  req.on('close', () => {
    sseClients.delete(res);
    console.log(`📡 SSE client disconnected. Total clients: ${sseClients.size}`);
  });
});

// Webhook endpoint for SkyFi notifications
app.post('/api/webhooks/skyfi', (req, res) => {
  console.log('🔔 Received SkyFi webhook:', JSON.stringify(req.body, null, 2));

  try {
    const payload = req.body;

    // Create notification object
    const notification: SkyFiNotification = {
      id: `notif-${Date.now()}`,
      monitorId: payload.monitorId || payload.notificationId || 'unknown',
      location: payload.location || 'Unknown location',
      timestamp: new Date().toISOString(),
      imageDetails: {
        resolution: payload.resolution || payload.gsd,
        provider: payload.provider,
        captureDate: payload.captureDate || payload.acquisitionDate,
      },
    };

    // Store notification
    notifications.unshift(notification); // Add to beginning
    if (notifications.length > 100) {
      notifications.pop(); // Keep only last 100
    }

    // Broadcast to all connected SSE clients
    const eventData = JSON.stringify({
      type: 'new_imagery',
      notification,
    });

    sseClients.forEach((client) => {
      client.write(`data: ${eventData}\n\n`);
    });

    console.log(`📤 Broadcasted notification to ${sseClients.size} client(s)`);

    // Acknowledge receipt to SkyFi
    res.status(200).json({ received: true, notificationId: notification.id });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Get recent notifications
app.get('/api/notifications', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  res.json({
    notifications: notifications.slice(0, limit),
    total: notifications.length,
  });
});

app.listen(PORT, async () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/api/notifications/stream`);
  console.log(`🔔 Webhook endpoint: http://localhost:${PORT}/api/webhooks/skyfi`);

  // Initialize MCP connection
  await initializeMCP();
});
