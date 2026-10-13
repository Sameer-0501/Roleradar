/**
 * Custom Integration Test
 *
 * REAL integration test against CERN on Custom Career Platform (SmartRecruiters) — no mocks.
 *
 * This test:
 *   1. Contacts the live CERN API (api.smartrecruiters.com/v1/companies/cern/postings)
 *   2. Confirms real job postings are returned
 *   3. Normalizes a real job
 *   4. Verifies it against the live per-job API (api.smartrecruiters.com/v1/companies/cern/postings/{id})
 *   5. Persists it to the real PostgreSQL database
 *   6. Runs the pipeline a second time to prove deduplication (0 duplicate records)
 *   7. Validates that the official job URL is reachable and returns HTTP 200
 *   8. Cleans up all inserted test records
 *
 * Requirements:
 *   - Live database (DATABASE_URL env var)
 *   - Internet access to api.smartrecruiters.com and jobs.smartrecruiters.com
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and } from 'drizzle-orm';
import { CustomCollector } from '../collectors/custom/custom-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';
import { sourceHealthTracker } from '../health/source-health.js';
import type { JobCandidate } from '../collectors/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  officialDomain: 'jobs.smartrecruiters.com',
  customConfig: {
    perJobApiEndpointTemplate: 'https://api.smartrecruiters.com/v1/companies/cern/postings/{id}',
  },
  sourceSystem: 'CUSTOM',
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let companyId: string;
let collector: CustomCollector;
let sharedCandidates: JobCandidate[] = [];
let insertedJobIds: string[] = [];

beforeAll(async () => {
  const seedMap = await seedSources();
  companyId = seedMap.get('CERN')!;

  if (!companyId) {
    const db = getDb();
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'CERN'))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      companyId = existing[0].id;
    }
  }

  if (!companyId) {
    throw new Error('Source seeding failed — cannot run integration test without company ID');
  }

  collector = new CustomCollector({
    companyName: 'CERN',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.cern/',
    apiEndpoint: 'https://api.smartrecruiters.com/v1/companies/cern/postings',
    perJobApiEndpointTemplate: 'https://api.smartrecruiters.com/v1/companies/cern/postings/{id}',
    paginationConfig: {
      strategy: 'offset_limit',
      pageSize: 20,
      maxPages: 1, // 1 page is plenty for integration test
    },
    fieldMappings: {
      jobsPath: 'content',
      idField: 'id',
      titleField: 'name',
      cityField: 'location.city',
      countryField: 'location.country',
      urlTemplate: 'https://jobs.smartrecruiters.com/cern/{id}',
      applyUrlField: 'applyUrl',
      postedAtField: 'releasedDate',
    },
    timeoutMs: 30_000,
  });

  // Fetch once for the entire test suite
  sharedCandidates = await collector.discoverJobs();
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

describe('Custom Integration — CERN real source', () => {
  it('fetches real jobs from the live CERN custom API', () => {
    expect(sharedCandidates.length).toBeGreaterThan(0);

    const first = sharedCandidates[0]!;
    expect(first.externalJobId).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.officialUrl).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\/cern\//i);
    expect(first.sourceSystem).toBe('CUSTOM');
  });

  it('health check reports the custom CERN source as healthy', async () => {
    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toMatch(/reachable/i);

    // Record in source health tracker and verify
    sourceHealthTracker.recordHealthCheck({
      company: 'CERN',
      source: 'CUSTOM',
      healthy: health.healthy,
      message: health.message,
    });
    expect(sourceHealthTracker.get('CERN', 'CUSTOM')?.status).toBe('HEALTHY');
  }, 30_000);

  it('persists a real CERN job through the full pipeline and verifies it', async () => {
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
          eq(schema.jobs.source_system, 'CUSTOM'),
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

  it('running the pipeline a second time does NOT create a duplicate CERN job', async () => {
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
          eq(schema.jobs.source_system, 'CUSTOM'),
          eq(schema.jobs.external_job_id, testCandidates[0]!.externalJobId)
        )
      );

    expect(records.length).toBe(1);
    if (!insertedJobIds.includes(records[0]!.id)) {
      insertedJobIds.push(records[0]!.id);
    }
  }, 60_000);

  it('the official CERN job URL is reachable and returns HTTP 200', async () => {
    const first = sharedCandidates[0]!;

    const response = await fetch(first.officialUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    expect(response.status).toBe(200);
  }, 30_000);
});
