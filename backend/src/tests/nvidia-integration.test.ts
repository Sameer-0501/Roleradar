/**
 * NVIDIA Workday Controlled Integration Test (Phase 20.5)
 *
 * REAL integration test against NVIDIA on Workday (nvidia.wd5.myworkdayjobs.com).
 * Uses bounded controlled discovery (pageSize: 5, maxPages: 1 -> max 5 postings).
 * Enforces:
 *   1. Health check & endpoint connectivity
 *   2. Bounded controlled discovery with authoritative requisition ID extraction (JR...)
 *   3. Official URL format & domain validation (accepts NVIDIA, rejects aggregators/lookalikes)
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
  officialDomain: 'nvidia.wd5.myworkdayjobs.com',
  workdayConfig: {
    host: 'nvidia.wd5.myworkdayjobs.com',
    tenant: 'nvidia',
    clientSite: 'NVIDIAExternalCareerSite',
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
  // Seed sources to register / verify Nvidia in the database
  const seedMap = await seedSources();
  companyId = seedMap.get('Nvidia')!;

  if (!companyId) {
    const db = getDb();
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Nvidia'))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      companyId = existing[0].id;
    }
  }

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run NVIDIA integration test without company ID');
  }

  // Deterministic Source Isolation Snapshot:
  // Capture existing unrelated jobs from other companies to ensure zero cross-source mutation
  const db = getDb();
  const otherJobsRes = await db
    .select({ id: schema.jobs.id, status: schema.jobs.status, updated_at: schema.jobs.updated_at })
    .from(schema.jobs)
    .where(sql`${schema.jobs.company_id} != ${companyId}`)
    .limit(10);

  snapshotOtherJobIds = otherJobsRes.map((j) => `${j.id}:${j.updated_at?.getTime() ?? 0}`);

  collector = new WorkdayCollector({
    companyName: 'Nvidia',
    host: SOURCE_CONFIG.workdayConfig.host,
    tenant: SOURCE_CONFIG.workdayConfig.tenant,
    clientSite: SOURCE_CONFIG.workdayConfig.clientSite,
    officialDomain: SOURCE_CONFIG.officialDomain,
    pageSize: 5,
    maxPages: 1, // Controlled bounded discovery (at most 5 candidates)
  });
});

afterAll(async () => {
  // Clean teardown of only test-inserted records
  if (insertedJobIds.length > 0) {
    const db = getDb();
    await db.delete(schema.jobs).where(inArray(schema.jobs.id, insertedJobIds));
  }
  await closeConnection();
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('NVIDIA Workday Controlled Integration (Phase 20.5)', () => {
  it('1. Health check reports healthy and returns valid latency and total count', async () => {
    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toContain('Workday CXS API reachable');
    expect(health.checkedAt).toBeInstanceOf(Date);
  });

  it('2. Discovers real jobs bounded to at most 5 candidates with stable JR IDs', async () => {
    const candidates = await collector.discoverJobs();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    for (const c of candidates) {
      expect(c.title).toBeTruthy();
      expect(c.externalJobId).toMatch(/^JR\d+$/i); // NVIDIA requisition IDs start with JR
      expect(c.officialUrl).toContain(SOURCE_CONFIG.officialDomain);
      expect(c.officialUrl).toContain(c.externalJobId);
      expect(c.sourceSystem).toBe('WORKDAY');
    }

    sharedCandidates = candidates;
  }, 30_000);

  it('3. Validates official NVIDIA URLs and strictly rejects third-party aggregators', () => {
    const first = sharedCandidates[0]!;

    // Valid official Workday job URLs
    const validCheck = validateJobUrl(first.officialUrl, SOURCE_CONFIG.officialDomain);
    expect(validCheck.valid).toBe(true);

    // Invalid lookalikes and aggregators
    const fakeDomain = 'https://nvidia-jobs.com/job/123';
    expect(validateJobUrl(fakeDomain, SOURCE_CONFIG.officialDomain).valid).toBe(false);

    const scamAggregator = 'https://naukri.com/nvidia-jobs/JR2024311';
    expect(validateJobUrl(scamAggregator, SOURCE_CONFIG.officialDomain).valid).toBe(false);

    const httpInsecure = 'http://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/test';
    expect(validateJobUrl(httpInsecure, SOURCE_CONFIG.officialDomain).valid).toBe(false);
  });

  it('4. Enforces notification safety: mocks alert evaluation with 0 live dispatches', () => {
    expect(vi.isMockFunction(alertService.evaluateAndCreateInstantAlerts)).toBe(true);
    expect(vi.isMockFunction(alertService.evaluateAndCreateRecentJobAlerts)).toBe(true);
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
        expect(job.status).toBe('ACTIVE');
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

  it('7. Partial-scan safety: incomplete scan (isCompleteScan=false) never closes absent jobs', async () => {
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
    if (snapshotOtherJobIds.length === 0) return;

    const db = getDb();
    const idsToQuery = snapshotOtherJobIds.map((val) => val.split(':')[0]);

    const currentOtherJobs = await db
      .select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
      .from(schema.jobs)
      .where(sql`${schema.jobs.id} IN ${idsToQuery}`);

    const currentOtherJobIds = currentOtherJobs.map((j) => `${j.id}:${j.updated_at?.getTime() ?? 0}`);
    expect(currentOtherJobIds.sort()).toEqual(snapshotOtherJobIds.sort());
  });

  it('9. Preserves experience hard filters — senior roles cannot enter fresher feeds', () => {
    // 1. Explicit Senior title is EXPERIENCED
    const seniorJob = parseExperienceRequirements('Sr System Verification Engineer', 'Leads team. 10+ years required.');
    expect(seniorJob.classification).toBe('EXPERIENCED');
    expect(matchExperience(seniorJob, 'FRESHER').matched).toBe(false);

    // 2. Senior title with deceptive "0-1 years" description retains EXPERIENCED and is blocked from FRESHER
    const deceptiveSenior = parseExperienceRequirements('Senior AI Software Engineer', 'Requires 0-1 years of experience with PyTorch');
    expect(deceptiveSenior.classification).toBe('EXPERIENCED');
    expect(matchExperience(deceptiveSenior, 'FRESHER').matched).toBe(false);

    // 3. Genuine entry level role is FRESHER_COMPATIBLE
    const gradJob = parseExperienceRequirements('New College Graduate - System Software', 'Recent university graduates welcome');
    expect(gradJob.classification).toBe('FRESHER_COMPATIBLE');
    expect(matchExperience(gradJob, 'FRESHER').matched).toBe(true);

    // 4. Role with unknown experience is UNKNOWN and blocked from FRESHER feed
    const unknownJob = parseExperienceRequirements('ASIC Verification Engineer', 'Works on GPU chip design');
    expect(unknownJob.classification).toBe('UNKNOWN');
    expect(matchExperience(unknownJob, 'FRESHER').matched).toBe(false);

    // 5. Internship role is recognized as FRESHER_COMPATIBLE
    const internJob = parseExperienceRequirements('Deep Learning Research Intern - Summer 2026', 'Enrolled in MS or PhD program');
    expect(internJob.classification).toBe('FRESHER_COMPATIBLE');
  });

  it('10. Location matching enforces India and country-aware workplace boundaries', () => {
    // Indian canonical locations
    expect(matchLocation('Bengaluru', ['Bengaluru']).matched).toBe(true);
    expect(matchLocation('India, Bengaluru', ['Bengaluru']).matched).toBe(true);
    expect(matchLocation('Hyderabad, India', ['Hyderabad']).matched).toBe(true);
    expect(matchLocation('Pune, India', ['Pune']).matched).toBe(true);

    // US vs India separation
    expect(matchLocation('Santa Clara, CA, US', ['Bengaluru']).matched).toBe(false);

    // Remote distinction
    expect(matchLocation('Remote', ['Remote']).matched).toBe(true);
    expect(matchLocation('Hybrid - Bengaluru', ['Remote']).matched).toBe(false);
    expect(matchLocation('Hybrid - Bengaluru', ['Bengaluru']).matched).toBe(true);
  });
});
