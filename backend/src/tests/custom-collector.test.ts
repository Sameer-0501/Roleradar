/**
 * CustomCollector Unit Tests.
 *
 * Tests the config-driven custom career site collector in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CustomCollector, type CustomSourceConfig } from '../collectors/custom/custom-collector.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_POSTING_1 = {
  id: '744000145967675',
  name: 'Experimental Physicist (EP-DI-2026-29-LD)',
  refNumber: 'EP-DI-2026-29-LD',
  location: {
    city: 'Geneva',
    country: 'ch',
  },
  releasedDate: '2026-08-27T12:14:05.990Z',
  applyUrl: 'https://jobs.smartrecruiters.com/CERN/744000145967675-apply',
};

const SAMPLE_POSTING_2 = {
  id: '744000145967676',
  name: 'Senior DevOps / Cloud Engineer',
  refNumber: 'IT-CD-2026-01-LD',
  location: {
    city: 'Geneva',
    country: 'ch',
  },
  releasedDate: '2026-08-26T10:00:00.000Z',
  applyUrl: 'https://jobs.smartrecruiters.com/CERN/744000145967676-apply',
};

const DEFAULT_CONFIG: CustomSourceConfig = {
  companyName: 'CERN',
  officialDomain: 'jobs.smartrecruiters.com',
  careersUrl: 'https://careers.cern/',
  apiEndpoint: 'https://api.smartrecruiters.com/v1/companies/cern/postings',
  perJobApiEndpointTemplate: 'https://api.smartrecruiters.com/v1/companies/cern/postings/{id}',
  paginationConfig: {
    strategy: 'offset_limit',
    pageSize: 20,
    maxPages: 2,
    offsetParam: 'offset',
    limitParam: 'limit',
  },
  fieldMappings: {
    jobsPath: 'content',
    idField: 'id',
    titleField: 'name',
    cityField: 'location.city',
    countryField: 'location.country',
    urlTemplate: 'https://jobs.smartrecruiters.com/cern/{id}',
    applyUrlField: 'applyUrl',
    postedAtField: 'releasedDate',
  },
  timeoutMs: 5_000,
};

function createCollector(overrides: Partial<CustomSourceConfig> = {}) {
  return new CustomCollector({ ...DEFAULT_CONFIG, ...overrides });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CustomCollector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Source identification ──────────────────────────────────────────────────

  it('reports the correct source name', () => {
    const collector = createCollector();
    expect(collector.getSourceName()).toBe('CERN Custom Career Collector');
  });

  it('reports source type as CUSTOM', () => {
    const collector = createCollector();
    expect(collector.getSourceType()).toBe('CUSTOM');
  });

  it('supports configured company name (case-insensitive)', () => {
    const collector = createCollector();
    expect(collector.supports('CERN')).toBe(true);
    expect(collector.supports('cern')).toBe(true);
    expect(collector.supports('GitLab')).toBe(false);
  });

  // ── Normalization ──────────────────────────────────────────────────────────

  it('normalizes custom JSON postings into JobCandidate objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          totalFound: 2,
          content: [SAMPLE_POSTING_1, SAMPLE_POSTING_2],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(2);

    const first = candidates[0]!;
    expect(first.externalJobId).toBe('744000145967675');
    expect(first.title).toBe('Experimental Physicist (EP-DI-2026-29-LD)');
    expect(first.location).toBe('Geneva, ch');
    expect(first.officialUrl).toBe('https://jobs.smartrecruiters.com/cern/744000145967675');
    expect(first.applyUrl).toBe('https://jobs.smartrecruiters.com/CERN/744000145967675-apply');
    expect(first.sourceSystem).toBe('CUSTOM');
  });

  it('supports direct URL field mapping instead of template', async () => {
    const directPosting = {
      id: 'custom-123',
      name: 'Site Reliability Engineer',
      jobUrl: 'https://jobs.smartrecruiters.com/cern/custom-123',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [directPosting],
        }),
      })
    );

    const collector = createCollector({
      fieldMappings: {
        jobsPath: 'content',
        idField: 'id',
        titleField: 'name',
        urlField: 'jobUrl',
      },
    });

    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.officialUrl).toBe('https://jobs.smartrecruiters.com/cern/custom-123');
  });

  // ── Rejection handling ─────────────────────────────────────────────────────

  it('rejects postings missing ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ ...SAMPLE_POSTING_1, id: undefined }],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects postings missing title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ ...SAMPLE_POSTING_1, name: '' }],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects postings that fail URL validation', async () => {
    const collector = createCollector({
      officialDomain: 'careers.cern', // domain mismatch with jobs.smartrecruiters.com template
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [SAMPLE_POSTING_1],
        }),
      })
    );

    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  // ── Pagination & Deduplication ─────────────────────────────────────────────

  it('paginates using offset_limit and honors maxPages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: [SAMPLE_POSTING_1] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: [SAMPLE_POSTING_2] }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const collector = createCollector({
      paginationConfig: {
        strategy: 'offset_limit',
        pageSize: 1,
        maxPages: 2,
      },
    });

    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates postings with identical external IDs within the same scan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [SAMPLE_POSTING_1, SAMPLE_POSTING_1],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
  });

  it('stops pagination early when receiving an empty list', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: [SAMPLE_POSTING_1] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: [] }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const collector = createCollector({
      paginationConfig: {
        strategy: 'offset_limit',
        pageSize: 1,
        maxPages: 5,
      },
    });

    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns empty array when API returns HTTP 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toEqual([]);
  });

  it('returns empty array on network timeout / failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Connection timed out'))
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toEqual([]);
  });

  // ── Health Check ───────────────────────────────────────────────────────────

  it('healthCheck returns healthy when custom API responds with 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [SAMPLE_POSTING_1] }),
      })
    );

    const collector = createCollector();
    const health = await collector.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.message).toMatch(/reachable/i);
    expect(health.checkedAt).toBeInstanceOf(Date);
  });

  it('healthCheck returns unhealthy on HTTP 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    const collector = createCollector();
    const health = await collector.healthCheck();

    expect(health.healthy).toBe(false);
    expect(health.message).toMatch(/HTTP 404/i);
  });
});
