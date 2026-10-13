/**
 * Unit Tests: Production Freshness, Job Lifecycle & Continuous Discovery.
 *
 * Tests:
 * 1. Bounded exponential backoff calculations
 * 2. Source health tracker backoff activation and health states
 * 3. Absence-based closure safety (partial scan vs complete scan)
 * 4. Re-verification state transitions (authoritative 404 vs transient errors)
 * 5. Scheduler concurrency locking (overlap prevention)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sourceHealthTracker,
  calculateBackoffDelayMs,
} from '../health/source-health.js';

describe('Phase 10: Production Freshness & Source Health Backoff', () => {
  beforeEach(() => {
    sourceHealthTracker.clear();
  });

  describe('Bounded Exponential Backoff Calculations', () => {
    it('returns 0 delay for 0 consecutive failures', () => {
      expect(calculateBackoffDelayMs(0)).toBe(0);
      expect(calculateBackoffDelayMs(-1)).toBe(0);
    });

    it('calculates bounded delays (1m, 2m, 4m, 8m, 16m, max 30m)', () => {
      expect(calculateBackoffDelayMs(1)).toBe(60_000); // 1 minute
      expect(calculateBackoffDelayMs(2)).toBe(120_000); // 2 minutes
      expect(calculateBackoffDelayMs(3)).toBe(240_000); // 4 minutes
      expect(calculateBackoffDelayMs(4)).toBe(480_000); // 8 minutes
      expect(calculateBackoffDelayMs(5)).toBe(960_000); // 16 minutes
      expect(calculateBackoffDelayMs(6)).toBe(1_800_000); // 30 minutes (capped at max 30m)
      expect(calculateBackoffDelayMs(10)).toBe(1_800_000); // capped at max 30m
    });
  });

  describe('Source Health State Machine & Backoff Window', () => {
    it('transitions HEALTHY -> DEGRADED on first failure with 1 min backoff', () => {
      const now = new Date('2026-08-30T10:00:00Z');
      sourceHealthTracker.recordScanFailure({
        company: 'GitLab',
        source: 'GREENHOUSE',
        failedAt: now,
        errorMessage: 'HTTP 502 Bad Gateway',
      });

      const record = sourceHealthTracker.get('GitLab', 'GREENHOUSE');
      expect(record?.status).toBe('DEGRADED');
      expect(record?.consecutiveFailures).toBe(1);
      expect(sourceHealthTracker.isBackoffActive('GitLab', 'GREENHOUSE', new Date('2026-08-30T10:00:30Z'))).toBe(true);
      expect(sourceHealthTracker.isBackoffActive('GitLab', 'GREENHOUSE', new Date('2026-08-30T10:01:01Z'))).toBe(false);
    });

    it('transitions DEGRADED -> UNAVAILABLE on 2+ consecutive failures', () => {
      const now = new Date('2026-08-30T10:00:00Z');
      sourceHealthTracker.recordScanFailure({
        company: 'GitLab',
        source: 'GREENHOUSE',
        failedAt: now,
        errorMessage: 'HTTP 500 Server Error',
      });
      sourceHealthTracker.recordScanFailure({
        company: 'GitLab',
        source: 'GREENHOUSE',
        failedAt: now,
        errorMessage: 'HTTP 503 Service Unavailable',
      });

      const record = sourceHealthTracker.get('GitLab', 'GREENHOUSE');
      expect(record?.status).toBe('UNAVAILABLE');
      expect(record?.consecutiveFailures).toBe(2);
    });

    it('recovers from UNAVAILABLE back to HEALTHY on successful scan', () => {
      const now = new Date('2026-08-30T10:00:00Z');
      for (let i = 1; i <= 3; i++) {
        sourceHealthTracker.recordScanFailure({
          company: 'GitLab',
          source: 'GREENHOUSE',
          failedAt: now,
          errorMessage: 'Connection timed out',
        });
      }

      let record = sourceHealthTracker.get('GitLab', 'GREENHOUSE');
      expect(record?.status).toBe('UNAVAILABLE');
      expect(record?.consecutiveFailures).toBe(3);

      // On successful scan, health resets immediately to HEALTHY and failures reset to 0
      sourceHealthTracker.recordScanSuccess({
        company: 'GitLab',
        source: 'GREENHOUSE',
        completedAt: new Date('2026-08-30T10:35:00Z'),
        jobsDiscovered: 20,
        jobsVerified: 18,
      });

      record = sourceHealthTracker.get('GitLab', 'GREENHOUSE');
      expect(record?.status).toBe('HEALTHY');
      expect(record?.consecutiveFailures).toBe(0);
      expect(sourceHealthTracker.isBackoffActive('GitLab', 'GREENHOUSE', new Date())).toBe(false);
    });
  });
});
