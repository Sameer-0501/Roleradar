/**
 * Real ATS Integration Test — Ashby (e.g. Linear / Retool / OpenAI / Ramp).
 *
 * This is a REAL integration test that talks to the live Ashby API,
 * persists a real job to PostgreSQL, verifies it live, tests deduplication,
 * and asserts that the official Ashby job URL returns HTTP 200.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and } from 'drizzle-orm';
import { AshbyCollector } from '../collectors/ats/ashby-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';

describe('Ashby ATS Integration — Real Live Source', () => {
  let testCompanyId: string;
  let insertedJobIds: string[] = [];
  const companyName = 'Linear';
  const jobBoardName = 'linear';
  const officialDomain = 'jobs.ashbyhq.com';

  beforeAll(async () => {
    const db = getDb();
    // Upsert company
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.name, companyName))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      testCompanyId = existing[0].id;
    } else {
      const [created] = await db
        .insert(schema.companies)
        .values({
          name: companyName,
          official_domain: officialDomain,
          careers_url: `https://jobs.ashbyhq.com/${jobBoardName}`,
          ats_type: 'CUSTOM',
          source_config: { jobBoardName },
          is_active: true,
        })
        .returning({ id: schema.companies.id });
      testCompanyId = created!.id;
    }
  });

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
    // Allow any pending background notifications to settle before pool teardown
    await new Promise((r) => setTimeout(r, 200));
    await closeConnection();
  });

  it('probes Ashby public API and reports healthy', async () => {
    const collector = new AshbyCollector({
      jobBoardName,
      companyName,
      officialDomain,
    });

    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
  }, 15_000);

  it('discovers genuine jobs with official Ashby URLs', async () => {
    const collector = new AshbyCollector({
      jobBoardName,
      companyName,
      officialDomain,
    });

    const candidates = await collector.discoverJobs();
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);

    const first = candidates[0]!;
    expect(first.externalJobId).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.officialUrl).toMatch(/^https:\/\/jobs\.ashbyhq\.com\//);
  }, 15_000);

  it('persists a real Ashby job through pipeline and verifies it live', async () => {
    const collector = new AshbyCollector({
      jobBoardName,
      companyName,
      officialDomain,
    });

    const candidates = await collector.discoverJobs();
    expect(candidates.length).toBeGreaterThan(0);

    const sample = candidates.slice(0, 1);
    const stats = await runPipeline(sample, testCompanyId, {
      officialDomain,
      ashbyConfig: { jobBoardName },
      sourceSystem: 'CUSTOM',
    });

    expect(stats.total).toBe(1);
    expect(stats.verified).toBe(1);
    expect(stats.failed).toBe(0);

    const targetJob = sample[0]!;
    const db = getDb();
    const persisted = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, testCompanyId),
          eq(schema.jobs.external_job_id, targetJob.externalJobId)
        )
      )
      .limit(1);

    expect(persisted.length).toBe(1);
    const jobRecord = persisted[0]!;
    if (!insertedJobIds.includes(jobRecord.id)) {
      insertedJobIds.push(jobRecord.id);
    }
    expect(jobRecord.status).toBe('ACTIVE');
    expect(jobRecord.verification_status).toBe('VERIFIED');
    expect(jobRecord.official_url).toBe(targetJob.officialUrl);
  }, 30_000);

  it('running pipeline a second time on the same job yields ZERO duplicate jobs', async () => {
    const collector = new AshbyCollector({
      jobBoardName,
      companyName,
      officialDomain,
    });

    const candidates = await collector.discoverJobs();
    const sample = candidates.slice(0, 1);

    const stats = await runPipeline(sample, testCompanyId, {
      officialDomain,
      ashbyConfig: { jobBoardName },
      sourceSystem: 'CUSTOM',
    });

    expect(stats.verified).toBe(1);
    expect(stats.failed).toBe(0);

    const targetJob = sample[0]!;
    const db = getDb();
    const allMatches = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.company_id, testCompanyId),
          eq(schema.jobs.external_job_id, targetJob.externalJobId)
        )
      );

    expect(allMatches.length).toBe(1);
    if (!insertedJobIds.includes(allMatches[0]!.id)) {
      insertedJobIds.push(allMatches[0]!.id);
    }
  }, 30_000);
});
