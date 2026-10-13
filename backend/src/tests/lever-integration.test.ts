/**
 * Lever Integration Test
 *
 * REAL integration test against Palantir on Lever — no mocks.
 *
 * This test:
 *   1. Contacts the live Lever API for Palantir (api.lever.co/v0/postings/palantir?mode=json)
 *   2. Confirms real job postings are returned
 *   3. Normalizes a real job
 *   4. Verifies it against the live Lever per-job API (api.lever.co/v0/postings/palantir/{id})
 *   5. Persists it to the real PostgreSQL database
 *   6. Runs the pipeline a second time to prove deduplication (0 duplicate records)
 *   7. Cleans up all inserted test records
 *
 * Requirements:
 *   - Live database (DATABASE_URL env var)
 *   - Internet access to api.lever.co and jobs.lever.co
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and } from 'drizzle-orm';
import { LeverCollector } from '../collectors/ats/lever-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';
import { sourceHealthTracker } from '../health/source-health.js';
import type { JobCandidate } from '../collectors/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  officialDomain: 'jobs.lever.co',
  siteToken: 'palantir',
  sourceSystem: 'LEVER',
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let companyId: string;
let collector: LeverCollector;
let sharedCandidates: JobCandidate[] = [];
let insertedJobIds: string[] = [];

beforeAll(async () => {
  const seedMap = await seedSources();
  companyId = seedMap.get('Palantir')!;

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run integration test without company ID');
  }

  collector = new LeverCollector({
    siteToken: 'palantir',
    companyName: 'Palantir',
    officialDomain: 'jobs.lever.co',
    timeoutMs: 30_000,
  });

  // Fetch once for the entire suite to avoid repeated large network payload fetches
  sharedCandidates = await collector.discoverJobs();
}, 180_000);

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

describe('Lever Integration — Palantir real source', () => {
  it('fetches real jobs from the live Lever postings API', () => {
    expect(sharedCandidates.length).toBeGreaterThan(0);

    const first = sharedCandidates[0]!;
    expect(first.externalJobId).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.officialUrl).toMatch(/^https:\/\/jobs\.lever\.co\/palantir\/[0-9a-f-]+/i);
    expect(first.sourceSystem).toBe('LEVER');
  });

  it('health check reports the Lever source as healthy', async () => {
    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toMatch(/reachable/i);

    // Record in source health tracker and verify
    sourceHealthTracker.recordHealthCheck({
      company: 'Palantir',
      source: 'LEVER',
      healthy: health.healthy,
      message: health.message,
    });
    expect(sourceHealthTracker.get('Palantir', 'LEVER')?.status).toBe('HEALTHY');
  }, 30_000);

  it('persists a real Lever job through the full pipeline and verifies it', async () => {
    expect(sharedCandidates.length).toBeGreaterThan(0);

    const testCandidates = [sharedCandidates[0]!];
    const stats = await runPipeline(testCandidates, companyId, SOURCE_CONFIG);

    expect(stats.total).toBe(1);
    expect(stats.skipped).toBe(0);

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
          eq(schema.jobs.source_system, 'LEVER'),
          eq(schema.jobs.external_job_id, testCandidates[0]!.externalJobId)
        )
      )
      .limit(1);

    expect(inserted.length).toBe(1);
    insertedJobIds.push(inserted[0]!.id);

    const verifications = await db
      .select()
      .from(schema.jobVerifications)
      .where(eq(schema.jobVerifications.job_id, inserted[0]!.id));

    expect(verifications.length).toBeGreaterThan(0);
    expect(verifications[0]!.domain_check).toBe(true);

    if (inserted[0]!.verification_status === 'VERIFIED') {
      expect(inserted[0]!.status).toBe('ACTIVE');
      expect(verifications[0]!.job_exists_check).toBe(true);
      expect(verifications[0]!.job_id_check).toBe(true);
      expect(verifications[0]!.title_check).toBe(true);
      expect(verifications[0]!.status_check).toBe(true);
    }
  }, 60_000);

  it('running the pipeline a second time does NOT create a duplicate Lever job', async () => {
    const testCandidates = [sharedCandidates[0]!];

    // Second run with the same candidate
    await runPipeline(testCandidates, companyId, SOURCE_CONFIG);

    const db = getDb();
    const records = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'LEVER'),
          eq(schema.jobs.external_job_id, testCandidates[0]!.externalJobId)
        )
      );

    expect(records.length).toBe(1);
    if (!insertedJobIds.includes(records[0]!.id)) {
      insertedJobIds.push(records[0]!.id);
    }
  }, 60_000);

  it('the official Lever job URL is reachable and returns HTTP 200', async () => {
    const first = sharedCandidates[0]!;

    const response = await fetch(first.officialUrl, {
      headers: { 'User-Agent': 'RoleRadar-JobEngine/2.0 (integration-test)' },
    });

    expect(response.status).toBe(200);
  }, 30_000);
});
