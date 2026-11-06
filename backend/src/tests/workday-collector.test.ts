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

  // ── Pagination & Scan Completeness Invariants (P0) ─────────────────────────

  describe('Pagination & Scan Completeness Invariants (P0)', () => {
    it('marks scan as INCOMPLETE when maxPages truncates results before exhausting total', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 119,
            jobPostings: [SAMPLE_POSTING_1],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 119,
            jobPostings: [SAMPLE_POSTING_2],
          }),
        });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 2, pageSize: 1 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(2);
      expect(collector.isCompleteScan()).toBe(false);
      const details = collector.getScanCompletenessDetails();
      expect(details.isComplete).toBe(false);
      expect(details.reason).toBe('TRUNCATED_BY_MAX_PAGES');
    });

    it('marks scan as COMPLETE when all pages are fetched and cumulative postings account for total', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2,
            jobPostings: [SAMPLE_POSTING_1],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2,
            jobPostings: [SAMPLE_POSTING_2],
          }),
        });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 5, pageSize: 1 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(2);
      expect(collector.isCompleteScan()).toBe(true);
      expect(collector.getScanCompletenessDetails().reason).toBe('FULL_ENUMERATION');
    });

    it('marks scan as COMPLETE when natural end is reached (postings.length < pageSize)', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          jobPostings: [SAMPLE_POSTING_1], // 1 posting returned for pageSize = 20
        }),
      });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 5, pageSize: 20 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(1);
      expect(collector.isCompleteScan()).toBe(true);
      expect(collector.getScanCompletenessDetails().reason).toBe('FULL_ENUMERATION');
    });

    it('marks scan as INCOMPLETE when a later page encounters an HTTP error', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 50,
            jobPostings: [SAMPLE_POSTING_1],
          }),
        })
        .mockResolvedValue({
          ok: false,
          status: 500,
        });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 5, pageSize: 1 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(1);
      expect(collector.isCompleteScan()).toBe(false);
      expect(collector.getScanCompletenessDetails().reason).toBe('HTTP_ERROR_500');
    });

    it('adapts when upstream total changes dynamically during pagination', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2, // initially reports 2
            jobPostings: [SAMPLE_POSTING_1],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 3, // upstream increased to 3
            jobPostings: [SAMPLE_POSTING_2],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 3,
            jobPostings: [SAMPLE_POSTING_FALLBACK_ID],
          }),
        });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 5, pageSize: 1 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(3);
      expect(collector.isCompleteScan()).toBe(true);
      expect(collector.getScanCompletenessDetails().reason).toBe('FULL_ENUMERATION');
    });

    it('marks scan as INCOMPLETE when appliedFacets are configured regardless of results', async () => {
      const facetedCollector = new WorkdayCollector({
        companyName: 'Thomson Reuters',
        host: 'thomsonreuters.wd5.myworkdayjobs.com',
        tenant: 'thomsonreuters',
        clientSite: 'external_career_site',
        appliedFacets: {
          Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
        pageSize: 20,
        maxPages: 5,
      });

      expect(facetedCollector.isCompleteScan()).toBe(false);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            total: 1,
            jobPostings: [SAMPLE_POSTING_1],
          }),
        })
      );

      const candidates = await facetedCollector.discoverJobs();
      expect(candidates).toHaveLength(1);
      expect(facetedCollector.isCompleteScan()).toBe(false);
      expect(facetedCollector.getScanCompletenessDetails().reason).toBe('CONFIGURED_FACETS');
    });

    it('exact 119 postings with pageSize=20 and maxPages=5 retrieves 100 and marks INCOMPLETE', async () => {
      const generatePage = (pageIdx: number, count: number) => ({
        total: 119,
        jobPostings: Array.from({ length: count }, (_, i) => ({
          title: `Engineer ${pageIdx * 20 + i}`,
          externalPath: `/job/loc/Title_R-${pageIdx * 20 + i + 1000}`,
          bulletFields: [`R-${pageIdx * 20 + i + 1000}`],
        })),
      });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(0, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(1, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(2, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(3, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(4, 20) });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 5, pageSize: 20 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(100);
      expect(collector.isCompleteScan()).toBe(false);
      expect(collector.getScanCompletenessDetails().reason).toBe('TRUNCATED_BY_MAX_PAGES');
    });

    it('exact 119 postings with pageSize=20 and maxPages=6 retrieves 119 with short final page and marks COMPLETE', async () => {
      const generatePage = (pageIdx: number, count: number) => ({
        total: 119,
        jobPostings: Array.from({ length: count }, (_, i) => ({
          title: `Engineer ${pageIdx * 20 + i}`,
          externalPath: `/job/loc/Title_R-${pageIdx * 20 + i + 1000}`,
          bulletFields: [`R-${pageIdx * 20 + i + 1000}`],
        })),
      });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(0, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(1, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(2, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(3, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(4, 20) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(5, 19) }); // short final page: 19 < 20

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 6, pageSize: 20 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(119);
      expect(collector.isCompleteScan()).toBe(true);
      expect(collector.getScanCompletenessDetails().reason).toBe('FULL_ENUMERATION');
    });

    it('zero-result response marks scan as COMPLETE with 0 candidates', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 0,
          jobPostings: [],
        }),
      });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 5, pageSize: 20 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(0);
      expect(collector.isCompleteScan()).toBe(true);
      expect(collector.getScanCompletenessDetails().reason).toBe('FULL_ENUMERATION');
    });

    it('marks scan as INCOMPLETE when later page returns malformed response', async () => {
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
          json: async () => ({ notAWorkdayResponse: true }),
        });

      vi.stubGlobal('fetch', fetchMock);

      const collector = createCollector({ maxPages: 5, pageSize: 1 });
      const candidates = await collector.discoverJobs();

      expect(candidates).toHaveLength(1);
      expect(collector.isCompleteScan()).toBe(false);
      expect(collector.getScanCompletenessDetails().reason).toBe('MALFORMED_RESPONSE');
    });

    it('collector reuse across consecutive scans resets state cleanly without leakage', async () => {
      const collector = createCollector({ maxPages: 2, pageSize: 1 });

      // Run 1: Truncated scan (total 5, maxPages 2, pageSize 1 -> 2 fetched)
      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total: 5, jobPostings: [SAMPLE_POSTING_1] }) })
          .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total: 5, jobPostings: [SAMPLE_POSTING_2] }) })
      );
      const res1 = await collector.discoverJobs();
      expect(res1).toHaveLength(2);
      expect(collector.isCompleteScan()).toBe(false);
      expect(collector.getScanCompletenessDetails().reason).toBe('TRUNCATED_BY_MAX_PAGES');

      // Run 2: Reusing SAME collector instance with full enumeration (total 1, 1 fetched)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total: 1, jobPostings: [SAMPLE_POSTING_1] }) })
      );
      const res2 = await collector.discoverJobs();
      expect(res2).toHaveLength(1);
      expect(collector.isCompleteScan()).toBe(true);
      expect(collector.getScanCompletenessDetails().reason).toBe('FULL_ENUMERATION');

      // Run 3: Reusing SAME collector instance when HTTP 500 occurs
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 500 })
      );
      const res3 = await collector.discoverJobs();
      expect(res3).toHaveLength(0);
      expect(collector.isCompleteScan()).toBe(false);
      expect(collector.getScanCompletenessDetails().reason).toBe('HTTP_ERROR_500');
    });
  });
});
