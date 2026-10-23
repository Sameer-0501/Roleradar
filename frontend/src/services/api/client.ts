/**
 * RoleRadar Shared HTTP API Client.
 *
 * Provides a robust, lightweight fetch-based API client with:
 * - Centralized environment base URL resolution.
 * - Standardized Bearer token authentication injection.
 * - Request timeouts and safe AbortController cancellation.
 * - Non-JSON / empty response resilience.
 * - Normalized, redaction-safe ApiError instances.
 * - 401 Unauthorized observer callbacks (without circular redirects).
 */

import { env } from '../../config/env.js';
import { ApiError, type ApiRequestOptions } from './types.js';

export const TOKEN_KEY = 'roleradar_auth_token';
export const USER_KEY = 'roleradar_auth_user';

type UnauthorizedListener = () => void;

class HttpClient {
  private readonly defaultTimeoutMs = 15_000;
  private readonly unauthorizedListeners: Set<UnauthorizedListener> = new Set();
  private isHandlingUnauthorized = false;

  /**
   * Reads stored JWT token from localStorage.
   */
  public getToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Persists authentication token and user profile into localStorage.
   */
  public setAuth(token: string, user: unknown): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  /**
   * Clears all authentication state from localStorage.
   */
  public clearAuth(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /**
   * Reads and parses cached user profile from localStorage.
   */
  public getUser<T = unknown>(): T | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  /**
   * Registers a listener to be notified when an HTTP 401 Unauthorized response occurs.
   * Returns an unsubscribe function.
   */
  public onUnauthorized(listener: UnauthorizedListener): () => void {
    this.unauthorizedListeners.add(listener);
    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }

  /**
   * Broadcasts 401 event to registered listeners with loop protection.
   */
  private notifyUnauthorized(): void {
    if (this.isHandlingUnauthorized) return;
    this.isHandlingUnauthorized = true;
    try {
      this.clearAuth();
      for (const listener of this.unauthorizedListeners) {
        try {
          listener();
        } catch {
          // Swallow listener errors to protect caller flow
        }
      }
    } finally {
      // Release lock after microtask to prevent immediate synchronous retry loops
      setTimeout(() => {
        this.isHandlingUnauthorized = false;
      }, 500);
    }
  }

  /**
   * Serializes query parameters into a URLSearchParams string.
   */
  private buildQueryString(params?: Record<string, string | number | boolean | undefined | null>): string {
    if (!params) return '';
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * Core request execution method with timeout, abort handling, and normalized error mapping.
   */
  public async request<T = unknown>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
    const {
      body,
      params,
      timeoutMs = this.defaultTimeoutMs,
      skipAuth = false,
      headers: customHeaders,
      signal: callerSignal,
      ...customOptions
    } = options;

    // Build full target URL
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const queryString = this.buildQueryString(params);
    const url = `${env.apiUrl}${cleanEndpoint}${queryString}`;

    // Configure AbortController timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Chain caller's abort signal if supplied
    if (callerSignal) {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    // Assemble headers
    const token = !skipAuth ? this.getToken() : null;
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(customHeaders as Record<string, string> || {}),
    };

    // Serialize JSON body if object provided and not FormData
    let serializedBody: BodyInit | undefined = undefined;
    if (body !== undefined && body !== null) {
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        serializedBody = body;
      } else if (typeof body === 'string') {
        serializedBody = body;
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else {
        serializedBody = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
    }

    try {
      const response = await fetch(url, {
        ...customOptions,
        headers,
        body: serializedBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 204 No Content
      if (response.status === 204) {
        return null as unknown as T;
      }

      // Safe JSON parsing with fallback to raw text
      const rawText = await response.text();
      let parsedData: unknown = {};
      if (rawText && rawText.trim()) {
        try {
          parsedData = JSON.parse(rawText);
        } catch {
          parsedData = { rawText };
        }
      }

      // If status is not 2xx, throw normalized ApiError
      if (!response.ok) {
        const errorRecord = typeof parsedData === 'object' && parsedData !== null ? (parsedData as Record<string, unknown>) : {};
        const details = Array.isArray(errorRecord['details'])
          ? (errorRecord['details'] as string[])
          : undefined;

        const errorMsg =
          details?.join(', ') ||
          (typeof errorRecord['error'] === 'string' ? errorRecord['error'] : undefined) ||
          (typeof errorRecord['message'] === 'string' ? errorRecord['message'] : undefined) ||
          response.statusText ||
          `Request failed with status ${response.status}`;

        if (response.status === 401) {
          this.notifyUnauthorized();
        }

        throw new ApiError({
          message: errorMsg,
          status: response.status,
          statusText: response.statusText,
          data: parsedData,
          details,
        });
      }

      return parsedData as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      // Pass through already-normalized ApiErrors
      if (err instanceof ApiError) {
        throw err;
      }

      // Handle Timeout / AbortError
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError({
          message: `Request timed out after ${timeoutMs}ms`,
          status: 408,
          statusText: 'Request Timeout',
          isTimeout: true,
        });
      }

      // Handle Network / Connection Errors
      const isNetwork = err instanceof TypeError && err.message.toLowerCase().includes('fetch');
      throw new ApiError({
        message: err instanceof Error ? err.message : 'Network request failed',
        status: 0,
        statusText: 'Network Error',
        isNetworkError: isNetwork,
      });
    }
  }

  // ── Convenience Verbs ──────────────────────────────────────────────────────

  public get<T = unknown>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T = unknown>(endpoint: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  public put<T = unknown>(endpoint: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  public delete<T = unknown>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

/**
 * Singleton HTTP API Client instance.
 */
export const httpClient = new HttpClient();
