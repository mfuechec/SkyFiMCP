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
  FeasibilityRequest,
  PlaceArchiveOrderRequest,
  PlaceTaskingOrderRequest,
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
  baseUrl: 'https://app.skyfi.com/platform-api',
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
        config.headers['X-Skyfi-Api-Key'] = this.config.apiKey;
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
        '/archives',
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
        '/pricing',
        request
      );
      return response.data;
    });
  }

  /**
   * Check if an order is feasible
   */
  async checkFeasibility(request: FeasibilityRequest): Promise<FeasibilityResponse> {
    return this.withRetry(async () => {
      const response = await this.client.post<FeasibilityResponse>(
        '/feasibility',
        request
      );
      return response.data;
    });
  }

  /**
   * Get feasibility status by ID
   */
  async getFeasibilityStatus(feasibilityId: string): Promise<FeasibilityResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get<FeasibilityResponse>(
        `/feasibility/${feasibilityId}`
      );
      return response.data;
    });
  }

  // ==================== Orders ====================

  /**
   * Place an archive order for existing imagery
   */
  async placeArchiveOrder(request: PlaceArchiveOrderRequest): Promise<Order> {
    return this.withRetry(async () => {
      const response = await this.client.post<Order>('/order-archive', request);
      return response.data;
    });
  }

  /**
   * Place a tasking order for new imagery capture
   */
  async placeTaskingOrder(request: PlaceTaskingOrderRequest): Promise<Order> {
    return this.withRetry(async () => {
      const response = await this.client.post<Order>('/order-tasking', request);
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
   * Request redelivery of an order to a new bucket
   */
  async redeliverOrder(orderId: string, deliveryConfig: { bucket: string; path?: string }): Promise<Order> {
    return this.withRetry(async () => {
      const response = await this.client.post<Order>(`/orders/${orderId}/redelivery`, deliveryConfig);
      return response.data;
    });
  }

  // ==================== Notifications/Monitoring ====================

  /**
   * Create a new notification/monitor for an area of interest
   */
  async createMonitor(request: CreateMonitorRequest): Promise<Monitor> {
    return this.withRetry(async () => {
      const response = await this.client.post<Monitor>('/notifications', request);
      return response.data;
    });
  }

  /**
   * List all notifications/monitors
   */
  async listMonitors(): Promise<ListMonitorsResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get<ListMonitorsResponse>('/notifications');
      return response.data;
    });
  }

  /**
   * Get notification/monitor by ID
   */
  async getMonitor(monitorId: string): Promise<Monitor> {
    return this.withRetry(async () => {
      const response = await this.client.get<Monitor>(`/notifications/${monitorId}`);
      return response.data;
    });
  }

  /**
   * Delete a notification/monitor
   */
  async deleteMonitor(monitorId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.client.delete(`/notifications/${monitorId}`);
    });
  }
}

/**
 * Create a SkyFi client instance
 */
export function createSkyFiClient(config: SkyFiClientConfig): SkyFiClient {
  return new SkyFiClient(config);
}
