/**
 * Phase 20.5 Consolidated Workday Employer Expansion Batch 2 Integration Test
 *
 * Tests the candidate direct employers:
 *   1. Fractal Analytics - fractal.wd1.myworkdayjobs.com (INTEGRATED)
 *   2. Omnissa - omnissa.wd501.myworkdayjobs.com (DEFERRED / BLOCKED)
 *   3. Piramal Pharma - piramalpharma.wd102.myworkdayjobs.com (INTEGRATED)
 *   4. Elevance Health / Carelon - elevancehealth.wd1.myworkdayjobs.com (INTEGRATED)
 *   5. Thomson Reuters - thomsonreuters.wd5.myworkdayjobs.com (INTEGRATED)
 *
 * Enforces:
 *   - Notification isolation (alertService mocked, zero real emails/alerts)
 *   - Catalog registration & source seeder idempotency
 *   - Safe deferral of Omnissa (HTTP 303 maintenance redirect, no false records)
 *   - Bounded controlled discovery (max 5 jobs per employer)
 *   - Declarative appliedFacets verification for Thomson Reuters (India facet)
 *   - Incomplete scan closure safety (isCompleteScan() === false for faceted TR)
 *   - Authoritative requisition ID extraction (e.g. JREQ..., SR-..., R..., JR...)
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
import { SOURCE_CATALOG } from '../sources/catalog.js';
import * as alertService from '../notifications/alert-service.js';

describe('Phase 20.5 Batch 2 Workday Expansion: Fractal, Omnissa, Piramal, Elevance, TR', () => {
  let db: ReturnType<typeof getDb>;
  const companyIds: Record<string, string> = {};

  const admittedEmployers = [
    {
      name: 'Fractal Analytics',
      officialDomain: 'fractal.wd1.myworkdayjobs.com',
      workdayConfig: {
        host: 'fractal.wd1.myworkdayjobs.com',
        tenant: 'fractal',
        clientSite: 'Careers',
      },
      reqPattern: /^SR-\d+/,
      urlSubpath: 'fractal.wd1.myworkdayjobs.com/Careers/job/',
      isFaceted: false,
    },
    {
      name: 'Piramal Pharma',
      officialDomain: 'piramalpharma.wd102.myworkdayjobs.com',
      workdayConfig: {
        host: 'piramalpharma.wd102.myworkdayjobs.com',
        tenant: 'piramalpharma',
        clientSite: 'PIRAMAL_EXTERNAL_CAREERS',
      },
      reqPattern: /^R\d+/,
      urlSubpath: 'piramalpharma.wd102.myworkdayjobs.com/PIRAMAL_EXTERNAL_CAREERS/job/',
      isFaceted: false,
    },
    {
      name: 'Elevance Health',
      officialDomain: 'elevancehealth.wd1.myworkdayjobs.com',
      workdayConfig: {
        host: 'elevancehealth.wd1.myworkdayjobs.com',
        tenant: 'elevancehealth',
        clientSite: 'carelonglobal_in',
      },
      reqPattern: /^JR\d+/,
      urlSubpath: 'elevancehealth.wd1.myworkdayjobs.com/carelonglobal_in/job/',
      isFaceted: false,
    },
    {
      name: 'Thomson Reuters',
      officialDomain: 'thomsonreuters.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'thomsonreuters.wd5.myworkdayjobs.com',
        tenant: 'thomsonreuters',
        clientSite: 'external_career_site',
        appliedFacets: {
          Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
        },
      },
      reqPattern: /^JREQ\d+/,
      urlSubpath: 'thomsonreuters.wd5.myworkdayjobs.com/external_career_site/job/',
      isFaceted: true,
    },
  ];

  beforeAll(async () => {
    db = getDb();
    // Seed sources so new catalog additions exist in companies table
    await seedSources();

    for (const emp of admittedEmployers) {
      const records = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.name, emp.name))
        .limit(1);
      expect(records.length).toBe(1);
      companyIds[emp.name] = records[0]!.id;
    }
  });

  afterAll(async () => {
    // Teardown created jobs to preserve clean DB state
    for (const emp of admittedEmployers) {
      const companyId = companyIds[emp.name];
      if (companyId) {
        await db.delete(schema.jobs).where(eq(schema.jobs.company_id, companyId));
      }
    }
    await closeConnection();
  });

  // ─── Omnissa Safe Deferral Verification ─────────────────────────────────────
  describe('Candidate 2: Omnissa (Safe Deferral)', () => {
    it('confirms Omnissa is NOT registered in SOURCE_CATALOG', () => {
      const omnissaSource = SOURCE_CATALOG.find(
        (s) => s.companyName.toLowerCase().includes('omnissa')
      );
      expect(omnissaSource).toBeUndefined();
    });

    it('documents empirical evidence: Workday host returns non-JSON maintenance redirect', async () => {
      const endpoint = 'https://omnissa.wd501.myworkdayjobs.com/wday/cxs/omnissa/Omnissa_External_Career_Site/jobs';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5, offset: 0, appliedFacets: {}, searchText: '' }),
      });

      // Following redirects leads to Workday maintenance page HTML
      const text = await res.text();
      const isHtml = text.trim().startsWith('<!DOCTYPE html>') || text.includes('maintenance-page') || text.includes('community.workday.com');
      expect(isHtml).toBe(true);
    });
  });

  // ─── Admitted Employers Live Integration Tests ─────────────────────────────
  for (const emp of admittedEmployers) {
    describe(`${emp.name} Workday Integration`, () => {
      it(`Health check connectivity succeeds for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        const health = await collector.healthCheck();
        expect(health.healthy).toBe(true);
        expect(health.message).toContain('Workday CXS API reachable');
      });

      it(`Correctly assesses scan completeness (isFaceted=${emp.isFaceted}) for ${emp.name}`, () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
          ...emp.workdayConfig,
          pageSize: 5,
          maxPages: 1,
        });

        expect(collector.isCompleteScan()).toBe(!emp.isFaceted);
      });

      it(`Discovers bounded jobs with authoritative requisition IDs for ${emp.name}`, async () => {
        const collector = new WorkdayCollector({
          companyName: emp.name,
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
          if (job.location) {
            expect(typeof job.location).toBe('string');
          }
        }
      });

      it(`Rejects lookalike and aggregator URLs for ${emp.name}`, () => {
        expect(validateJobUrl(`https://indeed.com/viewjob?jk=123`, emp.officialDomain).valid).toBe(false);
        expect(validateJobUrl(`https://naukri.com/job/123`, emp.officialDomain).valid).toBe(false);
        expect(validateJobUrl(`http://${emp.officialDomain}/job/123`, emp.officialDomain).valid).toBe(false);
        expect(validateJobUrl(`https://phishing-${emp.officialDomain}/job/123`, emp.officialDomain).valid).toBe(false);
      });

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
        const activeJobs = savedJobs.filter(
          (j) => j.status === 'ACTIVE' && j.verification_status === 'VERIFIED'
        );
        expect(activeJobs.length).toBe(stats.verified);
        for (const j of activeJobs) {
          expect(j.official_url).toContain(emp.officialDomain);
        }
      }, 45_000);

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
      }, 45_000);
    });
  }
});
