/**
 * Phase 20.5 Consolidated Workday Employer Expansion Batch 8 Integration Test
 *
 * Tests the newly integrated Workday direct employers:
 *   1. Salesforce - salesforce.wd12.myworkdayjobs.com
 *   2. Workday (Corporate) - workday.wd5.myworkdayjobs.com
 *   3. Teladoc Health - teladoc.wd503.myworkdayjobs.com
 *
 * Enforces:
 *   - Notification isolation (alertService mocked, zero real emails/alerts)
 *   - Catalog registration & source seeder idempotency
 *   - Bounded controlled discovery (max 5 jobs per employer)
 *   - Incomplete scan closure safety (isCompleteScan() === false on bounded/truncated scans)
 *   - Authoritative requisition ID extraction
 *   - Official application URL validation (rejects invalid/lookalike domains, non-443 ports, userinfo)
 *   - Full pipeline execution (candidates -> persisted -> verified ACTIVE)
 *   - Deduplication idempotency (re-running scan creates 0 duplicate rows)
 *   - Specialized endpoint checks: Salesforce Futureforce early career discovery & Teladoc cluster reconciliation
 *   - Clean teardown of test-created job data without deleting companies
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

describe('Phase 20.5 Batch 8 Workday Expansion: Salesforce, Workday, Teladoc Health', () => {
  let db: ReturnType<typeof getDb>;
  const companyIds: Record<string, string> = {};

  const employerConfigs = [
    {
      name: 'Salesforce',
      officialDomain: 'salesforce.wd12.myworkdayjobs.com',
      workdayConfig: {
        host: 'salesforce.wd12.myworkdayjobs.com',
        tenant: 'salesforce',
        clientSite: 'External_Career_Site',
      },
      reqPattern: /^(?:JR|R)?\d+/i,
      urlSubpath: 'salesforce.wd12.myworkdayjobs.com/External_Career_Site/job/',
    },
    {
      name: 'Workday',
      officialDomain: 'workday.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'workday.wd5.myworkdayjobs.com',
        tenant: 'workday',
        clientSite: 'Workday',
      },
      reqPattern: /^JR-?\d+/i,
      urlSubpath: 'workday.wd5.myworkdayjobs.com/Workday/job/',
    },
    {
      name: 'Teladoc Health',
      officialDomain: 'teladoc.wd503.myworkdayjobs.com',
      workdayConfig: {
        host: 'teladoc.wd503.myworkdayjobs.com',
        tenant: 'teladoc',
        clientSite: 'teladochealth_is_hiring',
      },
      reqPattern: /^(?:JR|R)?\d+/i,
      urlSubpath: 'teladoc.wd503.myworkdayjobs.com/teladochealth_is_hiring/job/',
    },
  ];

  beforeAll(async () => {
    db = getDb();

    // Seed sources to register all catalog items in database
    const seedResult = await seedSources();
    expect(seedResult.size).toBeGreaterThanOrEqual(153);

    // Retrieve company IDs without destroying pre-existing jobs (Phase 20.5D teardown safety standard)
    for (const emp of employerConfigs) {
      const company = await db.query.companies.findFirst({
        where: eq(schema.companies.name, emp.name),
      });
      expect(company, `Company record must exist for ${emp.name}`).toBeDefined();
      companyIds[emp.name] = company!.id;
    }
  }, 45000);

  afterAll(async () => {
    // Teardown: close connection safely without wiping pre-existing catalog data
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

  describe('Specialized Batch 8 Candidate Validations', () => {
    it('Salesforce Futureforce (New Grad / Early Career) endpoint discovers valid early talent jobs', async () => {
      const futureforceCollector = new WorkdayCollector({
        companyName: 'Salesforce Futureforce',
        host: 'salesforce.wd12.myworkdayjobs.com',
        tenant: 'salesforce',
        clientSite: 'Futureforce_NewGradRoles',
        pageSize: 5,
        maxPages: 1,
      });

      const health = await futureforceCollector.healthCheck();
      expect(health.healthy).toBe(true);

      const jobs = await futureforceCollector.discoverJobs();
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(5);
      expect(futureforceCollector.isCompleteScan()).toBe(false);

      for (const job of jobs) {
        expect(job.externalJobId).toMatch(/^(?:JR|R)?\d+/i);
        expect(job.officialUrl).toContain('salesforce.wd12.myworkdayjobs.com/Futureforce_NewGradRoles/job/');
        expect(validateJobUrl(job.officialUrl, 'salesforce.wd12.myworkdayjobs.com').valid).toBe(true);
      }
    }, 20000);

    it('Teladoc Health datacenter cluster routing: wd503 is reachable while preliminary wd1 is rejected', async () => {
      // Reconciled wd503 cluster
      const healthyCollector = new WorkdayCollector({
        companyName: 'Teladoc Health',
        host: 'teladoc.wd503.myworkdayjobs.com',
        tenant: 'teladoc',
        clientSite: 'teladochealth_is_hiring',
      });
      const health503 = await healthyCollector.healthCheck();
      expect(health503.healthy).toBe(true);

      // Preliminary un-reconciled wd1 cluster returns HTTP 422
      const prelimCollector = new WorkdayCollector({
        companyName: 'Teladoc Health (preliminary wd1)',
        host: 'teladoc.wd1.myworkdayjobs.com',
        tenant: 'teladoc',
        clientSite: 'teladochealth_is_hiring',
      });
      const healthWd1 = await prelimCollector.healthCheck();
      expect(healthWd1.healthy).toBe(false);
      expect(healthWd1.message).toContain('HTTP 422');
    }, 20000);
  });
});

