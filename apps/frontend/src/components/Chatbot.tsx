import { useState } from 'react';
import './Chatbot.css';
import { DynamicMarker } from '../App';

interface ChatbotProps {
  onRecenterMap: (lat: number, lng: number, location: string) => void;
  onSetZoom: (zoom: number) => void;
  onAddMarker: (marker: DynamicMarker) => void;
  onClearMarkers: () => void;
  onUpdateMarker: (name: string, updates: Partial<DynamicMarker>) => void;
}

// Simple geocoding lookup for common cities
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'phoenix': { lat: 33.4484, lng: -112.0740 },
  'philadelphia': { lat: 39.9526, lng: -75.1652 },
  'san antonio': { lat: 29.4241, lng: -98.4936 },
  'san diego': { lat: 32.7157, lng: -117.1611 },
  'dallas': { lat: 32.7767, lng: -96.7970 },
  'austin': { lat: 30.2672, lng: -97.7431 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'paris': { lat: 48.8566, lng: 2.3522 },
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'beijing': { lat: 39.9042, lng: 116.4074 },
  'moscow': { lat: 55.7558, lng: 37.6173 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'berlin': { lat: 52.5200, lng: 13.4050 },
};

export function Chatbot({ onRecenterMap, onSetZoom, onAddMarker, onClearMarkers, onUpdateMarker }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'bot' }[]>([
    { text: 'Hello! How can I help you with satellite imagery today?', sender: 'bot' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, sender: 'user' as const };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');

    try {
      // Call backend API
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      console.log('📨 Received from backend:', data);

      // Handle MCP data (satellite imagery, geocoding, etc.)
      if (data.mcpData && Array.isArray(data.mcpData)) {
        console.log('🛰️ MCP data received:', data.mcpData);

        // Format MCP results for display
        let mcpSummary = '\n\n';
        for (const result of data.mcpData) {
          if (result.error) {
            const errorMsg = typeof result.error === 'string'
              ? result.error
              : result.error.error || result.error.details || JSON.stringify(result.error);
            mcpSummary += `❌ **Error**: ${errorMsg}\n\n`;
          } else if (result.data) {
            try {
              const parsed = JSON.parse(result.data);

              // Format based on tool type
              if (result.tool === 'get_pricing_estimate') {
                if (parsed.success && parsed.pricing) {
                  const productType = parsed.pricing.productTypes?.[0];
                  const resolution = productType?.resolutions?.[0];
                  if (resolution && resolution.pricing) {
                    const p = resolution.pricing;
                    const exampleArea = p.taskingMinSqkm;
                    const exampleCost = exampleArea * p.taskingPriceOneSqkm;

                    mcpSummary += `High-resolution satellite imagery (${resolution.resolution}) costs $${p.taskingPriceOneSqkm} per square kilometer. You can order between ${p.taskingMinSqkm} km² and ${p.taskingMaxSqkm} km².\n\n`;
                    mcpSummary += `For example, a typical ${exampleArea} km² area would cost $${exampleCost}.`;
                  }
                } else {
                  mcpSummary += 'Pricing information is not available for this location at the moment.';
                }
              } else if (result.tool === 'create_monitor') {
                if (parsed.id) {
                  mcpSummary += `✅ **Monitor Created Successfully**\n\n`;
                  mcpSummary += `- **Monitor ID**: \`${parsed.id}\`\n`;
                  mcpSummary += `- **Created**: ${new Date(parsed.createdAt).toLocaleString()}\n`;
                  if (parsed.productType) {
                    mcpSummary += `- **Product Type**: ${parsed.productType}\n`;
                  }
                  mcpSummary += `\nYou'll receive notifications when new imagery becomes available for this area.`;
                } else {
                  mcpSummary += 'I encountered an issue setting up the monitor. Please try again or contact support.';
                }
              } else if (result.tool === 'check_order_feasibility') {
                if (parsed.available) {
                  mcpSummary += 'Good news! Satellite imagery is available for this location. ';
                  if (parsed.resolution) {
                    mcpSummary += `We can provide ${parsed.resolution} resolution imagery. `;
                  }
                  if (parsed.estimatedCost) {
                    mcpSummary += `The estimated cost is $${parsed.estimatedCost}.`;
                  }
                } else {
                  mcpSummary += 'Unfortunately, satellite imagery is not currently available for this location.';
                }
              } else {
                // Generic formatting for other tools
                mcpSummary += `✅ **${result.tool}**\n${JSON.stringify(parsed, null, 2)}\n\n`;
              }
            } catch {
              // Not JSON or parsing failed, display as-is
              mcpSummary += `✅ **${result.tool}**\n${result.data}\n\n`;
            }
          }
        }

        // Store MCP summary for later
        data.mcpSummary = mcpSummary;
      }

      // Handle tool calls if present (map controls)
      if (data.toolCalls && Array.isArray(data.toolCalls)) {
        console.log('🔧 Processing tool calls:', data.toolCalls);
        for (const toolCall of data.toolCalls) {
          console.log('🛠️ Tool call:', toolCall.name, toolCall.arguments);

          if (toolCall.name === 'recenter_map') {
            const args = toolCall.arguments;
            const lat = args.latitude;
            const lng = args.longitude;

            console.log('📍 Recenter request:', { location: args.location, lat, lng });

            if (lat !== undefined && lng !== undefined) {
              console.log('🗺️ Calling onRecenterMap with:', { lat, lng, location: args.location });
              onRecenterMap(lat, lng, args.location);
            } else {
              console.log('⚠️ Missing coordinates, cannot recenter');
            }
          } else if (toolCall.name === 'set_zoom') {
            console.log('🔍 Setting zoom to:', toolCall.arguments.zoom);
            onSetZoom(toolCall.arguments.zoom);
          } else if (toolCall.name === 'add_marker') {
            const args = toolCall.arguments;
            console.log('📍 Adding marker:', args);

            const marker: DynamicMarker = {
              id: `${args.name}-${Date.now()}`,
              name: args.name,
              lat: args.latitude,
              lng: args.longitude,
              description: args.description,
              category: args.category,
              additionalInfo: args.additionalInfo,
              satelliteInfo: args.satelliteInfo
            };

            onAddMarker(marker);
          } else if (toolCall.name === 'clear_markers') {
            console.log('🗑️ Clearing markers');
            onClearMarkers();
          } else if (toolCall.name === 'update_marker') {
            const args = toolCall.arguments;
            console.log('🔄 Updating marker:', args.name, args);

            const updates: Partial<DynamicMarker> = {};

            if (args.description) {
              updates.description = args.description;
            }
            if (args.additionalInfo) {
              updates.additionalInfo = args.additionalInfo;
            }
            if (args.satelliteInfo) {
              updates.satelliteInfo = args.satelliteInfo;
            }

            onUpdateMarker(args.name, updates);
          }
        }
      } else {
        console.log('ℹ️ No tool calls in response');
      }

      // Display AI message first
      const initialMessage = {
        text: data.message,
        sender: 'bot' as const
      };
      setMessages(prev => [...prev, initialMessage]);

      // If we have MCP data, send it as a separate follow-up message
      if (data.mcpSummary) {
        const mcpMessage = {
          text: data.mcpSummary.trim(),
          sender: 'bot' as const
        };
        setMessages(prev => [...prev, mcpMessage]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot' as const
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="chatbot-container">
      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <h3>SkyFi Assistant</h3>
            <button onClick={() => setIsOpen(false)} className="close-btn">×</button>
          </div>
          <div className="chatbot-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <div className="chatbot-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything..."
            />
            <button onClick={handleSend}>Send</button>
          </div>
        </div>
      )}
      <button
        className="chatbot-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle chat"
      >
        💬
      </button>
    </div>
  );
}
