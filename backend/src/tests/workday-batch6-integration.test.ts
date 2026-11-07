/**
 * Phase 20.5 Consolidated Workday Employer Expansion Batch 6 Integration Test
 *
 * Tests the newly integrated Workday direct employers:
 *   1. Haleon - gsknch.wd3.myworkdayjobs.com
 *   2. Nasdaq - nasdaq.wd1.myworkdayjobs.com
 *   3. TransUnion - transunion.wd5.myworkdayjobs.com
 *   4. Broadridge - broadridge.wd5.myworkdayjobs.com
 *   5. U.S. Bank - usbank.wd1.myworkdayjobs.com
 *   6. Pfizer - pfizer.wd1.myworkdayjobs.com
 *
 * Enforces:
 *   - Notification isolation (alertService mocked, zero real emails/alerts)
 *   - Catalog registration & source seeder idempotency
 *   - Bounded controlled discovery (max 5 jobs per employer)
 *   - Incomplete scan closure safety (isCompleteScan() === false on bounded/truncated scans)
 *   - Authoritative requisition ID extraction (numeric, R..., JR..., 2026-...)
 *   - Official application URL validation (rejects invalid/lookalike domains, non-443 ports, userinfo)
 *   - Full pipeline execution (candidates -> persisted -> verified ACTIVE)
 *   - Deduplication idempotency (re-running scan creates 0 duplicate rows)
 *   - Clean teardown of test-created job data without deleting companies
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

describe('Phase 20.5 Batch 6 Workday Expansion: Haleon, Nasdaq, TransUnion, Broadridge, U.S. Bank, Pfizer', () => {
  let db: ReturnType<typeof getDb>;
  const companyIds: Record<string, string> = {};

  const employerConfigs = [
    {
      name: 'Haleon',
      officialDomain: 'gsknch.wd3.myworkdayjobs.com',
      workdayConfig: {
        host: 'gsknch.wd3.myworkdayjobs.com',
        tenant: 'gsknch',
        clientSite: 'GSKCareers',
      },
      reqPattern: /^\d+/,
      urlSubpath: 'gsknch.wd3.myworkdayjobs.com/GSKCareers/job/',
    },
    {
      name: 'Nasdaq',
      officialDomain: 'nasdaq.wd1.myworkdayjobs.com',
      workdayConfig: {
        host: 'nasdaq.wd1.myworkdayjobs.com',
        tenant: 'nasdaq',
        clientSite: 'Global_External_Site',
      },
      reqPattern: /^R\d+/i,
      urlSubpath: 'nasdaq.wd1.myworkdayjobs.com/Global_External_Site/job/',
    },
    {
      name: 'TransUnion',
      officialDomain: 'transunion.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'transunion.wd5.myworkdayjobs.com',
        tenant: 'transunion',
        clientSite: 'TransUnion',
      },
      reqPattern: /^\d+/,
      urlSubpath: 'transunion.wd5.myworkdayjobs.com/TransUnion/job/',
    },
    {
      name: 'Broadridge',
      officialDomain: 'broadridge.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'broadridge.wd5.myworkdayjobs.com',
        tenant: 'broadridge',
        clientSite: 'Careers',
      },
      reqPattern: /^(?:JR|R)?\d+/i,
      urlSubpath: 'broadridge.wd5.myworkdayjobs.com/Careers/job/',
    },
    {
      name: 'U.S. Bank',
      officialDomain: 'usbank.wd1.myworkdayjobs.com',
      workdayConfig: {
        host: 'usbank.wd1.myworkdayjobs.com',
        tenant: 'usbank',
        clientSite: 'US_Bank_Careers',
      },
      reqPattern: /^\d{4}-\d+/,
      urlSubpath: 'usbank.wd1.myworkdayjobs.com/US_Bank_Careers/job/',
    },
    {
      name: 'Pfizer',
      officialDomain: 'pfizer.wd1.myworkdayjobs.com',
      workdayConfig: {
        host: 'pfizer.wd1.myworkdayjobs.com',
        tenant: 'pfizer',
        clientSite: 'PfizerCareers',
      },
      reqPattern: /^\d+/,
      urlSubpath: 'pfizer.wd1.myworkdayjobs.com/PfizerCareers/job/',
    },
  ];

  beforeAll(async () => {
    db = getDb();

    // Seed sources to register all catalog items in database
    const seedResult = await seedSources();
    expect(seedResult.size).toBeGreaterThanOrEqual(146);

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

      it(`Validates direct employer application URLs for ${emp.name}`, () => {
        // Canonical public format
        const validOfficialUrl = `https://${emp.workdayConfig.host}/${emp.workdayConfig.clientSite}/job/US/Sample-Role_12345`;
        const result = validateJobUrl(validOfficialUrl, emp.officialDomain);
        expect(result.valid).toBe(true);

        // Internationalized canonical format
        const validIntlUrl = `https://${emp.workdayConfig.host}/en-US/${emp.workdayConfig.tenant}/${emp.workdayConfig.clientSite}/job/Sample-Role_12345`;
        const intlResult = validateJobUrl(validIntlUrl, emp.officialDomain);
        expect(intlResult.valid).toBe(true);

        // Reject lookalike / domain spoofing
        const maliciousUrl = `https://evil-spoof.com/${emp.workdayConfig.clientSite}/job/Sample-Role_12345`;
        expect(validateJobUrl(maliciousUrl, emp.officialDomain).valid).toBe(false);

        const attackerSubdomain = `https://attacker-${emp.officialDomain}/${emp.workdayConfig.clientSite}/job/Sample-Role_12345`;
        expect(validateJobUrl(attackerSubdomain, emp.officialDomain).valid).toBe(false);

        // Reject non-standard ports
        const portUrl = `https://${emp.officialDomain}:8443/${emp.workdayConfig.clientSite}/job/Sample-Role_12345`;
        expect(validateJobUrl(portUrl, emp.officialDomain).valid).toBe(false);

        // Reject embedded credentials
        const credsUrl = `https://admin:pass@${emp.officialDomain}/${emp.workdayConfig.clientSite}/job/Sample-Role_12345`;
        expect(validateJobUrl(credsUrl, emp.officialDomain).valid).toBe(false);

        // Reject generic root / careers homepage
        const rootUrl = `https://${emp.officialDomain}/${emp.workdayConfig.clientSite}`;
        expect(validateJobUrl(rootUrl, emp.officialDomain).valid).toBe(false);
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

        // Absence reconciliation guard: bounded discovery scan must assert incomplete scan
        expect(collector.isCompleteScan()).toBe(false);

        for (const candidate of candidates) {
          expect(candidate.externalJobId).toBeDefined();
          expect(candidate.externalJobId).toMatch(emp.reqPattern);
          expect(candidate.title.trim().length).toBeGreaterThan(0);
          expect(candidate.officialUrl).toContain(emp.urlSubpath);
          expect(candidate.sourceSystem).toBe('WORKDAY');
          expect(candidate.location).toBeDefined();

          // Ensure generated URL passes validator
          const validation = validateJobUrl(candidate.officialUrl, emp.officialDomain);
          expect(validation.valid).toBe(true);
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

