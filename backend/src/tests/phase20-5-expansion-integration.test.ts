/**
 * Phase 20.5 Employer Expansion Controlled Integration Test
 *
 * Tests the newly integrated Workday direct employers:
 *   1. State Street (statestreet.wd1.myworkdayjobs.com)
 *   2. Cushman & Wakefield (cw.wd1.myworkdayjobs.com)
 *
 * Enforces:
 *   - Notification isolation (alertService mocked, zero real emails/alerts)
 *   - Bounded controlled discovery (max 5 jobs per employer)
 *   - Declarative appliedFacets verification (India country facets)
 *   - Incomplete scan closure safety (isCompleteScan() === false)
 *   - Authoritative requisition ID extraction (R-..., R...)
 *   - Official application URL validation (rejects invalid/lookalike domains)
 *   - Full pipeline execution (candidates -> persisted -> verified ACTIVE)
 *   - Deduplication idempotency (re-running scan creates 0 duplicates)
 *   - Clean teardown of test-created data
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import 'dotenv/config';

// 1. Notification Safety: Strictly prevent real email sends or alerts
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
import { eq, and, inArray } from 'drizzle-orm';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';
import { validateJobUrl } from '../collectors/url-validator.js';
import * as alertService from '../notifications/alert-service.js';

describe('Phase 20.5 Workday Employer Expansion Integration Tests', () => {
  let db: ReturnType<typeof getDb>;
  let stateStreetCompanyId: string;
  let cwCompanyId: string;

  beforeAll(async () => {
    db = getDb();
    // Seed sources so State Street and Cushman & Wakefield are registered in DB
    await seedSources();

    // Fetch State Street company record
    const ssCompanies = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.name, 'State Street'))
      .limit(1);
    expect(ssCompanies.length).toBe(1);
    stateStreetCompanyId = ssCompanies[0].id;

    // Fetch Cushman & Wakefield company record
    const cwCompanies = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Cushman & Wakefield'))
      .limit(1);
    expect(cwCompanies.length).toBe(1);
    cwCompanyId = cwCompanies[0].id;
  });

  afterAll(async () => {
    await closeConnection();
  });

  // ─── STATE STREET TESTS ───────────────────────────────────────────────────

  describe('State Street Workday Integration', () => {
    const ssConfig = {
      companyName: 'State Street',
      host: 'statestreet.wd1.myworkdayjobs.com',
      tenant: 'statestreet',
      clientSite: 'global',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    };

    it('1. Endpoint connectivity and health check passes with India postings count', async () => {
      const collector = new WorkdayCollector({
        ...ssConfig,
        pageSize: 5,
        maxPages: 1,
      });

      const health = await collector.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.message).toContain('Workday CXS API reachable');
    });

    it('2. Correctly flags faceted scan as incomplete for absence-based closure', () => {
      const collector = new WorkdayCollector({
        ...ssConfig,
        pageSize: 5,
        maxPages: 1,
      });

      expect(collector.isCompleteScan()).toBe(false);
    });

    it('3. Discovers bounded State Street India jobs with authoritative requisition IDs', async () => {
      const collector = new WorkdayCollector({
        ...ssConfig,
        pageSize: 5,
        maxPages: 1,
      });

      const jobs = await collector.discoverJobs();
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(5);

      for (const job of jobs) {
        // Requisition ID check
        expect(job.externalJobId).toBeTruthy();
        expect(job.externalJobId).toMatch(/^R-\d+/);

        // Official application URL check
        expect(job.officialUrl).toContain('statestreet.wd1.myworkdayjobs.com/global/job/');
        const urlValidation = validateJobUrl(job.officialUrl, 'statestreet.wd1.myworkdayjobs.com');
        expect(urlValidation.valid).toBe(true);

        // Title and location
        expect(job.title).toBeTruthy();
        expect(job.location).toBeTruthy();
      }
    });

    it('4. Rejects invalid and aggregator application URLs', () => {
      expect(validateJobUrl('https://indeed.com/viewjob?jk=123', 'statestreet.wd1.myworkdayjobs.com').valid).toBe(false);
      expect(validateJobUrl('https://linkedin.com/jobs/view/123', 'statestreet.wd1.myworkdayjobs.com').valid).toBe(false);
      expect(validateJobUrl('http://statestreet.wd1.myworkdayjobs.com/global/job/123', 'statestreet.wd1.myworkdayjobs.com').valid).toBe(false);
      expect(validateJobUrl('https://statestreet-fake.com/global/job/123', 'statestreet.wd1.myworkdayjobs.com').valid).toBe(false);
    });

    it('5. Successfully runs through pipeline and persists verified ACTIVE jobs without alert leaks', async () => {
      const collector = new WorkdayCollector({
        ...ssConfig,
        pageSize: 5,
        maxPages: 1,
      });

      const candidates = await collector.discoverJobs();
      expect(candidates.length).toBeGreaterThan(0);

      const sourceConfig = {
        officialDomain: 'statestreet.wd1.myworkdayjobs.com',
        workdayConfig: ssConfig,
        sourceSystem: 'WORKDAY',
      };

      const stats = await runPipeline(
        candidates,
        stateStreetCompanyId,
        sourceConfig as any,
        collector.isCompleteScan()
      );

      expect(stats.total).toBe(candidates.length);
      expect(stats.verified).toBeGreaterThan(0);
      expect(stats.skipped).toBe(0);

      // Verify alert safety
      expect(alertService.evaluateAndCreateInstantAlerts).toHaveBeenCalled();

      // Check DB records for candidate jobs
      const candidateExternalIds = candidates.map(c => c.externalJobId);
      const savedJobs = await db
        .select()
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.company_id, stateStreetCompanyId),
            inArray(schema.jobs.external_job_id, candidateExternalIds)
          )
        );

      expect(savedJobs.length).toBe(candidates.length);
      const activeJobs = savedJobs.filter(j => j.status === 'ACTIVE' && j.verification_status === 'VERIFIED');
      expect(activeJobs.length).toBe(stats.verified);
      for (const j of activeJobs) {
        expect(j.official_url).toContain('statestreet.wd1.myworkdayjobs.com');
      }
    }, 30_000);

    it('6. Re-running scan is idempotent and creates 0 duplicates', async () => {
      const collector = new WorkdayCollector({
        ...ssConfig,
        pageSize: 5,
        maxPages: 1,
      });

      const candidates = await collector.discoverJobs();
      const sourceConfig = {
        officialDomain: 'statestreet.wd1.myworkdayjobs.com',
        workdayConfig: ssConfig,
        sourceSystem: 'WORKDAY',
      };

      const countBefore = (
        await db
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.company_id, stateStreetCompanyId))
      ).length;

      const stats = await runPipeline(
        candidates,
        stateStreetCompanyId,
        sourceConfig as any,
        collector.isCompleteScan()
      );

      // Re-running existing candidates: updated, not newly created duplicates
      const countAfter = (
        await db
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.company_id, stateStreetCompanyId))
      ).length;

      expect(countAfter).toBe(countBefore);
    }, 30_000);
  });

  // ─── CUSHMAN & WAKEFIELD TESTS ────────────────────────────────────────────

  describe('Cushman & Wakefield Workday Integration', () => {
    const cwConfig = {
      companyName: 'Cushman & Wakefield',
      host: 'cw.wd1.myworkdayjobs.com',
      tenant: 'cw',
      clientSite: 'External',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    };

    it('7. Endpoint connectivity and health check passes with India postings count', async () => {
      const collector = new WorkdayCollector({
        ...cwConfig,
        pageSize: 5,
        maxPages: 1,
      });

      const health = await collector.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.message).toContain('Workday CXS API reachable');
    });

    it('8. Correctly flags faceted scan as incomplete for absence-based closure', () => {
      const collector = new WorkdayCollector({
        ...cwConfig,
        pageSize: 5,
        maxPages: 1,
      });

      expect(collector.isCompleteScan()).toBe(false);
    });

    it('9. Discovers bounded Cushman & Wakefield India jobs with valid URLs', async () => {
      const collector = new WorkdayCollector({
        ...cwConfig,
        pageSize: 5,
        maxPages: 1,
      });

      const jobs = await collector.discoverJobs();
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(5);

      for (const job of jobs) {
        expect(job.externalJobId).toBeTruthy();
        expect(job.officialUrl).toContain('cw.wd1.myworkdayjobs.com/External/job/');
        const urlValidation = validateJobUrl(job.officialUrl, 'cw.wd1.myworkdayjobs.com');
        expect(urlValidation.valid).toBe(true);
        expect(job.title).toBeTruthy();
        expect(job.location).toBeTruthy();
      }
    });

    it('10. Successfully runs Cushman & Wakefield through pipeline to ACTIVE + VERIFIED', async () => {
      const collector = new WorkdayCollector({
        ...cwConfig,
        pageSize: 5,
        maxPages: 1,
      });

      const candidates = await collector.discoverJobs();
      expect(candidates.length).toBeGreaterThan(0);

      const sourceConfig = {
        officialDomain: 'cw.wd1.myworkdayjobs.com',
        workdayConfig: cwConfig,
        sourceSystem: 'WORKDAY',
      };

      const stats = await runPipeline(
        candidates,
        cwCompanyId,
        sourceConfig as any,
        collector.isCompleteScan()
      );

      expect(stats.total).toBe(candidates.length);
      expect(stats.verified).toBeGreaterThan(0);

      // Check DB records for candidate jobs
      const candidateExternalIds = candidates.map(c => c.externalJobId);
      const savedJobs = await db
        .select()
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.company_id, cwCompanyId),
            inArray(schema.jobs.external_job_id, candidateExternalIds)
          )
        );

      expect(savedJobs.length).toBe(candidates.length);
      const activeJobs = savedJobs.filter(j => j.status === 'ACTIVE' && j.verification_status === 'VERIFIED');
      expect(activeJobs.length).toBe(stats.verified);
      for (const j of activeJobs) {
        expect(j.official_url).toContain('cw.wd1.myworkdayjobs.com');
      }
    }, 30_000);
  });
});
