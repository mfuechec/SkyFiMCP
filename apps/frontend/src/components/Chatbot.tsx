import { useState, useRef, useEffect } from 'react';
import './Chatbot.css';
import { AOIRectangle } from '../App';

interface OSMFeatureMarker {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  featureType?: string;
}

interface ChatbotProps {
  onRecenterMap: (lat: number, lng: number, location: string) => void;
  onSetZoom: (zoom: number) => void;
  onDrawRectangle: (rectangle: AOIRectangle) => void;
  onClearRectangles: () => void;
  onUpdateRectangle: (name: string, updates: Partial<AOIRectangle>) => void;
  onDrawOsmFeatures: (features: OSMFeatureMarker[]) => void;
  onClearOsmFeatures: () => void;
  onHighlightOsmFeature: (featureId: string) => void;
}

export function Chatbot({ onRecenterMap, onSetZoom, onDrawRectangle, onClearRectangles, onUpdateRectangle, onDrawOsmFeatures, onClearOsmFeatures, onHighlightOsmFeature }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'bot' }[]>([
    { text: 'Hello! How can I help you with satellite imagery today?', sender: 'bot' }
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string>('');

  // Refs for autofocus and auto-scroll
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Autofocus input when chatbot opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, sender: 'user' as const };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');

    try {
      // Call backend API
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Include session ID if we have one
      if (sessionId) {
        headers['x-session-id'] = sessionId;
      }

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      console.log('📨 Received from backend:', data);

      // Store session ID for future requests
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        console.log('🔑 Session ID:', data.sessionId);
      }

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
                  // Get user's last message to detect requested resolution
                  const lastUserMessage = [...newMessages].reverse().find(m => m.sender === 'user');
                  const userQuery = lastUserMessage?.text.toLowerCase() || '';

                  // Collect all unique resolutions from all product types
                  const allResolutions = new Map();
                  parsed.pricing.productTypes?.forEach((pt: any) => {
                    pt.resolutions?.forEach((res: any) => {
                      if (!allResolutions.has(res.resolution)) {
                        allResolutions.set(res.resolution, res);
                      }
                    });
                  });

                  // Try to match user's query to specific resolution
                  let targetResolution = null;
                  let requestedButNotAvailable: string | false = false;

                  if (userQuery.includes('ultra high') || userQuery.includes('ultra-high') || userQuery.includes('ultra')) {
                    targetResolution = allResolutions.get('ULTRA HIGH');
                    if (!targetResolution) requestedButNotAvailable = 'ULTRA HIGH';
                  } else if (userQuery.includes('super high') || userQuery.includes('super-high') || userQuery.includes('super')) {
                    targetResolution = allResolutions.get('SUPER HIGH');
                    if (!targetResolution) requestedButNotAvailable = 'SUPER HIGH';
                  } else if (userQuery.includes('very high') || userQuery.includes('very-high')) {
                    targetResolution = allResolutions.get('VERY HIGH');
                    if (!targetResolution) requestedButNotAvailable = 'VERY HIGH';
                  } else if (userQuery.includes('high') || userQuery.includes('hi res') || userQuery.includes('hi-res')) {
                    targetResolution = allResolutions.get('HIGH');
                    if (!targetResolution) requestedButNotAvailable = 'HIGH';
                  } else if (userQuery.includes('low') || userQuery.includes('medium') || userQuery.includes('med')) {
                    // User asked for low/medium which doesn't exist
                    requestedButNotAvailable = userQuery.includes('low') ? 'LOW' : 'MEDIUM';
                  }

                  if (requestedButNotAvailable) {
                    // Requested resolution not available - show helpful message
                    mcpSummary += `### 💰 ${requestedButNotAvailable} resolution isn't available, but here are your options:\n\n`;
                    Array.from(allResolutions.values()).forEach((res: any) => {
                      if (res.pricing) {
                        const exampleArea = res.pricing.taskingMinSqkm;
                        const exampleCost = Math.round(exampleArea * res.pricing.taskingPriceOneSqkm);
                        mcpSummary += `**${res.resolution}** — $${res.pricing.taskingPriceOneSqkm}/km²\n`;
                        mcpSummary += `   Example: ${exampleArea} km² area = **$${exampleCost}**\n\n`;
                      }
                    });
                  } else if (targetResolution && targetResolution.pricing) {
                    const p = targetResolution.pricing;
                    const exampleArea = p.taskingMinSqkm;
                    const exampleCost = Math.round(exampleArea * p.taskingPriceOneSqkm);

                    mcpSummary += `### 💰 Pricing for ${targetResolution.resolution} Resolution\n\n`;
                    mcpSummary += `**$${p.taskingPriceOneSqkm}** per square kilometer\n\n`;
                    mcpSummary += `You can order:\n`;
                    mcpSummary += `• Minimum: ${p.taskingMinSqkm} km²\n`;
                    mcpSummary += `• Maximum: ${p.taskingMaxSqkm} km²\n\n`;
                    mcpSummary += `📍 For example, a ${exampleArea} km² area would cost **$${exampleCost}**\n\n`;
                    mcpSummary += `Ready to place an order, or would you like to see other resolution options?`;
                  } else {
                    // Show all available resolutions
                    mcpSummary += '### 💰 Here are all the available resolution options:\n\n';
                    Array.from(allResolutions.values()).forEach((res: any) => {
                      if (res.pricing) {
                        mcpSummary += `**${res.resolution}** — $${res.pricing.taskingPriceOneSqkm}/km²\n`;
                        mcpSummary += `   (${res.pricing.taskingMinSqkm}–${res.pricing.taskingMaxSqkm} km² available)\n\n`;
                      }
                    });
                    mcpSummary += 'Which resolution would you like to learn more about?';
                  }
                } else {
                  mcpSummary += 'Pricing information is not available for this location at the moment.';
                }
              } else if (result.tool === 'create_monitor') {
                if (parsed.id) {
                  mcpSummary += `### ✅ Your monitor is now active!\n\n`;
                  mcpSummary += `📡 **Monitor ID:** ${parsed.id}\n`;
                  const createdDate = new Date(parsed.createdAt);
                  mcpSummary += `🕐 **Started:** ${createdDate.toLocaleDateString()} at ${createdDate.toLocaleTimeString()}\n`;
                  if (parsed.productType) {
                    mcpSummary += `🛰️ **Monitoring:** ${parsed.productType} imagery\n`;
                  }
                  mcpSummary += `\n💡 You'll get automatic notifications when new satellite images are captured for this location. The area is now marked in orange on the map!`;
                } else {
                  mcpSummary += '### ⚠️ Monitor setup issue\n\nI had trouble setting up the monitor. Let\'s try again, or I can help you with other options.';
                }
              } else if (result.tool === 'check_order_feasibility') {
                if (parsed.available) {
                  mcpSummary += '### ✅ Good news! Fresh satellite captures are available\n\n';
                  if (parsed.resolution) {
                    mcpSummary += `📸 **Resolution:** ${parsed.resolution}\n`;
                  }
                  if (parsed.estimatedCost) {
                    mcpSummary += `💰 **Estimated cost:** $${parsed.estimatedCost}\n`;
                  }
                  mcpSummary += '\nReady to place an order? Just say the word!';
                } else {
                  mcpSummary += '### 😕 Fresh captures aren\'t available right now\n\nBut I can search the archive for existing imagery, or we can set up monitoring for when new captures become possible. What would you prefer?';
                }
              } else if (result.tool === 'list_orders') {
                if (parsed.success && parsed.orders && parsed.orders.length > 0) {
                  mcpSummary += `📋 **Your Recent Orders** (${parsed.total} total)\n\n`;
                  parsed.orders.forEach((order: any, index: number) => {
                    mcpSummary += `**${index + 1}. Order ${order.id}**\n`;
                    mcpSummary += `   - **Type**: ${order.type}\n`;
                    mcpSummary += `   - **Status**: ${order.status}\n`;
                    mcpSummary += `   - **Price**: ${order.currency} ${order.price}\n`;
                    mcpSummary += `   - **Created**: ${new Date(order.createdAt).toLocaleString()}\n`;
                    if (order.estimatedDelivery) {
                      mcpSummary += `   - **Est. Delivery**: ${new Date(order.estimatedDelivery).toLocaleString()}\n`;
                    }
                    mcpSummary += '\n';
                  });
                  if (parsed.hasMore) {
                    mcpSummary += '*There are more orders available. Ask to see more details.*';
                  }
                } else if (parsed.success && parsed.orders && parsed.orders.length === 0) {
                  mcpSummary += 'You don\'t have any orders yet. Would you like to order satellite imagery for a specific location?';
                } else {
                  mcpSummary += 'Unable to retrieve order history at this time.';
                }
              } else if (result.tool === 'get_order_status') {
                if (parsed.success && parsed.order) {
                  const order = parsed.order;
                  mcpSummary += `📦 **Order ${order.id}**\n\n`;
                  mcpSummary += `- **Status**: ${order.status}\n`;
                  mcpSummary += `- **Type**: ${order.type}\n`;
                  mcpSummary += `- **Price**: ${order.currency} ${order.price}\n`;
                  mcpSummary += `- **Created**: ${new Date(order.createdAt).toLocaleString()}\n`;
                  if (order.updatedAt) {
                    mcpSummary += `- **Last Updated**: ${new Date(order.updatedAt).toLocaleString()}\n`;
                  }
                  if (order.estimatedDelivery) {
                    mcpSummary += `- **Est. Delivery**: ${new Date(order.estimatedDelivery).toLocaleString()}\n`;
                  }
                  if (order.progress) {
                    mcpSummary += `- **Progress**: ${order.progress}%\n`;
                  }
                  if (order.statusDescription) {
                    mcpSummary += `\n*${order.statusDescription}*\n`;
                  }
                  if (order.errorMessage) {
                    mcpSummary += `\n⚠️ **Error**: ${order.errorMessage}\n`;
                  }
                } else {
                  mcpSummary += 'Unable to retrieve order status.';
                }
              } else if (result.tool === 'search_archive') {
                if (parsed.success && parsed.results && parsed.results.length > 0) {
                  const total = parsed.total || parsed.results.length;
                  mcpSummary += `### 🛰️ Great news! I found ${total} archived satellite image${total === 1 ? '' : 's'}\n\n`;

                  parsed.results.slice(0, 5).forEach((img: any, index: number) => {
                    const provider = img.provider || 'Satellite';
                    const productType = img.productType || 'imagery';
                    mcpSummary += `**${index + 1}. ${provider} ${productType}**\n`;

                    if (img.captureDate || img.date) {
                      const date = new Date(img.captureDate || img.date);
                      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      const formattedDate = `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                      mcpSummary += `   • Captured on ${formattedDate}\n`;
                    }
                    if (img.resolution) {
                      mcpSummary += `   • Resolution: ${img.resolution}\n`;
                    }
                    if (img.cloudCover !== undefined) {
                      const cloudEmoji = img.cloudCover < 10 ? '☀️' : img.cloudCover < 30 ? '⛅' : '☁️';
                      mcpSummary += `   • ${cloudEmoji} Cloud coverage: ${Math.round(img.cloudCover)}%\n`;
                    }
                    if (img.price !== undefined) {
                      mcpSummary += `   • **Price: $${img.price}/km²**\n`;
                    }
                    if (img.offNadir !== undefined) {
                      mcpSummary += `   • Viewing angle: ${Math.round(img.offNadir)}°\n`;
                    }
                    mcpSummary += '\n';
                  });

                  if (parsed.results.length > 5) {
                    mcpSummary += `*Plus ${parsed.results.length - 5} more option${parsed.results.length - 5 === 1 ? '' : 's'} available...*\n\n`;
                  }

                  mcpSummary += 'Would you like more details about any of these images, or shall I help you place an order?';
                } else if (parsed.success && parsed.results && parsed.results.length === 0) {
                  mcpSummary += '### 😕 No archived imagery found\n\nI couldn\'t find any existing satellite images for this location. However, I can check if we can order a fresh capture! Would you like me to check availability for a new tasking order?';
                } else {
                  mcpSummary += 'I\'m having trouble searching the archive right now. Let me try again, or we can look at other options.';
                }
              } else {
                // Generic formatting for other tools - try to make it conversational
                mcpSummary += `### 📝 ${result.tool.replace(/_/g, ' ')}\n\n`;

                // Try to format the data nicely
                if (typeof parsed === 'object') {
                  // Don't show everything - just key fields
                  if (parsed.success === false && parsed.error) {
                    mcpSummary += `⚠️ ${parsed.error}\n\n`;
                  } else if (parsed.message) {
                    mcpSummary += `${parsed.message}\n\n`;
                  } else {
                    // Show a simplified view
                    const keys = Object.keys(parsed).filter(k => !['success', 'timestamp', 'requestId'].includes(k));
                    keys.slice(0, 5).forEach(key => {
                      const value = parsed[key];
                      if (typeof value !== 'object') {
                        mcpSummary += `**${key}**: ${value}\n`;
                      }
                    });
                    mcpSummary += '\n';
                  }
                } else {
                  mcpSummary += `${parsed}\n\n`;
                }
              }
            } catch {
              // Not JSON or parsing failed - just show tool name, not raw data
              mcpSummary += `✅ ${result.tool.replace(/_/g, ' ')} completed\n\n`;
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
          } else if (toolCall.name === 'draw_rectangle') {
            const args = toolCall.arguments;
            console.log('📐 Drawing rectangle:', args);

            const rectangle: AOIRectangle = {
              id: `${args.name}-${Date.now()}`,
              name: args.name,
              bounds: args.bounds, // [[south, west], [north, east]]
              description: args.description,
              category: args.category,
              additionalInfo: args.additionalInfo,
              satelliteInfo: args.satelliteInfo
            };

            onDrawRectangle(rectangle);
          } else if (toolCall.name === 'clear_rectangles') {
            console.log('🗑️ Clearing rectangles');
            onClearRectangles();
          } else if (toolCall.name === 'update_rectangle') {
            const args = toolCall.arguments;
            console.log('🔄 Updating rectangle:', args.name, args);

            const updates: Partial<AOIRectangle> = {};

            if (args.description) {
              updates.description = args.description;
            }
            if (args.bounds) {
              updates.bounds = args.bounds;
            }
            if (args.additionalInfo) {
              updates.additionalInfo = args.additionalInfo;
            }
            if (args.satelliteInfo) {
              updates.satelliteInfo = args.satelliteInfo;
            }

            onUpdateRectangle(args.name, updates);
          } else if (toolCall.name === 'draw_osm_features') {
            const args = toolCall.arguments;
            console.log('📍 Drawing OSM features:', args.features?.length || 0);

            if (args.features && Array.isArray(args.features)) {
              const features: OSMFeatureMarker[] = args.features.map((f: any) => ({
                id: f.id,
                name: f.name,
                type: f.type,
                lat: f.lat,
                lon: f.lon,
                tags: f.tags || {},
                featureType: f.featureType
              }));
              onDrawOsmFeatures(features);
            }
          } else if (toolCall.name === 'clear_osm_features') {
            console.log('🗑️ Clearing OSM features');
            onClearOsmFeatures();
          } else if (toolCall.name === 'highlight_osm_feature') {
            const args = toolCall.arguments;
            console.log('✨ Highlighting OSM feature:', args.featureId);
            onHighlightOsmFeature(args.featureId);
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
            <div ref={messagesEndRef} />
          </div>
          <div className="chatbot-input">
            <input
              ref={inputRef}
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
