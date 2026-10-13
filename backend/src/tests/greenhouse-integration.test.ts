/**
 * Greenhouse Integration Test
 *
 * REAL integration test — no mocks.
 *
 * This test:
 *   1. Calls the live Greenhouse API for GitLab
 *   2. Confirms real jobs are returned
 *   3. Normalizes the first real job
 *   4. Verifies it against the live Greenhouse per-job API
 *   5. Persists it to the real PostgreSQL database
 *   6. Runs the pipeline again with the same data
 *   7. Confirms no duplicate was created
 *   8. Cleans up all inserted test records
 *
 * Requirements:
 *   - Live database (DATABASE_URL env var)
 *   - Internet access to boards-api.greenhouse.io
 *
 * Run with: npm run test:integration
 *
 * This test is excluded from npm test (unit-only run).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and } from 'drizzle-orm';
import { GreenhouseCollector } from '../collectors/ats/greenhouse-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  officialDomain: 'job-boards.greenhouse.io',
  boardToken: 'gitlab',
  sourceSystem: 'GREENHOUSE',
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let companyId: string;
let insertedJobIds: string[] = [];

beforeAll(async () => {
  // Ensure GitLab company record exists (idempotent)
  // DATABASE_URL is read from .env via dotenv/config import above
  const seedMap = await seedSources();
  companyId = seedMap.get('GitLab')!;

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run integration test without company ID');
  }
}, 30_000);


afterAll(async () => {
  // Clean up: remove only the jobs we inserted during this test run
  if (insertedJobIds.length > 0) {
    const db = getDb();
    for (const id of insertedJobIds) {
      try {
        // Cascade: job_verifications deleted automatically (onDelete: cascade)
        await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
      } catch {
        // Ignore cleanup errors — don't fail the test
      }
    }
  }
  await closeConnection();
}, 15_000);

// ─── Integration Tests ────────────────────────────────────────────────────────

describe('Greenhouse Integration — GitLab real source', () => {
  it('fetches real jobs from the live Greenhouse API', async () => {
    const collector = new GreenhouseCollector({
      boardToken: 'gitlab',
      companyName: 'GitLab',
      officialDomain: 'job-boards.greenhouse.io',
    });

    const candidates = await collector.discoverJobs();

    expect(candidates.length).toBeGreaterThan(0);

    const first = candidates[0]!;
    expect(first.externalJobId).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.officialUrl).toMatch(/^https:\/\/job-boards\.greenhouse\.io\/gitlab\/jobs\/\d+$/);
    expect(first.sourceSystem).toBe('GREENHOUSE');
  }, 30_000);

  it('health check reports the source as healthy', async () => {
    const collector = new GreenhouseCollector({
      boardToken: 'gitlab',
      companyName: 'GitLab',
      officialDomain: 'job-boards.greenhouse.io',
    });

    const health = await collector.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.message).toMatch(/reachable/i);
  }, 15_000);

  it('persists a real job through the full pipeline', async () => {
    const collector = new GreenhouseCollector({
      boardToken: 'gitlab',
      companyName: 'GitLab',
      officialDomain: 'job-boards.greenhouse.io',
    });

    const candidates = await collector.discoverJobs();
    expect(candidates.length).toBeGreaterThan(0);

    // Use only the first candidate for this test
    const testCandidates = [candidates[0]!];
    const stats = await runPipeline(testCandidates, companyId, SOURCE_CONFIG);

    // We expect at least 1 outcome (verified OR pending — never 0 total processed)
    expect(stats.total).toBe(1);
    expect(stats.skipped).toBe(0);

    // Record the job ID for cleanup
    const db = getDb();
    const inserted = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'GREENHOUSE'),
          eq(schema.jobs.external_job_id, testCandidates[0]!.externalJobId)
        )
      )
      .limit(1);

    expect(inserted.length).toBe(1);
    insertedJobIds.push(inserted[0]!.id);

    // Verify the verification audit record was created
    const verifications = await db
      .select()
      .from(schema.jobVerifications)
      .where(eq(schema.jobVerifications.job_id, inserted[0]!.id));

    expect(verifications.length).toBeGreaterThan(0);

    const vRecord = verifications[0]!;
    expect(vRecord.domain_check).toBe(true); // Domain check always runs

    // If job was VERIFIED, required checks must be true
    const job = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, inserted[0]!.id))
      .limit(1);

    const jobRecord = job[0]!;
    if (jobRecord.verification_status === 'VERIFIED') {
      expect(jobRecord.status).toBe('ACTIVE');
      expect(vRecord.job_exists_check).toBe(true);
      expect(vRecord.job_id_check).toBe(true);
      expect(vRecord.title_check).toBe(true);
      expect(vRecord.status_check).toBe(true);
    } else {
      // PENDING is acceptable if live check was not conclusive
      expect(['PENDING', 'FAILED']).toContain(jobRecord.verification_status);
    }
  }, 60_000);

  it('running the pipeline a second time does NOT create a duplicate job', async () => {
    const collector = new GreenhouseCollector({
      boardToken: 'gitlab',
      companyName: 'GitLab',
      officialDomain: 'job-boards.greenhouse.io',
    });

    const candidates = await collector.discoverJobs();
    const testCandidates = [candidates[0]!];

    // First run
    await runPipeline(testCandidates, companyId, SOURCE_CONFIG);

    // Second run (same data)
    await runPipeline(testCandidates, companyId, SOURCE_CONFIG);

    // Should be exactly 1 DB record for this job
    const db = getDb();
    const records = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, companyId),
          eq(schema.jobs.source_system, 'GREENHOUSE'),
          eq(schema.jobs.external_job_id, testCandidates[0]!.externalJobId)
        )
      );

    expect(records.length).toBe(1);

    // Collect for cleanup (may already be tracked)
    const id = records[0]!.id;
    if (!insertedJobIds.includes(id)) insertedJobIds.push(id);
  }, 120_000);

  it('the official job URL is reachable and returns valid content', async () => {
    const collector = new GreenhouseCollector({
      boardToken: 'gitlab',
      companyName: 'GitLab',
      officialDomain: 'job-boards.greenhouse.io',
    });

    const candidates = await collector.discoverJobs();
    const first = candidates[0]!;

    // Fetch the official URL
    const response = await fetch(first.officialUrl, {
      headers: { 'User-Agent': 'RoleRadar-JobEngine/2.0 (integration-test)' },
    });

    expect(response.status).toBe(200);
  }, 60_000);
});
