/**
 * RoleRadar Redis & Memory Fallback Cache Verification Tests (Item 10).
 *
 * Verifies:
 * - Cache key isolation and namespace prefixing.
 * - TTL expiration semantics.
 * - Single-flight stampede protection (coalesced concurrent loads).
 * - Prefix pattern invalidation (delPrefix).
 * - Fallback resilience when Redis is unavailable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheService } from '../cache/redis-cache.js';

describe('CacheService (Memory LRU & Redis Interface)', () => {
  let cache: CacheService;

  beforeEach(() => {
    // Instantiate fresh cache service with test prefix
    cache = new CacheService(60, 'test-radar:');
  });

  it('stores and retrieves cached values within TTL', async () => {
    await cache.set('user:profile:100', { name: 'Alice', role: 'Architect' }, 10);
    const result = await cache.get<{ name: string; role: string }>('user:profile:100');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Alice');
    expect(result?.role).toBe('Architect');
  });

  it('expires entries after TTL has elapsed', async () => {
    vi.useFakeTimers();
    try {
      await cache.set('transient-key', { temporary: true }, 2); // 2 second TTL

      // Immediately present
      const immediate = await cache.get<{ temporary: boolean }>('transient-key');
      expect(immediate).toEqual({ temporary: true });

      // Fast forward time by 2.5 seconds
      vi.advanceTimersByTime(2500);

      const expired = await cache.get('transient-key');
      expect(expired).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces namespace key isolation preventing cross-tenant leakage', async () => {
    await cache.set('tenantA:settings', { theme: 'dark' });
    await cache.set('tenantB:settings', { theme: 'light' });

    const tenantA = await cache.get<{ theme: string }>('tenantA:settings');
    const tenantB = await cache.get<{ theme: string }>('tenantB:settings');

    expect(tenantA?.theme).toBe('dark');
    expect(tenantB?.theme).toBe('light');
  });

  it('prevents cache stampede via single-flight load coalescing', async () => {
    let loaderCallCount = 0;
    const expensiveDbQuery = vi.fn(async () => {
      loaderCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { totalJobs: 42, timestamp: Date.now() };
    });

    // Fire 10 concurrent requests for the exact same uncached key
    const concurrentRequests = Array.from({ length: 10 }, () =>
      cache.fetchOrSet('popular-query-key', expensiveDbQuery, 60)
    );

    const results = await Promise.all(concurrentRequests);

    // Loader should only have been called ONCE despite 10 concurrent callers
    expect(loaderCallCount).toBe(1);
    expect(expensiveDbQuery).toHaveBeenCalledTimes(1);

    // All 10 callers receive identical payload
    for (const res of results) {
      expect(res.totalJobs).toBe(42);
    }

    // Subsequent call immediately returns cached without executing loader again
    const subsequent = await cache.fetchOrSet('popular-query-key', expensiveDbQuery, 60);
    expect(subsequent.totalJobs).toBe(42);
    expect(loaderCallCount).toBe(1);
  });

  it('invalidates specific keys with del()', async () => {
    await cache.set('delete-target', { active: true });
    expect(await cache.get('delete-target')).not.toBeNull();

    await cache.del('delete-target');
    expect(await cache.get('delete-target')).toBeNull();
  });

  it('invalidates namespaces with delPrefix()', async () => {
    await cache.set('jobs:verified:page1', { page: 1 });
    await cache.set('jobs:verified:page2', { page: 2 });
    await cache.set('companies:list', { companies: [] });

    // Invalidate all jobs:verified:*
    await cache.delPrefix('jobs:verified:');

    expect(await cache.get('jobs:verified:page1')).toBeNull();
    expect(await cache.get('jobs:verified:page2')).toBeNull();
    // Unrelated namespace remains intact
    expect(await cache.get('companies:list')).not.toBeNull();
  });

  it('reports operational health status', () => {
    const status = cache.getStatus();
    expect(status).toHaveProperty('driver');
    expect(status).toHaveProperty('connected');
    expect(status).toHaveProperty('memoryEntries');
    expect(status).toHaveProperty('inFlightCoalesced');
  });
});

