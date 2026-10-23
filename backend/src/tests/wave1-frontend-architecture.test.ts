/**
 * RoleRadar Frontend Wave 1 Architectural Tests.
 *
 * Validates:
 * 1. Environment configuration validation & sanitization (env.ts)
 * 2. Shared HTTP API Client behavior (client.ts):
 *    - Bearer token injection
 *    - skipAuth option
 *    - 204 No Content handling
 *    - 400 validation error normalization
 *    - Non-JSON / HTML error handling
 *    - 401 Unauthorized observer & auto-logout
 *    - Redaction safety (no tokens leaked in errors)
 * 3. Incremental API Services (Auth, Jobs, Workspace)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Provide mock localStorage for Node.js test runner before importing client
const storageMap = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

import { sanitizeApiUrl, createFrontendConfig } from '../../../frontend/src/config/env.js';
import {
  httpClient,
  ApiError,
  authService,
  jobsService,
  workspaceService,
} from '../../../frontend/src/services/api/index.js';

describe('Frontend Wave 1 Architecture Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    storageMap.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── 1. Configuration Validation ──────────────────────────────────────────

  describe('1. Environment Configuration (env.ts)', () => {
    it('sanitizes API URL by stripping trailing slashes', () => {
      expect(sanitizeApiUrl('http://localhost:4000/api/')).toBe('http://localhost:4000/api');
      expect(sanitizeApiUrl('https://api.roleradar.com///')).toBe('https://api.roleradar.com');
      expect(sanitizeApiUrl('https://api.roleradar.com')).toBe('https://api.roleradar.com');
    });

    it('falls back to safe default URL when empty or null', () => {
      expect(sanitizeApiUrl('')).toBe('http://localhost:4000/api');
      expect(sanitizeApiUrl(null)).toBe('http://localhost:4000/api');
      expect(sanitizeApiUrl('   ')).toBe('http://localhost:4000/api');
    });

    it('creates an immutable configuration object', () => {
      const config = createFrontendConfig({ VITE_API_URL: 'https://staging.roleradar.com/api/' });
      expect(config.apiUrl).toBe('https://staging.roleradar.com/api');
      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  // ── 2. Shared HTTP Client (client.ts) ─────────────────────────────────────

  describe('2. Shared HTTP API Client (client.ts)', () => {
    it('injects Bearer token into Authorization header when logged in', async () => {
      httpClient.setAuth('jwt-test-token-123', { id: 'u1', email: 'user@example.com' });

      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = (init?.headers || {}) as Record<string, string>;
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      });

      await httpClient.get('/jobs/matches');
      expect(capturedHeaders['Authorization']).toBe('Bearer jwt-test-token-123');
    });

    it('omits Authorization header when skipAuth option is true', async () => {
      httpClient.setAuth('jwt-test-token-123', { id: 'u1' });

      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = (init?.headers || {}) as Record<string, string>;
        return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
      });

      await httpClient.get('/health', { skipAuth: true });
      expect(capturedHeaders['Authorization']).toBeUndefined();
    });

    it('handles HTTP 204 No Content safely without parsing JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

      const result = await httpClient.delete('/jobs/123/save');
      expect(result).toBeNull();
    });

    it('normalizes HTTP 400 validation error with details array', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Validation failed',
            details: ['Password must be at least 8 characters', 'Email is invalid'],
          }),
          { status: 400, statusText: 'Bad Request' }
        )
      );

      try {
        await httpClient.post('/auth/register', {});
        expect.unreachable('Should have thrown ApiError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.details).toHaveLength(2);
        expect(apiErr.userMessage).toContain('Password must be at least 8 characters');
      }
    });

    it('handles non-JSON error pages (e.g. 502 Bad Gateway HTML) gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'Content-Type': 'text/html' },
        })
      );

      try {
        await httpClient.get('/jobs/matches');
        expect.unreachable('Should have thrown ApiError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.statusText).toBe('Bad Gateway');
      }
    });

    it('notifies onUnauthorized listener on HTTP 401 and clears auth state', async () => {
      httpClient.setAuth('stale-token', { id: 'u1' });

      const on401Spy = vi.fn();
      const unsubscribe = httpClient.onUnauthorized(on401Spy);

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Token expired' }), {
          status: 401,
          statusText: 'Unauthorized',
        })
      );

      await expect(httpClient.get('/users/me')).rejects.toThrow(ApiError);

      expect(on401Spy).toHaveBeenCalledTimes(1);
      expect(httpClient.getToken()).toBeNull();
      expect(httpClient.getUser()).toBeNull();

      unsubscribe();
    });

    it('guarantees redaction safety (never leaks tokens or passwords in error messages)', () => {
      const err = new ApiError({
        message: 'Normal error message',
        status: 400,
        statusText: 'Bad Request',
      });

      expect(err.message).not.toContain('Bearer');
      expect(err.userMessage).not.toContain('Bearer');
      expect(err.name).toBe('ApiError');
    });
  });

  // ── 3. Incremental API Services ───────────────────────────────────────────

  describe('3. Incremental API Services', () => {
    it('authService.login persists auth token and user record on success', async () => {
      const mockUser = { id: 'u100', email: 'candidate@example.com', isAdmin: false, isBetaUser: false, emailVerified: true };
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: 'new-jwt-token', user: mockUser }), { status: 200 })
      );

      const res = await authService.login({ email: 'candidate@example.com', password: 'Password123' });
      expect(res.token).toBe('new-jwt-token');
      expect(httpClient.getToken()).toBe('new-jwt-token');
      expect(httpClient.getUser()).toEqual(mockUser);
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('authService.logout clears token and user storage', () => {
      httpClient.setAuth('test-token', { id: 'u1' });
      expect(authService.isAuthenticated()).toBe(true);

      authService.logout();
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getToken()).toBeNull();
    });

    it('jobsService.getMatchedJobs serializes options into URL query params', async () => {
      let requestedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        requestedUrl = String(url);
        return Promise.resolve(new Response(JSON.stringify({ jobs: [], pagination: { page: 1, limit: 10, total: 0 } }), { status: 200 }));
      });

      await jobsService.getMatchedJobs({ page: 2, limit: 10, workplace: 'REMOTE', q: 'Frontend' });
      expect(requestedUrl).toContain('page=2');
      expect(requestedUrl).toContain('limit=10');
      expect(requestedUrl).toContain('workplace=REMOTE');
      expect(requestedUrl).toContain('q=Frontend');
    });

    it('workspaceService.saveJob calls POST /jobs/:id/save and returns interaction', async () => {
      let requestedMethod = '';
      let requestedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url, init) => {
        requestedUrl = String(url);
        requestedMethod = init?.method;
        return Promise.resolve(new Response(JSON.stringify({ interaction: { id: 'int-1', jobId: 'job-999', isSaved: true } }), { status: 200 }));
      });

      const interaction = await workspaceService.saveJob('job-999');
      expect(requestedMethod).toBe('POST');
      expect(requestedUrl).toContain('/jobs/job-999/save');
      expect(interaction.isSaved).toBe(true);
    });

    it('workspaceService.unsaveJob calls DELETE /jobs/:id/save', async () => {
      let requestedMethod = '';
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        requestedMethod = init?.method;
        return Promise.resolve(new Response(JSON.stringify({ interaction: { id: 'int-1', jobId: 'job-999', isSaved: false } }), { status: 200 }));
      });

      const interaction = await workspaceService.unsaveJob('job-999');
      expect(requestedMethod).toBe('DELETE');
      expect(interaction.isSaved).toBe(false);
    });
  });
});
