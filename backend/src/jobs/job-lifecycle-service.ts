/**
 * Job Lifecycle Service.
 *
 * Implements deterministic tiered lifecycle management:
 * 1. Tier 1 (0–14 days): Fresh & Recent window for active discovery and alert generation.
 * 2. Tier 2 (15–30 days): Soft-closure transition for stale jobs past max active days.
 *    - Preserves logical identity to permanently prevent duplicate alerts on re-discovery.
 *    - Preserves user bookmarks, applications, notes, and interview prep.
 * 3. Tier 3 (60+ days): Safe pruning of dead, unreferenced closed jobs.
 *    - Strictly checks that NO user interactions (user_job_interactions) exist before pruning.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { config } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('job-lifecycle');

export interface JobLifecycleSweepResult {
  closedCount: number;
  purgedCount: number;
  durationMs: number;
  timestamp: string;
}

export interface JobLifecycleStats {
  totalJobs: number;
  activeCount: number;
  closedCount: number;
  activeWithin14Days: number;
  active15to30Days: number;
  activeOlderThan30Days: number;
  jobsWithUserInteractions: number;
}

/**
 * Automatically transition ACTIVE jobs exceeding the max active threshold to CLOSED.
 *
 * Rules:
 * - If official_posted_at is known, uses official_posted_at < cutoff.
 * - If official_posted_at is NULL, uses first_seen_at < cutoff.
 * - Only affects jobs with status = 'ACTIVE'.
 * - Sets status = 'CLOSED', closed_at = NOW(), updated_at = NOW().
 */
export async function autoCloseStaleJobs(options?: {
  maxActiveDays?: number;
}): Promise<{ closedCount: number }> {
  const db = getDb();
  const maxDays = options?.maxActiveDays ?? config.jobMaxActiveDays;
  const cutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  const result = await db.execute(sql`
    UPDATE jobs
    SET status = 'CLOSED',
        closed_at = ${now},
        updated_at = ${now}
    WHERE status = 'ACTIVE'
      AND (
        (official_posted_at IS NOT NULL AND official_posted_at < ${cutoff})
        OR
        (official_posted_at IS NULL AND first_seen_at < ${cutoff})
      )
  `);

  const closedCount = Number(result.rowCount ?? 0);

  log.info(
    { maxActiveDays: maxDays, cutoff: cutoff.toISOString(), closedCount },
    'AUTO_CLOSE_STALE_JOBS completed'
  );

  return { closedCount };
}

/**
 * Safely purge ancient CLOSED jobs that have NO user interactions.
 *
 * Safety Guards:
 * - Must have status = 'CLOSED'.
 * - Must have closed_at older than purgeRetentionDays.
 * - Must NOT be referenced by user_job_interactions (never saved, applied, or noted).
 */
export async function pruneUnreferencedClosedJobs(options?: {
  purgeRetentionDays?: number;
}): Promise<{ purgedCount: number }> {
  const db = getDb();
  const retentionDays = options?.purgeRetentionDays ?? config.jobPurgeRetentionDays;
  const purgeCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Safe delete with subquery ensuring zero user interactions
  const result = await db.execute(sql`
    DELETE FROM jobs
    WHERE status = 'CLOSED'
      AND closed_at IS NOT NULL
      AND closed_at < ${purgeCutoff}
      AND NOT EXISTS (
        SELECT 1 FROM user_job_interactions
        WHERE user_job_interactions.job_id = jobs.id
      )
  `);

  const purgedCount = Number(result.rowCount ?? 0);

  if (purgedCount > 0) {
    log.info(
      { purgeCutoff: purgeCutoff.toISOString(), purgedCount },
      'PRUNE_UNREFERENCED_CLOSED_JOBS completed'
    );
  }

  return { purgedCount };
}

/**
 * Retrieve comprehensive statistics on job age, statuses, and interactions.
 */
export async function getJobLifecycleStats(): Promise<JobLifecycleStats> {
  const db = getDb();
  const now = new Date();
  const cutoff14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [counts] = (
    await db.execute(sql`
      SELECT
        count(*)::int as total_jobs,
        count(*) FILTER (WHERE status = 'ACTIVE')::int as active_count,
        count(*) FILTER (WHERE status = 'CLOSED')::int as closed_count,
        count(*) FILTER (
          WHERE status = 'ACTIVE' 
            AND COALESCE(official_posted_at, first_seen_at) >= ${cutoff14}
        )::int as active_within_14,
        count(*) FILTER (
          WHERE status = 'ACTIVE' 
            AND COALESCE(official_posted_at, first_seen_at) < ${cutoff14}
            AND COALESCE(official_posted_at, first_seen_at) >= ${cutoff30}
        )::int as active_15_to_30,
        count(*) FILTER (
          WHERE status = 'ACTIVE' 
            AND COALESCE(official_posted_at, first_seen_at) < ${cutoff30}
        )::int as active_older_than_30
      FROM jobs
    `)
  ).rows as any[];

  const [interactions] = (
    await db.execute(sql`
      SELECT count(DISTINCT job_id)::int as jobs_with_interactions
      FROM user_job_interactions
    `)
  ).rows as any[];

  return {
    totalJobs: counts?.total_jobs ?? 0,
    activeCount: counts?.active_count ?? 0,
    closedCount: counts?.closed_count ?? 0,
    activeWithin14Days: counts?.active_within_14 ?? 0,
    active15to30Days: counts?.active_15_to_30 ?? 0,
    activeOlderThan30Days: counts?.active_older_than_30 ?? 0,
    jobsWithUserInteractions: interactions?.jobs_with_interactions ?? 0,
  };
}

/**
 * Execute a complete job lifecycle sweep.
 */
export async function runJobLifecycleSweep(options?: {
  maxActiveDays?: number;
  purgeRetentionDays?: number;
}): Promise<JobLifecycleSweepResult> {
  const startMs = Date.now();
  log.info('JOB_LIFECYCLE_SWEEP started');

  const { closedCount } = await autoCloseStaleJobs({
    maxActiveDays: options?.maxActiveDays,
  });

  const { purgedCount } = await pruneUnreferencedClosedJobs({
    purgeRetentionDays: options?.purgeRetentionDays,
  });

  const durationMs = Date.now() - startMs;
  log.info(
    { closedCount, purgedCount, durationMs },
    'JOB_LIFECYCLE_SWEEP completed successfully'
  );

  return {
    closedCount,
    purgedCount,
    durationMs,
    timestamp: new Date().toISOString(),
  };
}
