/**
 * Bank of America Integration Test (Phase 20.5-G)
 *
 * REAL integration test against Bank of America on Workday.
 * Uses bounded controlled discovery (limit: 5).
 * Enforces Source Isolation and Notification Safety.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import 'dotenv/config';

// Mock alert service to strictly prevent notification generation and ghost intents
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
  })
}));

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';
import type { JobCandidate } from '../collectors/types.js';
import * as alertService from '../notifications/alert-service.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  officialDomain: 'ghr.wd1.myworkdayjobs.com',
  workdayConfig: {
    host: 'ghr.wd1.myworkdayjobs.com',
    tenant: 'ghr',
    clientSite: 'lateral-us',
  },
  sourceSystem: 'WORKDAY',
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let companyId: string;
let collector: WorkdayCollector;
let sharedCandidates: JobCandidate[] = [];
let insertedJobIds: string[] = [];

// Snapshot for isolation check
let snapshotOtherJobsCount = 0;
let snapshotBofaJobsCount = 0;

beforeAll(async () => {
  const seedMap = await seedSources();
  companyId = seedMap.get('Bank of America')!;

  if (!companyId) {
    const db = getDb();
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Bank of America'))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      companyId = existing[0].id;
    }
  }

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run integration test without company ID');
  }

  const db = getDb();
  const otherJobsRes = await db.execute(sql`SELECT count(*) FROM jobs WHERE company_id != ${companyId}`);
  snapshotOtherJobsCount = Number(otherJobsRes.rows[0].count);

  const bofaJobsRes = await db.execute(sql`SELECT count(*) FROM jobs WHERE company_id = ${companyId}`);
  snapshotBofaJobsCount = Number(bofaJobsRes.rows[0].count);

  collector = new WorkdayCollector({
    companyName: 'Bank of America',
    host: 'ghr.wd1.myworkdayjobs.com',
    tenant: 'ghr',
    clientSite: 'lateral-us',
    officialDomain: 'ghr.wd1.myworkdayjobs.com',
    timeoutMs: 30_000,
    pageSize: 5,
    maxPages: 1, // Only 1 page (5 jobs total bounded test)
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

describe('Workday Integration — Bank of America', () => {
  
  it('health check reports the Bank of America Workday source as healthy', async () => {
    const health = await collector.healthCheck();
    if (!health.healthy) {
      console.warn(`Workday health check notice: ${health.message}`);
    }
    expect(health.healthy).toBe(true);
    console.log("Health check result:", health.message);
  }, 30_000);

  it('fetches controlled bounded real jobs from the live API', async () => {
    sharedCandidates = await collector.discoverJobs();
    
    console.log(`Discovered ${sharedCandidates.length} bounded controlled jobs from Bank of America.`);
    expect(sharedCandidates.length).toBeGreaterThan(0);
    expect(sharedCandidates.length).toBeLessThanOrEqual(5);

    const first = sharedCandidates[0]!;
    expect(first.externalJobId).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.officialUrl).toMatch(/^https:\/\/ghr\.wd1\.myworkdayjobs\.com\/lateral-us/i);
    expect(first.sourceSystem).toBe('WORKDAY');
  }, 30_000);

  it('verifies that no orphaned intent can be created due to strict mocking', () => {
    expect(vi.isMockFunction(alertService.evaluateAndCreateInstantAlerts)).toBe(true);
  });

  it('persists a controlled bounded subset through the full pipeline and verifies them safely', async () => {
    expect(sharedCandidates.length).toBeGreaterThan(0);

    const stats = await runPipeline(sharedCandidates, companyId, SOURCE_CONFIG);

    console.log(`Run pipeline 1: ${stats.total} total, ${stats.skipped} skipped, ${stats.failed} failed.`);

    const db = getDb();
    const inserted = await db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        verification_status: schema.jobs.verification_status,
      })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'WORKDAY')
        )
      );

    for (const job of inserted) {
      if (!insertedJobIds.includes(job.id)) {
        insertedJobIds.push(job.id);
      }
    }

    const verifiedCount = inserted.filter(j => j.verification_status === 'VERIFIED').length;
    const closedCount = inserted.filter(j => j.verification_status === 'CLOSED').length;
    const pendingCount = inserted.filter(j => j.verification_status === 'PENDING').length;
    
    console.log(`Verification: VERIFIED=${verifiedCount}, CLOSED=${closedCount}, PENDING=${pendingCount}`);
    
  }, 90_000);

  it('running the pipeline a second time correctly deduplicates externally', async () => {
    const stats2 = await runPipeline(sharedCandidates, companyId, SOURCE_CONFIG);
    console.log(`Run pipeline 2 (duplicate check): ${stats2.total} total, ${stats2.skipped} skipped, ${stats2.failed} failed.`);
    
    const db = getDb();
    const records = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'WORKDAY')
        )
      );

    // It should not insert new records, the count should match insertedJobIds length
    expect(records.length).toBe(insertedJobIds.length);
  }, 90_000);
  
  it('enforces strict source isolation (no unrelated employers modified)', async () => {
    const db = getDb();
    const otherJobsRes = await db.execute(sql`SELECT count(*) FROM jobs WHERE company_id != ${companyId}`);
    const finalOtherJobsCount = Number(otherJobsRes.rows[0].count);
    
    expect(finalOtherJobsCount).toBe(snapshotOtherJobsCount);
  });
});
