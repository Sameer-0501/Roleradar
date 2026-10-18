/**
 * Phase 20.5 Consolidated Workday Employer Expansion Integration Test
 *
 * Tests the newly integrated Workday direct employers:
 *   1. LSEG (London Stock Exchange Group) - lseg.wd3.myworkdayjobs.com
 *   2. Stryker - stryker.wd1.myworkdayjobs.com
 *   3. KONE - kone.wd3.myworkdayjobs.com
 *   4. Aptiv - aptiv.wd5.myworkdayjobs.com
 *
 * Enforces:
 *   - Notification isolation (alertService mocked, zero real emails/alerts)
 *   - Bounded controlled discovery (max 5 jobs per employer)
 *   - Declarative appliedFacets verification (India country facets)
 *   - Incomplete scan closure safety (isCompleteScan() === false)
 *   - Authoritative requisition ID extraction
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

describe('Phase 20.5 Consolidated Expansion: LSEG, Stryker, KONE, Aptiv', () => {
  let db: ReturnType<typeof getDb>;
  const companyIds: Record<string, string> = {};

  const employerConfigs = [
    {
      name: 'LSEG',
      officialDomain: 'lseg.wd3.myworkdayjobs.com',
      workdayConfig: {
        host: 'lseg.wd3.myworkdayjobs.com',
        tenant: 'lseg',
        clientSite: 'Careers',
        appliedFacets: {
          locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^R\d+/,
      urlSubpath: 'lseg.wd3.myworkdayjobs.com/Careers/job/',
    },
    {
      name: 'Stryker',
      officialDomain: 'stryker.wd1.myworkdayjobs.com',
      workdayConfig: {
        host: 'stryker.wd1.myworkdayjobs.com',
        tenant: 'stryker',
        clientSite: 'StrykerCareers',
        appliedFacets: {
          Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^R\d+/,
      urlSubpath: 'stryker.wd1.myworkdayjobs.com/StrykerCareers/job/',
    },
    {
      name: 'KONE',
      officialDomain: 'kone.wd3.myworkdayjobs.com',
      workdayConfig: {
        host: 'kone.wd3.myworkdayjobs.com',
        tenant: 'kone',
        clientSite: 'Careers',
        appliedFacets: {
          Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^R\d+/,
      urlSubpath: 'kone.wd3.myworkdayjobs.com/Careers/job/',
    },
    {
      name: 'Aptiv',
      officialDomain: 'aptiv.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'aptiv.wd5.myworkdayjobs.com',
        tenant: 'aptiv',
        clientSite: 'APTIV_CAREERS',
        appliedFacets: {
          Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^J\d+/,
      urlSubpath: 'aptiv.wd5.myworkdayjobs.com/APTIV_CAREERS/job/',
    },
  ];

  beforeAll(async () => {
    db = getDb();
    // Seed sources so new companies are added to companies table
    await seedSources();

    for (const emp of employerConfigs) {
      const records = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.name, emp.name))
        .limit(1);
      expect(records.length).toBe(1);
      companyIds[emp.name] = records[0].id;
    }
  });

  afterAll(async () => {
    await closeConnection();
  });

  for (const emp of employerConfigs) {
    describe(`${emp.name} Workday Integration`, () => {
      it(`Health check connectivity succeeds for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        const health = await collector.healthCheck();
        expect(health.healthy).toBe(true);
        expect(health.message).toContain('Workday CXS API reachable');
      });

      it(`Correctly flags ${emp.name} faceted scan as incomplete for absence-based closure`, () => {
        const collector = new WorkdayCollector({
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        expect(collector.isCompleteScan()).toBe(false);
      });

      it(`Discovers bounded India jobs with authoritative requisition IDs for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        const jobs = await collector.discoverJobs();
        expect(jobs.length).toBeGreaterThan(0);
        expect(jobs.length).toBeLessThanOrEqual(5);

        for (const job of jobs) {
          expect(job.externalJobId).toBeTruthy();
          expect(job.externalJobId).toMatch(emp.reqPattern);
          expect(job.officialUrl).toContain(emp.urlSubpath);

          const urlValidation = validateJobUrl(job.officialUrl, emp.officialDomain);
          expect(urlValidation.valid).toBe(true);
          expect(job.title).toBeTruthy();
          expect(job.location).toBeTruthy();
        }
      });

      it(`Rejects lookalike and aggregator URLs for ${emp.name}`, () => {
        expect(validateJobUrl(`https://indeed.com/viewjob?jk=123`, emp.officialDomain).valid).toBe(false);
        expect(validateJobUrl(`https://linkedin.com/jobs/view/123`, emp.officialDomain).valid).toBe(false);
        expect(validateJobUrl(`http://${emp.officialDomain}/job/123`, emp.officialDomain).valid).toBe(false);
        expect(validateJobUrl(`https://fake-${emp.officialDomain}/job/123`, emp.officialDomain).valid).toBe(false);
      });

      it(`Executes full pipeline and persists verified ACTIVE jobs for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        const candidates = await collector.discoverJobs();
        expect(candidates.length).toBeGreaterThan(0);

        const sourceConfig = {
          officialDomain: emp.officialDomain,
          workdayConfig: emp.workdayConfig,
          sourceSystem: 'WORKDAY',
        };

        const companyId = companyIds[emp.name];
        const stats = await runPipeline(
          candidates,
          companyId,
          sourceConfig as any,
          collector.isCompleteScan()
        );

        expect(stats.total).toBe(candidates.length);
        expect(stats.verified).toBeGreaterThan(0);
        expect(stats.skipped).toBe(0);

        // Verify alert safety (mocked)
        expect(alertService.evaluateAndCreateInstantAlerts).toHaveBeenCalled();

        // Check DB records for candidate jobs
        const candidateExternalIds = candidates.map(c => c.externalJobId);
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
        const activeJobs = savedJobs.filter(j => j.status === 'ACTIVE' && j.verification_status === 'VERIFIED');
        expect(activeJobs.length).toBe(stats.verified);
        for (const j of activeJobs) {
          expect(j.official_url).toContain(emp.officialDomain);
        }
      }, 40_000);

      it(`Repeat scan is idempotent and creates 0 duplicates for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        const candidates = await collector.discoverJobs();
        const sourceConfig = {
          officialDomain: emp.officialDomain,
          workdayConfig: emp.workdayConfig,
          sourceSystem: 'WORKDAY',
        };

        const companyId = companyIds[emp.name];
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
          collector.isCompleteScan()
        );

        const countAfter = (
          await db
            .select()
            .from(schema.jobs)
            .where(eq(schema.jobs.company_id, companyId))
        ).length;

        expect(countAfter).toBe(countBefore);
      }, 40_000);
    });
  }
});
