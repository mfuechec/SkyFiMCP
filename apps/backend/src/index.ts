// Backend API server for SkyFi MCP web interface
import express from 'express';
import cors from 'cors';
import { isValidCoordinate } from '@skyfi-mcp/shared';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import axios from 'axios';
import { mcpClient, convertMCPToolToOpenAI } from './mcp-client.js';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    // Frontend-specific tools (map control)
    const frontendTools = [
      {
        type: 'function',
        function: {
          name: 'recenter_map',
          description: 'Recenters the map view to a specific geographic location. Use this when the user asks to see, view, or navigate to a location. Always provide exact coordinates - use geocoding or your knowledge of city/landmark coordinates. The map will smoothly pan to center on the provided coordinates.',
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
          description: 'Adjusts the map zoom level to show more or less detail. Use after recentering to provide the appropriate view for the context: zoom 1-4 for continents/regions, 5-8 for countries, 9-12 for cities, 13-15 for neighborhoods, 16-18 for streets. Higher zoom = more detail.',
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
          name: 'add_marker',
          description: 'Places an interactive marker pin on the map at a specific location with rich information. Use this to highlight points of interest, locations being discussed, or areas relevant to satellite imagery. Multiple markers can be added - each appears as a clickable pin with a popup showing details. When showing multiple related locations (e.g., "drought regions in Africa"), call this function multiple times with different coordinates.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Primary label for this location that appears on the marker tooltip and popup header (e.g., "Port of Rotterdam", "Sahel Region", "Mount Vesuvius")'
              },
              latitude: {
                type: 'number',
                description: 'Latitude coordinate in decimal degrees where the marker should be placed (-90 to 90)'
              },
              longitude: {
                type: 'number',
                description: 'Longitude coordinate in decimal degrees where the marker should be placed (-180 to 180)'
              },
              description: {
                type: 'string',
                description: 'A brief but informative description of this location, its significance, or current status. This appears in the marker popup and helps users understand why this location matters.'
              },
              category: {
                type: 'string',
                description: 'Type or category of this location for context and potential future filtering (e.g., "port", "canal", "airport", "city", "volcano", "drought area", "conflict zone", "industrial site")'
              },
              additionalInfo: {
                type: 'object',
                description: 'Optional structured data providing deeper context about this location. Include relevant metrics, statistics, or characteristics that help understand the location\'s importance.',
                properties: {
                  tradeVolume: { type: 'string', description: 'Trade or shipping volume if applicable' },
                  keyRoutes: { type: 'array', items: { type: 'string' }, description: 'Important routes or connections' },
                  importance: { type: 'string', description: 'Strategic or economic importance' },
                  population: { type: 'string', description: 'Population if applicable' },
                  capacity: { type: 'string', description: 'Capacity or throughput metrics' },
                  status: { type: 'string', description: 'Current operational status or condition' }
                }
              },
              satelliteInfo: {
                type: 'object',
                description: 'Satellite imagery information for this location. Include actual data from MCP tools when available, or omit if not yet fetched.',
                properties: {
                  available: { type: 'boolean', description: 'Whether satellite imagery is available for this location' },
                  estimatedCost: { type: 'string', description: 'Cost estimate from get_pricing_estimate if available (e.g., "$8 per km²")' },
                  resolution: { type: 'string', description: 'Available imagery resolution (e.g., "30cm", "1m", "10m")' }
                }
              }
            },
            required: ['name', 'latitude', 'longitude', 'description']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'clear_markers',
          description: 'Removes all existing markers from the map to provide a clean slate. IMPORTANT: Always use this when the user asks about a NEW topic or location that is unrelated to previous markers. For example, if markers show "drought in Africa" and the user then asks "show me Ukraine", call clear_markers first. However, NEVER call this alone - always immediately follow with add_marker calls for the new topic.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_marker',
          description: 'Updates an existing marker on the map by adding or modifying information. Use this to enhance markers with monitoring status, satellite data, or other additional information after the marker has been created. For example, after setting up monitoring for a location, call this to add the monitor ID to the existing marker.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The name of the marker to update (must exactly match an existing marker\'s name, e.g., "Avdiivka, Ukraine")'
              },
              additionalInfo: {
                type: 'object',
                description: 'Additional information to merge into the marker\'s existing additionalInfo. New fields are added, existing fields are updated.',
                properties: {
                  monitoring: { type: 'string', description: 'Monitoring status (e.g., "Active", "Inactive")' },
                  monitorId: { type: 'string', description: 'Monitor ID from create_monitor' },
                  monitorType: { type: 'string', description: 'Type of monitoring (e.g., "VIDEO", "DAY", "SAR")' },
                  createdAt: { type: 'string', description: 'When monitoring was set up' }
                }
              },
              satelliteInfo: {
                type: 'object',
                description: 'Satellite information to merge into the marker\'s existing satelliteInfo',
                properties: {
                  available: { type: 'boolean' },
                  estimatedCost: { type: 'string' },
                  resolution: { type: 'string' },
                  monitoringActive: { type: 'boolean', description: 'Whether active monitoring is configured' }
                }
              },
              description: {
                type: 'string',
                description: 'Updated description for the marker (replaces the existing description)'
              }
            },
            required: ['name']
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

    // Negative keywords that indicate conversational queries (not actions)
    const conversationalKeywords = ['how to', 'what is', 'tell me about', 'explain', 'help me understand', 'what can you'];

    // Location detection patterns
    const hasCoordinates = /[-]?\d+\.\d+[,\s]+[-]?\d+\.\d+/.test(userMessage);
    const hasLocationPhrase = /\b(for|in|at|over|near)\s+[A-Z]/.test(messages[messages.length - 1]?.text || '');

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

    // Penalize conversational markers
    if (conversationalKeywords.some(kw => userMessage.includes(kw))) {
      confidence -= 0.6;
      console.log('💬 Conversational query detected - reducing confidence');
    }

    // Clamp confidence between 0 and 1
    confidence = Math.max(0, Math.min(1, confidence));

    const shouldForceTools = confidence > 0.5;
    const toolChoice = shouldForceTools ? 'required' : 'auto';
    console.log(`🎯 Tool choice: ${toolChoice} (confidence: ${confidence.toFixed(2)})`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',  // Upgraded from gpt-4o-mini for reliable tool calling
      messages: [
        {
          role: 'system',
          content: `You are a helpful SkyFi satellite imagery assistant.

CRITICAL RULE - NO FABRICATED DATA:
❌ NEVER include pricing, costs, resolution, or availability in add_marker unless you FIRST called the appropriate MCP tool
❌ NEVER provide estimated costs, availability status, or satellite specifications from your training data
✅ ALWAYS call get_pricing_estimate or check_order_feasibility BEFORE mentioning any pricing or availability
✅ If you haven't called an MCP tool yet, leave satelliteInfo and cost fields EMPTY in add_marker

Example of CORRECT behavior:
User: "How much would it cost to monitor Austin?"
You: Call get_pricing_estimate(location) → Then use that real data in your response

Example of INCORRECT behavior (DO NOT DO THIS):
User: "How much would it cost to monitor Austin?"
You: add_marker with satelliteInfo: {"estimatedCost": "$200"} ← WRONG! You made this up!

TOOL USAGE PATTERNS:
When users ask to VIEW locations ("show", "display", "where is"):
- Call recenter_map + add_marker (without satelliteInfo) + set_zoom
- Example: "show me drought areas" → add 3-5 markers for regions + recenter + zoom

When users ask about PRICING/COSTS:
- Call get_pricing_estimate FIRST
- Then call add_marker + recenter_map
- Example: "how much for Paris?" → get_pricing_estimate + marker + recenter

When users ask about AVAILABILITY/FEASIBILITY:
- Call check_order_feasibility FIRST
- Then call add_marker with the REAL data from the API response
- Example: "can I get imagery of Ukraine?" → check_order_feasibility + marker

When users want to MONITOR areas:
- Call add_marker + recenter_map FIRST (to show the location)
- Then call create_monitor (to set up monitoring)
- Then call update_marker with the monitor ID (to add monitoring info to the existing marker)
- Example: "monitor Avdiivka" → add_marker + recenter + create_monitor + update_marker with monitorId

When users want to ORDER imagery:
- Call check_order_feasibility + add_marker
- Then place_tasking_order or place_archive_order if feasible

When users ask CAPABILITY questions ("Could I...", "Can I...", "Is it possible..."):
- Call check_order_feasibility to verify availability
- Call get_pricing_estimate for cost information
- Example: "Could I monitor this area?" → check_order_feasibility + get_pricing_estimate + add_marker

RESPONSE STYLE:
- Keep messages brief: "Let me check SkyFi pricing for Paris."
- Don't include data that tools will provide (your message shows first, then tool results show separately)
- Always call tools when describing actions - never say "I'll add markers" without calling add_marker
- NEVER say specific costs/prices unless you've called get_pricing_estimate

MARKER MANAGEMENT:
- When showing a NEW topic/location: Call clear_markers FIRST, then add_marker + recenter_map
- NEVER call clear_markers alone - always follow with add_marker calls
- Example: "show me Africa" → clear_markers + add 3-5 Africa markers + recenter

IMPORTANT:
- Use multiple tools together (map + data tools)
- For "show me X" queries, always call clear_markers + recenter_map + add_marker
- Tool results appear in a separate message automatically
- REAL DATA ONLY: All pricing and availability must come from SkyFi API via MCP tools`
        },
        ...messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      ],
      tools,
      tool_choice: toolChoice  // Intelligently force tools based on user intent
    });

    const responseMessage = completion.choices[0]?.message;

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

      const reply = responseMessage.content || 'I\'ll help you with that!';
      console.log('💬 Response:', reply);
      console.log('🔧 Sending tool calls to frontend:', toolCalls);
      console.log('🛰️ MCP results:', mcpResults);

      res.json({
        message: reply,
        toolCalls,
        mcpData: mcpResults.length > 0 ? mcpResults : undefined
      });
    } else {
      const reply = responseMessage?.content || 'Sorry, I could not generate a response.';
      console.log('💬 Simple response (no tools):', reply);
      res.json({ message: reply });
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
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
