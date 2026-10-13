/**
 * Background Job Re-Verification Worker.
 *
 * Periodically re-verifies existing ACTIVE + VERIFIED jobs to ensure
 * they remain open on official ATS sources and haven't been quietly closed.
 *
 * PRINCIPLES:
 * 1. Continuous Trust: Active jobs are periodically re-checked, prioritizing
 *    jobs with the oldest verification timestamp.
 * 2. Conservative Safety:
 *    - Authoritative HTTP 404 / removal -> transitions job to CLOSED.
 *    - Temporary failures (HTTP 429, 500, 502, 503, timeout) -> kept ACTIVE for retry.
 * 3. Bounded Overhead: Runs in small batches with polite request pacing.
 */

import { getJobsForReverification, markJobActive, markJobClosed } from './job-service.js';
import { verifyJob } from '../verification/verification-service.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { createLogger } from '../utils/logger.js';
import type { CandidateJobData } from '../matching/matching-types.js';

const log = createLogger('reverification-worker');

const DEFAULT_CYCLE_INTERVAL_MS = 10 * 60_000; // 10 minutes
const DEFAULT_BATCH_SIZE = 25;
const REVERIFICATION_AGE_THRESHOLD_HOURS = 12; // Re-verify jobs older than 12 hours

export interface ReverificationCycleStats {
  checked: number;
  confirmedActive: number;
  confirmedClosed: number;
  temporaryErrors: number;
}

export class ReverificationWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private intervalMs: number;
  private activeReverifications = new Set<string>();

  constructor(intervalMs: number = DEFAULT_CYCLE_INTERVAL_MS) {
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    log.info({ intervalMinutes: this.intervalMs / 60_000 }, 'Reverification worker started');

    this.timer = setInterval(() => {
      void this.runReverificationCycle();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Reverification worker stopped');
  }

  /**
   * Execute a single re-verification pass.
   */
  async runReverificationCycle(options?: {
    batchSize?: number;
    ageThresholdHours?: number;
  }): Promise<ReverificationCycleStats> {
    if (this.isProcessing) {
      log.warn('Re-verification cycle already in progress — skipping overlapping run');
      return { checked: 0, confirmedActive: 0, confirmedClosed: 0, temporaryErrors: 0 };
    }

    this.isProcessing = true;
    const stats: ReverificationCycleStats = {
      checked: 0,
      confirmedActive: 0,
      confirmedClosed: 0,
      temporaryErrors: 0,
    };

    try {
      const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
      const hours = options?.ageThresholdHours ?? REVERIFICATION_AGE_THRESHOLD_HOURS;
      const olderThan = new Date(Date.now() - hours * 60 * 60 * 1000);

      const jobsToRecheck = await getJobsForReverification({
        limit: batchSize,
        olderThanDate: olderThan,
      });

      if (jobsToRecheck.length === 0) {
        log.debug('No active jobs require re-verification at this time');
        return stats;
      }

      log.info({ count: jobsToRecheck.length }, 'REVERIFICATION_CYCLE started');

      for (const job of jobsToRecheck) {
        stats.checked++;
        try {
          const outcome = await this.executeSingleReverification(job);
          if (outcome === 'ACTIVE') stats.confirmedActive++;
          else if (outcome === 'CLOSED') stats.confirmedClosed++;
          else stats.temporaryErrors++;
        } catch (err) {
          if (err instanceof Error && err.message === 'Verification already in progress for this job') {
            log.debug({ jobId: job.id }, 'REVERIFICATION_SKIPPED already in progress via admin');
            continue;
          }
          stats.temporaryErrors++;
          log.error(
            { jobId: job.id, err: err instanceof Error ? err.message : String(err) },
            'REVERIFICATION_ERROR failed to re-verify job'
          );
        }
      }

      log.info(
        {
          checked: stats.checked,
          active: stats.confirmedActive,
          closed: stats.confirmedClosed,
          temporaryErrors: stats.temporaryErrors,
        },
        'REVERIFICATION_CYCLE completed'
      );
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'REVERIFICATION_CYCLE unexpected error'
      );
    } finally {
      this.isProcessing = false;
    }

    return stats;
  }

  private async reverifySingleJob(job: CandidateJobData): Promise<'ACTIVE' | 'CLOSED' | 'TEMPORARY_FAILURE'> {
    const catalogEntry = SOURCE_CATALOG.find(
      (s) => s.companyName.toLowerCase() === job.companyName.toLowerCase()
    );

    const officialDomain = catalogEntry?.officialDomain ?? new URL(job.officialUrl).hostname;
    let boardToken: string | undefined;
    let siteToken: string | undefined;
    let workdayConfig: any;
    let ashbyConfig: any;
    let workableConfig: any;
    let customConfig: any;

    if (catalogEntry) {
      if (catalogEntry.atsType === 'GREENHOUSE') {
        boardToken = (catalogEntry.config as any)?.boardToken;
      } else if (catalogEntry.atsType === 'LEVER') {
        siteToken = (catalogEntry.config as any)?.siteToken;
      } else if (catalogEntry.atsType === 'WORKDAY') {
        workdayConfig = catalogEntry.config;
      } else if (catalogEntry.atsType === 'ASHBY') {
        ashbyConfig = catalogEntry.config;
      } else if (catalogEntry.atsType === 'WORKABLE') {
        workableConfig = catalogEntry.config;
      } else if (catalogEntry.atsType === 'CUSTOM') {
        customConfig = catalogEntry.config;
      }
    }

    const verificationResult = await verifyJob({
      jobId: job.id,
      externalJobId: job.externalJobId,
      title: job.title,
      location: job.location ?? undefined,
      officialUrl: job.officialUrl,
      applyUrl: job.applyUrl ?? undefined,
      officialDomain,
      sourceSystem: job.sourceSystem,
      boardToken,
      siteToken,
      workdayConfig,
      ashbyConfig,
      workableConfig,
      customConfig,
    });

    if (verificationResult.verificationStatus === 'VERIFIED') {
      await markJobActive(job.id);
      log.debug({ jobId: job.id, title: job.title }, 'REVERIFIED confirmed active');
      return 'ACTIVE';
    }

    if (verificationResult.verificationStatus === 'FAILED') {
      const isConfirmedClosed =
        verificationResult.jobExistsCheck === false &&
        verificationResult.failureReason?.includes('404');

      if (isConfirmedClosed) {
        await markJobClosed(job.id);
        log.info(
          { jobId: job.id, title: job.title, reason: verificationResult.failureReason },
          'REVERIFIED_CLOSED job confirmed removed by source (404)'
        );
        return 'CLOSED';
      }

      // Non-404 failure: log but do not close (transient/data mismatch)
      log.warn(
        { jobId: job.id, reason: verificationResult.failureReason },
        'REVERIFIED_FAILED non-authoritative failure — kept ACTIVE for retry'
      );
      return 'TEMPORARY_FAILURE';
    }

    // PENDING / timeout / 5xx
    log.debug(
      { jobId: job.id, reason: verificationResult.failureReason },
      'REVERIFIED_PENDING temporary status'
    );
    return 'TEMPORARY_FAILURE';
  }

  // ── Admin Operation Exposure ──

  /**
   * Safely execute a re-verification for a single job, protected by a per-job lock
   * to prevent concurrent execution with the automated cycle or other admins.
   */
  async executeSingleReverification(job: CandidateJobData): Promise<'ACTIVE' | 'CLOSED' | 'TEMPORARY_FAILURE'> {
    if (this.activeReverifications.has(job.id)) {
      throw new Error('Verification already in progress for this job');
    }
    
    this.activeReverifications.add(job.id);
    try {
      return await this.reverifySingleJob(job);
    } finally {
      this.activeReverifications.delete(job.id);
    }
  }
}

export const reverificationWorker = new ReverificationWorker();
