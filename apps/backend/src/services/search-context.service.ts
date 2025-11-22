import { SearchContext, SearchContextUpdate } from '../types/search-context.js';

const CONTEXT_TTL = 60 * 60 * 24 * 1000; // 24 hours in milliseconds

interface CachedContext {
  data: SearchContext;
  expiresAt: number;
}

export class SearchContextService {
  private contextStore = new Map<string, CachedContext>();

  constructor() {
    // Clean up expired contexts every hour
    setInterval(() => this.cleanupExpired(), 60 * 60 * 1000);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, cached] of this.contextStore.entries()) {
      if (cached.expiresAt < now) {
        this.contextStore.delete(key);
      }
    }
  }

  /**
   * Get search context for a session
   */
  async getContext(sessionId: string): Promise<SearchContext | null> {
    const cached = this.contextStore.get(sessionId);

    if (!cached) {
      return null;
    }

    // Check if expired
    if (cached.expiresAt < Date.now()) {
      this.contextStore.delete(sessionId);
      return null;
    }

    return cached.data;
  }

  /**
   * Create new search context for a session
   */
  async createContext(sessionId: string, query: string, initialData?: SearchContextUpdate): Promise<SearchContext> {
    const now = new Date().toISOString();
    const context: SearchContext = {
      sessionId,
      lastQuery: query,
      queryHistory: [query],
      createdAt: now,
      updatedAt: now,
      ...initialData
    };

    await this.saveContext(context);
    return context;
  }

  /**
   * Update existing search context with new data
   */
  async updateContext(
    sessionId: string,
    query: string,
    updates: SearchContextUpdate
  ): Promise<SearchContext | null> {
    const existing = await this.getContext(sessionId);

    if (!existing) {
      // Create new context if none exists
      return this.createContext(sessionId, query, updates);
    }

    const updated: SearchContext = {
      ...existing,
      ...updates,
      lastQuery: query,
      queryHistory: [...existing.queryHistory, query],
      updatedAt: new Date().toISOString()
    };

    await this.saveContext(updated);
    return updated;
  }

  /**
   * Clear search context for a session
   */
  async clearContext(sessionId: string): Promise<void> {
    this.contextStore.delete(sessionId);
  }

  /**
   * Check if query is a refinement of previous search
   */
  isRefinementQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Keywords that indicate refinement
    const refinementKeywords = [
      'only',
      'just',
      'filter',
      'narrow',
      'cheaper',
      'more expensive',
      'under',
      'over',
      'recent',
      'from last',
      'higher resolution',
      'lower resolution',
      'better',
      'different',
      'exclude',
      'without'
    ];

    return refinementKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  /**
   * Check if query is a new search (not refinement)
   */
  isNewSearchQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Keywords that indicate new search
    const newSearchKeywords = [
      'show me',
      'search for',
      'find',
      'what about',
      'how about',
      'tell me about'
    ];

    return newSearchKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  /**
   * Extract search parameters from query and existing context
   */
  extractSearchParams(query: string, context?: SearchContext | null): SearchContextUpdate {
    const lowerQuery = query.toLowerCase();
    const updates: SearchContextUpdate = {};

    // Extract resolution
    if (lowerQuery.includes('ultra high') || lowerQuery.includes('ultra-high')) {
      updates.resolution = 'ULTRA HIGH';
    } else if (lowerQuery.includes('super high') || lowerQuery.includes('super-high')) {
      updates.resolution = 'SUPER HIGH';
    } else if (lowerQuery.includes('very high') || lowerQuery.includes('very-high')) {
      updates.resolution = 'VERY HIGH';
    } else if (lowerQuery.includes('high') || lowerQuery.includes('hi res') || lowerQuery.includes('hi-res')) {
      updates.resolution = 'HIGH';
    } else if (lowerQuery.includes('medium') || lowerQuery.includes('med res')) {
      updates.resolution = 'MEDIUM';
    } else if (lowerQuery.includes('low')) {
      updates.resolution = 'LOW';
    }

    // Extract price filters
    const priceMatch = lowerQuery.match(/under\s+\$?(\d+)/);
    if (priceMatch) {
      updates.maxPrice = parseInt(priceMatch[1], 10);
    }

    const minPriceMatch = lowerQuery.match(/over\s+\$?(\d+)/);
    if (minPriceMatch) {
      updates.minPrice = parseInt(minPriceMatch[1], 10);
    }

    // Extract date range
    if (lowerQuery.includes('last 30 days') || lowerQuery.includes('past month')) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      updates.dateRange = {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
    } else if (lowerQuery.includes('last 7 days') || lowerQuery.includes('past week')) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      updates.dateRange = {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
    } else if (lowerQuery.includes('last year')) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      updates.dateRange = {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
    }

    // Extract cloud cover
    const cloudCoverMatch = lowerQuery.match(/(\d+)%?\s+cloud/);
    if (cloudCoverMatch) {
      updates.cloudCover = parseInt(cloudCoverMatch[1], 10);
    }

    // If this is a refinement, preserve existing location
    if (context && this.isRefinementQuery(query) && !this.isNewSearchQuery(query)) {
      if (context.location) {
        updates.location = context.location;
      }
      if (context.coordinates) {
        updates.coordinates = context.coordinates;
      }
    }

    return updates;
  }

  /**
   * Save search context to in-memory store
   */
  private async saveContext(context: SearchContext): Promise<void> {
    this.contextStore.set(context.sessionId, {
      data: context,
      expiresAt: Date.now() + CONTEXT_TTL
    });
  }
}

export const searchContextService = new SearchContextService();
