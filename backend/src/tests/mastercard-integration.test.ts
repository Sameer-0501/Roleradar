/**
 * Mastercard Workday Controlled Integration Test (Phase 20.5)
 *
 * REAL integration test against Mastercard on Workday (mastercard.wd1.myworkdayjobs.com).
 * Uses bounded controlled discovery (pageSize: 5, maxPages: 1 -> max 5 postings).
 * Enforces:
 *   1. Health check & endpoint connectivity
 *   2. Bounded controlled discovery with authoritative requisition ID extraction
 *   3. Official URL format & domain validation (accepts Mastercard, rejects aggregators/lookalikes)
 *   4. Strict notification isolation (mocks alert service, zero real alerts/emails sent)
 *   5. Full pipeline run (persistence, verification checks, status update)
 *   6. Idempotent duplicate-scan handling (0 duplicates created)
 *   7. Partial scan safety (absent jobs not closed on partial scan)
 *   8. Deterministic source isolation (unrelated jobs unaffected)
 *   9. Clean teardown of test records without touching production data
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  officialDomain: 'mastercard.wd1.myworkdayjobs.com',
  workdayConfig: {
    host: 'mastercard.wd1.myworkdayjobs.com',
    tenant: 'mastercard',
    clientSite: 'CorporateCareers',
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
  // Seed sources to register Mastercard in the database
  const seedMap = await seedSources();
  companyId = seedMap.get('Mastercard')!;

  if (!companyId) {
    const db = getDb();
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Mastercard'))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      companyId = existing[0].id;
    }
  }

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run Mastercard integration test without company ID');
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
    companyName: 'Mastercard',
    host: 'mastercard.wd1.myworkdayjobs.com',
    tenant: 'mastercard',
    clientSite: 'CorporateCareers',
    officialDomain: 'mastercard.wd1.myworkdayjobs.com',
    timeoutMs: 30_000,
    pageSize: 5,
    maxPages: 1, // Controlled bounded test: max 5 jobs
  });
}, 60_000);

afterAll(async () => {
  // Teardown only newly created test jobs
  if (insertedJobIds.length > 0) {
    const db = getDb();
    for (const id of insertedJobIds) {
      try {
        await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
      } catch {
        // Ignore individual deletion errors
      }
    }
  }
  await closeConnection();
}, 15_000);

// ─── Integration Tests ────────────────────────────────────────────────────────

describe('Mastercard Workday Controlled Integration', () => {
  it('health check confirms Mastercard Workday CXS API connectivity and returns healthy', async () => {
    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toContain('Workday CXS API reachable');
    expect(health.checkedAt).toBeInstanceOf(Date);
  }, 30_000);

  it('fetches controlled bounded real jobs from live API (max 5)', async () => {
    sharedCandidates = await collector.discoverJobs();

    expect(sharedCandidates.length).toBeGreaterThan(0);
    expect(sharedCandidates.length).toBeLessThanOrEqual(5);

    for (const c of sharedCandidates) {
      expect(c.externalJobId).toBeTruthy();
      expect(c.title).toBeTruthy();
      expect(c.officialUrl).toMatch(/^https:\/\/mastercard\.wd1\.myworkdayjobs\.com\/CorporateCareers\/job\//i);
      expect(c.sourceSystem).toBe('WORKDAY');
    }
  }, 30_000);

  it('validates canonical Workday career path and rejects aggregator/lookalike URLs', () => {
    const first = sharedCandidates[0]!;

    // Valid Mastercard URL passes
    const validCheck = validateJobUrl(first.officialUrl, SOURCE_CONFIG.officialDomain);
    expect(validCheck.valid).toBe(true);

    // Aggregator URLs are rejected
    const indeedCheck = validateJobUrl('https://www.indeed.com/viewjob?jk=1234567890abcdef', SOURCE_CONFIG.officialDomain);
    expect(indeedCheck.valid).toBe(false);

    const linkedinCheck = validateJobUrl('https://www.linkedin.com/jobs/view/9999999999', SOURCE_CONFIG.officialDomain);
    expect(linkedinCheck.valid).toBe(false);

    // Lookalike domain rejected
    const lookalike = validateJobUrl('https://fakemastercard.wd1.myworkdayjobs.com/CorporateCareers/job/fake/Fake_R-000001', SOURCE_CONFIG.officialDomain);
    expect(lookalike.valid).toBe(false);

    // Different employer Workday host rejected
    const otherEmployer = validateJobUrl('https://cisco.wd5.myworkdayjobs.com/Cisco_Careers/job/fake/Fake_123456', SOURCE_CONFIG.officialDomain);
    expect(otherEmployer.valid).toBe(false);

    // Generic root URL rejected
    const rootCheck = validateJobUrl('https://mastercard.wd1.myworkdayjobs.com/CorporateCareers', SOURCE_CONFIG.officialDomain);
    expect(rootCheck.valid).toBe(false);

    // Root domain rejected
    const rootDomain = validateJobUrl('https://mastercard.com/careers', SOURCE_CONFIG.officialDomain);
    expect(rootDomain.valid).toBe(false);
  });

  it('verifies that notification service is strictly mocked and zero real alerts are sent', () => {
    expect(vi.isMockFunction(alertService.evaluateAndCreateInstantAlerts)).toBe(true);
    expect(vi.isMockFunction(alertService.evaluateAndCreateRecentJobAlerts)).toBe(true);
  });

  it('persists bounded candidates through full pipeline and executes verification', async () => {
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

  it('running the pipeline a second time correctly deduplicates (0 duplicate records)', async () => {
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

    // Count must match exactly insertedJobIds.length — no duplicate rows
    expect(records.length).toBe(insertedJobIds.length);
  }, 90_000);

  it('partial scan does not close absent jobs', async () => {
    // Only pass 1 candidate in a partial scan (isCompleteScan: false)
    const partialCandidates = [sharedCandidates[0]!];
    const partialStats = await runPipeline(partialCandidates, companyId, SOURCE_CONFIG, false);

    expect(partialStats.closed).toBe(0);

    const db = getDb();
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

    // All previously inserted test jobs must remain intact (none closed)
    expect(remainingJobs.length).toBe(insertedJobIds.length);
    for (const r of remainingJobs) {
      expect(r.status).not.toBe('CLOSED');
    }
  }, 90_000);

  it('enforces strict source isolation — unrelated company jobs remain unmodified', async () => {
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
});
