/**
 * Job Engine Scheduler.
 *
 * Manages periodic execution of job collectors. Each registered
 * collector runs on its own configurable interval with strict isolation,
 * concurrency locks to prevent overlapping scans, bounded exponential
 * backoff on failure, and crash recovery for stale scan records.
 *
 * Design rules:
 * - The scheduler does NOT run scans on startup (no immediate scan).
 * - Intervals must be >= 1 minute (enforced).
 * - Overlapping scans of the same collector are strictly blocked.
 * - A failure in one source (e.g. Greenhouse) never impacts another (e.g. Lever/Workday).
 * - Bounded backoff prevents hammering failing sources.
 * - Stale RUNNING scan runs from previous process crashes are cleaned up on startup.
 */

import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';
import { createLogger } from '../utils/logger.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { runRecentSourceSweep } from '../pipeline/recent-source-sweep.js';
import { evaluateAndCreateRecentJobAlerts } from '../notifications/alert-service.js';
import { sourceHealthTracker } from '../health/source-health.js';
import { config } from '../config/env.js';
import type { ScheduledJob, SchedulerState, SchedulerStatus } from './types.js';
import type { ICollector } from '../collectors/types.js';
import type { PipelineSourceConfig } from '../pipeline/pipeline.js';

const log = createLogger('scheduler');

const MIN_INTERVAL_MS = 60_000; // 1 minute minimum

class JobScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private activeScans: Set<string> = new Set();
  private _status: SchedulerStatus = 'stopped';
  /**
   * Timer handles for Recent Source Sweep intervals, keyed by collector name.
   * Stored separately from ScheduledJob.handle so the ScheduledJob type stays
   * unchanged and both handles can be independently cleared in stop().
   */
  private _recentSweepHandles: Map<string, ReturnType<typeof setInterval>> = new Map();
  /** Timer handle for the DB Reconciliation Sweep interval. */
  private _dbReconciliationHandle: ReturnType<typeof setInterval> | undefined = undefined;

  /**
   * Register a collector to run on a given interval.
   */
  register(
    collector: ICollector,
    intervalMs: number,
    companyId?: string,
    sourceConfig?: PipelineSourceConfig,
    companyName?: string
  ): void {
    const safeName = collector.getSourceName();
    const safeInterval = Math.max(intervalMs, MIN_INTERVAL_MS);

    if (safeInterval !== intervalMs) {
      log.warn(
        { name: safeName, requestedMs: intervalMs, enforcedMs: safeInterval },
        'Interval below minimum, enforcing 1 minute minimum'
      );
    }

    const resolvedCompanyName = companyName ?? safeName.split(' ')[0] ?? 'Unknown';

    this.jobs.set(safeName, {
      name: safeName,
      collector,
      intervalMs: safeInterval,
      companyId,
      companyName: resolvedCompanyName,
      sourceConfig,
    });

    sourceHealthTracker.registerSource(resolvedCompanyName, collector.getSourceType());

    log.info(
      { name: safeName, intervalMinutes: safeInterval / 60_000, company: resolvedCompanyName },
      'Collector registered with scheduler'
    );
  }

  /**
   * Recover any scan runs left in RUNNING state from a previous server crash.
   */
  async recoverStaleScanRuns(): Promise<number> {
    try {
      const db = getDb();
      const now = new Date();
      const updated = await db
        .update(schema.scanRuns)
        .set({
          status: 'FAILED',
          completed_at: now,
          error_message: 'Process restarted before scan completed (crash recovery)',
        })
        .where(eq(schema.scanRuns.status, 'RUNNING'))
        .returning({ id: schema.scanRuns.id });

      if (updated.length > 0) {
        log.warn(
          { count: updated.length },
          'CRASH_RECOVERY cleaned up orphaned RUNNING scan records'
        );
      }
      return updated.length;
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Failed to execute crash recovery for stale scan runs'
      );
      return 0;
    }
  }

  /** Start all registered scan jobs */
  start(): void {
    if (this._status === 'running') {
      log.warn('Scheduler already running — ignoring start()');
      return;
    }

    // Run crash recovery on startup
    void this.recoverStaleScanRuns();

    if (this.jobs.size === 0) {
      log.info('Scheduler started with no registered collectors (no scans will run)');
      this._status = 'running';
      return;
    }

    const STARTUP_STAGGER_MS = 3_000;
    // Normal scans occupy slots [0 .. jobs.size - 1].
    // Recent source sweeps use slots [jobs.size .. 2*jobs.size - 1] so they
    // all start after every normal startup scan has been queued.
    // DB reconciliation uses slot [2*jobs.size] (runs last).
    const recentSweepBaseSlot = this.jobs.size;
    const dbReconciliationSlot = this.jobs.size * 2;

    let startupIndex = 0;
    for (const [name, job] of this.jobs) {
      // 1. Queue a staggered startup scan so all collectors don't fire simultaneously.
      const startupDelay = startupIndex * STARTUP_STAGGER_MS;
      setTimeout(() => {
        void this.runScan(job);
      }, startupDelay);

      // 2. Register the normal recurring interval
      const handle = setInterval(() => {
        void this.runScan(job);
      }, job.intervalMs);

      // 3. Queue a staggered startup recent sweep (after all normal startup scans)
      const recentStartupDelay = (recentSweepBaseSlot + startupIndex) * STARTUP_STAGGER_MS;
      setTimeout(() => {
        void this.runRecentSweep(job);
      }, recentStartupDelay);

      // 4. Register the recent sweep recurring interval (same cadence as normal scan)
      const recentHandle = setInterval(() => {
        void this.runRecentSweep(job);
      }, job.intervalMs);

      this.jobs.set(name, { ...job, handle });
      // Store the recent sweep handle on a weakly-associated timer list
      this._recentSweepHandles.set(name, recentHandle);

      log.info(
        {
          name,
          intervalMinutes: job.intervalMs / 60_000,
          startupDelayMs: startupDelay,
          recentSweepStartupDelayMs: recentStartupDelay,
        },
        'SCAN_STARTED scheduled (startup scan + recent sweep queued with stagger)'
      );
      startupIndex++;
    }

    // 5. DB reconciliation sweep — runs on the same interval as jobScanIntervalMinutes
    //    but with a staggered startup after all collector slots.
    const dbReconciliationInterval = config.jobScanIntervalMinutes * 60_000;
    const dbReconciliationStartupDelay = dbReconciliationSlot * STARTUP_STAGGER_MS;
    setTimeout(() => {
      void this.runRecentDbReconciliation();
    }, dbReconciliationStartupDelay);
    this._dbReconciliationHandle = setInterval(() => {
      void this.runRecentDbReconciliation();
    }, dbReconciliationInterval);

    log.info(
      {
        dbReconciliationIntervalMinutes: config.jobScanIntervalMinutes,
        dbReconciliationStartupDelayMs: dbReconciliationStartupDelay,
      },
      'RECENT_DB_RECONCILIATION scheduled'
    );

    this._status = 'running';
    log.info({ jobCount: this.jobs.size }, 'Scheduler started');
  }

  /** Stop all scheduled scan jobs */
  stop(): void {
    if (this._status === 'stopped') {
      log.warn('Scheduler already stopped — ignoring stop()');
      return;
    }

    for (const [name, job] of this.jobs) {
      if (job.handle) {
        clearInterval(job.handle);
        this.jobs.set(name, { ...job, handle: undefined });
      }
      const recentHandle = this._recentSweepHandles.get(name);
      if (recentHandle) {
        clearInterval(recentHandle);
        this._recentSweepHandles.delete(name);
      }
    }

    if (this._dbReconciliationHandle) {
      clearInterval(this._dbReconciliationHandle);
      this._dbReconciliationHandle = undefined;
    }

    this._status = 'stopped';
    log.info('Scheduler stopped');
  }

  get status(): SchedulerStatus {
    return this._status;
  }

  getState(): SchedulerState {
    return {
      status: this._status,
      registeredJobs: this.jobs.size,
      jobs: Array.from(this.jobs.values()).map((j) => ({
        name: j.name,
        intervalMs: j.intervalMs,
        lastRunAt: j.lastRunAt,
        lastSuccessAt: j.lastSuccessAt,
      })),
    };
  }

  /**
   * Execute a single scan for a collector with complete isolation,
   * concurrency locking, and bounded backoff.
   */
  private async runScan(job: ScheduledJob, isManual: boolean = false): Promise<void> {
    const companyName = job.companyName ?? job.name.split(' ')[0] ?? 'Unknown';
    const sourceType = job.collector.getSourceType();

    // 1. Concurrency Lock: Check if a scan is already running for this collector
    if (this.activeScans.has(job.name)) {
      log.warn(
        { source: job.name, company: companyName },
        'SCAN_OVERLAP_BLOCKED scan already in progress for this source'
      );
      return;
    }

    // 2. Bounded Backoff: Check if source is currently backing off after repeated failures (automated runs only)
    if (!isManual && sourceHealthTracker.isBackoffActive(companyName, sourceType)) {
      const nextScan = sourceHealthTracker.getNextAllowedScanAt(companyName, sourceType);
      log.warn(
        { source: job.name, company: companyName, nextAllowedScanAt: nextScan?.toISOString() },
        'SCAN_BACKOFF_ACTIVE skipping scan during bounded backoff window'
      );
      return;
    }

    this.activeScans.add(job.name);
    const startMs = Date.now();
    const startedAt = new Date();

    try {
      log.info({ source: job.name, company: companyName }, 'SCAN_STARTED');
      this.jobs.set(job.name, { ...job, lastRunAt: startedAt });
      sourceHealthTracker.recordScanStart({ company: companyName, source: sourceType, startedAt });

      // Create scan_run record
      let scanRunId: string | null = null;
      try {
        const db = getDb();
        const [inserted] = await db
          .insert(schema.scanRuns)
          .values({
            source_type: sourceType,
            source_name: job.name,
            started_at: startedAt,
            status: 'RUNNING',
          })
          .returning({ id: schema.scanRuns.id });
        scanRunId = inserted?.id ?? null;
      } catch (err) {
        log.error(
          { source: job.name, err: err instanceof Error ? err.message : String(err) },
          'Failed to create scan_run record — skipping scan'
        );
        sourceHealthTracker.recordScanFailure({
          company: companyName,
          source: sourceType,
          failedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        });
        return;
      }

      let jobsDiscovered = 0;
      let jobsVerified = 0;
      let jobsRejected = 0;
      let errorMessage: string | null = null;

      try {
        log.info({ source: job.name }, 'SOURCE_CHECK running health check');
        const health = await job.collector.healthCheck();
        sourceHealthTracker.recordHealthCheck({
          company: companyName,
          source: sourceType,
          healthy: health.healthy,
          message: health.message,
          checkedAt: health.checkedAt,
        });

        if (!health.healthy) {
          log.warn(
            { source: job.name, reason: health.message },
            'SOURCE_CHECK health check failed — running discovery anyway'
          );
        }

        log.info({ source: job.name }, 'JOBS_DISCOVERED starting discovery');
        const candidates = await job.collector.discoverJobs();
        jobsDiscovered = candidates.length;
        log.info({ source: job.name, count: jobsDiscovered }, 'JOBS_DISCOVERED completed');

        // Run the pipeline with complete scan safety
        if (job.companyId && job.sourceConfig && candidates.length > 0) {
          const stats = await runPipeline(candidates, job.companyId, job.sourceConfig, true);
          jobsVerified = stats.verified;
          jobsRejected = stats.failed + stats.skipped;
        } else if (!job.companyId || !job.sourceConfig) {
          log.warn(
            { source: job.name },
            'SCAN no companyId or sourceConfig — discovery only, pipeline skipped'
          );
        }

        const updated = this.jobs.get(job.name);
        if (updated) {
          this.jobs.set(job.name, { ...updated, lastSuccessAt: new Date() });
        }

        const durationMs = Date.now() - startMs;
        sourceHealthTracker.recordScanSuccess({
          company: companyName,
          source: sourceType,
          completedAt: new Date(),
          jobsDiscovered,
          jobsVerified,
          durationMs,
        });
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startMs;
        log.error({ source: job.name, err: errorMessage, durationMs }, 'SCAN_COMPLETED with error');

        sourceHealthTracker.recordScanFailure({
          company: companyName,
          source: sourceType,
          failedAt: new Date(),
          errorMessage,
          durationMs,
        });
      }

      // Update scan_run record
      if (scanRunId) {
        try {
          const db = getDb();
          await db
            .update(schema.scanRuns)
            .set({
              completed_at: new Date(),
              status: errorMessage ? 'FAILED' : 'COMPLETED',
              jobs_discovered: jobsDiscovered,
              jobs_verified: jobsVerified,
              jobs_rejected: jobsRejected,
              error_message: errorMessage,
            })
            .where(eq(schema.scanRuns.id, scanRunId));
        } catch (updateErr) {
          log.error(
            { scanRunId, err: updateErr instanceof Error ? updateErr.message : String(updateErr) },
            'Failed to update scan_run record'
          );
        }
      }

      log.info(
        {
          source: job.name,
          discovered: jobsDiscovered,
          verified: jobsVerified,
          rejected: jobsRejected,
          durationMs: Date.now() - startMs,
          error: errorMessage ?? 'none',
        },
        'SCAN_COMPLETED'
      );
    } finally {
      this.activeScans.delete(job.name);
    }
  }

  /**
   * Manually trigger a single scan run (useful for testing and the dev API).
   */
  async triggerScan(collectorName: string): Promise<void> {
    const job = this.jobs.get(collectorName);
    if (!job) {
      throw new Error(`No collector registered with name: "${collectorName}"`);
    }
    await this.runScan(job, true);
  }

  /**
   * Execute the Recent Source Sweep for a single collector.
   *
   * CONCURRENCY RULE: Uses the SAME activeScans key (job.name) as runScan.
   * This guarantees that for any given collector, the normal scan and the
   * recent sweep are mutually exclusive — only one may run at a time.
   * If a normal scan is running, the recent sweep fires and immediately
   * returns (and vice versa). Different collectors remain fully independent.
   *
   * Backoff is intentionally NOT checked here: a recent sweep hitting a
   * briefly-failing source during backoff would be noisy. The normal scan
   * backoff already protects the source; we simply skip if locked.
   */
  private async runRecentSweep(job: ScheduledJob): Promise<void> {
    if (!job.companyId || !job.sourceConfig) {
      // No pipeline config — can't run sweep
      return;
    }

    // SHARED LOCK: same key as runScan — mutual exclusion per collector
    if (this.activeScans.has(job.name)) {
      log.warn(
        { source: job.name },
        'RECENT_SWEEP_BLOCKED normal scan in progress for this source — skipping sweep'
      );
      return;
    }

    this.activeScans.add(job.name);
    const startMs = Date.now();
    try {
      log.info({ source: job.name, windowDays: config.recentJobWindowDays }, 'RECENT_SWEEP_RUNNING');
      const stats = await runRecentSourceSweep(
        job.collector,
        job.companyId,
        job.sourceConfig,
        { windowDays: config.recentJobWindowDays }
      );
      log.info(
        {
          source: job.name,
          fetched: stats.jobsFetched,
          withinWindow: stats.jobsWithinWindow,
          verified: stats.verified,
          durationMs: Date.now() - startMs,
        },
        'RECENT_SWEEP_COMPLETED'
      );
    } catch (err) {
      log.error(
        {
          source: job.name,
          err: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        },
        'RECENT_SWEEP_ERROR'
      );
    } finally {
      this.activeScans.delete(job.name);
    }
  }

  /**
   * Execute the Recent DB Reconciliation Sweep.
   *
   * Queries the database for ACTIVE + VERIFIED jobs within the recent window
   * and evaluates each against all eligible users, creating any missing
   * INSTANT_JOB notifications. The existing unique constraint prevents
   * duplicate notifications.
   *
   * Uses its own '__recent_db__' activeScans key (independent of any collector
   * lock) because this sweep does not hit any external ATS API.
   */
  private async runRecentDbReconciliation(): Promise<void> {
    const lockKey = '__recent_db__';
    if (this.activeScans.has(lockKey)) {
      log.warn('RECENT_DB_RECONCILIATION_BLOCKED already running — skipping');
      return;
    }

    this.activeScans.add(lockKey);
    const startMs = Date.now();
    try {
      const result = await evaluateAndCreateRecentJobAlerts({
        windowDays: config.recentJobWindowDays,
      });
      log.info(
        {
          jobsEvaluated: result.jobsEvaluated,
          totalAlerts: result.totalAlerts,
          durationMs: Date.now() - startMs,
        },
        'RECENT_DB_RECONCILIATION_CYCLE_COMPLETED'
      );
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        },
        'RECENT_DB_RECONCILIATION_ERROR'
      );
    } finally {
      this.activeScans.delete(lockKey);
    }
  }

  /**
   * Reset all registered jobs and active scans.
   * FOR TESTING ONLY — never call this in production code.
   */
  resetForTesting(): void {
    this.stop();
    this.jobs.clear();
    this.activeScans.clear();
    this._recentSweepHandles.clear();
    this._dbReconciliationHandle = undefined;
  }
}

export const scheduler = new JobScheduler();
