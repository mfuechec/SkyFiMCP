/**
 * SkyFi API Client
 * HTTP client for interacting with the SkyFi Public API
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import type {
  SkyFiClientConfig,
  SearchArchiveRequest,
  SearchArchiveResponse,
  PricingRequest,
  PricingResponse,
  FeasibilityResponse,
  PlaceOrderRequest,
  Order,
  ListOrdersRequest,
  ListOrdersResponse,
  CreateMonitorRequest,
  Monitor,
  ListMonitorsResponse,
  SkyFiApiError,
} from './types.js';

// Default configuration
const DEFAULT_CONFIG: Partial<SkyFiClientConfig> = {
  baseUrl: 'https://api.skyfi.com/v1',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

// Custom error class for SkyFi API errors
export class SkyFiApiException extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SkyFiApiException';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * SkyFi API Client
 */
export class SkyFiClient {
  private client: AxiosInstance;
  private config: Required<SkyFiClientConfig>;

  constructor(config: SkyFiClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<SkyFiClientConfig>;

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.headers.Authorization = `Bearer ${this.config.apiKey}`;
        return config;
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<SkyFiApiError>) => {
        return this.handleError(error);
      }
    );
  }

  /**
   * Handle API errors and convert to SkyFiApiException
   */
  private handleError(error: AxiosError<SkyFiApiError>): never {
    if (error.response) {
      const { status, data } = error.response;
      throw new SkyFiApiException(
        data?.code || 'API_ERROR',
        data?.message || error.message,
        status,
        data?.details
      );
    } else if (error.request) {
      throw new SkyFiApiException(
        'NETWORK_ERROR',
        'Network error: Unable to reach SkyFi API',
        0
      );
    } else {
      throw new SkyFiApiException(
        'REQUEST_ERROR',
        error.message,
        0
      );
    }
  }

  /**
   * Execute request with retry logic
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    attempts: number = this.config.retryAttempts
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (error instanceof SkyFiApiException) {
          if (error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        // Wait before retrying (exponential backoff)
        if (attempt < attempts) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== Archive Search ====================

  /**
   * Search the SkyFi archive for imagery
   */
  async searchArchive(request: SearchArchiveRequest): Promise<SearchArchiveResponse> {
    return this.withRetry(async () => {
      const response = await this.client.post<SearchArchiveResponse>(
        '/archive/search',
        request
      );
      return response.data;
    });
  }

  // ==================== Pricing ====================

  /**
   * Get pricing estimate for imagery
   */
  async getPricing(request: PricingRequest): Promise<PricingResponse> {
    return this.withRetry(async () => {
      const response = await this.client.post<PricingResponse>(
        '/pricing/estimate',
        request
      );
      return response.data;
    });
  }

  /**
   * Check if an order is feasible
   */
  async checkFeasibility(request: PricingRequest): Promise<FeasibilityResponse> {
    return this.withRetry(async () => {
      const response = await this.client.post<FeasibilityResponse>(
        '/pricing/feasibility',
        request
      );
      return response.data;
    });
  }

  // ==================== Orders ====================

  /**
   * Place an order for imagery
   */
  async placeOrder(request: PlaceOrderRequest): Promise<Order> {
    return this.withRetry(async () => {
      const response = await this.client.post<Order>('/orders', request);
      return response.data;
    });
  }

  /**
   * Get order status by ID
   */
  async getOrderStatus(orderId: string): Promise<Order> {
    return this.withRetry(async () => {
      const response = await this.client.get<Order>(`/orders/${orderId}`);
      return response.data;
    });
  }

  /**
   * List orders with optional filters
   */
  async listOrders(request?: ListOrdersRequest): Promise<ListOrdersResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get<ListOrdersResponse>('/orders', {
        params: request,
      });
      return response.data;
    });
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<Order> {
    return this.withRetry(async () => {
      const response = await this.client.post<Order>(`/orders/${orderId}/cancel`);
      return response.data;
    });
  }

  // ==================== Monitoring ====================

  /**
   * Create a new monitor for an area of interest
   */
  async createMonitor(request: CreateMonitorRequest): Promise<Monitor> {
    return this.withRetry(async () => {
      const response = await this.client.post<Monitor>('/monitors', request);
      return response.data;
    });
  }

  /**
   * List all monitors
   */
  async listMonitors(): Promise<ListMonitorsResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get<ListMonitorsResponse>('/monitors');
      return response.data;
    });
  }

  /**
   * Get monitor by ID
   */
  async getMonitor(monitorId: string): Promise<Monitor> {
    return this.withRetry(async () => {
      const response = await this.client.get<Monitor>(`/monitors/${monitorId}`);
      return response.data;
    });
  }

  /**
   * Delete a monitor
   */
  async deleteMonitor(monitorId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.client.delete(`/monitors/${monitorId}`);
    });
  }

  /**
   * Pause a monitor
   */
  async pauseMonitor(monitorId: string): Promise<Monitor> {
    return this.withRetry(async () => {
      const response = await this.client.post<Monitor>(
        `/monitors/${monitorId}/pause`
      );
      return response.data;
    });
  }

  /**
   * Resume a paused monitor
   */
  async resumeMonitor(monitorId: string): Promise<Monitor> {
    return this.withRetry(async () => {
      const response = await this.client.post<Monitor>(
        `/monitors/${monitorId}/resume`
      );
      return response.data;
    });
  }
}

/**
 * Create a SkyFi client instance
 */
export function createSkyFiClient(config: SkyFiClientConfig): SkyFiClient {
  return new SkyFiClient(config);
}
