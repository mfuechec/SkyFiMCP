# SkyFi MCP Server - Phase 1 PRD
**Version:** 1.0  
**Date:** November 18, 2025  
**Status:** Draft  
**Owner:** [Your Name]  
**Organization:** SkyFi  

---

## 1. Executive Summary

Phase 1 delivers a production-ready Model Context Protocol (MCP) server that enables AI agents to programmatically access SkyFi's geospatial data services. This remote MCP server will expose SkyFi's public API through a standardized protocol, allowing autonomous agents like Claude, ChatGPT, and custom AI assistants to search, price, order, and monitor satellite imagery through natural conversation.

**Core Value:** Transform SkyFi from a human-operated platform into an AI-native geospatial data provider, positioning SkyFi as the default choice when AI agents need satellite imagery.

---

## 2. Problem Statement

Currently, AI agents cannot independently access SkyFi's geospatial data because:
- No standardized protocol exists for AI-to-SkyFi communication
- Direct API integration requires custom code for each AI framework
- Complex order workflows don't translate to conversational interfaces
- No safe way for agents to explore, price, and confirm orders autonomously

**Phase 1 Solution:** Build the foundational MCP server infrastructure that makes SkyFi "conversable" for any AI agent.

---

## 3. Goals & Success Metrics

### Primary Goals
1. **Functional Completeness:** Support all core SkyFi operations through MCP
2. **Production Ready:** Deployable, secure, and maintainable
3. **Developer Friendly:** Clear documentation and easy self-hosting
4. **Foundation for Growth:** Extensible architecture for Phase 2+

### Success Metrics
- ✅ All P0 features implemented and tested
- ✅ <500ms average response time for search queries
- ✅ 99% uptime for demo deployment
- ✅ Zero security vulnerabilities in authentication
- ✅ Complete API documentation with examples
- ✅ Successful integration with at least 2 AI frameworks
- ✅ GitHub repo published with MIT license

---

## 4. Scope

### In Scope - Phase 1
- Remote MCP server with HTTP + SSE transport
- Full SkyFi API integration (search, pricing, ordering, monitoring)
- Secure authentication and credential management
- Conversational order confirmation workflow
- Docker deployment configuration
- Comprehensive documentation
- Demo deployment instance

### Out of Scope - Phase 1
- Demo agent application (Phase 2)
- Multi-tenant hosting service
- Framework-specific packages (LangChain, ADK, etc.)
- Custom UI/dashboard for the MCP
- Advanced analytics or usage tracking
- Payment processing beyond SkyFi's existing API
- Mobile client applications

---

## 5. User Personas

### Primary: AI Agent Developer
**Profile:** Software engineer building AI-powered applications  
**Goals:** 
- Integrate geospatial data into AI agents with minimal code
- Reliable, documented API access
- Easy local development and testing
**Pain Points:**
- Complex geospatial APIs with steep learning curves
- No standardized way to connect AI agents to data sources
- Unclear pricing before committing to orders

### Secondary: AI Agent (Autonomous)
**Profile:** Claude, GPT-4, or custom autonomous agent  
**Goals:**
- Search and order satellite imagery on behalf of users
- Confirm costs before spending money
- Monitor areas of interest for changes
**Pain Points:**
- Cannot interpret traditional REST API documentation
- Need conversational, tool-based interfaces
- Must have clear success/failure responses

### Tertiary: SkyFi Internal Team
**Profile:** SkyFi engineering and product teams  
**Goals:**
- Maintain and extend the MCP server
- Monitor usage and performance
- Support developers using the MCP
**Pain Points:**
- Need clear architecture documentation
- Must be able to deploy updates safely
- Require visibility into errors and usage patterns

---

## 6. Functional Requirements

### P0: Must-Have (Core Functionality)

#### 6.1 Archive Search & Data Exploration
**User Story:** As an AI agent, I want to search SkyFi's archive so I can find existing imagery for a location and time range.

**Requirements:**
- Tool: `search_archive`
- Parameters:
  - `location` (required): Lat/long, address, or GeoJSON polygon
  - `date_range` (optional): Start and end dates
  - `resolution` (optional): Filter by image resolution
  - `image_type` (optional): optical, SAR, multispectral, etc.
  - `open_data_only` (optional): Boolean for free imagery
  - `limit` (optional): Number of results (default: 10, max: 50)
- Returns: List of available imagery with metadata (date, resolution, price, provider, preview URL)
- Error handling: Invalid location, no results found, API errors

#### 6.2 Pricing & Feasibility Checks
**User Story:** As an AI agent, I want to check pricing before placing an order so I can confirm costs with the user.

**Requirements:**
- Tool: `get_pricing_estimate`
- Parameters:
  - `image_id` (for archive) OR `tasking_request` (for new capture)
  - `location` (for tasking): AOI polygon
  - `resolution` (for tasking)
  - `capture_date` (for tasking)
- Returns: Price estimate with breakdown, minimum AOI, provider info
- Tool: `check_order_feasibility`
- Parameters: Same as pricing
- Returns: Boolean feasibility + reason if not feasible (e.g., "AOI too small", "cloud coverage expected", "satellite unavailable")

#### 6.3 Order Placement with Confirmation
**User Story:** As an AI agent, I want to place orders with explicit user confirmation so I never spend money without permission.

**Requirements:**
- Tool: `place_order`
- Parameters:
  - `image_id` OR `tasking_request`
  - `delivery_options` (optional): Cloud storage destination
  - `user_confirmation_token` (required): Proof of user approval
- **Critical Flow:**
  1. Agent calls `get_pricing_estimate`
  2. Agent presents price to user and gets explicit "yes"
  3. Agent receives confirmation token from user
  4. Agent calls `place_order` with token
- Returns: Order ID, status, estimated delivery time
- Error handling: Insufficient funds, invalid AOI, confirmation token mismatch

#### 6.4 Order Status & History
**User Story:** As an AI agent, I want to check order status and history so I can track deliveries and reference past purchases.

**Requirements:**
- Tool: `get_order_status`
- Parameters: `order_id`
- Returns: Status, progress percentage, ETA, download links when ready
- Tool: `list_orders`
- Parameters: `limit`, `status_filter`, `date_range`
- Returns: List of orders with key metadata
- Polling support: Agent can check status periodically

#### 6.5 AOI Monitoring Setup
**User Story:** As an AI agent, I want to set up monitoring for areas of interest so users get notified when new imagery becomes available.

**Requirements:**
- Tool: `create_monitor`
- Parameters:
  - `location`: AOI polygon
  - `monitoring_criteria`: Resolution, image type, frequency
  - `webhook_url`: Where to send notifications
  - `notification_preferences`: What triggers notifications
- Returns: Monitor ID, status
- Tool: `list_monitors` / `delete_monitor`
- **Note:** If SkyFi API doesn't support webhooks natively, implement polling + webhook dispatch on MCP side

#### 6.6 Authentication & Security
**Requirements:**
- Support for SkyFi API key authentication
- **Security Model:**
  - **Local deployment:** User provides their own SkyFi API key via environment variable
  - **Demo deployment:** Stateless sessions where user provides key per-session (encrypted in transit only)
  - Never store API keys in databases or logs
- SSL/TLS required for all communications
- Rate limiting per API key
- Input validation and sanitization

#### 6.7 MCP Protocol Compliance
**Requirements:**
- Implement MCP specification (HTTP + SSE transport)
- Standard tool discovery via `tools/list`
- Standard tool execution via `tools/call`
- Proper error responses following MCP spec
- Server-sent events for long-running operations (order processing)
- Resource endpoints for imagery metadata

---

### P1: Should-Have (Enhanced Functionality)

#### 6.8 OpenStreetMap Integration
**User Story:** As an AI agent, I want to search by place names and landmarks so users don't need to provide coordinates.

**Requirements:**
- Tool: `geocode_location`
- Parameters: `place_name` (e.g., "Golden Gate Bridge", "Austin, TX")
- Returns: GeoJSON polygon or bounding box
- Integration with Nominatim or similar OSM API
- Cache frequent lookups

#### 6.9 Intelligent Search Refinement
**User Story:** As an AI agent, I want suggestions when searches return no results so I can help users find alternatives.

**Requirements:**
- When `search_archive` returns 0 results, include suggestions:
  - Expand date range
  - Lower resolution requirement
  - Try open data sources
  - Consider tasking new imagery
- Tool: `suggest_alternatives`

#### 6.10 Batch Operations
**User Story:** As an AI agent, I want to place multiple orders at once so I can efficiently fulfill bulk requests.

**Requirements:**
- Tool: `batch_order`
- Parameters: Array of order requests
- Returns: Array of order IDs and statuses
- Transaction handling: All or nothing, or partial success with clear reporting

---

### P2: Nice-to-Have (Future Enhancements)

#### 6.11 Advanced Analytics Integration
- Expose SkyFi Insights analytics capabilities
- Tool for running change detection, object counting, etc.

#### 6.12 Delivery Status Webhooks
- Reverse webhooks: MCP server notifies AI agent when order completes
- Requires agent to register a callback URL

#### 6.13 Cost Management Tools
- Budget tracking per session
- Spending alerts
- Monthly cost summaries

---

## 7. Non-Functional Requirements

### 7.1 Performance
- **Search queries:** < 500ms average response time
- **Order placement:** < 2s response time
- **SSE updates:** < 100ms latency for status changes
- **Concurrent requests:** Support 100+ simultaneous connections
- **Throughput:** Handle 1000+ requests/hour per instance

### 7.2 Reliability
- **Uptime:** 99% for demo deployment
- **Error recovery:** Graceful degradation when SkyFi API is down
- **Retry logic:** Exponential backoff for transient failures
- **Idempotency:** Order placement is idempotent (duplicate prevention)

### 7.3 Security
- **Authentication:** API key required for all requests
- **Transport:** TLS 1.3 for all connections
- **Input validation:** Sanitize all user inputs
- **Rate limiting:** 100 requests/minute per API key
- **Secrets management:** Never log or expose API keys
- **CORS:** Configurable allowed origins

### 7.4 Scalability
- **Horizontal scaling:** Stateless design for easy replication
- **Resource limits:** Configurable memory and CPU constraints
- **Connection pooling:** Efficient HTTP client for SkyFi API
- **Caching:** Cache static data (providers, resolutions) for 1 hour

### 7.5 Maintainability
- **Code quality:** TypeScript with strict typing, 80%+ test coverage
- **Documentation:** Inline JSDoc for all public APIs
- **Logging:** Structured logs with correlation IDs
- **Monitoring:** Health check endpoint, metrics export (Prometheus format)
- **Versioning:** Semantic versioning for releases

### 7.6 Observability
- **Health checks:** `/health` endpoint with dependency status
- **Metrics:** Request count, latency, error rate
- **Tracing:** Distributed tracing support (OpenTelemetry)
- **Logs:** JSON structured logs with log levels

---

## 8. Technical Architecture

### 8.1 System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                       AI Agent                               │
│                   (Claude, GPT, etc)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP Protocol (HTTP + SSE)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    SkyFi MCP Server                          │
│  ┌────────────┬──────────────┬───────────────┬────────────┐ │
│  │   MCP      │  Auth &      │   Business    │   API      │ │
│  │  Protocol  │  Validation  │    Logic      │  Client    │ │
│  │  Handler   │  Middleware  │   Services    │  (SkyFi)   │ │
│  └────────────┴──────────────┴───────────────┴────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (REST)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   SkyFi Public API                           │
│     (Archive, Orders, Tasking, Monitoring)                   │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Technology Stack
- **Runtime:** Node.js 20+ LTS
- **Language:** TypeScript 5.x
- **Framework:** Express.js
- **MCP SDK:** @modelcontextprotocol/sdk
- **HTTP Client:** Axios with retry logic
- **Validation:** Zod for schema validation
- **Testing:** Vitest + Supertest
- **Containerization:** Docker with multi-stage builds
- **Package Manager:** pnpm

### 8.3 Project Structure
```
skyfi-mcp/
├── src/
│   ├── server/           # Express server setup
│   ├── mcp/              # MCP protocol handlers
│   ├── tools/            # MCP tool implementations
│   ├── services/         # Business logic
│   │   ├── skyfi/        # SkyFi API client
│   │   ├── geocoding/    # OSM integration
│   │   └── monitoring/   # AOI monitoring logic
│   ├── middleware/       # Auth, validation, rate limiting
│   ├── models/           # TypeScript types and schemas
│   ├── utils/            # Helper functions
│   └── config/           # Configuration management
├── docs/
│   ├── api/              # MCP API documentation
│   ├── architecture/     # Architecture diagrams
│   ├── integration/      # Integration guides
│   └── deployment/       # Deployment instructions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/              # Utility scripts
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

### 8.4 Data Models

#### Tool Request/Response
```typescript
interface SearchArchiveRequest {
  location: string | GeoJSON;
  dateRange?: { start: string; end: string };
  resolution?: string;
  imageType?: 'optical' | 'sar' | 'multispectral' | 'hyperspectral';
  openDataOnly?: boolean;
  limit?: number;
}

interface ImageResult {
  id: string;
  provider: string;
  captureDate: string;
  resolution: string;
  imageType: string;
  price: number;
  currency: string;
  previewUrl: string;
  bounds: GeoJSON;
  cloudCoverage?: number;
}
```

#### Order Model
```typescript
interface Order {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageId?: string;
  taskingRequest?: TaskingRequest;
  price: number;
  createdAt: string;
  estimatedDelivery: string;
  downloadUrls?: string[];
  errorMessage?: string;
}
```

### 8.5 API Endpoints (MCP Tools)

| Tool Name | Purpose | Parameters | Returns |
|-----------|---------|------------|---------|
| `search_archive` | Find existing imagery | location, filters | ImageResult[] |
| `get_pricing_estimate` | Get price quote | image_id or tasking spec | Price breakdown |
| `check_order_feasibility` | Validate order | Same as pricing | Feasibility status |
| `place_order` | Purchase imagery | image_id or tasking, token | Order ID |
| `get_order_status` | Check order progress | order_id | Order details |
| `list_orders` | View order history | filters | Order[] |
| `create_monitor` | Set up AOI monitoring | location, criteria, webhook | Monitor ID |
| `list_monitors` | View active monitors | - | Monitor[] |
| `delete_monitor` | Remove monitor | monitor_id | Success status |
| `geocode_location` | Convert place to coords | place_name | GeoJSON |

---

## 9. User Experience & Design

### 9.1 Conversational Flow Examples

#### Example 1: Simple Archive Search
```
User: "Show me recent satellite imagery of Austin, Texas"

Agent → MCP: search_archive({
  location: "Austin, Texas",
  dateRange: { start: "2025-10-01", end: "2025-11-18" }
})

MCP → Agent: [5 results with previews, dates, prices]

Agent → User: "I found 5 recent images. The most recent is from 
Nov 15 at 50cm resolution for $45. Would you like to see the others 
or order this one?"
```

#### Example 2: Order with Confirmation
```
User: "Order that November 15th image"

Agent → MCP: get_pricing_estimate({ image_id: "img_abc123" })

MCP → Agent: { price: 45.00, resolution: "50cm", ... }

Agent → User: "This image costs $45.00 for a 50cm resolution 
capture. Shall I proceed with the order?"

User: "Yes, order it"

Agent → MCP: place_order({ 
  image_id: "img_abc123",
  user_confirmation_token: "confirmed_xyz789"
})

MCP → Agent: { order_id: "ord_def456", status: "processing" }

Agent → User: "Order placed! Your image will be ready in about 
30 minutes. Order ID: ord_def456"
```

#### Example 3: Setting Up Monitoring
```
User: "Alert me when new imagery becomes available for my office 
building in San Francisco"

Agent → MCP: geocode_location({ place_name: "San Francisco" })
Agent → User: "Could you provide the specific address or describe 
the area more precisely?"

User: "Golden Gate Park"

Agent → MCP: create_monitor({
  location: <Golden Gate Park GeoJSON>,
  criteria: { resolution: "1m", imageType: "optical" },
  webhook_url: "https://user-notification-service.com/webhook"
})

MCP → Agent: { monitor_id: "mon_ghi789", status: "active" }

Agent → User: "I've set up monitoring for Golden Gate Park. 
You'll receive notifications when new 1m resolution optical 
imagery becomes available."
```

### 9.2 Error Handling
- **Clear error messages:** Human-readable descriptions
- **Actionable guidance:** Suggest next steps when operations fail
- **Graceful degradation:** Continue working when optional features fail

---

## 10. Security Considerations

### 10.1 Authentication Model
**Two deployment modes:**

#### Self-Hosted Mode (Recommended)
- User runs their own MCP server instance
- SkyFi API key set via environment variable
- Key never leaves user's infrastructure
- Most secure option

#### Demo/Hosted Mode
- User provides API key per-session via secure parameter
- Key stored in memory only for session duration
- Encrypted in transit (TLS)
- Rate limiting to prevent abuse
- Clear warnings about security implications

### 10.2 Authorization
- All operations require valid SkyFi API key
- Order placement requires explicit confirmation token
- Monitor webhooks must be HTTPS

### 10.3 Data Privacy
- No PII stored by MCP server
- Logs sanitized to remove API keys
- No tracking or analytics without opt-in

### 10.4 Threat Mitigation
- **SSRF protection:** Validate webhook URLs
- **Input injection:** Sanitize all location inputs
- **Rate limiting:** Prevent DoS attacks
- **Dependency scanning:** Automated CVE checks

---

## 11. Testing Strategy

### 11.1 Unit Tests
- All business logic functions
- Tool parameter validation
- Error handling paths
- Target: 80%+ code coverage

### 11.2 Integration Tests
- MCP protocol compliance
- SkyFi API integration (with mocks)
- End-to-end tool execution
- Authentication flows

### 11.3 E2E Tests
- Complete user workflows
- Order placement flow
- Monitoring setup
- Error recovery

### 11.4 Manual Testing
- Test with real AI agents (Claude Desktop, GPT with function calling)
- Validate conversational flows
- Test with actual SkyFi API (using open data)

### 11.5 Performance Testing
- Load testing with k6 or Artillery
- 1000 requests/hour sustained
- Monitor memory leaks
- Profile slow operations

---

## 12. Deployment Strategy

### 12.1 Local Development
```bash
# Clone repo
git clone https://github.com/skyfi/skyfi-mcp.git
cd skyfi-mcp

# Install dependencies
pnpm install

# Configure
cp .env.example .env
# Add SKYFI_API_KEY=your_key_here

# Run in development
pnpm dev

# Run tests
pnpm test
```

### 12.2 Docker Deployment
```bash
# Build image
docker build -t skyfi-mcp .

# Run container
docker run -p 3000:3000 \
  -e SKYFI_API_KEY=your_key \
  skyfi-mcp
```

### 12.3 Production Deployment
**Demo Instance:** Railway or Render
- Free tier initially
- Auto-deploy from main branch
- Environment variables managed in dashboard
- Custom domain: `mcp.skyfi.com` or similar

**User Deployments:**
- Provide Docker Compose file
- Document deployment to major cloud providers:
  - AWS ECS
  - Google Cloud Run
  - Azure Container Instances
  - DigitalOcean App Platform

### 12.4 CI/CD Pipeline
- **On PR:** Run tests, lint, type check
- **On merge to main:** 
  - Run full test suite
  - Build Docker image
  - Deploy to demo instance (if tests pass)
  - Tag release with semantic version

---

## 13. Documentation Requirements

### 13.1 README.md
- Project overview and purpose
- Quick start guide (< 5 minutes to first request)
- Architecture diagram
- Link to full documentation

### 13.2 API Documentation
- Complete tool reference
- Parameter descriptions and examples
- Response schemas
- Error codes and meanings
- Rate limits and quotas

### 13.3 Integration Guides
- How to connect Claude Desktop
- How to use with LangChain (basic example)
- How to use with AI SDK (basic example)
- Custom integration guide

### 13.4 Deployment Guides
- Local development setup
- Docker deployment
- Cloud provider specific guides
- Environment variable reference
- Troubleshooting common issues

### 13.5 Architecture Documentation
- System architecture diagrams
- Sequence diagrams for key flows
- Data models and schemas
- Security model explanation
- Extension points for Phase 2+

### 13.6 Contributing Guide
- Code style and standards
- How to run tests
- PR process
- Issue templates

---

## 14. Dependencies & Assumptions

### 14.1 External Dependencies
- **SkyFi Public API:** Must be stable and documented
- **SkyFi API Key:** Users must have Pro account
- **OpenStreetMap Nominatim:** For geocoding (public API)
- **MCP SDK:** Official SDK from Anthropic

### 14.2 Assumptions
1. SkyFi API has comprehensive documentation (Swagger/OpenAPI)
2. SkyFi API supports webhook notifications OR we can poll
3. Order confirmation can be implemented via token mechanism
4. SkyFi pricing is deterministic (same inputs = same price)
5. SkyFi API is RESTful and uses standard HTTP codes
6. Users have their own SkyFi accounts and API keys

### 14.3 Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| SkyFi API changes | High | Medium | Version pinning, automated tests |
| Rate limiting issues | Medium | Medium | Implement backoff, document limits |
| Webhook support missing | Medium | Medium | Build polling + webhook dispatch |
| MCP spec changes | Medium | Low | Pin SDK version, monitor updates |
| Security vulnerability | High | Low | Automated scanning, security audits |

---

## 15. Timeline & Milestones

### Milestone 1: Foundation (Week 1-2)
- ✅ Project setup (repo, CI/CD, Docker)
- ✅ MCP server skeleton with protocol handlers
- ✅ SkyFi API client with authentication
- ✅ Basic health check and metrics

### Milestone 2: Core Tools (Week 3-4)
- ✅ Archive search tool
- ✅ Pricing and feasibility tools
- ✅ Order placement with confirmation flow
- ✅ Order status and history tools
- ✅ Unit tests for all tools

### Milestone 3: Advanced Features (Week 5)
- ✅ AOI monitoring setup
- ✅ OpenStreetMap geocoding
- ✅ Error handling and validation
- ✅ Integration tests

### Milestone 4: Polish & Deploy (Week 6)
- ✅ Documentation (all sections)
- ✅ E2E testing with real AI agent
- ✅ Demo deployment to Railway/Render
- ✅ Performance testing and optimization
- ✅ Security audit
- ✅ GitHub repo published

**Total Duration:** 6 weeks (with 1 developer full-time)

---

## 16. Launch Checklist

### Pre-Launch
- [ ] All P0 features implemented and tested
- [ ] Demo deployment live and stable
- [ ] Complete documentation published
- [ ] Security review completed (no critical issues)
- [ ] Performance tests passed (all metrics met)
- [ ] At least 2 successful AI agent integrations tested

### Launch Day
- [ ] GitHub repo made public
- [ ] Docker image published to Docker Hub
- [ ] Demo instance URL shared
- [ ] Blog post or announcement published
- [ ] Submit to MCP directory (if exists)
- [ ] Share on relevant communities (Reddit, HN, Discord)

### Post-Launch (First Week)
- [ ] Monitor error rates and performance
- [ ] Respond to GitHub issues within 24 hours
- [ ] Collect feedback from early users
- [ ] Fix critical bugs immediately
- [ ] Document common questions in FAQ

---

## 17. Success Criteria

Phase 1 is considered successful when:

1. ✅ **Technical:** All P0 features working in production
2. ✅ **Quality:** 99% uptime, <500ms avg response time
3. ✅ **Security:** Zero critical vulnerabilities
4. ✅ **Usability:** Developer can integrate in < 30 minutes
5. ✅ **Documentation:** Complete docs with examples
6. ✅ **Adoption:** At least 5 external developers testing
7. ✅ **Foundation:** Architecture ready for Phase 2 (demo agent)

---

## 18. Post-Phase 1 Considerations

### Transition to Phase 2
- Codebase frozen except for critical bugs
- Focus shifts to demo agent development
- Demo agent will be primary feedback source for improvements
- Maintain backward compatibility in any updates

### Known Phase 1 Limitations
- Basic error messages (Phase 2 will improve UX)
- No usage dashboard (analytics in Phase 2+)
- Limited framework integrations (covered in Phase 2)
- No mobile clients (out of scope)

### Technical Debt to Address
- Performance optimization based on real usage
- Caching strategy refinement
- Enhanced monitoring and alerting
- Automated security scanning in CI

---

## Appendix A: Tool Reference (Quick View)

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| search_archive | location, filters | ImageResult[] | Find existing imagery |
| get_pricing_estimate | image_id or spec | Price | Get cost before order |
| check_order_feasibility | order spec | Boolean + reason | Validate order viability |
| place_order | image_id, token | Order ID | Purchase imagery |
| get_order_status | order_id | Order details | Track order progress |
| list_orders | filters | Order[] | View purchase history |
| create_monitor | AOI, criteria | Monitor ID | Set up alerts |
| list_monitors | - | Monitor[] | View active monitors |
| delete_monitor | monitor_id | Success | Remove monitor |
| geocode_location | place name | GeoJSON | Convert address to coords |

---

## Appendix B: Environment Variables

```bash
# Required
SKYFI_API_KEY=your_skyfi_api_key_here
PORT=3000

# Optional
NODE_ENV=production
LOG_LEVEL=info
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
CACHE_TTL_SECONDS=3600
MAX_CONCURRENT_REQUESTS=100

# External Services
NOMINATIM_API_URL=https://nominatim.openstreetmap.org
```

---

## Appendix C: Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| AUTH_INVALID | Invalid API key | Check SKYFI_API_KEY |
| LOCATION_INVALID | Bad location input | Provide valid coords or address |
| NO_RESULTS | Search returned nothing | Adjust search parameters |
| ORDER_FAILED | Order could not be placed | Check feasibility first |
| RATE_LIMITED | Too many requests | Wait and retry |
| INTERNAL_ERROR | Server error | Check logs, retry |

---

## Appendix D: Example MCP Tool Call

```json
{
  "method": "tools/call",
  "params": {
    "name": "search_archive",
    "arguments": {
      "location": "Austin, Texas",
      "dateRange": {
        "start": "2025-11-01",
        "end": "2025-11-18"
      },
      "resolution": "50cm",
      "openDataOnly": false,
      "limit": 5
    }
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 3 images matching your criteria:\n\n1. November 15, 2025 - 50cm resolution - $45.00\n   Provider: Maxar\n   Cloud coverage: 5%\n   Preview: [link]\n\n2. November 10, 2025 - 50cm resolution - $42.00\n   Provider: Planet\n   Cloud coverage: 15%\n   Preview: [link]\n\n3. November 3, 2025 - 75cm resolution - $28.00\n   Provider: Satellogic\n   Cloud coverage: 8%\n   Preview: [link]"
    }
  ]
}
```

---

**END OF PRD**

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-18 | [Your Name] | Initial draft |

**Review & Approval:**
- [ ] Technical Lead
- [ ] Product Manager
- [ ] Security Team
- [ ] SkyFi Stakeholder
