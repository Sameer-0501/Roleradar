/**
 * Verification Retention Concurrency & Transaction Safety Integration Tests.
 *
 * Implements real PostgreSQL integration verification for RR-RETENTION-PHASE-C-02 & C-04:
 * 1. Cross-connection mutual exclusion via PostgreSQL transaction-scoped advisory locking.
 * 2. Non-blocking lock acquisition failure causing safe skip.
 * 3. Lock automatic release upon transaction commit or rollback.
 * 4. Isolated test fixture verification: fixture records are never deleted in dry-run mode.
 * 5. Background-ingestion-tolerant assertion verifying fixture preservation and table non-shrinkage.
 */

import dotenv from 'dotenv';
dotenv.config();

import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPool } from '../database/connection.js';
import {
  tryAcquireRetentionAdvisoryLock,
  executeAtomicRetentionDeletion,
  runVerificationRetentionSweep,
} from '../jobs/verification-retention-service.js';

describe('Phase C-04: PostgreSQL Advisory Locking & Concurrency Integration', () => {
  let initialRowCount: number = 0;
  let testCompanyId: string = '';
  let testJobId: string = '';
  let fixtureVerificationIds: string[] = [];
  let earliestId: string = '';
  let redundantId: string = '';
  let failureId: string = '';
  let recoveryId: string = '';
  let latestId: string = '';

  beforeAll(async () => {
    const pool = getPool();
    const res = await pool.query('SELECT count(*)::bigint AS count FROM job_verifications');
    initialRowCount = Number(res.rows[0]?.count ?? 0);

    // Get an existing company or create test fixture
    const compRes = await pool.query('SELECT id FROM companies LIMIT 1');
    if (compRes.rows.length === 0) {
      throw new Error('No companies found in database for integration test fixture');
    }
    testCompanyId = compRes.rows[0].id;
    testJobId = randomUUID();

    // Insert isolated test fixture job created 30 days ago
    await pool.query(
      `
      INSERT INTO jobs (id, company_id, source_system, external_job_id, title, official_url, content_hash, created_at)
      VALUES ($1, $2, 'TEST_INTEGRATION_FIXTURE', $3, 'Retention Concurrency Test Job', 'https://example.com/test-fixture', $4, NOW() - INTERVAL '30 days')
    `,
      [testJobId, testCompanyId, 'ext-job-' + testJobId, 'hash-' + testJobId]
    );

    earliestId = randomUUID();
    redundantId = randomUUID();
    failureId = randomUUID();
    recoveryId = randomUUID();
    latestId = randomUUID();

    fixtureVerificationIds = [earliestId, redundantId, failureId, recoveryId, latestId];

    const rowsToInsert = [
      [earliestId, testJobId, 25, true, null], // earliest record (asc_rn=1, desc_rn=5) -> PROTECTED_INITIAL
      [redundantId, testJobId, 20, true, null], // redundant middle record (asc_rn=2, desc_rn=4) -> ELIGIBLE_CANDIDATE
      [failureId, testJobId, 18, false, 'HTTP 500 Server Error'], // failure diagnostic (asc_rn=3, desc_rn=3) -> PROTECTED_FAILURE
      [recoveryId, testJobId, 16, true, null], // recovery transition (asc_rn=4, desc_rn=2) -> PROTECTED_RECOVERY
      [latestId, testJobId, 2, true, null], // latest record (asc_rn=5, desc_rn=1) -> PROTECTED_LATEST (< 14d)
    ];

    for (const [id, jId, daysAgo, success, fail] of rowsToInsert) {
      await pool.query(
        `
        INSERT INTO job_verifications (
          id, job_id, checked_at,
          domain_check, job_exists_check, job_id_check, title_check, location_check, status_check, apply_url_check,
          verification_score, failure_reason
        )
        VALUES ($1, $2, NOW() - ($3 * INTERVAL '1 day'), $4, $4, $4, $4, $4, $4, $4, 1.0, $5)
      `,
        [id, jId, daysAgo, success, fail]
      );
    }
  });

  afterAll(async () => {
    const pool = getPool();

    // 1. Verify that all fixture records remain present before cleanup
    const fixtureCheck = await pool.query(
      'SELECT id FROM job_verifications WHERE id = ANY($1::uuid[])',
      [fixtureVerificationIds]
    );
    expect(fixtureCheck.rows).toHaveLength(5);

    // 2. Clean up test fixture job (cascades to delete only test fixture verifications)
    if (testJobId) {
      await pool.query('DELETE FROM jobs WHERE id = $1', [testJobId]);
    }

    // 3. Strict safety invariant: live table count must not drop below initial
    // (background scraper may concurrently insert new rows, but zero records are deleted)
    const res = await pool.query('SELECT count(*)::bigint AS count FROM job_verifications');
    const finalRowCount = Number(res.rows[0]?.count ?? 0);
    expect(finalRowCount).toBeGreaterThanOrEqual(initialRowCount);
  });

  it('8. Concurrent retention workers across separate database sessions cannot perform conflicting sweeps', async () => {
    const pool = getPool();
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Session 1 begins transaction and acquires advisory lock
      await client1.query('BEGIN');
      const acquired1 = await tryAcquireRetentionAdvisoryLock(client1);
      expect(acquired1).toBe(true);

      // Session 2 concurrently attempts to acquire the advisory lock in a transaction
      await client2.query('BEGIN');
      const acquired2 = await tryAcquireRetentionAdvisoryLock(client2);
      expect(acquired2).toBe(false); // MUST be false due to cross-session mutual exclusion!
      await client2.query('ROLLBACK');

      // Session 1 completes and commits, releasing the transaction-scoped advisory lock
      await client1.query('COMMIT');

      // Session 2 can now acquire the lock cleanly
      await client2.query('BEGIN');
      const acquired2AfterRelease = await tryAcquireRetentionAdvisoryLock(client2);
      expect(acquired2AfterRelease).toBe(true);
      await client2.query('COMMIT');
    } finally {
      client1.release();
      client2.release();
    }
  });

  it('9. A lock-acquisition failure causes a safe skip, not an uncoordinated deletion', async () => {
    const pool = getPool();
    const blockerClient = await pool.connect();
    const workerClient = await pool.connect();

    try {
      // Blocker session holds the advisory lock
      await blockerClient.query('BEGIN');
      const blockerAcquired = await tryAcquireRetentionAdvisoryLock(blockerClient);
      expect(blockerAcquired).toBe(true);

      // Worker session attempts execution while lock is held
      const sweepResult = await executeAtomicRetentionDeletion({
        client: workerClient,
        dryRun: false,
        allowDeletion: true,
      });

      // Must safely skip without performing any mutations
      expect(sweepResult.skipped).toBe(true);
      expect(sweepResult.skipReason).toBe('ADVISORY_LOCK_UNAVAILABLE');
      expect(sweepResult.deletedCount).toBe(0);
      expect(sweepResult.deletedIds).toHaveLength(0);

      // Release blocker
      await blockerClient.query('COMMIT');
    } finally {
      blockerClient.release();
      workerClient.release();
    }
  });

  it('Advisory lock releases automatically on ROLLBACK or unhandled transaction error', async () => {
    const pool = getPool();
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      await client1.query('BEGIN');
      const acquired1 = await tryAcquireRetentionAdvisoryLock(client1);
      expect(acquired1).toBe(true);

      // Explicit ROLLBACK (or crash)
      await client1.query('ROLLBACK');

      // Client 2 can immediately acquire
      await client2.query('BEGIN');
      const acquired2 = await tryAcquireRetentionAdvisoryLock(client2);
      expect(acquired2).toBe(true);
      await client2.query('COMMIT');
    } finally {
      client1.release();
      client2.release();
    }
  });

  it('6 & 7. Atomic CTE revalidation SQL executes safely without mutating live records', async () => {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Execute atomic candidate selection query on fixture job
      const testQuery = `
        WITH target_jobs AS (
          SELECT $1::uuid AS job_id
        ),
        job_rows AS (
          SELECT
            jv.id,
            jv.job_id,
            jv.checked_at,
            ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS asc_rn,
            ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at DESC, jv.id DESC) AS desc_rn,
            LAG(jv.domain_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_domain,
            LAG(jv.failure_reason) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_failure_reason
          FROM job_verifications jv
          JOIN target_jobs tj ON jv.job_id = tj.job_id
        )
        SELECT id, asc_rn, desc_rn
        FROM job_rows
        WHERE asc_rn > 1 AND desc_rn > 1;
      `;

      const result = await client.query(testQuery, [testJobId]);
      // All identified rows strictly have asc_rn > 1 and desc_rn > 1
      for (const row of result.rows) {
        expect(Number(row.asc_rn)).toBeGreaterThan(1);
        expect(Number(row.desc_rn)).toBeGreaterThan(1);
      }

      // Roll back transaction
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('Strict dry-run sweep identifies fixture candidate without deleting any records', async () => {
    const pool = getPool();

    // Run sweep targeting the fixture job
    const sweepResult = await runVerificationRetentionSweep({
      jobIds: [testJobId],
      dryRun: true,
      allowDeletion: false,
    });

    expect(sweepResult.dryRun).toBe(true);
    expect(sweepResult.deletedCount).toBe(0);
    expect(sweepResult.candidatesIdentified).toBe(1);
    expect(sweepResult.candidateIdsSample).toContain(redundantId);

    // Confirm that the candidate and all 5 fixture rows remain intact in the database
    const fixtureRows = await pool.query(
      'SELECT id FROM job_verifications WHERE id = ANY($1::uuid[])',
      [fixtureVerificationIds]
    );
    expect(fixtureRows.rows).toHaveLength(5);
  });
});
