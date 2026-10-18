/**
 * Airbus Workday Controlled Integration Test (Phase 20.5)
 *
 * REAL integration test against Airbus on Workday (ag.wd3.myworkdayjobs.com).
 * Uses bounded controlled discovery (pageSize: 5, maxPages: 1 -> max 5 postings).
 * Enforces:
 *   1. Health check & endpoint connectivity
 *   2. Bounded controlled discovery with authoritative requisition ID extraction (JR...)
 *   3. Official URL format & domain validation (accepts Airbus, rejects aggregators/lookalikes)
 *   4. Strict notification isolation (mocks alert service, zero real alerts/emails sent)
 *   5. Full pipeline run (persistence, verification checks, status update)
 *   6. Idempotent duplicate-scan handling (0 duplicates created)
 *   7. Partial scan safety (absent jobs not closed on partial scan)
 *   8. Deterministic source isolation (unrelated jobs unaffected)
 *   9. Country-aware remote/location and experience/fresher hard filter invariants
 *  10. Clean teardown of test records without touching production data
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import 'dotenv/config';

// 1. Notification Safety: Strictly prevent any real email sends or notifications
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
import { eq, and, sql, inArray } from 'drizzle-orm';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';
import { validateJobUrl } from '../collectors/url-validator.js';
import type { JobCandidate } from '../collectors/types.js';
import * as alertService from '../notifications/alert-service.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import { matchLocation } from '../matching/location-matcher.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  officialDomain: 'ag.wd3.myworkdayjobs.com',
  workdayConfig: {
    host: 'ag.wd3.myworkdayjobs.com',
    tenant: 'ag',
    clientSite: 'Airbus',
  },
  sourceSystem: 'WORKDAY',
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let companyId: string;
let collector: WorkdayCollector;
let sharedCandidates: JobCandidate[] = [];
const insertedJobIds: string[] = [];
let snapshotOtherJobIds: string[] = [];

beforeAll(async () => {
  // Seed sources to register / verify Airbus in the database
  const seedMap = await seedSources();
  companyId = seedMap.get('Airbus')!;

  if (!companyId) {
    const db = getDb();
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Airbus'))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      companyId = existing[0].id;
    }
  }

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run Airbus integration test without company ID');
  }

  // Deterministic Source Isolation Snapshot:
  // Capture existing jobs from an unrelated company (Nvidia) to ensure zero cross-source mutation
  const db = getDb();
  const nvidiaCompany = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(eq(schema.companies.name, 'Nvidia'))
    .limit(1);

  if (nvidiaCompany.length > 0 && nvidiaCompany[0]) {
    const otherJobsRes = await db
      .select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, nvidiaCompany[0].id))
      .limit(10);
    snapshotOtherJobIds = otherJobsRes.map((j) => `${j.id}:${j.updated_at?.getTime() ?? 0}`);
  }


  collector = new WorkdayCollector({
    companyName: 'Airbus',
    host: 'ag.wd3.myworkdayjobs.com',
    tenant: 'ag',
    clientSite: 'Airbus',
    officialDomain: 'ag.wd3.myworkdayjobs.com',
    pageSize: 5,
    maxPages: 1, // Bounded: 1 page of 5 items
  });
}, 60_000);

afterAll(async () => {
  try {
    const db = getDb();
    if (insertedJobIds.length > 0) {
      await db.delete(schema.jobs).where(inArray(schema.jobs.id, insertedJobIds));
    }
  } catch (err) {
    console.error('Failed to clean up test records:', err);
  } finally {
    await closeConnection();
  }
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Phase 20.5: Airbus Workday Controlled Integration', () => {
  it('1. Verifies Workday endpoint connectivity via healthCheck', async () => {
    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toContain('Workday CXS API reachable');
  }, 30_000);

  it('2. Discovers bounded candidate pool (max 5) with authoritative requisition IDs', async () => {
    const candidates = await collector.discoverJobs();
    expect(candidates).toBeDefined();
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    sharedCandidates = candidates;

    for (const c of candidates) {
      expect(c.externalJobId).toBeDefined();
      expect(c.externalJobId).toMatch(/^JR\d{7,8}/);
      expect(c.title).toBeTruthy();
      expect(c.officialUrl).toBeTruthy();
      expect(c.officialUrl).toContain('ag.wd3.myworkdayjobs.com/Airbus/job/');
      expect(c.sourceSystem).toBe('WORKDAY');
    }
  }, 30_000);

  it('3. Validates official Airbus application URLs and rejects aggregators/unauthorized domains', () => {
    // Valid Workday candidate portal URL
    const validUrl = 'https://ag.wd3.myworkdayjobs.com/Airbus/job/Bangalore-Area/Service-Delivery-Manager_JR10450990';
    const validCheck = validateJobUrl(validUrl, 'ag.wd3.myworkdayjobs.com');
    expect(validCheck.valid).toBe(true);

    // Reject aggregators
    const aggregatorUrl = 'https://www.naukri.com/job-listings-airbus-123456';
    const aggregatorCheck = validateJobUrl(aggregatorUrl, 'ag.wd3.myworkdayjobs.com');
    expect(aggregatorCheck.valid).toBe(false);

    // Reject fake / lookalike domain
    const fakeDomainUrl = 'https://ag.wd3.airbus-jobs.com/Airbus/job/123';
    const fakeDomainCheck = validateJobUrl(fakeDomainUrl, 'ag.wd3.myworkdayjobs.com');
    expect(fakeDomainCheck.valid).toBe(false);

    // Reject insecure HTTP
    const insecureUrl = 'http://ag.wd3.myworkdayjobs.com/Airbus/job/123';
    const insecureCheck = validateJobUrl(insecureUrl, 'ag.wd3.myworkdayjobs.com');
    expect(insecureCheck.valid).toBe(false);
  });

  it('4. Enforces strict notification isolation — zero real alerts dispatched', async () => {
    expect(vi.isMockFunction(alertService.evaluateAndCreateInstantAlerts)).toBe(true);
    expect(vi.isMockFunction(alertService.evaluateAndCreateRecentJobAlerts)).toBe(true);

    // Verify mocks have not been called yet
    expect(alertService.evaluateAndCreateInstantAlerts).not.toHaveBeenCalled();
    expect(alertService.evaluateAndCreateRecentJobAlerts).not.toHaveBeenCalled();
  });

  it('5. Persists real jobs through full pipeline and executes verification', async () => {
    expect(sharedCandidates.length).toBeGreaterThan(0);

    const stats = await runPipeline(sharedCandidates, companyId, SOURCE_CONFIG, false);

    expect(stats.total).toBe(sharedCandidates.length);
    expect(stats.skipped).toBe(0);

    const db = getDb();
    const inserted = await db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        verification_status: schema.jobs.verification_status,
        title: schema.jobs.title,
        external_job_id: schema.jobs.external_job_id,
        official_url: schema.jobs.official_url,
      })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'WORKDAY'),
          inArray(
            schema.jobs.external_job_id,
            sharedCandidates.map((c) => c.externalJobId)
          )
        )
      );

    expect(inserted.length).toBe(sharedCandidates.length);

    for (const job of inserted) {
      if (!insertedJobIds.includes(job.id)) {
        insertedJobIds.push(job.id);
      }
      expect(job.title).toBeTruthy();
      expect(job.official_url).toContain('ag.wd3.myworkdayjobs.com/Airbus/job/');
      expect(job.status).toBe('ACTIVE');
      expect(job.verification_status).toBe('VERIFIED');
    }

    // Verify verification log records exist
    for (const job of inserted) {
      const verifications = await db
        .select()
        .from(schema.jobVerifications)
        .where(eq(schema.jobVerifications.job_id, job.id));

      expect(verifications.length).toBeGreaterThan(0);
      expect(verifications[0]!.domain_check).toBe(true);

      if (job.verification_status === 'VERIFIED') {
        expect(verifications[0]!.job_exists_check).toBe(true);
        expect(verifications[0]!.job_id_check).toBe(true);
        expect(verifications[0]!.title_check).toBe(true);
      }
    }
  }, 90_000);

  it('6. Proves repeat-scan idempotency: re-running pipeline creates 0 duplicate jobs', async () => {
    const stats2 = await runPipeline(sharedCandidates, companyId, SOURCE_CONFIG, false);
    expect(stats2.total).toBe(sharedCandidates.length);

    const db = getDb();
    const records = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'WORKDAY'),
          inArray(
            schema.jobs.external_job_id,
            sharedCandidates.map((c) => c.externalJobId)
          )
        )
      );

    expect(records.length).toBe(sharedCandidates.length); // 0 duplicates
  }, 90_000);

  it('7. Partial scan safety: incomplete scans (isCompleteScan=false) do NOT close absent jobs', async () => {
    const db = getDb();

    // Partial empty scan
    const statsEmpty = await runPipeline([], companyId, SOURCE_CONFIG, false);
    expect(statsEmpty.total).toBe(0);
    expect(statsEmpty.closed).toBe(0);

    const remainingJobs = await db
      .select({ id: schema.jobs.id, status: schema.jobs.status })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'WORKDAY'),
          inArray(
            schema.jobs.external_job_id,
            sharedCandidates.map((c) => c.externalJobId)
          )
        )
      );

    expect(remainingJobs.length).toBe(insertedJobIds.length);
    for (const r of remainingJobs) {
      expect(r.status).not.toBe('CLOSED');
    }
  }, 90_000);

  it('8. Deterministic source isolation: unrelated companies and jobs remain untouched', async () => {
    const db = getDb();

    // Verify all inserted Airbus jobs strictly have Airbus company_id
    const crossCompanyCheck = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          sql`${schema.jobs.company_id} != ${companyId}`,
          inArray(schema.jobs.id, insertedJobIds)
        )
      );
    expect(crossCompanyCheck.length).toBe(0);

    // Verify sampled inactive other company records remain unchanged
    if (snapshotOtherJobIds.length > 0) {
      const idsToQuery = snapshotOtherJobIds.map((val) => val.split(':')[0]);
      const currentOtherJobs = await db
        .select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
        .from(schema.jobs)
        .where(inArray(schema.jobs.id, idsToQuery));

      const currentOtherJobIds = currentOtherJobs.map((j) => `${j.id}:${j.updated_at?.getTime() ?? 0}`);
      expect(currentOtherJobIds.sort()).toEqual(snapshotOtherJobIds.sort());
    }
  });

  it('9. Preserves experience hard filters — senior roles cannot enter fresher feeds', () => {
    // 1. Explicit Senior title is EXPERIENCED
    const seniorJob = parseExperienceRequirements('Senior Flight Physics Simulation Engineer', 'Leads aerodynamic modeling team. 8+ years required.');
    expect(seniorJob.classification).toBe('EXPERIENCED');
    expect(matchExperience(seniorJob, 'FRESHER').matched).toBe(false);

    // 2. Senior title with deceptive "0-1 years" description retains EXPERIENCED and is blocked from FRESHER
    const deceptiveSenior = parseExperienceRequirements('Lead Software Engineer - Big Data', 'Requires 0-1 years with Spark');
    expect(deceptiveSenior.classification).toBe('EXPERIENCED');
    expect(matchExperience(deceptiveSenior, 'FRESHER').matched).toBe(false);

    // 3. Genuine entry level role is FRESHER_COMPATIBLE
    const gradJob = parseExperienceRequirements('Associate Systems Engineer - SAP WM / EWM', 'Recent university engineering graduates welcome');
    expect(gradJob.classification).toBe('FRESHER_COMPATIBLE');
    expect(matchExperience(gradJob, 'FRESHER').matched).toBe(true);

    // 4. Role with unknown experience is UNKNOWN and blocked from FRESHER feed
    const unknownJob = parseExperienceRequirements('Advanced Numerical Simulation Engineer', 'Performs stress analysis on composite wings');
    expect(unknownJob.classification).toBe('UNKNOWN');
    expect(matchExperience(unknownJob, 'FRESHER').matched).toBe(false);

    // 5. Internship role is recognized as FRESHER_COMPATIBLE
    const internJob = parseExperienceRequirements('Internship - India Innovation Center - Data Analyst Intern', 'Currently enrolled in B.Tech / M.Tech in CS');
    expect(internJob.classification).toBe('FRESHER_COMPATIBLE');
  });

  it('10. Location matching enforces India and country-aware workplace boundaries', () => {
    // Indian canonical locations
    expect(matchLocation('Bangalore', ['Bangalore']).matched).toBe(true);
    expect(matchLocation('Bengaluru, India', ['Bangalore']).matched).toBe(true);
    expect(matchLocation('India, Bangalore', ['Bangalore']).matched).toBe(true);
    expect(matchLocation('Hyderabad, India', ['Hyderabad']).matched).toBe(true);

    // European vs India separation
    expect(matchLocation('Toulouse Area, France', ['Bangalore']).matched).toBe(false);
    expect(matchLocation('Hamburg Area, Germany', ['Bangalore']).matched).toBe(false);
    expect(matchLocation('Belfast, United Kingdom', ['Bangalore']).matched).toBe(false);

    // Remote distinction
    expect(matchLocation('Remote', ['Remote']).matched).toBe(true);
    expect(matchLocation('Hybrid - Bangalore', ['Remote']).matched).toBe(false);
    expect(matchLocation('Hybrid - Bangalore', ['Bangalore']).matched).toBe(true);
  });

  it('11. Discovers real Airbus India postings using appliedFacets and confirms isCompleteScan is false', async () => {
    const indiaCollector = new WorkdayCollector({
      companyName: 'Airbus',
      host: 'ag.wd3.myworkdayjobs.com',
      tenant: 'ag',
      clientSite: 'Airbus',
      officialDomain: 'ag.wd3.myworkdayjobs.com',
      pageSize: 5,
      maxPages: 1,
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    });

    // 1. Verify scan completeness classification
    expect(indiaCollector.isCompleteScan()).toBe(false);
    expect(collector.isCompleteScan()).toBe(true); // default global has no facets

    // 2. Discover jobs with India facet
    const candidates = await indiaCollector.discoverJobs();
    expect(candidates).toBeDefined();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    // 3. Verify all returned candidates are located in India and have valid URLs
    for (const c of candidates) {
      expect(c.location).toBeDefined();
      const isIndia = /india|bangalore|bengaluru|delhi|vadodara/i.test(c.location!);
      expect(isIndia).toBe(true);
      expect(c.externalJobId).toMatch(/^JR\d{7,8}/);
      expect(c.officialUrl).toContain('ag.wd3.myworkdayjobs.com/Airbus/job/');
      const urlCheck = validateJobUrl(c.officialUrl, 'ag.wd3.myworkdayjobs.com');
      expect(urlCheck.valid).toBe(true);
    }
  }, 30_000);

  it('12. Protects absent European jobs from closure when running an India-filtered scan', async () => {
    const db = getDb();

    // 1. Check if there are active European Airbus jobs in the database
    const activeEuropeanJobs = await db
      .select({ id: schema.jobs.id, status: schema.jobs.status, location: schema.jobs.location })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.status, 'ACTIVE')
        )
      )
      .limit(5);

    if (activeEuropeanJobs.length > 0) {
      const euroJobIds = activeEuropeanJobs.map((j) => j.id);

      // 2. Run pipeline with India candidate and isCompleteScan = false
      const mockIndiaCandidate: JobCandidate = {
        externalJobId: 'JR99999999_TEST',
        title: 'Software Engineer - Test',
        location: 'Bangalore Area',
        officialUrl: 'https://ag.wd3.myworkdayjobs.com/Airbus/job/Bangalore-Area/Test_JR99999999',
        sourceSystem: 'WORKDAY',
      };

      // Since isCompleteScan is false, absent European jobs must NOT be closed
      await runPipeline([mockIndiaCandidate], companyId, SOURCE_CONFIG, false);

      // Verify European jobs remain ACTIVE
      const postEuropeanJobs = await db
        .select({ id: schema.jobs.id, status: schema.jobs.status })
        .from(schema.jobs)
        .where(inArray(schema.jobs.id, euroJobIds));

      for (const ej of postEuropeanJobs) {
        expect(ej.status).toBe('ACTIVE');
      }

      // Cleanup test candidate
      await db.delete(schema.jobs).where(eq(schema.jobs.external_job_id, 'JR99999999_TEST'));
    }
  });
});
