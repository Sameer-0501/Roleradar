/**
 * Adobe Workday Controlled Integration Test (Phase 20.5)
 *
 * REAL integration test against Adobe on Workday (adobe.wd5.myworkdayjobs.com).
 * Validates domain correction from legacy 'adobe.com' to 'adobe.wd5.myworkdayjobs.com'.
 * Uses bounded controlled discovery (pageSize: 5, maxPages: 1 -> max 5 postings).
 *
 * Enforces:
 *   1. Health check & endpoint connectivity
 *   2. Authoritative requisition ID extraction & identity stability
 *   3. Official URL format & domain validation (accepts Adobe Workday, rejects lookalikes/aggregators)
 *   4. Strict notification isolation (mocks alert service, zero real alerts/emails sent)
 *   5. Deterministic source isolation (unrelated jobs unaffected)
 *   6. Full pipeline run (persistence, verification checks, status update)
 *   7. Idempotent duplicate-scan handling (0 duplicates created)
 *   8. Partial scan safety (absent jobs not closed on partial scan)
 *   9. Clean teardown of test records without touching production data
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import 'dotenv/config';

// 1. Notification Safety: Strictly prevent any real email sends or orphan notification intents.
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
  officialDomain: 'adobe.wd5.myworkdayjobs.com',
  workdayConfig: {
    host: 'adobe.wd5.myworkdayjobs.com',
    tenant: 'adobe',
    clientSite: 'external_experienced',
  },
  sourceSystem: 'WORKDAY',
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let companyId: string;
let collector: WorkdayCollector;
let sharedCandidates: JobCandidate[] = [];
const insertedJobIds: string[] = [];

// Snapshot for isolation check
let snapshotOtherJobIds: string[] = [];

beforeAll(async () => {
  // 1. Seed sources to sync updated Adobe domain into the database
  const seedMap = await seedSources();
  companyId = seedMap.get('Adobe')!;

  if (!companyId) {
    const db = getDb();
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Adobe'))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      companyId = existing[0].id;
    }
  }

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run integration test without company ID');
  }

  // 2. Deterministic Source Isolation Snapshot:
  // Capture specific IDs of existing unrelated jobs to ensure zero cross-source mutation
  const db = getDb();
  const otherJobsRes = await db
    .select({ id: schema.jobs.id, status: schema.jobs.status, updated_at: schema.jobs.updated_at })
    .from(schema.jobs)
    .where(sql`${schema.jobs.company_id} != ${companyId}`)
    .limit(10);

  snapshotOtherJobIds = otherJobsRes.map((j) => `${j.id}:${j.updated_at?.getTime() ?? 0}`);

  collector = new WorkdayCollector({
    companyName: 'Adobe',
    host: 'adobe.wd5.myworkdayjobs.com',
    tenant: 'adobe',
    clientSite: 'external_experienced',
    officialDomain: 'adobe.wd5.myworkdayjobs.com',
    timeoutMs: 30_000,
    pageSize: 5, // Workday API limit per page
    maxPages: 1, // Only 1 page (5 jobs max total for bounded test)
  });
}, 60_000);

afterAll(async () => {
  if (insertedJobIds.length > 0) {
    const db = getDb();
    for (const id of insertedJobIds) {
      try {
        await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
      } catch {
        // Ignore cleanup errors
      }
    }
  }
  await closeConnection();
}, 15_000);

// ─── Integration Tests ────────────────────────────────────────────────────────

describe('Adobe Workday Controlled Integration', () => {
  it('health check reports the Adobe Workday source as healthy', async () => {
    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toContain('Workday CXS API reachable');
    expect(health.checkedAt).toBeInstanceOf(Date);
  }, 30_000);

  it('fetches controlled bounded real jobs from the live API (max 5)', async () => {
    sharedCandidates = await collector.discoverJobs();

    expect(sharedCandidates.length).toBeGreaterThan(0);
    expect(sharedCandidates.length).toBeLessThanOrEqual(5);

    for (const c of sharedCandidates) {
      expect(c.externalJobId).toBeTruthy();
      expect(c.title).toBeTruthy();
      expect(c.officialUrl).toMatch(/^https:\/\/adobe\.wd5\.myworkdayjobs\.com\/external_experienced\/job\//i);
      expect(c.officialUrl).not.toMatch(/linkedin|indeed|naukri/i);
      expect(c.sourceSystem).toBe('WORKDAY');
    }
  }, 30_000);

  it('proves domain validation accepts valid Adobe Workday URLs and rejects invalid/aggregator/lookalike URLs', () => {
    const first = sharedCandidates[0]!;

    // 1. Legitimate Adobe Workday job URL passes
    const validCheck = validateJobUrl(first.officialUrl, SOURCE_CONFIG.officialDomain);
    expect(validCheck.valid).toBe(true);

    // 2. Aggregators are strictly rejected
    const indeedCheck = validateJobUrl('https://www.indeed.com/viewjob?jk=1234567890abcdef', SOURCE_CONFIG.officialDomain);
    expect(indeedCheck.valid).toBe(false);

    const linkedinCheck = validateJobUrl('https://www.linkedin.com/jobs/view/9999999999', SOURCE_CONFIG.officialDomain);
    expect(linkedinCheck.valid).toBe(false);

    // 3. Lookalike / wrong domain URLs are strictly rejected
    const evilDomainCheck = validateJobUrl('https://adobe.wd5.eviljobs.com/external_experienced/job/San-Jose/Engineer_R172762', SOURCE_CONFIG.officialDomain);
    expect(evilDomainCheck.valid).toBe(false);

    const subDomainSpoofCheck = validateJobUrl('https://fakeadobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/Engineer_R172762', SOURCE_CONFIG.officialDomain);
    expect(subDomainSpoofCheck.valid).toBe(false);

    // 4. Legacy mismatched apex domain without Workday host is rejected by the corrected configuration
    const apexDomainCheck = validateJobUrl('https://adobe.com/careers/job/12345', SOURCE_CONFIG.officialDomain);
    expect(apexDomainCheck.valid).toBe(false);

    // 5. Generic career root without individual job identifier is rejected
    const rootCheck = validateJobUrl('https://adobe.wd5.myworkdayjobs.com/external_experienced', SOURCE_CONFIG.officialDomain);
    expect(rootCheck.valid).toBe(false);
  });

  it('verifies that no orphaned intent can be created due to strict mocking', () => {
    expect(vi.isMockFunction(alertService.evaluateAndCreateInstantAlerts)).toBe(true);
    expect(vi.isMockFunction(alertService.evaluateAndCreateRecentJobAlerts)).toBe(true);
  });

  it('persists a controlled bounded subset through the full pipeline and verifies them safely', async () => {
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

    // Verify verification log records exist and domain check passed
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

  it('enforces strict source isolation via deterministic evidence', async () => {
    if (snapshotOtherJobIds.length > 0) {
      const db = getDb();
      const idsToQuery = snapshotOtherJobIds.map((val) => val.split(':')[0]);

      const currentOtherJobs = await db
        .select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
        .from(schema.jobs)
        .where(sql`${schema.jobs.id} IN ${idsToQuery}`);

      const currentOtherJobIds = currentOtherJobs.map((j) => `${j.id}:${j.updated_at?.getTime() ?? 0}`);

      // Expect arrays to strictly match (meaning no IDs changed and their updated_at timestamps stayed exactly the same)
      expect(currentOtherJobIds.sort()).toEqual(snapshotOtherJobIds.sort());
    }
  });
});
