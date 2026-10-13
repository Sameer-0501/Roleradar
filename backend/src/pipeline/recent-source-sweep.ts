/**
 * Recent Source Discovery Sweep.
 *
 * For each registered collector, retrieves the current ATS source listing and
 * filters candidates whose trustworthy posting date falls within the configured
 * rolling recent-job window (RECENT_JOB_WINDOW_DAYS, default 10 days).
 *
 * PURPOSE: Recover jobs that RoleRadar entirely missed on their original posting day
 * due to temporary collector failures, scheduler downtime, or the source not yet
 * being in the catalog when the employer posted.
 *
 * INVARIANTS (all preserved):
 * - Only candidates with a trustworthy officialPostedAt (CONFIRMED or INFERRED
 *   confidence) are eligible. Null/UNKNOWN dates are always excluded.
 * - Future posting dates are defensively excluded.
 * - All eligible candidates pass through the FULL existing pipeline:
 *     URL validation → upsert (dedup) → verification → classification → matching.
 * - isCompleteScan is FORCED FALSE: the filtered subset must never trigger
 *   absence-based job closure.
 * - Notifications use INSTANT_JOB type with discovery_reason = 'RECENT_JOB'.
 * - The existing onConflictDoNothing on (user_id, job_id, notification_type)
 *   prevents duplicate notifications regardless of how many times this sweep runs.
 *
 * CONCURRENCY: The caller (scheduler) is responsible for holding the per-collector
 * activeScans lock during this sweep. The same lock is shared with the normal scan
 * so the same ATS source is never hit by two concurrent RoleRadar operations.
 */

import { createLogger } from '../utils/logger.js';
import { isDateEligibleForRecentSweep } from '../jobs/posting-date-confidence.js';
import { runPipeline } from './pipeline.js';
import type { ICollector, JobCandidate } from '../collectors/types.js';
import type { PipelineSourceConfig } from './pipeline.js';

const log = createLogger('recent-source-sweep');

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RecentSourceSweepOptions {
  /** Rolling window in days. Only candidates with officialPostedAt >= now - windowDays included. */
  windowDays: number;
  /** Optional anchor date for rolling window. Defaults to new Date(). */
  now?: Date;
}

export interface RecentSourceSweepStats {
  source: string;
  jobsFetched: number;
  jobsWithUsableDate: number;
  jobsWithinWindow: number;
  jobsOutsideWindow: number;
  jobsUnknownDate: number;
  jobsFutureDate: number;
  verified: number;
  failed: number;
  pending: number;
  skipped: number;
}

// ─── Date-window filter (pure, testable in isolation) ─────────────────────────

export interface WindowFilterResult {
  eligible: JobCandidate[];
  unknownDate: number;
  outsideWindow: number;
  futureDate: number;
}

/**
 * Filter a set of discovered candidates to those whose posting date falls within
 * the rolling recent-job window.
 *
 * Pure function — no side effects, fully testable without mocking.
 *
 * @param candidates  - Raw candidates from a collector
 * @param windowDays  - How many days back to look
 * @param now         - Anchor for "now" (injectable for deterministic tests)
 */
export function filterCandidatesByRecentWindow(
  candidates: JobCandidate[],
  windowDays: number,
  now: Date = new Date()
): WindowFilterResult {
  const windowMs = windowDays * 24 * 60 * 60 * 1_000;
  const windowStart = new Date(now.getTime() - windowMs);

  const eligible: JobCandidate[] = [];
  let unknownDate = 0;
  let outsideWindow = 0;
  let futureDate = 0;

  for (const candidate of candidates) {
    // Exclude if no date or UNKNOWN confidence
    if (
      !candidate.officialPostedAt ||
      !isDateEligibleForRecentSweep(candidate.sourceSystem, candidate.officialPostedAt)
    ) {
      unknownDate++;
      continue;
    }

    const postedAt = candidate.officialPostedAt;

    // Defensive: exclude future posting dates
    if (postedAt > now) {
      futureDate++;
      continue;
    }

    // Rolling window: windowStart <= postedAt <= now
    if (postedAt < windowStart) {
      outsideWindow++;
      continue;
    }

    eligible.push(candidate);
  }

  return { eligible, unknownDate, outsideWindow, futureDate };
}

// ─── Sweep orchestrator ───────────────────────────────────────────────────────

/**
 * Run the recent source discovery sweep for a single collector.
 *
 * Fetches the current ATS source listing (same API call as the normal scan),
 * applies the date-window filter, and feeds qualifying candidates through
 * the existing pipeline with discoveryReason = 'RECENT_JOB'.
 *
 * The caller (JobScheduler.runRecentSweep) holds the shared per-collector
 * activeScans lock, ensuring this sweep and the normal scan for the same
 * source never execute concurrently.
 *
 * @param collector    - The collector to use for source discovery
 * @param companyId    - UUID of the company in the database
 * @param sourceConfig - Pipeline source configuration
 * @param options      - Sweep options (window size)
 * @returns Sweep statistics
 */
export async function runRecentSourceSweep(
  collector: ICollector,
  companyId: string,
  sourceConfig: PipelineSourceConfig,
  options: RecentSourceSweepOptions
): Promise<RecentSourceSweepStats> {
  const sourceName = collector.getSourceName();
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - options.windowDays * 24 * 60 * 60 * 1_000);

  const stats: RecentSourceSweepStats = {
    source: sourceName,
    jobsFetched: 0,
    jobsWithUsableDate: 0,
    jobsWithinWindow: 0,
    jobsOutsideWindow: 0,
    jobsUnknownDate: 0,
    jobsFutureDate: 0,
    verified: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
  };

  log.info(
    {
      source: sourceName,
      windowDays: options.windowDays,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    },
    'RECENT_SWEEP_STARTED'
  );

  // 1. Fetch full listing from the ATS source (reuses existing collector, same API call)
  let allCandidates: JobCandidate[];
  try {
    allCandidates = await collector.discoverJobs();
    stats.jobsFetched = allCandidates.length;
    log.info({ source: sourceName, fetched: allCandidates.length }, 'RECENT_SWEEP_FETCHED');
  } catch (err) {
    log.error(
      { source: sourceName, err: err instanceof Error ? err.message : String(err) },
      'RECENT_SWEEP_FETCH_ERROR collector threw during discoverJobs'
    );
    return stats;
  }

  // 2. Apply posting-date window filter (CONFIRMED and INFERRED dates only)
  const { eligible, unknownDate, outsideWindow, futureDate } = filterCandidatesByRecentWindow(
    allCandidates,
    options.windowDays,
    now
  );

  stats.jobsUnknownDate = unknownDate;
  stats.jobsFutureDate = futureDate;
  stats.jobsOutsideWindow = outsideWindow;
  stats.jobsWithinWindow = eligible.length;
  stats.jobsWithUsableDate = allCandidates.length - unknownDate;

  log.info(
    {
      source: sourceName,
      fetched: stats.jobsFetched,
      usableDate: stats.jobsWithUsableDate,
      withinWindow: stats.jobsWithinWindow,
      outsideWindow: stats.jobsOutsideWindow,
      unknownDate: stats.jobsUnknownDate,
      futureDate: stats.jobsFutureDate,
    },
    'RECENT_SWEEP_FILTERED'
  );

  if (eligible.length === 0) {
    log.info({ source: sourceName }, 'RECENT_SWEEP_COMPLETED no eligible candidates within window');
    return stats;
  }

  // 3. Feed eligible candidates through the existing pipeline with RECENT_JOB reason.
  //    CRITICAL: isCompleteScan = FALSE — we are passing a filtered SUBSET of the
  //    source listing. Absence reconciliation MUST NOT run on a subset to prevent
  //    legitimate active jobs being incorrectly marked CLOSED.
  try {
    const pipelineStats = await runPipeline(
      eligible,
      companyId,
      sourceConfig,
      false, // isCompleteScan: MUST remain false for a filtered subset
      { discoveryReason: 'RECENT_JOB' }
    );

    stats.verified = pipelineStats.verified;
    stats.failed = pipelineStats.failed;
    stats.pending = pipelineStats.pending;
    stats.skipped = pipelineStats.skipped;
  } catch (err) {
    log.error(
      { source: sourceName, err: err instanceof Error ? err.message : String(err) },
      'RECENT_SWEEP_PIPELINE_ERROR pipeline threw for recent candidates'
    );
  }

  log.info(
    {
      source: sourceName,
      fetched: stats.jobsFetched,
      withinWindow: stats.jobsWithinWindow,
      verified: stats.verified,
      failed: stats.failed,
      pending: stats.pending,
      skipped: stats.skipped,
    },
    'RECENT_SWEEP_COMPLETED'
  );

  return stats;
}
