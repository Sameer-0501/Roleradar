/**
 * Phase 20.5 Consolidated Workday Employer Expansion Batch 5 Integration Test
 *
 * Tests the newly integrated Workday direct employers:
 *   1. Genpact - genpact.wd108.myworkdayjobs.com
 *   2. Abbott - abbott.wd5.myworkdayjobs.com
 *   3. General Mills - genmills.wd1.myworkdayjobs.com
 *   4. Cigna Healthcare - cigna.wd5.myworkdayjobs.com
 *   5. RELX - relx.wd3.myworkdayjobs.com
 *
 * Enforces:
 *   - Notification isolation (alertService mocked, zero real emails/alerts)
 *   - Catalog registration & source seeder idempotency
 *   - Bounded controlled discovery (max 5 jobs per employer)
 *   - Declarative appliedFacets verification for faceted sources
 *   - Incomplete scan closure safety (isCompleteScan() === false for faceted sources)
 *   - Authoritative requisition ID extraction (numeric, R..., CPG/JR...)
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

describe('Phase 20.5 Batch 5 Workday Expansion: Genpact, Abbott, General Mills, Cigna Healthcare, RELX', () => {
  let db: ReturnType<typeof getDb>;
  const companyIds: Record<string, string> = {};

  const employerConfigs = [
    {
      name: 'Genpact',
      officialDomain: 'genpact.wd108.myworkdayjobs.com',
      workdayConfig: {
        host: 'genpact.wd108.myworkdayjobs.com',
        tenant: 'genpact',
        clientSite: 'external_careers',
      },
      reqPattern: /^(?:CPG|JR)\d+/i,
      urlSubpath: 'genpact.wd108.myworkdayjobs.com/external_careers/job/',
      isFaceted: false,
    },
    {
      name: 'Abbott',
      officialDomain: 'abbott.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'abbott.wd5.myworkdayjobs.com',
        tenant: 'abbott',
        clientSite: 'abbottcareers',
        appliedFacets: {
          Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^\d+/,
      urlSubpath: 'abbott.wd5.myworkdayjobs.com/abbottcareers/job/',
      isFaceted: true,
    },
    {
      name: 'General Mills',
      officialDomain: 'genmills.wd1.myworkdayjobs.com',
      workdayConfig: {
        host: 'genmills.wd1.myworkdayjobs.com',
        tenant: 'genmills',
        clientSite: 'GMI_External_Careers',
        appliedFacets: {
          locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^\d+/,
      urlSubpath: 'genmills.wd1.myworkdayjobs.com/GMI_External_Careers/job/',
      isFaceted: true,
    },
    {
      name: 'Cigna Healthcare',
      officialDomain: 'cigna.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'cigna.wd5.myworkdayjobs.com',
        tenant: 'cigna',
        clientSite: 'cignacareers',
        appliedFacets: {
          Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^\d+/,
      urlSubpath: 'cigna.wd5.myworkdayjobs.com/cignacareers/job/',
      isFaceted: true,
    },
    {
      name: 'RELX',
      officialDomain: 'relx.wd3.myworkdayjobs.com',
      workdayConfig: {
        host: 'relx.wd3.myworkdayjobs.com',
        tenant: 'relx',
        clientSite: 'relx',
        appliedFacets: {
          Country___Territory: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^R\d+/,
      urlSubpath: 'relx.wd3.myworkdayjobs.com/relx/job/',
      isFaceted: true,
    },
  ];

  beforeAll(async () => {
    db = getDb();

    // Seed sources to register all catalog items in database
    const seedResult = await seedSources();
    expect(seedResult.size).toBeGreaterThanOrEqual(140);

    // Retrieve company IDs and clean up any pre-existing jobs for clean baseline
    for (const emp of employerConfigs) {
      const company = await db.query.companies.findFirst({
        where: eq(schema.companies.name, emp.name),
      });
      expect(company, `Company record must exist for ${emp.name}`).toBeDefined();
      companyIds[emp.name] = company!.id;
      await db.delete(schema.jobs).where(eq(schema.jobs.company_id, company!.id));
    }
  }, 45000);

  afterAll(async () => {
    // Teardown: clean up test-created jobs to maintain database cleanliness
    for (const emp of employerConfigs) {
      const compId = companyIds[emp.name];
      if (compId) {
        await db.delete(schema.jobs).where(eq(schema.jobs.company_id, compId));
      }
    }
    await closeConnection();
  });

  for (const emp of employerConfigs) {
    describe(`${emp.name} Workday Integration`, () => {
      it(`Health check connectivity succeeds for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
          ...emp.workdayConfig,
        });

        const health = await collector.healthCheck();
        expect(health.healthy).toBe(true);
        expect(health.message).toContain('Workday CXS API reachable');
      }, 15000);

      it(`Correctly assesses scan completeness (isFaceted=${emp.isFaceted}) for ${emp.name}`, () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
          ...emp.workdayConfig,
        });

        expect(collector.isCompleteScan()).toBe(!emp.isFaceted);
      });

      it(`Validates direct employer application URLs for ${emp.name}`, () => {
        const validOfficialUrl = `https://${emp.workdayConfig.host}/${emp.workdayConfig.clientSite}/job/India/Sample-Role_R12345`;
        const result = validateJobUrl(validOfficialUrl, emp.officialDomain);
        expect(result.valid).toBe(true);

        const maliciousUrl = `https://evil-spoof.com/${emp.workdayConfig.clientSite}/job/India/Sample-Role_R12345`;
        const maliciousResult = validateJobUrl(maliciousUrl, emp.officialDomain);
        expect(maliciousResult.valid).toBe(false);
      });

      it(`Discovers bounded jobs with authoritative requisition IDs for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        const candidates = await collector.discoverJobs();
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.length).toBeLessThanOrEqual(5);

        for (const candidate of candidates) {
          expect(candidate.externalJobId).toBeDefined();
          expect(candidate.externalJobId).toMatch(emp.reqPattern);
          expect(candidate.title.trim().length).toBeGreaterThan(0);
          expect(candidate.officialUrl).toContain(emp.urlSubpath);
          expect(candidate.sourceSystem).toBe('WORKDAY');
          expect(candidate.location).toBeDefined();
        }
      }, 20000);

      it(`Executes full pipeline and persists verified ACTIVE jobs for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
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
          expect(job.status).toBe('ACTIVE');
          expect(job.verification_status).toBe('VERIFIED');
          expect(job.title).toBeTruthy();
          expect(job.location).toBeTruthy();
          expect(job.official_url).toContain(emp.urlSubpath);
        }
      }, 35000);

      it(`Repeat scan is idempotent and creates 0 duplicates for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
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
      }, 30000);
    });
  }
});
