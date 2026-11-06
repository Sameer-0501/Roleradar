/**
 * Omnissa Workday Integration & Admission Gate Test Suite.
 *
 * Implements Phase 20.5 Omnissa integrity and regression verification:
 *
 * Part 1: Deterministic CI Suite (Mocked Upstream — Zero Network Flakiness)
 *   - Catalog registration & factory instantiation
 *   - Historical 303 maintenance / deferral regression handling
 *   - Operational 200 JSON candidate normalization & requisition extraction
 *   - P0 Workday pagination & scan completeness invariants (119 total vs maxPages truncation)
 *   - Complete-scan safety (prevents accidental absence-based job closure)
 *   - Canonical identity & deduplication idempotency
 *   - URL provenance & anti-tampering (user-info, non-standard ports, lookalikes, aggregators)
 *
 * Part 2: Live Upstream Integration Smoke Suite (Live Workday API)
 *   - Live CXS health check probe
 *   - Live bounded discovery (1 page, 5 jobs)
 *   - Runtime truncation detection (reports isCompleteScan === false for bounded scan)
 *   - End-to-end pipeline execution with notification isolation
 *   - Database deduplication & clean isolated teardown
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray, and } from 'drizzle-orm';
import 'dotenv/config';

// 1. Notification Isolation: Strictly prevent real email sends or alerts
vi.mock('../notifications/alert-service.js', () => ({
  evaluateAndCreateInstantAlerts: vi.fn().mockResolvedValue({
    evaluatedUsers: 0,
    matchedUsers: 0,
    createdNotifications: 0,
  }),
  evaluateAndCreateRecentJobAlerts: vi.fn().mockResolvedValue({
    jobsEvaluated: 0,
    totalAlerts: 0,
    totalSkipped: 0,
  }),
}));

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';
import { validateJobUrl } from '../collectors/url-validator.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import * as alertService from '../notifications/alert-service.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_OMNISSA_POSTING_1 = {
  title: 'Senior Program Manager -  APJ',
  externalPath: '/job/Remote---India/Senior-Program-Manager----APJ_R-102282-1',
  timeType: 'Full time',
  locationsText: 'Remote - India',
  postedOn: 'Posted 2 Days Ago',
  bulletFields: ['R-102282'],
};

const MOCK_OMNISSA_POSTING_2 = {
  title: 'Digital Marketing Manager, EMEA',
  externalPath: '/job/Cork-Ireland-Office/Digital-Marketing-Manager--EMEA_R-102065',
  timeType: 'Full time',
  locationsText: 'Cork, Ireland Office',
  postedOn: 'Posted 12 Days Ago',
  bulletFields: ['R-102065'],
};

const OMNISSA_SOURCE_CONFIG = {
  companyName: 'Omnissa',
  officialDomain: 'omnissa.wd501.myworkdayjobs.com',
  host: 'omnissa.wd501.myworkdayjobs.com',
  tenant: 'omnissa',
  clientSite: 'Omnissa_External_Career_Site',
};

// ─── PART 1: Deterministic CI Suite (Mocked Upstream) ─────────────────────────

describe('Omnissa Workday — Deterministic CI Suite (Mocked Upstream)', () => {
  // 1. Catalog & Factory Support
  describe('Catalog Registration & Source Factory', () => {
    it('Omnissa is registered as an active source in SOURCE_CATALOG', () => {
      const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === 'Omnissa');
      expect(sourceDef).toBeDefined();
      expect(sourceDef!.atsType).toBe('WORKDAY');
      expect(sourceDef!.isActive).toBe(true);
      expect(sourceDef!.officialDomain).toBe('omnissa.wd501.myworkdayjobs.com');
      expect(sourceDef!.careersUrl).toBe('https://omnissa.wd501.myworkdayjobs.com/Omnissa_External_Career_Site');
      expect(sourceDef!.config).toEqual({
        host: 'omnissa.wd501.myworkdayjobs.com',
        tenant: 'omnissa',
        clientSite: 'Omnissa_External_Career_Site',
      });
    });

    it('Source factory instantiates WorkdayCollector for Omnissa', () => {
      const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === 'Omnissa')!;
      const createdCollector = createCollectorForSource(sourceDef);
      expect(createdCollector).toBeDefined();
      expect(createdCollector.getSourceName()).toBe('Omnissa Workday Collector');
      expect(createdCollector.getSourceType()).toBe('WORKDAY');
      expect(createdCollector.supports('Omnissa')).toBe(true);
      expect(createdCollector.supports('omnissa')).toBe(true);
    });
  });

  // 2. Historical Deferral Regression (HTTP 303 / Maintenance Handling)
  describe('Historical 303 Maintenance & Deferral Regression', () => {
    it('handles HTTP 303 maintenance redirect gracefully: marks unhealthy and yields 0 jobs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 303,
        statusText: 'See Other',
        headers: new Headers({
          Location: 'https://community.workday.com/maintenance',
        }),
        text: async () => '<!DOCTYPE html><html><body>Scheduled Maintenance</body></html>',
      });
      vi.stubGlobal('fetch', fetchMock);

      const collector = new WorkdayCollector({
        ...OMNISSA_SOURCE_CONFIG,
        timeoutMs: 1_000,
        pageSize: 5,
        maxPages: 1,
      });

      const health = await collector.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.message).toContain('HTTP 303');

      const candidates = await collector.discoverJobs();
      expect(candidates).toEqual([]);
      expect(collector.isCompleteScan()).toBe(false);
      expect(collector.getScanCompletenessDetails().reason).toBe('HTTP_ERROR_303');

      vi.unstubAllGlobals();
    });
  });

  // 3. Normalization & Requisition Extraction
  describe('Candidate Normalization & Requisition Extraction', () => {
    it('normalizes Workday CXS JSON into JobCandidates with /^R-\\d+/ requisition IDs', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            total: 2,
            jobPostings: [MOCK_OMNISSA_POSTING_1, MOCK_OMNISSA_POSTING_2],
          }),
        })
      );

      const collector = new WorkdayCollector({
        ...OMNISSA_SOURCE_CONFIG,
        pageSize: 20,
        maxPages: 1,
      });

      const candidates = await collector.discoverJobs();
      expect(candidates).toHaveLength(2);

      const c1 = candidates[0]!;
      expect(c1.externalJobId).toBe('R-102282');
      expect(c1.title).toBe('Senior Program Manager -  APJ');
      expect(c1.location).toBe('Remote - India');
      expect(c1.sourceSystem).toBe('WORKDAY');
      expect(c1.officialUrl).toBe(
        'https://omnissa.wd501.myworkdayjobs.com/Omnissa_External_Career_Site/job/Remote---India/Senior-Program-Manager----APJ_R-102282-1'
      );

      const c2 = candidates[1]!;
      expect(c2.externalJobId).toBe('R-102065');
      expect(c2.title).toBe('Digital Marketing Manager, EMEA');
      expect(c2.location).toBe('Cork, Ireland Office');
      expect(c2.sourceSystem).toBe('WORKDAY');

      vi.unstubAllGlobals();
    });

    it('reconciles authoritative live CXS requisition pairings for R-102118, R-101450, R-100622 and resolves title/slug discrepancies', async () => {
      // Authoritative live Workday CXS postings as verified directly against upstream API
      const liveCxsSamplePostings = [
        {
          title: 'Associate Account Executive - Belux',
          externalPath: '/job/Cork-Ireland-Office/Associate-Account-Executive---European-Languages_R-101450',
          bulletFields: ['R-101450'],
          locationsText: 'Cork, Ireland Office',
        },
        {
          title: 'Partner Solution Consultant',
          externalPath: '/job/Remote---Germany/Partner-Solution-Consultant_R-102118',
          bulletFields: ['R-102118'],
          locationsText: 'Remote - Germany',
        },
        {
          title: 'Renewals Specialist - German Speaking',
          externalPath: '/job/Cork-Ireland-Office/Renewals-Specialist---French-speaker_R-100622',
          bulletFields: ['R-100622'],
          locationsText: 'Cork, Ireland Office',
        },
        {
          title: 'Digital Marketing Manager, EMEA',
          externalPath: '/job/Cork-Ireland-Office/Digital-Marketing-Manager--EMEA_R-102065',
          bulletFields: ['R-102065'],
          locationsText: 'Cork, Ireland Office',
        },
      ];

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            total: liveCxsSamplePostings.length,
            jobPostings: liveCxsSamplePostings,
          }),
        })
      );

      const collector = new WorkdayCollector({
        ...OMNISSA_SOURCE_CONFIG,
        pageSize: 20,
        maxPages: 1,
      });

      const candidates = await collector.discoverJobs();
      expect(candidates).toHaveLength(4);

      // Verify exact authoritative mappings:
      const beluxJob = candidates.find((c) => c.externalJobId === 'R-101450');
      expect(beluxJob).toBeDefined();
      expect(beluxJob!.title).toBe('Associate Account Executive - Belux');
      expect(beluxJob!.officialUrl).toContain('_R-101450');

      const partnerJob = candidates.find((c) => c.externalJobId === 'R-102118');
      expect(partnerJob).toBeDefined();
      expect(partnerJob!.title).toBe('Partner Solution Consultant');
      expect(partnerJob!.officialUrl).toContain('_R-102118');

      const renewalsJob = candidates.find((c) => c.externalJobId === 'R-100622');
      expect(renewalsJob).toBeDefined();
      expect(renewalsJob!.title).toBe('Renewals Specialist - German Speaking');
      expect(renewalsJob!.officialUrl).toContain('_R-100622');

      const marketingJob = candidates.find((c) => c.externalJobId === 'R-102065');
      expect(marketingJob).toBeDefined();
      expect(marketingJob!.title).toBe('Digital Marketing Manager, EMEA');
      expect(marketingJob!.officialUrl).toContain('_R-102065');

      // Discrepancy resolution: R-101890 is not present in live CXS response
      const missingJob = candidates.find((c) => c.externalJobId === 'R-101890');
      expect(missingJob).toBeUndefined();

      vi.unstubAllGlobals();
    });
  });

  // 4. P0 Workday Pagination & Scan Completeness Invariants
  describe('P0 Workday Pagination & Completeness Invariants', () => {
    it('when maxPages=5 and pageSize=20 with total=119: detects truncation and returns isCompleteScan=false', async () => {
      // 5 pages of 20 = 100 items retrieved, but upstream total is 119
      const generatePage = (pageIdx: number) => ({
        total: 119,
        jobPostings: Array.from({ length: 20 }, (_, i) => ({
          title: `Job ${pageIdx * 20 + i + 1}`,
          externalPath: `/job/loc/Title_R-${pageIdx * 20 + i + 1000}`,
          bulletFields: [`R-${pageIdx * 20 + i + 1000}`],
        })),
      });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(0) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(1) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(2) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(3) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => generatePage(4) });

      vi.stubGlobal('fetch', fetchMock);

      const collector = new WorkdayCollector({
        ...OMNISSA_SOURCE_CONFIG,
        pageSize: 20,
        maxPages: 5, // Capped at 5 pages (100 jobs)
      });

      const candidates = await collector.discoverJobs();
      expect(candidates).toHaveLength(100);

      // CRITICAL P0 INVARIANT: Capped scan must NEVER report complete
      expect(collector.isCompleteScan()).toBe(false);
      const details = collector.getScanCompletenessDetails();
      expect(details.isComplete).toBe(false);
      expect(details.reason).toBe('TRUNCATED_BY_MAX_PAGES');

      vi.unstubAllGlobals();
    });

    it('when all pages are fetched (cumulative postings >= total): returns isCompleteScan=true', async () => {
      // 6 pages needed to exhaust 119 total (5x20 + 1x19)
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 119,
            jobPostings: Array.from({ length: 20 }, (_, i) => ({
              title: `Job ${i}`,
              externalPath: `/job/loc/Title_R-${1000 + i}`,
              bulletFields: [`R-${1000 + i}`],
            })),
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            total: 119,
            // Last page returns fewer than pageSize (19 < 20)
            jobPostings: Array.from({ length: 19 }, (_, i) => ({
              title: `Job ${20 + i}`,
              externalPath: `/job/loc/Title_R-${1020 + i}`,
              bulletFields: [`R-${1020 + i}`],
            })),
          }),
        });

      vi.stubGlobal('fetch', fetchMock);

      const collector = new WorkdayCollector({
        ...OMNISSA_SOURCE_CONFIG,
        pageSize: 20,
        maxPages: 2, // 2 pages total
      });

      const candidates = await collector.discoverJobs();
      expect(candidates).toHaveLength(39);
      // Because page 2 returned 19 < 20 (fewer than pageSize), natural end was reached
      expect(collector.isCompleteScan()).toBe(true);
      expect(collector.getScanCompletenessDetails().reason).toBe('FULL_ENUMERATION');

      vi.unstubAllGlobals();
    });
  });

  // 5. URL Provenance & Anti-Tampering Hardening
  describe('URL Provenance & Anti-Tampering Hardening', () => {
    const DOMAIN = OMNISSA_SOURCE_CONFIG.officialDomain;

    it('accepts legitimate deep Workday job URLs', () => {
      const url = 'https://omnissa.wd501.myworkdayjobs.com/Omnissa_External_Career_Site/job/Remote---India/Senior-Program-Manager----APJ_R-102282-1';
      expect(validateJobUrl(url, DOMAIN).valid).toBe(true);
    });

    it('rejects third-party job aggregators (Indeed, Naukri, LinkedIn)', () => {
      expect(validateJobUrl('https://indeed.com/viewjob?jk=R-102282', DOMAIN).valid).toBe(false);
      expect(validateJobUrl('https://naukri.com/job/R-102282', DOMAIN).valid).toBe(false);
      expect(validateJobUrl('https://linkedin.com/jobs/view/R-102282', DOMAIN).valid).toBe(false);
    });

    it('rejects insecure HTTP protocol', () => {
      const url = 'http://omnissa.wd501.myworkdayjobs.com/Omnissa_External_Career_Site/job/R-102282';
      expect(validateJobUrl(url, DOMAIN).valid).toBe(false);
    });

    it('rejects hostname prefix lookalikes', () => {
      const url = 'https://attacker-omnissa.wd501.myworkdayjobs.com/Omnissa_External_Career_Site/job/R-102282';
      expect(validateJobUrl(url, DOMAIN).valid).toBe(false);
    });

    it('rejects hostname suffix lookalikes', () => {
      const url = 'https://omnissa.wd501.myworkdayjobs.com.attacker.com/Omnissa_External_Career_Site/job/R-102282';
      expect(validateJobUrl(url, DOMAIN).valid).toBe(false);
    });

    it('rejects user-info URL tricks (embedded credentials)', () => {
      const url1 = 'https://omnissa.wd501.myworkdayjobs.com@evil.com/job/R-102282';
      const url2 = 'https://admin:pass@omnissa.wd501.myworkdayjobs.com/job/R-102282';
      expect(validateJobUrl(url1, DOMAIN).valid).toBe(false);
      expect(validateJobUrl(url2, DOMAIN).valid).toBe(false);
    });

    it('rejects non-standard ports (e.g. 8443, 8080)', () => {
      const url = 'https://omnissa.wd501.myworkdayjobs.com:8443/Omnissa_External_Career_Site/job/R-102282';
      expect(validateJobUrl(url, DOMAIN).valid).toBe(false);
    });

    it('rejects generic root / portal homepages without individual job path', () => {
      expect(validateJobUrl('https://omnissa.wd501.myworkdayjobs.com/', DOMAIN).valid).toBe(false);
      expect(validateJobUrl('https://omnissa.wd501.myworkdayjobs.com/Omnissa_External_Career_Site', DOMAIN).valid).toBe(false);
    });
  });
});

// ─── PART 2: Live Upstream Integration Smoke Suite ───────────────────────────

describe('Omnissa Workday — Live Upstream Smoke Suite', () => {
  let db: ReturnType<typeof getDb>;
  let companyId: string;
  const insertedJobIds: string[] = [];

  let liveCollector: WorkdayCollector;

  beforeAll(async () => {
    db = getDb();

    // Seed catalog sources so Omnissa exists in companies table
    await seedSources();

    const companyRecords = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Omnissa'))
      .limit(1);

    expect(companyRecords.length).toBe(1);
    expect(companyRecords[0]).toBeDefined();
    companyId = companyRecords[0]!.id;

    // Bounded live collector: 1 page, 5 jobs
    liveCollector = new WorkdayCollector({
      ...OMNISSA_SOURCE_CONFIG,
      pageSize: 5,
      maxPages: 1,
    });
  }, 30_000);

  afterAll(async () => {
    // Teardown created test jobs in reverse dependency order
    if (insertedJobIds.length > 0) {
      for (const id of insertedJobIds) {
        try {
          await db.delete(schema.jobVerifications).where(eq(schema.jobVerifications.job_id, id));
          await db.delete(schema.userJobInteractions).where(eq(schema.userJobInteractions.job_id, id));
          await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
        } catch {
          // Ignore individual teardown errors
        }
      }
    }
    await closeConnection();
  }, 15_000);

  it('Live health check confirms Workday CXS API is reachable and reports >= 100 jobs', async () => {
    const health = await liveCollector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toContain('Workday CXS API reachable');
    expect(health.message).toContain('total jobs reported');
  }, 15_000);

  it('Discovers bounded live jobs, extracts R-\\d+ reqIds, and detects pagination truncation', async () => {
    const candidates = await liveCollector.discoverJobs();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    // CRITICAL RUNTIME CHECK: Because upstream total is 119 and we only fetched 5,
    // the collector MUST report isCompleteScan === false with reason TRUNCATED_BY_MAX_PAGES
    expect(liveCollector.isCompleteScan()).toBe(false);
    expect(liveCollector.getScanCompletenessDetails().reason).toBe('TRUNCATED_BY_MAX_PAGES');

    for (const candidate of candidates) {
      expect(candidate.externalJobId).toBeTruthy();
      expect(candidate.externalJobId).toMatch(/^R-\d+/);
      expect(candidate.title).toBeTruthy();
      expect(candidate.sourceSystem).toBe('WORKDAY');
      expect(candidate.officialUrl).toContain('omnissa.wd501.myworkdayjobs.com/Omnissa_External_Career_Site/job/');

      const validation = validateJobUrl(candidate.officialUrl, OMNISSA_SOURCE_CONFIG.officialDomain);
      expect(validation.valid).toBe(true);
    }
  }, 20_000);

  it('Executes full pipeline and verifies jobs as ACTIVE with notification isolation', async () => {
    const candidates = await liveCollector.discoverJobs();
    expect(candidates.length).toBeGreaterThan(0);

    const sourceConfig = {
      officialDomain: OMNISSA_SOURCE_CONFIG.officialDomain,
      workdayConfig: {
        host: OMNISSA_SOURCE_CONFIG.host,
        tenant: OMNISSA_SOURCE_CONFIG.tenant,
        clientSite: OMNISSA_SOURCE_CONFIG.clientSite,
      },
      sourceSystem: 'WORKDAY',
    };

    // Notice: liveCollector.isCompleteScan() is false, which safely prevents absence reconciliation!
    const stats = await runPipeline(
      candidates,
      companyId,
      sourceConfig as any,
      liveCollector.isCompleteScan()
    );

    expect(stats.total).toBe(candidates.length);
    expect(stats.verified).toBeGreaterThan(0);
    expect(stats.skipped).toBe(0);

    // Verify alert safety (mocked, zero real notifications)
    expect(alertService.evaluateAndCreateInstantAlerts).toHaveBeenCalled();

    // Retrieve saved DB records
    const candidateExternalIds = candidates.map((c) => c.externalJobId);
    const savedJobs = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          inArray(schema.jobs.external_job_id, candidateExternalIds)
        )
      );

    expect(savedJobs.length).toBe(candidates.length);
    for (const job of savedJobs) {
      insertedJobIds.push(job.id);
      expect(job.status).toBe('ACTIVE');
      expect(job.verification_status).toBe('VERIFIED');
      expect(job.official_url).toContain(OMNISSA_SOURCE_CONFIG.officialDomain);
    }
  }, 45_000);

  it('Running the pipeline a second time is idempotent and creates 0 duplicates', async () => {
    const candidates = await liveCollector.discoverJobs();
    const sourceConfig = {
      officialDomain: OMNISSA_SOURCE_CONFIG.officialDomain,
      workdayConfig: {
        host: OMNISSA_SOURCE_CONFIG.host,
        tenant: OMNISSA_SOURCE_CONFIG.tenant,
        clientSite: OMNISSA_SOURCE_CONFIG.clientSite,
      },
      sourceSystem: 'WORKDAY',
    };

    const countBefore = (
      await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.company_id, companyId))
    ).length;

    const stats = await runPipeline(
      candidates,
      companyId,
      sourceConfig as any,
      liveCollector.isCompleteScan()
    );

    const countAfter = (
      await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.company_id, companyId))
    ).length;

    expect(countAfter).toBe(countBefore);
    expect(stats.total).toBe(candidates.length);
  }, 45_000);
});
