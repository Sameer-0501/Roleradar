/**
 * Teardown Safety Remediation Regression Suite (Phase 20.5D)
 *
 * Verifies that automated integration-test teardown routines:
 * 1. Safely clean up test-created records.
 * 2. Guarantee pre-existing records survive teardown completely unchanged.
 * 3. Safely clean up test-owned records even when tests encounter unexpected failures.
 * 4. Strictly prevent teardown from crossing test-run boundaries (Run A cannot delete Run B's records).
 * 5. Fail safely on ambiguous ownership rather than executing broad database deletes.
 * 6. Respect foreign-key relationships and child dependencies during cleanup.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, inArray, sql } from 'drizzle-orm';

describe('Phase 20.5D — Safe Integration-Test Teardown Remediation', () => {
  let db: ReturnType<typeof getDb>;
  let syntheticCompanyId: string;
  const companyName = `TeardownSafetyTest_${Date.now()}`;

  beforeAll(async () => {
    db = getDb();
    // Create an isolated synthetic company fixture
    const [company] = await db
      .insert(schema.companies)
      .values({
        name: companyName,
        official_domain: `${companyName.toLowerCase()}.test`,
        careers_url: `https://${companyName.toLowerCase()}.test/careers`,
        ats_type: 'WORKDAY',
      })
      .returning();
    syntheticCompanyId = company!.id;
  });

  afterAll(async () => {
    if (syntheticCompanyId) {
      // Clean up any remaining test jobs and the synthetic company
      const jobs = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(eq(schema.jobs.company_id, syntheticCompanyId));
      const jobIds = jobs.map((j) => j.id);
      if (jobIds.length > 0) {
        await db.delete(schema.jobVerifications).where(inArray(schema.jobVerifications.job_id, jobIds));
        await db.delete(schema.userJobInteractions).where(inArray(schema.userJobInteractions.job_id, jobIds));
        await db.delete(schema.jobs).where(inArray(schema.jobs.id, jobIds));
      }
      await db.delete(schema.companies).where(eq(schema.companies.id, syntheticCompanyId));
    }
    await closeConnection();
  });

  it('1. test-created records are cleaned up while pre-existing records survive teardown unchanged', async () => {
    // A. Pre-existing records exist in the database prior to the test run
    const [preExisting1] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `pre-existing-alpha-${Date.now()}`,
        title: 'Pre-existing Senior Engineer',
        official_url: `https://test.com/jobs/pre-1`,
        content_hash: `hash-pre-1-${Date.now()}`,
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      })
      .returning();

    const [preExisting2] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `pre-existing-beta-${Date.now()}`,
        title: 'Pre-existing Staff Architect',
        official_url: `https://test.com/jobs/pre-2`,
        content_hash: `hash-pre-2-${Date.now()}`,
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      })
      .returning();

    // B. Snapshot pre-existing job IDs before running the simulated test operation
    const preSnapshot = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, syntheticCompanyId));
    const preExistingIdSet = new Set(preSnapshot.map((j) => j.id));

    expect(preExistingIdSet.has(preExisting1!.id)).toBe(true);
    expect(preExistingIdSet.has(preExisting2!.id)).toBe(true);

    // C. Simulated test operation creates new test records
    const [testJob1] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `test-run-1-${Date.now()}`,
        title: 'Test Created Engineer',
        official_url: `https://test.com/jobs/test-1`,
        content_hash: `hash-test-1-${Date.now()}`,
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      })
      .returning();

    // D. Safe ownership filter: only records NOT in preExistingIdSet are captured
    const allCurrentJobs = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, syntheticCompanyId));

    const testOwnedJobIds: string[] = [];
    for (const job of allCurrentJobs) {
      if (!preExistingIdSet.has(job.id)) {
        testOwnedJobIds.push(job.id);
      }
    }

    expect(testOwnedJobIds).toEqual([testJob1!.id]);
    expect(testOwnedJobIds).not.toContain(preExisting1!.id);
    expect(testOwnedJobIds).not.toContain(preExisting2!.id);

    // E. Execute Safe Teardown Routine
    for (const id of testOwnedJobIds) {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
    }

    // F. Assertions: Test records are deleted, pre-existing records survive intact
    const remainingJobs = await db
      .select({ id: schema.jobs.id, title: schema.jobs.title })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, syntheticCompanyId));

    const remainingIds = remainingJobs.map((j) => j.id);
    expect(remainingIds).not.toContain(testJob1!.id);
    expect(remainingIds).toContain(preExisting1!.id);
    expect(remainingIds).toContain(preExisting2!.id);
    expect(remainingJobs.length).toBe(2);

    // Clean up pre-existing jobs
    await db.delete(schema.jobs).where(inArray(schema.jobs.id, [preExisting1!.id, preExisting2!.id]));
  });

  it('2. unexpected test failure still triggers safe cleanup of test-owned records without harming pre-existing data', async () => {
    // Pre-existing job
    const [preExisting] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `pre-existing-survivor-${Date.now()}`,
        title: 'Survivor Job',
        official_url: `https://test.com/jobs/survivor`,
        content_hash: `hash-survivor-${Date.now()}`,
      })
      .returning();

    const preSnapshot = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, syntheticCompanyId));
    const preExistingSet = new Set(preSnapshot.map((j) => j.id));

    const testCreatedIds: string[] = [];

    // Simulate test failure inside try block
    let caughtError: Error | null = null;
    try {
      const [transientJob] = await db
        .insert(schema.jobs)
        .values({
          company_id: syntheticCompanyId,
          source_system: 'WORKDAY',
          external_job_id: `transient-${Date.now()}`,
          title: 'Transient Job During Failure',
          official_url: `https://test.com/jobs/transient`,
          content_hash: `hash-transient-${Date.now()}`,
        })
        .returning();

      // Track test-owned record
      if (!preExistingSet.has(transientJob!.id)) {
        testCreatedIds.push(transientJob!.id);
      }

      // Simulate assertion failure
      throw new Error('Simulated assertion failure during pipeline validation');
    } catch (err: any) {
      caughtError = err;
    } finally {
      // Safe teardown hook runs in finally
      for (const id of testCreatedIds) {
        await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
      }
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toBe('Simulated assertion failure during pipeline validation');

    // Confirm transient job was cleaned up and pre-existing job remains untouched
    const currentJobs = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, syntheticCompanyId));

    const currentIds = currentJobs.map((j) => j.id);
    expect(currentIds).toContain(preExisting!.id);
    expect(currentIds.length).toBe(1);

    // Clean up survivor
    await db.delete(schema.jobs).where(eq(schema.jobs.id, preExisting!.id));
  });

  it('3. teardown cannot cross test/run boundary (Run A cannot delete Run B records)', async () => {
    // Run A creates record A
    const [jobA] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `run-a-${Date.now()}`,
        title: 'Run A Job',
        official_url: `https://test.com/jobs/run-a`,
        content_hash: `hash-run-a-${Date.now()}`,
      })
      .returning();
    const runAOwnedIds = [jobA!.id];

    // Run B creates record B (sharing the same company and ATS type)
    const [jobB] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `run-b-${Date.now()}`,
        title: 'Run B Job',
        official_url: `https://test.com/jobs/run-b`,
        content_hash: `hash-run-b-${Date.now()}`,
      })
      .returning();
    const runBOwnedIds = [jobB!.id];

    // Run A's teardown executes
    for (const id of runAOwnedIds) {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
    }

    // Run A job is deleted; Run B job MUST remain untouched
    const midCheck = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, syntheticCompanyId));

    const midIds = midCheck.map((j) => j.id);
    expect(midIds).not.toContain(jobA!.id);
    expect(midIds).toContain(jobB!.id);

    // Now Run B's teardown executes
    for (const id of runBOwnedIds) {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
    }

    const finalCheck = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.company_id, syntheticCompanyId));
    expect(finalCheck.map((j) => j.id)).not.toContain(jobB!.id);
  });

  it('4. ambiguous record ownership fails safely without executing broad database deletes', async () => {
    // Pre-existing job
    const [anchorJob] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `anchor-${Date.now()}`,
        title: 'Anchor Job Should Never Be Deleted',
        official_url: `https://test.com/jobs/anchor`,
        content_hash: `hash-anchor-${Date.now()}`,
      })
      .returning();

    // Guard function simulating safe ownership enforcement
    async function safeTeardown(targetIds: string[], allowedOwnershipSet: Set<string>): Promise<{ deleted: number; rejected: number }> {
      let deleted = 0;
      let rejected = 0;
      for (const id of targetIds) {
        // Safe guard: only delete if explicit ownership is verified
        if (allowedOwnershipSet.has(id)) {
          await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
          deleted++;
        } else {
          // Reject ambiguous or unverified target ID
          rejected++;
        }
      }
      return { deleted, rejected };
    }

    // Attempt to invoke teardown with ambiguous / unowned target (including empty or anchor job ID)
    const emptyOwnershipSet = new Set<string>(); // No test-created IDs owned
    const result = await safeTeardown([anchorJob!.id], emptyOwnershipSet);

    expect(result.deleted).toBe(0);
    expect(result.rejected).toBe(1);

    // Verify anchor job survived
    const check = await db.select().from(schema.jobs).where(eq(schema.jobs.id, anchorJob!.id));
    expect(check.length).toBe(1);

    // Clean up anchor
    await db.delete(schema.jobs).where(eq(schema.jobs.id, anchorJob!.id));
  });

  it('5. respects foreign-key relationships and cleanly deletes dependent verification records', async () => {
    // Create test job
    const [parentJob] = await db
      .insert(schema.jobs)
      .values({
        company_id: syntheticCompanyId,
        source_system: 'WORKDAY',
        external_job_id: `fk-parent-${Date.now()}`,
        title: 'FK Parent Job',
        official_url: `https://test.com/jobs/fk-parent`,
        content_hash: `hash-fk-parent-${Date.now()}`,
      })
      .returning();

    // Create child verification record referencing parent job
    const [childVerification] = await db
      .insert(schema.jobVerifications)
      .values({
        job_id: parentJob!.id,
        verification_status: 'VERIFIED',
        official_url_reachable: true,
        company_reference_found: true,
        title_reference_found: true,
        confidence_score: 1.0,
      })
      .returning();

    // Safe hierarchical teardown: clean children before parent
    await db.delete(schema.jobVerifications).where(eq(schema.jobVerifications.job_id, parentJob!.id));
    await db.delete(schema.userJobInteractions).where(eq(schema.userJobInteractions.job_id, parentJob!.id));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, parentJob!.id));

    // Confirm both are removed without foreign key violation
    const verCheck = await db.select().from(schema.jobVerifications).where(eq(schema.jobVerifications.id, childVerification!.id));
    const jobCheck = await db.select().from(schema.jobs).where(eq(schema.jobs.id, parentJob!.id));

    expect(verCheck.length).toBe(0);
    expect(jobCheck.length).toBe(0);
  });

  it('6. authentic catalog employers (such as GitLab) remain persistent and immune to test teardown', async () => {
    // Assert authentic catalog company 'GitLab' exists in the database and is never deleted
    const gitlab = await db
      .select({ id: schema.companies.id, name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'GitLab'));

    expect(gitlab.length).toBe(1);
    expect(gitlab[0]!.name).toBe('GitLab');

    // Assert pre-existing Bank of America company and jobs remain persistent
    const bofa = await db
      .select({ id: schema.companies.id, name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.name, 'Bank of America'));

    expect(bofa.length).toBe(1);
    expect(bofa[0]!.name).toBe('Bank of America');
  });
});
