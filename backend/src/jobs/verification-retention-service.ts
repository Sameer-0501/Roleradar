/**
 * Verification History Retention Service.
 *
 * Implements RR-RETENTION-PHASE-C-01: Bounded Verification-History Retention.
 *
 * Safe, restart-ready, bounded retention analysis and candidate identification
 * for `job_verifications`.
 *
 * Core Safeguards:
 * 1. Earliest verification record for each job is NEVER pruned (deterministically ordered: checked_at ASC, id ASC).
 * 2. Latest verification record for each job is NEVER pruned (deterministically ordered: checked_at DESC, id DESC).
 * 3. All records within the last `retentionWindowDays` (default: 14 days) are STRICTLY PROTECTED.
 * 4. Material state transitions and authoritative closure evidence are NEVER pruned.
 * 5. Diagnostic records, transient failures (HTTP 429, 5xx, timeouts), and errors are NEVER pruned
 *    within the `failureRetentionDays` (default: 90 days; under standard policy, failures are preserved indefinitely).
 * 6. ONLY consecutive, materially identical successful verification records older than 14 days are candidate rows.
 * 7. When redundancy cannot be established with certainty, the record is PRESERVED.
 * 8. Never deletes jobs, notifications, user records, or admin logs.
 * 9. Never alters job status or last_verified_at.
 * 10. STRICT DRY-RUN BY DEFAULT: Zero database mutations unless explicitly enabled.
 */

import { sql } from 'drizzle-orm';
import { getDb, getPool } from '../database/connection.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('verification-retention-service');

export const DEFAULT_RETENTION_WINDOW_DAYS = 14;
export const DEFAULT_FAILURE_RETENTION_DAYS = 90;
export const DEFAULT_RETENTION_BATCH_SIZE = 500;
export const DEFAULT_RETENTION_JOB_CHUNK_SIZE = 100;

// Explicit calculation: heap tuple (~96 bytes) + 3 indexes (pkey ~32B, job_id ~32B, checked_at ~24B) = ~184 bytes
export const ESTIMATED_BYTES_PER_VERIFICATION_ROW = 184;

export const RETENTION_ADVISORY_LOCK_NAME = 'verification_retention_sweep';

export interface RetentionOptions {
  /** Retention window for recent records in days (default: 14) */
  retentionWindowDays?: number;
  /**
   * Retention window for failure/diagnostic records in days (default: 90).
   * NOTE: Under current RoleRadar safety policy, failure and recovery evidence
   * is protected INDEFINITELY in SQL (failure_reason IS NULL AND prev_failure_reason IS NULL).
   * Automatic failure-row deletion is NOT implemented. This setting is reserved for future policy.
   */
  failureRetentionDays?: number;
  /** Maximum candidate rows to identify/prune per batch (default: 500) */
  batchSize?: number;
  /** Number of jobs to evaluate in window partition chunks (default: 100) */
  jobChunkSize?: number;
  /** Keyset pagination cursor: job_id UUID from which to resume backlog sweep */
  cursorJobId?: string | null;
  /** Maximum job chunks to evaluate in a single sweep cycle (default: 5) */
  maxChunksPerSweep?: number;
  /** Strict dry-run mode — makes zero database mutations (default: true) */
  dryRun?: boolean;
  /** Explicit authorization gate required for deletion (default: false) */
  allowDeletion?: boolean;
  /** Optional job IDs filter for focused testing */
  jobIds?: string[];
  /** Optional candidates pre-identified for deletion revalidation */
  candidates?: RetentionCandidateRow[];
  /** Explicitly include the full-table audit query (default: false) */
  includeGlobalAudit?: boolean;
  /** Optional dedicated client for transactional isolation or testing */
  client?: any;
}

export interface RetentionCandidateRow {
  id: string;
  job_id: string;
  checked_at: Date;
}

export interface CandidateBatchResult {
  candidates: RetentionCandidateRow[];
  nextCursorJobId: string | null;
  passCompleted: boolean;
  chunksEvaluated: number;
  jobsEvaluated: number;
}

export interface RetentionSummaryStats {
  totalRows: number;
  protectedRecent14d: number;
  protectedEarliest: number;
  protectedLatest: number;
  protectedErrorsAndTransitions: number;
  eligibleCandidates: number;
}

export interface RetentionCycleResult {
  dryRun: boolean;
  executedAt: Date;
  durationMs: number;
  retentionWindowDays: number;
  failureRetentionDays: number;
  batchSize: number;
  totalRecordsInScope?: number;
  candidatesIdentified: number;
  candidateIdsSample: string[];
  cursorJobId?: string | null;
  nextCursorJobId?: string | null;
  passCompleted: boolean;
  chunksEvaluated: number;
  jobsEvaluated: number;
  ageDistribution: {
    days14To30: number;
    days31To60: number;
    days61To90: number;
    over90Days: number;
  };
  protectionBreakdown?: {
    protectedInitial: number;
    protectedLatest: number;
    protectedRecent: number;
    protectedFailuresAndDiagnostics: number;
    protectedTransitions: number;
    protectedSingleRecordJobs: number;
  };
  storageEstimates: {
    estimatedRowBytes: number;
    estimatedLogicalReclaimBytes: number;
    estimatedLogicalReclaimPretty: string;
    note: string;
  };
  deletedCount: number;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Attempt to acquire transaction-scoped PostgreSQL advisory lock.
 * Non-blocking: returns true if acquired, false if held by another session.
 * Automatically released upon COMMIT, ROLLBACK, or connection termination.
 */
export async function tryAcquireRetentionAdvisoryLock(client: any): Promise<boolean> {
  const lockRes = await client.query(
    `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
    [RETENTION_ADVISORY_LOCK_NAME]
  );
  return lockRes.rows?.[0]?.acquired === true;
}

/**
 * Retrieve high-level retention analysis across the entire database or a subset of jobs.
 * Always strictly read-only.
 *
 * NOTE: This executes window functions across the entire table (~40s on 1.8M rows).
 * It is decoupled from the routine scheduled sweep and must only be invoked for explicit
 * on-demand administrative diagnostics.
 */
export async function getOverallRetentionAudit(
  options: RetentionOptions = {}
): Promise<RetentionSummaryStats> {
  const db = getDb();
  const windowDays = options.retentionWindowDays ?? DEFAULT_RETENTION_WINDOW_DAYS;

  // Uses window functions to deterministically distinguish earliest, latest, and transitions
  const querySql = sql`
    WITH ordered AS (
      SELECT
        id,
        job_id,
        checked_at,
        domain_check,
        job_exists_check,
        job_id_check,
        title_check,
        location_check,
        status_check,
        apply_url_check,
        verification_score,
        failure_reason,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS asc_rn,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY checked_at DESC, id DESC) AS desc_rn,
        LAG(domain_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_domain,
        LAG(job_exists_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_exists,
        LAG(job_id_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_job_id,
        LAG(title_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_title,
        LAG(location_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_location,
        LAG(status_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_status,
        LAG(apply_url_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_apply_url,
        LAG(verification_score) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_score,
        LAG(failure_reason) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) AS prev_failure_reason
      FROM job_verifications
    )
    SELECT
      COUNT(*)::bigint AS total_rows,
      COUNT(*) FILTER (WHERE checked_at >= NOW() - (${windowDays} * INTERVAL '1 day'))::bigint AS protected_recent_14d,
      COUNT(*) FILTER (WHERE asc_rn = 1)::bigint AS protected_earliest,
      COUNT(*) FILTER (WHERE desc_rn = 1 AND asc_rn > 1)::bigint AS protected_latest,
      COUNT(*) FILTER (WHERE failure_reason IS NOT NULL OR prev_failure_reason IS NOT NULL)::bigint AS protected_errors_and_transitions,
      COUNT(*) FILTER (
        WHERE checked_at < NOW() - (${windowDays} * INTERVAL '1 day')
          AND asc_rn > 1
          AND desc_rn > 1
          AND failure_reason IS NULL
          AND prev_failure_reason IS NULL
          AND domain_check IS NOT DISTINCT FROM prev_domain
          AND job_exists_check IS NOT DISTINCT FROM prev_exists
          AND job_id_check IS NOT DISTINCT FROM prev_job_id
          AND title_check IS NOT DISTINCT FROM prev_title
          AND location_check IS NOT DISTINCT FROM prev_location
          AND status_check IS NOT DISTINCT FROM prev_status
          AND apply_url_check IS NOT DISTINCT FROM prev_apply_url
          AND abs(verification_score - prev_score) < 0.0001
      )::bigint AS eligible_candidates
    FROM ordered;
  `;

  const result = await (db as any).execute(querySql);
  const row = (result.rows && result.rows[0]) ? result.rows[0] : (result[0] ?? {});

  return {
    totalRows: Number(row.total_rows ?? 0),
    protectedRecent14d: Number(row.protected_recent_14d ?? 0),
    protectedEarliest: Number(row.protected_earliest ?? 0),
    protectedLatest: Number(row.protected_latest ?? 0),
    protectedErrorsAndTransitions: Number(row.protected_errors_and_transitions ?? 0),
    eligibleCandidates: Number(row.eligible_candidates ?? 0),
  };
}

/**
 * Identify a bounded batch of candidate rows eligible for retention pruning.
 *
 * Fast (~200–500ms) indexed query using keyset pagination on jobs.id.
 * Traverses backlog monotonically to prevent completed jobs from starving eligible history.
 * Revalidates every safeguard:
 * - Must be strictly older than retentionWindowDays.
 * - Must NOT be earliest record (asc_rn > 1).
 * - Must NOT be latest record (desc_rn > 1).
 * - Must be successful pass without failureReason.
 * - Must match preceding record across all checks, score, and failure state.
 */
export async function identifyCandidateBatch(
  options: RetentionOptions = {}
): Promise<CandidateBatchResult> {
  const db = getDb();
  const windowDays = options.retentionWindowDays ?? DEFAULT_RETENTION_WINDOW_DAYS;
  const batchLimit = options.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;
  const jobChunkSize = options.jobChunkSize ?? DEFAULT_RETENTION_JOB_CHUNK_SIZE;
  const cursor = options.cursorJobId ?? null;

  // Case 1: Specific job IDs provided (focused evaluation)
  if (options.jobIds && options.jobIds.length > 0) {
    const candidateQuerySql = sql`
      WITH job_rows AS (
        SELECT
          id,
          job_id,
          checked_at,
          domain_check,
          job_exists_check,
          job_id_check,
          title_check,
          location_check,
          status_check,
          apply_url_check,
          verification_score,
          failure_reason,
          ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as asc_rn,
          ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY checked_at DESC, id DESC) as desc_rn,
          LAG(domain_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_domain,
          LAG(job_exists_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_exists,
          LAG(job_id_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_job_id,
          LAG(title_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_title,
          LAG(location_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_location,
          LAG(status_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_status,
          LAG(apply_url_check) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_apply_url,
          LAG(verification_score) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_score,
          LAG(failure_reason) OVER (PARTITION BY job_id ORDER BY checked_at ASC, id ASC) as prev_failure_reason
        FROM job_verifications
        WHERE job_id IN (${sql.join(options.jobIds.map(id => sql`${id}`), sql`, `)})
      )
      SELECT id, job_id, checked_at
      FROM job_rows
      WHERE checked_at < NOW() - (${windowDays} * INTERVAL '1 day')
        AND asc_rn > 1
        AND desc_rn > 1
        AND failure_reason IS NULL
        AND prev_failure_reason IS NULL
        AND domain_check IS NOT DISTINCT FROM prev_domain
        AND job_exists_check IS NOT DISTINCT FROM prev_exists
        AND job_id_check IS NOT DISTINCT FROM prev_job_id
        AND title_check IS NOT DISTINCT FROM prev_title
        AND location_check IS NOT DISTINCT FROM prev_location
        AND status_check IS NOT DISTINCT FROM prev_status
        AND apply_url_check IS NOT DISTINCT FROM prev_apply_url
        AND abs(verification_score - prev_score) < 0.0001
      ORDER BY checked_at ASC, id ASC
      LIMIT ${batchLimit};
    `;

    const result = await (db as any).execute(candidateQuerySql);
    const rows: any[] = result.rows ?? (Array.isArray(result) ? result : []);
    const candidates = rows.map((r: any) => ({
      id: String(r.id),
      job_id: String(r.job_id),
      checked_at: new Date(r.checked_at),
    }));

    return {
      candidates,
      nextCursorJobId: null,
      passCompleted: true,
      chunksEvaluated: 1,
      jobsEvaluated: options.jobIds.length,
    };
  }

  // Case 2: Routine sweep progression using keyset pagination on jobs.id
  // 1. Fetch next deterministic chunk of job IDs
  const targetJobsSql = sql`
    SELECT id AS job_id
    FROM jobs
    WHERE (${cursor}::uuid IS NULL OR id > ${cursor}::uuid)
      AND EXISTS (
        SELECT 1 FROM job_verifications jv
        WHERE jv.job_id = jobs.id
          AND jv.checked_at < NOW() - (${windowDays} * INTERVAL '1 day')
      )
    ORDER BY id ASC
    LIMIT ${jobChunkSize};
  `;

  const targetResult = await (db as any).execute(targetJobsSql);
  const targetRows: any[] = targetResult.rows ?? (Array.isArray(targetResult) ? targetResult : []);

  if (targetRows.length === 0) {
    return {
      candidates: [],
      nextCursorJobId: null,
      passCompleted: true,
      chunksEvaluated: 0,
      jobsEvaluated: 0,
    };
  }

  const lastJobId = String(targetRows[targetRows.length - 1].job_id);
  const passCompleted = targetRows.length < jobChunkSize;
  const nextCursorJobId = passCompleted ? null : lastJobId;
  const chunkJobIds = targetRows.map((r: any) => String(r.job_id));

  // 2. Evaluate window functions and candidate predicates strictly for this chunk of jobs
  const chunkCandidatesSql = sql`
    WITH job_rows AS (
      SELECT
        jv.id,
        jv.job_id,
        jv.checked_at,
        jv.domain_check,
        jv.job_exists_check,
        jv.job_id_check,
        jv.title_check,
        jv.location_check,
        jv.status_check,
        jv.apply_url_check,
        jv.verification_score,
        jv.failure_reason,
        ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as asc_rn,
        ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at DESC, jv.id DESC) as desc_rn,
        LAG(jv.domain_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_domain,
        LAG(jv.job_exists_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_exists,
        LAG(jv.job_id_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_job_id,
        LAG(jv.title_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_title,
        LAG(jv.location_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_location,
        LAG(jv.status_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_status,
        LAG(jv.apply_url_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_apply_url,
        LAG(jv.verification_score) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_score,
        LAG(jv.failure_reason) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) as prev_failure_reason
      FROM job_verifications jv
      WHERE jv.job_id IN (${sql.join(chunkJobIds.map(id => sql`${id}`), sql`, `)})
    )
    SELECT id, job_id, checked_at
    FROM job_rows
    WHERE checked_at < NOW() - (${windowDays} * INTERVAL '1 day')
      AND asc_rn > 1
      AND desc_rn > 1
      AND failure_reason IS NULL
      AND prev_failure_reason IS NULL
      AND domain_check IS NOT DISTINCT FROM prev_domain
      AND job_exists_check IS NOT DISTINCT FROM prev_exists
      AND job_id_check IS NOT DISTINCT FROM prev_job_id
      AND title_check IS NOT DISTINCT FROM prev_title
      AND location_check IS NOT DISTINCT FROM prev_location
      AND status_check IS NOT DISTINCT FROM prev_status
      AND apply_url_check IS NOT DISTINCT FROM prev_apply_url
      AND abs(verification_score - prev_score) < 0.0001
    ORDER BY checked_at ASC, id ASC
    LIMIT ${batchLimit};
  `;

  const chunkResult = await (db as any).execute(chunkCandidatesSql);
  const chunkRows: any[] = chunkResult.rows ?? (Array.isArray(chunkResult) ? chunkResult : []);

  const candidates: RetentionCandidateRow[] = chunkRows.map((r: any) => ({
    id: String(r.id),
    job_id: String(r.job_id),
    checked_at: new Date(r.checked_at),
  }));

  return {
    candidates,
    nextCursorJobId,
    passCompleted,
    chunksEvaluated: 1,
    jobsEvaluated: targetRows.length,
  };
}

/**
 * Execute atomic retention deletion with transaction-scoped PostgreSQL advisory lock.
 *
 * Atomically revalidates all retention predicates in the database snapshot:
 * 1. Checks out a dedicated client from pg.Pool (or uses provided client).
 * 2. Begins transaction: `BEGIN`.
 * 3. Acquires transaction-scoped advisory lock: `SELECT pg_try_advisory_xact_lock(hashtext($1))`.
 *    - Automatically releases on COMMIT, ROLLBACK, crash, or disconnection.
 *    - If busy, rolls back immediately and returns `skipped: true`.
 * 4. Atomic CTE DELETE re-evaluates:
 *    - `checked_at < NOW() - INTERVAL '14 days'`
 *    - `asc_rn > 1` (protects earliest record)
 *    - `desc_rn > 1` (protects latest record)
 *    - `failure_reason IS NULL` AND `prev_failure_reason IS NULL` (protects failures, transitions)
 *    - all 8 boolean check fields `IS NOT DISTINCT FROM prev_*`
 *    - `abs(verification_score - prev_score) < 0.0001`
 *    - LIMIT batchLimit
 * 5. Commits transaction and releases connection back to pool.
 */
export async function executeAtomicRetentionDeletion(
  options: RetentionOptions = {}
): Promise<{ deletedCount: number; deletedIds: string[]; skipped: boolean; skipReason?: string }> {
  const windowDays = options.retentionWindowDays ?? DEFAULT_RETENTION_WINDOW_DAYS;
  const batchLimit = options.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;
  const jobChunkSize = options.jobChunkSize ?? DEFAULT_RETENTION_JOB_CHUNK_SIZE;

  const pool = getPool();
  const client = options.client ?? (await pool.connect());
  const managesConnection = !options.client;

  try {
    await client.query('BEGIN');

    const acquired = await tryAcquireRetentionAdvisoryLock(client);

    if (!acquired) {
      await client.query('ROLLBACK');
      log.warn(
        { lockName: RETENTION_ADVISORY_LOCK_NAME },
        'RETENTION_ADVISORY_LOCK_BUSY skipping sweep — concurrent process holds lock'
      );
      return {
        deletedCount: 0,
        deletedIds: [],
        skipped: true,
        skipReason: 'ADVISORY_LOCK_UNAVAILABLE',
      };
    }

    let queryText: string;
    let queryParams: any[];

    const candidateJobIds = options.jobIds && options.jobIds.length > 0
      ? options.jobIds
      : (options.candidates && options.candidates.length > 0
          ? Array.from(new Set(options.candidates.map((c: any) => c.job_id)))
          : undefined);

    if (candidateJobIds && candidateJobIds.length > 0) {
      queryText = `
        WITH target_jobs AS (
          SELECT unnest($1::uuid[]) AS job_id
        ),
        job_rows AS (
          SELECT
            jv.id,
            jv.job_id,
            jv.checked_at,
            jv.domain_check,
            jv.job_exists_check,
            jv.job_id_check,
            jv.title_check,
            jv.location_check,
            jv.status_check,
            jv.apply_url_check,
            jv.verification_score,
            jv.failure_reason,
            ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS asc_rn,
            ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at DESC, jv.id DESC) AS desc_rn,
            LAG(jv.domain_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_domain,
            LAG(jv.job_exists_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_exists,
            LAG(jv.job_id_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_job_id,
            LAG(jv.title_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_title,
            LAG(jv.location_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_location,
            LAG(jv.status_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_status,
            LAG(jv.apply_url_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_apply_url,
            LAG(jv.verification_score) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_score,
            LAG(jv.failure_reason) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_failure_reason
          FROM job_verifications jv
          JOIN target_jobs tj ON jv.job_id = tj.job_id
        ),
        candidates_to_prune AS (
          SELECT id
          FROM job_rows
          WHERE checked_at < NOW() - ($2 * INTERVAL '1 day')
            AND asc_rn > 1
            AND desc_rn > 1
            AND failure_reason IS NULL
            AND prev_failure_reason IS NULL
            AND domain_check IS NOT DISTINCT FROM prev_domain
            AND job_exists_check IS NOT DISTINCT FROM prev_exists
            AND job_id_check IS NOT DISTINCT FROM prev_job_id
            AND title_check IS NOT DISTINCT FROM prev_title
            AND location_check IS NOT DISTINCT FROM prev_location
            AND status_check IS NOT DISTINCT FROM prev_status
            AND apply_url_check IS NOT DISTINCT FROM prev_apply_url
            AND abs(verification_score - prev_score) < 0.0001
          ORDER BY checked_at ASC, id ASC
          LIMIT $3
        )
        DELETE FROM job_verifications
        WHERE id IN (SELECT id FROM candidates_to_prune)
        RETURNING id;
      `;
      queryParams = [candidateJobIds, windowDays, batchLimit];
    } else {
      // Deterministic keyset pagination fallback when jobIds/candidates not provided
      queryText = `
        WITH target_jobs AS (
          SELECT id AS job_id
          FROM jobs
          WHERE ($1::uuid IS NULL OR id > $1::uuid)
            AND EXISTS (
              SELECT 1 FROM job_verifications jv
              WHERE jv.job_id = jobs.id
                AND jv.checked_at < NOW() - ($2 * INTERVAL '1 day')
            )
          ORDER BY id ASC
          LIMIT $3
        ),
        job_rows AS (
          SELECT
            jv.id,
            jv.job_id,
            jv.checked_at,
            jv.domain_check,
            jv.job_exists_check,
            jv.job_id_check,
            jv.title_check,
            jv.location_check,
            jv.status_check,
            jv.apply_url_check,
            jv.verification_score,
            jv.failure_reason,
            ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS asc_rn,
            ROW_NUMBER() OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at DESC, jv.id DESC) AS desc_rn,
            LAG(jv.domain_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_domain,
            LAG(jv.job_exists_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_exists,
            LAG(jv.job_id_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_job_id,
            LAG(jv.title_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_title,
            LAG(jv.location_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_location,
            LAG(jv.status_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_status,
            LAG(jv.apply_url_check) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_apply_url,
            LAG(jv.verification_score) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_score,
            LAG(jv.failure_reason) OVER (PARTITION BY jv.job_id ORDER BY jv.checked_at ASC, jv.id ASC) AS prev_failure_reason
          FROM job_verifications jv
          JOIN target_jobs tj ON jv.job_id = tj.job_id
        ),
        candidates_to_prune AS (
          SELECT id
          FROM job_rows
          WHERE checked_at < NOW() - ($2 * INTERVAL '1 day')
            AND asc_rn > 1
            AND desc_rn > 1
            AND failure_reason IS NULL
            AND prev_failure_reason IS NULL
            AND domain_check IS NOT DISTINCT FROM prev_domain
            AND job_exists_check IS NOT DISTINCT FROM prev_exists
            AND job_id_check IS NOT DISTINCT FROM prev_job_id
            AND title_check IS NOT DISTINCT FROM prev_title
            AND location_check IS NOT DISTINCT FROM prev_location
            AND status_check IS NOT DISTINCT FROM prev_status
            AND apply_url_check IS NOT DISTINCT FROM prev_apply_url
            AND abs(verification_score - prev_score) < 0.0001
          ORDER BY checked_at ASC, id ASC
          LIMIT $4
        )
        DELETE FROM job_verifications
        WHERE id IN (SELECT id FROM candidates_to_prune)
        RETURNING id;
      `;
      queryParams = [options.cursorJobId ?? null, windowDays, jobChunkSize, batchLimit];
    }

    const res = await client.query(queryText, queryParams);
    const deletedIds = (res.rows ?? []).map((r: any) => String(r.id));
    const deletedCount = deletedIds.length;

    await client.query('COMMIT');

    log.info(
      { deletedCount },
      'RETENTION_ATOMIC_DELETION_COMMITTED successfully executed atomic prune'
    );

    return { deletedCount, deletedIds, skipped: false };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  } finally {
    if (managesConnection) {
      client.release();
    }
  }
}

/**
 * Run a Verification History Retention Cycle.
 *
 * DEFAULTS TO STRICT DRY RUN:
 * - When dryRun is true (default), identifies candidates, computes age distribution,
 *   audits protections, and returns comprehensive analytics with ZERO database mutations.
 * - When dryRun is false, requires explicit `allowDeletion: true` to perform bounded deletion.
 * - Routine scheduled sweeps use indexed bounded candidate batch queries (~60ms) and
 *   do NOT invoke the expensive full-table window audit query.
 */
export async function runVerificationRetentionSweep(
  options: RetentionOptions = {}
): Promise<RetentionCycleResult> {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? true;
  const allowDeletion = options.allowDeletion ?? false;
  const windowDays = options.retentionWindowDays ?? DEFAULT_RETENTION_WINDOW_DAYS;
  const failureDays = options.failureRetentionDays ?? DEFAULT_FAILURE_RETENTION_DAYS;
  const batchSize = options.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;
  const includeGlobalAudit = options.includeGlobalAudit ?? false;

  log.info(
    { dryRun, allowDeletion, windowDays, failureDays, batchSize, includeGlobalAudit, cursorJobId: options.cursorJobId },
    'RETENTION_SWEEP_STARTED'
  );

  // 1. Audit overall protection figures ONLY if explicitly requested
  let overallAudit: RetentionSummaryStats | undefined;
  if (includeGlobalAudit) {
    try {
      overallAudit = await getOverallRetentionAudit({ retentionWindowDays: windowDays });
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'RETENTION_AUDIT_FALLBACK using candidate batch projection'
      );
    }
  }

  // 2. Identify candidate rows for this bounded batch (uses fast keyset progression query)
  const batchResult = await identifyCandidateBatch({
    retentionWindowDays: windowDays,
    batchSize,
    jobChunkSize: options.jobChunkSize,
    cursorJobId: options.cursorJobId,
    maxChunksPerSweep: options.maxChunksPerSweep,
    jobIds: options.jobIds,
  });

  const candidates = batchResult.candidates;
  const now = Date.now();
  const ageDistribution = {
    days14To30: 0,
    days31To60: 0,
    days61To90: 0,
    over90Days: 0,
  };

  for (const c of candidates) {
    const ageDays = (now - c.checked_at.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 30) ageDistribution.days14To30++;
    else if (ageDays <= 60) ageDistribution.days31To60++;
    else if (ageDays <= 90) ageDistribution.days61To90++;
    else ageDistribution.over90Days++;
  }

  const candidateIdsSample = candidates.slice(0, 20).map((c) => c.id);
  const candidateCount = candidates.length;
  const estimatedLogicalReclaimBytes = candidateCount * ESTIMATED_BYTES_PER_VERIFICATION_ROW;

  let deletedCount = 0;
  let skipped = false;
  let skipReason: string | undefined;

  // 3. Deletion Execution Path (Strictly Guarded: requires !dryRun AND allowDeletion: true)
  if (!dryRun && allowDeletion) {
    const deletionResult = await executeAtomicRetentionDeletion({
      ...options,
      candidates,
    });
    deletedCount = deletionResult.deletedCount;
    skipped = deletionResult.skipped;
    skipReason = deletionResult.skipReason;
  } else {
    log.info(
      { candidateCount, dryRun, allowDeletion },
      'RETENTION_DRY_RUN_COMPLETED zero database mutations executed'
    );
  }

  const durationMs = Date.now() - startTime;

  return {
    dryRun,
    executedAt: new Date(),
    durationMs,
    retentionWindowDays: windowDays,
    failureRetentionDays: failureDays,
    batchSize,
    totalRecordsInScope: overallAudit?.totalRows ?? candidateCount,
    candidatesIdentified: candidateCount,
    candidateIdsSample,
    cursorJobId: options.cursorJobId ?? null,
    nextCursorJobId: batchResult.nextCursorJobId,
    passCompleted: batchResult.passCompleted,
    chunksEvaluated: batchResult.chunksEvaluated,
    jobsEvaluated: batchResult.jobsEvaluated,
    ageDistribution,
    protectionBreakdown: overallAudit ? {
      protectedInitial: overallAudit.protectedEarliest,
      protectedLatest: overallAudit.protectedLatest,
      protectedRecent: overallAudit.protectedRecent14d,
      protectedFailuresAndDiagnostics: overallAudit.protectedErrorsAndTransitions,
      protectedTransitions: overallAudit.protectedErrorsAndTransitions,
      protectedSingleRecordJobs: overallAudit.protectedEarliest - overallAudit.protectedLatest,
    } : undefined,
    storageEstimates: {
      estimatedRowBytes: ESTIMATED_BYTES_PER_VERIFICATION_ROW,
      estimatedLogicalReclaimBytes,
      estimatedLogicalReclaimPretty: formatBytes(estimatedLogicalReclaimBytes),
      note: 'Logical tuple space reclaimed for autovacuum reuse within existing PostgreSQL heap pages. OS filesystem file size reduction requires VACUUM FULL or pg_repack table rebuild.',
    },
    deletedCount,
    skipped,
    skipReason,
  };
}

