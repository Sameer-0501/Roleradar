/**
 * Verification Retention Background Worker.
 *
 * Implements RR-RETENTION-PHASE-C-01.
 *
 * Runs bounded, restart-safe retention cycles with strict dry-run by default.
 * Prevents overlapping sweeps via an in-memory execution lock (`isProcessing`).
 */

import {
  runVerificationRetentionSweep,
  getOverallRetentionAudit,
  type RetentionCycleResult,
  type RetentionOptions,
  type RetentionSummaryStats,
} from './verification-retention-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('verification-retention-worker');

const STARTUP_DELAY_MS = 45_000; // 45 seconds after server boot
const DEFAULT_CADENCE_MS = 12 * 60 * 60 * 1000; // Run every 12 hours

export class VerificationRetentionWorker {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private currentCursorJobId: string | null = null;

  /**
   * Start scheduled worker cycles.
   * Default mode is strictly DRY-RUN (zero mutations).
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    log.info(
      { startupDelaySec: STARTUP_DELAY_MS / 1000, cadenceHours: DEFAULT_CADENCE_MS / (3600 * 1000) },
      'VerificationRetentionWorker initialized (strict dry-run mode)'
    );

    // Staggered startup pass (bounded candidate query, no full-table audit)
    this.startupTimer = setTimeout(() => {
      void this.executeSweep('STARTUP', { dryRun: true });
    }, STARTUP_DELAY_MS);

    // Periodic schedule (bounded candidate query, no full-table audit)
    this.timer = setInterval(() => {
      void this.executeSweep('SCHEDULED', { dryRun: true });
    }, DEFAULT_CADENCE_MS);
  }

  /**
   * Stop worker cycles cleanly on shutdown.
   */
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

    log.info('VerificationRetentionWorker stopped');
  }

  /**
   * Execute sweep with processing lock to prevent overlapping runs.
   * Automatically advances keyset cursor across batches and resets upon pass completion.
   */
  async executeSweep(
    triggerReason: 'STARTUP' | 'SCHEDULED' | 'MANUAL',
    options: RetentionOptions = {}
  ): Promise<RetentionCycleResult | null> {
    if (this.isProcessing) {
      log.warn(
        { triggerReason },
        'Retention sweep already in progress — skipping overlapping run'
      );
      return null;
    }

    this.isProcessing = true;
    try {
      const sweepOptions: RetentionOptions = {
        cursorJobId: options.cursorJobId !== undefined ? options.cursorJobId : this.currentCursorJobId,
        ...options,
      };

      log.info(
        { triggerReason, dryRun: sweepOptions.dryRun ?? true, cursorJobId: sweepOptions.cursorJobId },
        'Verification retention sweep cycle started'
      );

      const result = await runVerificationRetentionSweep(sweepOptions);

      // Advance or reset cursor lifecycle
      if (result.passCompleted) {
        log.info(
          { previousCursor: this.currentCursorJobId },
          'Verification retention backlog pass completed — cursor reset to start for next cycle'
        );
        this.currentCursorJobId = null;
      } else if (result.nextCursorJobId) {
        this.currentCursorJobId = result.nextCursorJobId;
      }

      log.info(
        {
          triggerReason,
          dryRun: result.dryRun,
          candidates: result.candidatesIdentified,
          nextCursorJobId: this.currentCursorJobId,
          passCompleted: result.passCompleted,
          chunksEvaluated: result.chunksEvaluated,
          jobsEvaluated: result.jobsEvaluated,
          deleted: result.deletedCount,
          skipped: result.skipped,
          skipReason: result.skipReason,
          durationMs: result.durationMs,
        },
        'Verification retention sweep cycle completed'
      );
      return result;
    } catch (err) {
      log.error(
        { triggerReason, err: err instanceof Error ? err.message : String(err) },
        'Verification retention sweep failed'
      );
      throw err;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manual dry-run trigger for verification or admin inspections.
   */
  async triggerDryRun(options: Omit<RetentionOptions, 'dryRun' | 'allowDeletion'> = {}): Promise<RetentionCycleResult | null> {
    return this.executeSweep('MANUAL', { ...options, dryRun: true, allowDeletion: false });
  }

  /**
   * Explicit global retention audit for manual diagnostics or administrative reviews.
   * Runs the full-table analysis on demand without executing in the routine scheduled loop.
   */
  async runGlobalAudit(options: RetentionOptions = {}): Promise<RetentionSummaryStats> {
    log.info('Explicit global retention audit requested');
    return getOverallRetentionAudit(options);
  }

  /**
   * Get current keyset cursor position.
   */
  getCursorPosition(): string | null {
    return this.currentCursorJobId;
  }

  /**
   * Reset keyset cursor to start of backlog.
   */
  resetCursor(): void {
    this.currentCursorJobId = null;
  }

  /**
   * Check if worker is currently running an active cycle.
   */
  isActive(): boolean {
    return this.isProcessing;
  }
}

export const verificationRetentionWorker = new VerificationRetentionWorker();
