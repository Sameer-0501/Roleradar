/**
 * Job Lifecycle Background Worker.
 *
 * Periodically executes the Job Lifecycle Sweep:
 * 1. Automatically transitions ACTIVE jobs older than config.jobMaxActiveDays (default: 30) to CLOSED.
 * 2. Safely prunes unreferenced CLOSED jobs older than config.jobPurgeRetentionDays (default: 60).
 *
 * Staggered Startup:
 * - Runs a single startup pass after 30 seconds to clean up any backlog without blocking boot.
 * - Thereafter runs on a periodic cadence (config.lifecycleWorkerIntervalMinutes, default: 6 hours).
 */

import { runJobLifecycleSweep } from './job-lifecycle-service.js';
import { config } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('job-lifecycle-worker');

const STARTUP_DELAY_MS = 30_000; // 30 seconds after server boot

export class JobLifecycleWorker {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const intervalMs = config.lifecycleWorkerIntervalMinutes * 60_000;
    log.info(
      { intervalMinutes: config.lifecycleWorkerIntervalMinutes, startupDelaySec: STARTUP_DELAY_MS / 1000 },
      'JobLifecycleWorker initialized'
    );

    // Staggered initial execution
    this.startupTimer = setTimeout(() => {
      void this.executeSweep('STARTUP');
    }, STARTUP_DELAY_MS);

    // Recurring interval
    this.timer = setInterval(() => {
      void this.executeSweep('SCHEDULED');
    }, intervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    log.info('JobLifecycleWorker stopped');
  }

  private async executeSweep(triggerReason: 'STARTUP' | 'SCHEDULED' | 'MANUAL'): Promise<void> {
    if (this.isProcessing) {
      log.warn({ triggerReason }, 'Lifecycle sweep already in progress — skipping overlapping run');
      return;
    }

    this.isProcessing = true;
    try {
      log.info({ triggerReason }, 'Triggering Job Lifecycle sweep');
      const result = await runJobLifecycleSweep();
      log.info(
        {
          triggerReason,
          closedCount: result.closedCount,
          purgedCount: result.purgedCount,
          durationMs: result.durationMs,
        },
        'Job Lifecycle sweep execution finished'
      );
    } catch (err) {
      log.error(
        { triggerReason, err: err instanceof Error ? err.message : String(err) },
        'Job Lifecycle sweep failed'
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /** Manual trigger for testing or admin endpoints */
  async triggerManualSweep(): Promise<void> {
    await this.executeSweep('MANUAL');
  }
}

export const jobLifecycleWorker = new JobLifecycleWorker();
