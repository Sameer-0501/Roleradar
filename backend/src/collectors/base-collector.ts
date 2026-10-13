/**
 * Abstract base collector.
 *
 * Provides common logging, error handling, and structure for
 * all concrete collector implementations. Future company-specific
 * collectors should extend this class.
 *
 * Example:
 *   class AcmeWorkdayCollector extends BaseCollector { ... }
 */

import type { JobCandidate, ICollector, CollectorHealth } from './types.js';
import type { AtsType } from '../ats/types.js';
import { createLogger } from '../utils/logger.js';

export abstract class BaseCollector implements ICollector {
  private _log: ReturnType<typeof createLogger> | null = null;

  /** Lazy logger — initialized on first access so subclasses can set fields before super() */
  protected get log() {
    if (!this._log) {
      this._log = createLogger(`collector:${this.getSourceName()}`);
    }
    return this._log;
  }

  abstract discoverJobs(): Promise<JobCandidate[]>;
  abstract getSourceName(): string;
  abstract getSourceType(): AtsType;
  abstract supports(companyName: string): boolean;

  /**
   * Default health check implementation. Override in subclasses
   * that have a meaningful connectivity check to perform.
   */
  async healthCheck(): Promise<CollectorHealth> {
    return {
      healthy: false,
      message: `${this.getSourceName()}: health check not implemented`,
      checkedAt: new Date(),
    };
  }


  /**
   * Safely execute discoverJobs with structured logging.
   * Returns an empty array on error so a single broken collector
   * does not halt the entire scan.
   */
  async safeDiscover(): Promise<JobCandidate[]> {
    this.log.info({ source: this.getSourceName() }, 'SOURCE_CHECK starting discovery');
    try {
      const candidates = await this.discoverJobs();
      this.log.info(
        { source: this.getSourceName(), count: candidates.length },
        'JOBS_DISCOVERED'
      );
      return candidates;
    } catch (err) {
      this.log.error(
        { source: this.getSourceName(), err: err instanceof Error ? err.message : String(err) },
        'COLLECTOR_ERROR discovery failed'
      );
      return [];
    }
  }
}
