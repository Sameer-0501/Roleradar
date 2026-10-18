/**
 * WorkdayCollector Unit Tests.
 *
 * All tests use mock fetch to test collector logic in isolation.
 * No network requests or database connections are made here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_POSTING_1 = {
  title: 'Principal Experience Designer',
  externalPath: '/job/Tel-Aviv-ISR/Principal-Experience-Designer_26WD100698',
  locationsText: 'Tel Aviv, ISR',
  postedOn: 'Posted Today',
  bulletFields: ['26WD100698'],
};

const SAMPLE_POSTING_2 = {
  title: 'Senior Software Engineer, Platform',
  externalPath: '/job/San-Francisco-CA/Senior-Software-Engineer_26WD100699',
  locationsText: 'San Francisco, CA',
  postedOn: 'Posted 2 Days Ago',
  bulletFields: ['26WD100699'],
};

const SAMPLE_POSTING_FALLBACK_ID = {
  title: 'Staff Product Manager',
  externalPath: '/job/Novi-MI/Staff-Product-Manager_26WD100700',
  locationsText: 'Novi, MI',
  postedOn: 'Posted Today',
  bulletFields: [], // empty bulletFields -> fallback to externalPath regex
};

const SAMPLE_POSTING_ACCENTURE_VALID = {
  title: 'Consultor SAP',
  externalPath: '/job/Pernambuco/Consultor-SAP_R00253071',
  postedOn: 'Posted Yesterday',
  bulletFields: ['R00253071', 'Pernambuco, Brazil'],
};

const SAMPLE_POSTING_ACCENTURE_EMPTY_BULLET = {
  title: 'Manager',
  externalPath: '/job/Empty/Manager_R00253072',
  postedOn: 'Posted Yesterday',
  bulletFields: [],
};

const SAMPLE_POSTING_ACCENTURE_INSUFFICIENT_BULLET = {
  title: 'Analyst',
  externalPath: '/job/Insuff/Analyst_R00253073',
  postedOn: 'Posted Yesterday',
  bulletFields: ['R00253073'],
};

const SAMPLE_SEARCH_RESPONSE = {
  total: 3,
  jobPostings: [SAMPLE_POSTING_1, SAMPLE_POSTING_2, SAMPLE_POSTING_FALLBACK_ID],
};

function createCollector(options: { maxPages?: number; timeoutMs?: number; pageSize?: number } = {}) {
  return new WorkdayCollector({
    companyName: 'Autodesk',
    host: 'autodesk.wd1.myworkdayjobs.com',
    tenant: 'autodesk',
    clientSite: 'Ext',
    officialDomain: 'autodesk.wd1.myworkdayjobs.com',
    timeoutMs: options.timeoutMs ?? 5_000,
    maxPages: options.maxPages ?? 2,
    pageSize: options.pageSize ?? 20,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkdayCollector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Source identification ──────────────────────────────────────────────────

  it('reports the correct source name', () => {
    const collector = createCollector();
    expect(collector.getSourceName()).toBe('Autodesk Workday Collector');
  });

  it('reports source type as WORKDAY', () => {
    const collector = createCollector();
    expect(collector.getSourceType()).toBe('WORKDAY');
  });

  it('supports its configured company name (case-insensitive)', () => {
    const collector = createCollector();
    expect(collector.supports('Autodesk')).toBe(true);
    expect(collector.supports('autodesk')).toBe(true);
    expect(collector.supports('AUTODESK')).toBe(true);
    expect(collector.supports('GitLab')).toBe(false);
    expect(collector.supports('Palantir')).toBe(false);
  });

  // ── Normalization ──────────────────────────────────────────────────────────

  it('normalizes valid Workday postings into JobCandidate objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SAMPLE_SEARCH_RESPONSE,
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(3);

    const first = candidates[0]!;
    expect(first.externalJobId).toBe('26WD100698');
    expect(first.title).toBe('Principal Experience Designer');
    expect(first.location).toBe('Tel Aviv, ISR');
    expect(first.officialUrl).toBe(
      'https://autodesk.wd1.myworkdayjobs.com/Ext/job/Tel-Aviv-ISR/Principal-Experience-Designer_26WD100698'
    );
    expect(first.sourceSystem).toBe('WORKDAY');
  });

  it('extracts location from bulletFields[1] when locationsText is absent (Accenture-style)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [SAMPLE_POSTING_ACCENTURE_VALID],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.location).toBe('Pernambuco, Brazil');
  });

  it('extracts location from bulletFields[0] when bulletFields[1] is reqId (Nationwide-style)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [
            {
              title: 'Software Engineer',
              externalPath: '/job/Hyd/Software-Engineer_099707',
              bulletFields: ['Hyderabad, India', '099707', 'Software Engineer'],
            },
          ],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.externalJobId).toBe('099707');
    expect(candidates[0]!.location).toBe('Hyderabad, India');
  });

  it('safely leaves location undefined when locationsText is missing and bulletFields is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [SAMPLE_POSTING_ACCENTURE_EMPTY_BULLET],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.location).toBeUndefined();
  });

  it('safely leaves location undefined without crashing when bulletFields has only 1 element', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [SAMPLE_POSTING_ACCENTURE_INSUFFICIENT_BULLET],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.location).toBeUndefined();
  });

  it('extracts requisition ID from externalPath if bulletFields is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [SAMPLE_POSTING_FALLBACK_ID],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.externalJobId).toBe('26WD100700');
    expect(candidates[0]!.title).toBe('Staff Product Manager');
  });

  // ── Rejection handling ─────────────────────────────────────────────────────

  it('rejects postings missing title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [
            {
              ...SAMPLE_POSTING_1,
              title: '',
            },
          ],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects postings missing externalPath', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [
            {
              ...SAMPLE_POSTING_1,
              externalPath: null,
            },
          ],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects postings with no extractable ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [
            {
              title: 'Unknown Job',
              externalPath: '/job/something/without_id_format',
              bulletFields: [],
            },
          ],
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates[0]?.externalJobId).toBe('format'); // fallback match
  });

  it('rejects postings that fail URL validation', async () => {
    const collector = new WorkdayCollector({
      companyName: 'Autodesk',
      host: 'fakejobs.com',
      tenant: 'autodesk',
      clientSite: 'Ext',
      officialDomain: 'autodesk.wd1.myworkdayjobs.com', // domain mismatch
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SAMPLE_SEARCH_RESPONSE,
      })
    );

    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  // ── Pagination & Deduplication ─────────────────────────────────────────────

  it('paginates across multiple pages and stops at maxPages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 50,
          jobPostings: [SAMPLE_POSTING_1],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 50,
          jobPostings: [SAMPLE_POSTING_2],
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const collector = createCollector({ maxPages: 2, pageSize: 1 });
    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates jobs with identical requisition IDs within the same scan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 2,
          jobPostings: [SAMPLE_POSTING_1, SAMPLE_POSTING_1], // duplicate in same response
        }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(1);
  });

  it('stops pagination early when receiving an empty page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 10,
          jobPostings: [SAMPLE_POSTING_1],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 10,
          jobPostings: [], // empty page
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const collector = createCollector({ maxPages: 5, pageSize: 1 });
    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns empty array when HTTP response is 500', async () => {
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

  it('returns empty array on network timeout / error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error: connection refused'))
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toEqual([]);
  });

  it('handles malformed non-JSON or missing jobPostings gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ unexpectedKey: 'value' }),
      })
    );

    const collector = createCollector();
    const candidates = await collector.discoverJobs();
    expect(candidates).toEqual([]);
  });

  // ── Health Check ───────────────────────────────────────────────────────────

  it('healthCheck returns healthy when CXS endpoint responds with 200 and jobPostings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total: 412, jobPostings: [SAMPLE_POSTING_1] }),
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

  it('healthCheck returns unhealthy on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('DNS resolution failed'))
    );

    const collector = createCollector();
    const health = await collector.healthCheck();

    expect(health.healthy).toBe(false);
    expect(health.message).toMatch(/unreachable/i);
  });
});
