# PRD: Iterative Data Search and Previous Orders Exploration

## Overview
Implement conversational, iterative satellite imagery search capabilities and comprehensive order history exploration to enable users to refine searches progressively and review their past purchases.

## Problem Statement
Currently, users must specify all search criteria upfront and cannot:
- Progressively refine search results through conversation
- Easily view and filter their order history
- Reference or re-order previous imagery purchases
- Build on previous queries without re-stating context

## Goals
1. Enable iterative, conversational search refinement
2. Provide comprehensive order history exploration
3. Support contextual follow-up queries
4. Allow re-ordering of previous purchases
5. Maintain conversation context across multiple queries

## User Stories

### Iterative Search
- As a user, I want to search for imagery and then refine by resolution without re-specifying the location
- As a user, I want to narrow down results by date range in a follow-up query
- As a user, I want to filter search results by price after seeing initial options
- As a user, I want to combine multiple filters conversationally ("only high-res under $500 from last month")

### Order History
- As a user, I want to see all my previous orders
- As a user, I want to filter order history by date range
- As a user, I want to search orders by location
- As a user, I want to see order status and details
- As a user, I want to re-order the same imagery configuration
- As a user, I want to see what I spent on each order

## Technical Requirements

### Backend Requirements

#### Search Context Management
- Store conversation state to track active search context
- Parse follow-up queries to identify refinements vs new searches
- Maintain filter state (location, resolution, date range, price, product type)
- Clear context when user starts a new unrelated search

#### Archive Search Integration
- Integrate existing `search_archive` MCP tool into chatbot
- Support filtering by: location, date range, resolution, cloud cover, product type
- Format archive results for display in chat UI
- Handle pagination for large result sets

#### Order History Integration
- Integrate `list_orders` MCP tool into chatbot
- Support filtering orders by: date range, location, status
- Format order data with: ID, location, date, cost, resolution, status
- Implement `get_order_status` for detailed order views
- Track order metadata for re-ordering capability

#### System Prompt Enhancements
- Add instructions for recognizing iterative refinements
- Define context retention rules
- Specify when to call search_archive vs other tools
- Add order history formatting guidelines

### Frontend Requirements

#### Search Results Display
- Create reusable search results component
- Display archive imagery with: thumbnail (if available), date, resolution, coverage area, price
- Show active filters/context
- Add "Clear filters" action
- Support result pagination

#### Order History UI
- Create order history list component
- Display orders with: date, location, resolution, status badge, cost
- Add filtering controls (date picker, location search, status filter)
- Implement order detail modal/panel
- Add "Re-order" button for completed orders

#### Context Indicators
- Show current search context/filters in chat
- Visual indicator when AI is refining previous search
- Clear context button/command

### AI Behavior Patterns

#### Recognizing Iterative Queries
Keywords that indicate refinement:
- "only", "just", "filter", "narrow down"
- "cheaper", "more expensive", "under $X"
- "recent", "from last [timeframe]"
- "higher resolution", "lower resolution"
- Comparative terms: "better", "worse", "different"

Keywords that indicate new search:
- "show me [new location]"
- "search for [different thing]"
- "what about [unrelated topic]"

#### Search Workflow
1. User: "Search archive for Austin imagery"
   - AI calls: `search_archive(location="Austin")`
   - Display results with context: "Showing archive imagery for Austin"

2. User: "Only high resolution"
   - AI recognizes refinement of previous Austin search
   - AI calls: `search_archive(location="Austin", resolution="HIGH")`
   - Display: "High-resolution archive imagery for Austin"

3. User: "From the last 30 days"
   - AI adds date filter to existing context
   - AI calls: `search_archive(location="Austin", resolution="HIGH", startDate="2024-XX-XX")`
   - Display: "High-resolution Austin imagery from last 30 days"

4. User: "Under $500"
   - Frontend filters already-fetched results by price
   - Display: "Filtered to under $500"

#### Order History Workflow
1. User: "Show my orders"
   - AI calls: `list_orders()`
   - Display formatted order list

2. User: "Only from last month"
   - AI calls: `list_orders(startDate="...", endDate="...")`
   - Display filtered orders

3. User: "What's the status of order 12345?"
   - AI calls: `get_order_status(orderId="12345")`
   - Display detailed order status

4. User: "Re-order this"
   - AI extracts order parameters
   - AI asks confirmation with pricing
   - On confirm: places new order with same specs

## Data Models

### Search Context State
```typescript
interface SearchContext {
  location?: string;
  coordinates?: { lat: number; lng: number };
  resolution?: string;
  dateRange?: { start: string; end: string };
  maxPrice?: number;
  productType?: string;
  cloudCover?: number;
  lastQuery: string;
  lastResults?: any[];
}
```

### Order Display Format
```typescript
interface OrderDisplay {
  id: string;
  date: string;
  location: string;
  coordinates: { lat: number; lng: number };
  resolution: string;
  productType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  cost: number;
  area: number;
  thumbnailUrl?: string;
}
```

## UI/UX Design

### Search Results Component
- Card-based layout showing imagery results
- Each card shows: preview image, date, resolution badge, coverage area, price
- Active filters displayed at top
- "X" buttons to remove individual filters
- Pagination controls at bottom

### Order History Panel
- Tabbed interface: "All Orders" | "Pending" | "Completed"
- Filter bar with: date range picker, location search, status dropdown
- Order cards with status badges (colored dots)
- Click order → expand detail panel
- "Re-order" button on completed orders

### Context Indicators
- Small pill showing active search context: "🔍 Austin, HIGH res, last 30 days"
- Click pill to view/edit filters
- "Clear" button to start fresh search

## Success Metrics
- Users can complete multi-step refined searches without re-stating context
- Order history is accessible and filterable
- Re-ordering previous purchases works in <3 clicks
- Search context is correctly maintained in >90% of conversational refinements
- Users can find specific past orders quickly

## Implementation Priority
1. **Phase 1**: Backend search context management + archive search integration
2. **Phase 2**: Order history backend integration + data formatting
3. **Phase 3**: Frontend search results display component
4. **Phase 4**: Frontend order history UI
5. **Phase 5**: Re-ordering capability
6. **Phase 6**: Context indicators and clear controls

## Testing Requirements
- Test iterative search with various refinement combinations
- Test context clearing when user changes topic
- Test order history filtering and pagination
- Test re-ordering flow with confirmation
- Test edge cases: ambiguous queries, conflicting filters
- Load testing with large result sets and order histories

## Dependencies
- Existing MCP tools: `search_archive`, `list_orders`, `get_order_status`
- OpenAI GPT-4o for intent recognition
- Frontend state management for search context
- Backend session management for multi-turn conversations

## Open Questions
1. How long should search context be retained in a conversation?
2. Should we auto-clear context after X unrelated queries?
3. What's the maximum result set size before pagination is required?
4. Should archived imagery thumbnails be cached?
5. How to handle re-ordering if pricing has changed?
