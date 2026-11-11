/**
 * Unit and Regression Tests for Ashby Board Cache and Verification Reuse.
 *
 * Verifies Safeguard 1:
 * - Board-scoped caching (Linear vs OpenAI vs Retool isolation)
 * - Scan-cycle-scoped TTL and eviction
 * - Concurrency safety
 * - Live HTTP fallback on cache miss or expiration
 * - Accurate job closure detection when job is missing from cached board
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'dotenv/config';

// Mock database connection so unit tests run in isolation
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  }),
}));

import { AshbyBoardCache, ashbyBoardCache } from '../collectors/ats/ashby-board-cache.js';
import { verifyJob } from '../verification/verification-service.js';
import type { VerificationInput } from '../verification/types.js';

describe('AshbyBoardCache Unit Tests', () => {
  let cache: AshbyBoardCache;

  beforeEach(() => {
    cache = new AshbyBoardCache(60_000); // 60s TTL
  });

  afterEach(() => {
    cache.clear();
  });

  it('normalizes board names and isolates different boards', () => {
    cache.setBoardJobs('Linear', [
      { id: 'lin-1', title: 'Frontend Engineer', location: 'Remote' },
    ]);
    cache.setBoardJobs('openai', [
      { id: 'oai-1', title: 'Research Scientist', location: 'SF' },
    ]);

    // Linear lookups (case-insensitive)
    const linJob = cache.getCachedJob('LINEAR', 'lin-1');
    expect(linJob.cacheHit).toBe(true);
    if (linJob.cacheHit) {
      expect(linJob.found).toBe(true);
      if (linJob.found) {
        expect(linJob.job.title).toBe('Frontend Engineer');
      }
    }

    // Cross-board isolation
    const wrongBoard = cache.getCachedJob('Linear', 'oai-1');
    expect(wrongBoard.cacheHit).toBe(true);
    if (wrongBoard.cacheHit) {
      expect(wrongBoard.found).toBe(false); // Does not exist on Linear board
    }

    // Uncached board lookup
    const uncached = cache.getCachedJob('Retool', 'lin-1');
    expect(uncached.cacheHit).toBe(false);
  });

  it('reports cacheHit: true, found: false when job is absent from cached board', () => {
    cache.setBoardJobs('linear', [
      { id: 'lin-1', title: 'Frontend Engineer' },
    ]);

    const res = cache.getCachedJob('linear', 'non-existent-job-id');
    expect(res.cacheHit).toBe(true);
    if (res.cacheHit) {
      expect(res.found).toBe(false);
    }
  });

  it('evicts and returns cacheHit: false when entry exceeds TTL', () => {
    const shortTtlCache = new AshbyBoardCache(50); // 50ms TTL
    shortTtlCache.setBoardJobs('linear', [
      { id: 'lin-1', title: 'Frontend Engineer' },
    ]);

    // Immediate lookup -> cache hit
    expect(shortTtlCache.getCachedJob('linear', 'lin-1').cacheHit).toBe(true);

    // Wait for TTL expiration
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const expired = shortTtlCache.getCachedJob('linear', 'lin-1');
        expect(expired.cacheHit).toBe(false);
        resolve();
      }, 60);
    });
  });

  it('supports explicit invalidation and clear', () => {
    cache.setBoardJobs('linear', [{ id: '1', title: 'Eng' }]);
    cache.setBoardJobs('openai', [{ id: '2', title: 'Eng' }]);
    expect(cache.size()).toBe(2);

    cache.invalidate('linear');
    expect(cache.size()).toBe(1);
    expect(cache.getCachedJob('linear', '1').cacheHit).toBe(false);
    expect(cache.getCachedJob('openai', '2').cacheHit).toBe(true);

    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe('Ashby Verification Live Fallback & Cache Reuse Invariants', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    ashbyBoardCache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    ashbyBoardCache.clear();
    globalThis.fetch = originalFetch;
  });

  const baseAshbyInput: VerificationInput = {
    jobId: 'ashby-test-job-1',
    externalJobId: 'f272fc4a-91a7-4dcf-9cb5-3600ebaf14e1',
    title: 'Analytics Engineer',
    location: 'Remote',
    officialUrl: 'https://jobs.ashbyhq.com/linear/f272fc4a-91a7-4dcf-9cb5-3600ebaf14e1',
    applyUrl: 'https://jobs.ashbyhq.com/linear/f272fc4a-91a7-4dcf-9cb5-3600ebaf14e1/application',
    officialDomain: 'jobs.ashbyhq.com',
    sourceSystem: 'CUSTOM',
    ashbyConfig: {
      jobBoardName: 'linear',
    },
  };

  it('reuses discovery board cache and makes ZERO outbound HTTP requests during verification', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    // Simulate discovery populating the cache
    ashbyBoardCache.setBoardJobs('linear', [
      {
        id: 'f272fc4a-91a7-4dcf-9cb5-3600ebaf14e1',
        title: 'Analytics Engineer',
        location: 'Remote',
        applyUrl: 'https://jobs.ashbyhq.com/linear/f272fc4a-91a7-4dcf-9cb5-3600ebaf14e1/application',
      },
    ]);

    const result = await verifyJob(baseAshbyInput);

    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.jobExistsCheck).toBe(true);
    expect(result.jobIdCheck).toBe(true);
    expect(result.titleCheck).toBe(true);
    expect(result.statusCheck).toBe(true);

    // ZERO outbound HTTP calls made!
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('correctly detects removed/closed jobs from cached board without HTTP calls', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    // Cache populated with other jobs, but NOT the requested externalJobId
    ashbyBoardCache.setBoardJobs('linear', [
      {
        id: 'other-job-id',
        title: 'Product Designer',
      },
    ]);

    const result = await verifyJob(baseAshbyInput);

    expect(result.verificationStatus).toBe('FAILED');
    expect(result.jobExistsCheck).toBe(false);
    expect(result.statusCheck).toBe(false);
    expect(result.failureReason).toContain('confirmed closed');

    // Authoritative check performed without outbound HTTP call
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('safely falls back to live HTTP fetch when cache is empty (ad-hoc re-verification)', async () => {
    // Cache is intentionally empty
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jobs: [
          {
            id: 'f272fc4a-91a7-4dcf-9cb5-3600ebaf14e1',
            title: 'Analytics Engineer',
            location: 'Remote',
            applyUrl: 'https://jobs.ashbyhq.com/linear/f272fc4a-91a7-4dcf-9cb5-3600ebaf14e1/application',
          },
        ],
      }),
    });
    globalThis.fetch = fetchMock;

    const result = await verifyJob(baseAshbyInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.jobExistsCheck).toBe(true);
    expect(result.titleCheck).toBe(true);
  });

  it('concurrency test: verifies multiple jobs on the same cached board concurrently without race conditions', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    ashbyBoardCache.setBoardJobs('linear', [
      { id: 'job-1', title: 'Engineer 1', location: 'Remote' },
      { id: 'job-2', title: 'Engineer 2', location: 'Remote' },
      { id: 'job-3', title: 'Engineer 3', location: 'Remote' },
    ]);

    const inputs: VerificationInput[] = [1, 2, 3].map((n) => ({
      ...baseAshbyInput,
      jobId: `ashby-job-${n}`,
      externalJobId: `job-${n}`,
      title: `Engineer ${n}`,
      officialUrl: `https://jobs.ashbyhq.com/linear/job-${n}`,
    }));

    const results = await Promise.all(inputs.map((inp) => verifyJob(inp)));

    expect(results).toHaveLength(3);
    for (const res of results) {
      expect(res.verificationStatus).toBe('VERIFIED');
      expect(res.jobExistsCheck).toBe(true);
      expect(res.jobIdCheck).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
