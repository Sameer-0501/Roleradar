/**
 * Source Health Tracker.
 *
 * Tracks the operational connectivity, health, and bounded backoff of each
 * job source (e.g. GitLab Greenhouse, Palantir Lever, Autodesk Workday).
 *
 * CRITICAL ARCHITECTURAL SEPARATION:
 * - Source Health: "Can our collector communicate reliably with the source?"
 * - Job Verification: "Does this specific job genuinely exist and pass authenticity checks?"
 *
 * INVARIANTS:
 * - A HEALTHY source does NOT automatically make jobs VERIFIED.
 * - A DEGRADED source does NOT invalidate previously verified jobs.
 * - An UNAVAILABLE source does NOT close existing jobs.
 * - Bounded backoff prevents hammering failing ATS endpoints during outages.
 */

import type { AtsType } from '../ats/types.js';

export type SourceHealthStatus = 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'UNAVAILABLE';

export interface SourceHealthRecord {
  company: string;
  source: AtsType;
  status: SourceHealthStatus;
  lastScanStartedAt?: string;
  lastScanCompletedAt?: string;
  lastSuccessfulScanAt?: string;
  lastFailureAt?: string;
  nextAllowedScanAt?: string;
  jobsDiscovered: number;
  jobsVerified: number;
  errorMessage: string | null;
  responseTimeMs?: number;
  lastScanDurationMs?: number;
  consecutiveFailures: number;
}

export interface RecordScanStartInput {
  company: string;
  source: AtsType;
  startedAt: Date;
}

export interface RecordScanSuccessInput {
  company: string;
  source: AtsType;
  completedAt: Date;
  jobsDiscovered: number;
  jobsVerified: number;
  responseTimeMs?: number;
  durationMs?: number;
}

export interface RecordScanFailureInput {
  company: string;
  source: AtsType;
  failedAt: Date;
  errorMessage: string;
  durationMs?: number;
}

export interface RecordHealthCheckInput {
  company: string;
  source: AtsType;
  healthy: boolean;
  message?: string;
  responseTimeMs?: number;
  checkedAt?: Date;
}

const BASE_BACKOFF_MS = 60_000; // 1 minute
const MAX_BACKOFF_MS = 30 * 60_000; // 30 minutes maximum backoff

export function calculateBackoffDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const factor = Math.pow(2, Math.min(consecutiveFailures - 1, 6));
  return Math.min(BASE_BACKOFF_MS * factor, MAX_BACKOFF_MS);
}

class SourceHealthTrackerClass {
  private records: Map<string, SourceHealthRecord> = new Map();

  private getKey(company: string, source: string): string {
    return `${company.toLowerCase()}:${source.toLowerCase()}`;
  }

  private getOrCreate(company: string, source: AtsType): SourceHealthRecord {
    const key = this.getKey(company, source);
    let record = this.records.get(key);
    if (!record) {
      record = {
        company,
        source,
        status: 'HEALTHY',
        jobsDiscovered: 0,
        jobsVerified: 0,
        errorMessage: null,
        consecutiveFailures: 0,
      };
      this.records.set(key, record);
    }
    return record;
  }

  /**
   * Register a source in the health tracker.
   */
  registerSource(company: string, source: AtsType): void {
    this.getOrCreate(company, source);
  }

  /**
   * Record the start of a scan run.
   */
  recordScanStart(input: RecordScanStartInput): void {
    const record = this.getOrCreate(input.company, input.source);
    record.lastScanStartedAt = input.startedAt.toISOString();
  }

  /**
   * Record a successful scan completion.
   */
  recordScanSuccess(input: RecordScanSuccessInput): void {
    const record = this.getOrCreate(input.company, input.source);
    record.lastScanCompletedAt = input.completedAt.toISOString();
    record.lastSuccessfulScanAt = input.completedAt.toISOString();
    record.nextAllowedScanAt = undefined;
    record.jobsDiscovered = input.jobsDiscovered;
    record.jobsVerified = input.jobsVerified;
    record.errorMessage = null;
    record.consecutiveFailures = 0;
    if (input.responseTimeMs !== undefined) {
      record.responseTimeMs = input.responseTimeMs;
    }
    if (input.durationMs !== undefined) {
      record.lastScanDurationMs = input.durationMs;
    }
    record.status = 'HEALTHY';
  }

  /**
   * Record a scan failure with bounded exponential backoff.
   */
  recordScanFailure(input: RecordScanFailureInput): void {
    const record = this.getOrCreate(input.company, input.source);
    record.lastScanCompletedAt = input.failedAt.toISOString();
    record.lastFailureAt = input.failedAt.toISOString();
    record.errorMessage = input.errorMessage;
    record.consecutiveFailures += 1;
    if (input.durationMs !== undefined) {
      record.lastScanDurationMs = input.durationMs;
    }

    const backoffMs = calculateBackoffDelayMs(record.consecutiveFailures);
    const nextAllowed = new Date(input.failedAt.getTime() + backoffMs);
    record.nextAllowedScanAt = nextAllowed.toISOString();

    // 1 -> DEGRADED, >=2 -> UNAVAILABLE
    if (record.consecutiveFailures >= 2) {
      record.status = 'UNAVAILABLE';
    } else {
      record.status = 'DEGRADED';
    }
  }

  /**
   * Check if a source is currently in a bounded backoff period.
   */
  isBackoffActive(company: string, source: AtsType, now: Date = new Date()): boolean {
    const record = this.records.get(this.getKey(company, source));
    if (!record || !record.nextAllowedScanAt) return false;
    return new Date(record.nextAllowedScanAt).getTime() > now.getTime();
  }

  /**
   * Get the next allowed scan timestamp for a source.
   */
  getNextAllowedScanAt(company: string, source: AtsType): Date | null {
    const record = this.records.get(this.getKey(company, source));
    if (!record || !record.nextAllowedScanAt) return null;
    return new Date(record.nextAllowedScanAt);
  }

  /**
   * Record the outcome of an independent health check probe.
   */
  recordHealthCheck(input: RecordHealthCheckInput): void {
    const record = this.getOrCreate(input.company, input.source);
    if (input.responseTimeMs !== undefined) {
      record.responseTimeMs = input.responseTimeMs;
    }

    if (input.healthy) {
      if (record.consecutiveFailures === 0) {
        record.status = 'HEALTHY';
      }
    } else {
      record.errorMessage = input.message ?? 'Health check probe failed';
      if (record.consecutiveFailures >= 2) {
        record.status = 'UNAVAILABLE';
      } else {
        record.status = 'DEGRADED';
      }
    }
  }

  /**
   * Get health status for all registered sources.
   */
  getAll(): SourceHealthRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get health status for a specific source.
   */
  get(company: string, source: AtsType): SourceHealthRecord | undefined {
    return this.records.get(this.getKey(company, source));
  }

  /**
   * Reset all records (useful for test isolation).
   */
  clear(): void {
    this.records.clear();
  }
}

export const sourceHealthTracker = new SourceHealthTrackerClass();
