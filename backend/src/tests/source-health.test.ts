/**
 * Source Health Tracker Tests
 *
 * Tests:
 * - Registration of sources
 * - Status transitions: HEALTHY, DEGRADED, UNAVAILABLE
 * - Preservation of lastSuccessfulScanAt across failure events
 * - Error recording and recovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sourceHealthTracker } from '../health/source-health.js';

describe('SourceHealthTracker', () => {
  beforeEach(() => {
    sourceHealthTracker.clear();
  });

  it('registers a source as HEALTHY initially', () => {
    sourceHealthTracker.registerSource('GitLab', 'GREENHOUSE');
    const record = sourceHealthTracker.get('GitLab', 'GREENHOUSE');

    expect(record).toBeDefined();
    expect(record?.company).toBe('GitLab');
    expect(record?.source).toBe('GREENHOUSE');
    expect(record?.status).toBe('HEALTHY');
    expect(record?.consecutiveFailures).toBe(0);
  });

  it('records scan start, scan success, and updates metrics', () => {
    const start = new Date('2026-08-27T10:00:00Z');
    const finish = new Date('2026-08-27T10:00:05Z');

    sourceHealthTracker.recordScanStart({
      company: 'Palantir',
      source: 'LEVER',
      startedAt: start,
    });

    sourceHealthTracker.recordScanSuccess({
      company: 'Palantir',
      source: 'LEVER',
      completedAt: finish,
      jobsDiscovered: 45,
      jobsVerified: 45,
      responseTimeMs: 320,
    });

    const record = sourceHealthTracker.get('Palantir', 'LEVER');
    expect(record?.status).toBe('HEALTHY');
    expect(record?.lastScanStartedAt).toBe(start.toISOString());
    expect(record?.lastScanCompletedAt).toBe(finish.toISOString());
    expect(record?.lastSuccessfulScanAt).toBe(finish.toISOString());
    expect(record?.jobsDiscovered).toBe(45);
    expect(record?.jobsVerified).toBe(45);
    expect(record?.responseTimeMs).toBe(320);
    expect(record?.errorMessage).toBeNull();
    expect(record?.consecutiveFailures).toBe(0);
  });

  it('transitions to DEGRADED on single scan failure and preserves lastSuccessfulScanAt', () => {
    const successTime = new Date('2026-08-27T10:00:00Z');
    const failTime = new Date('2026-08-27T10:30:00Z');

    sourceHealthTracker.recordScanSuccess({
      company: 'GitLab',
      source: 'GREENHOUSE',
      completedAt: successTime,
      jobsDiscovered: 218,
      jobsVerified: 218,
    });

    sourceHealthTracker.recordScanFailure({
      company: 'GitLab',
      source: 'GREENHOUSE',
      failedAt: failTime,
      errorMessage: 'HTTP 503 Service Unavailable',
    });

    const record = sourceHealthTracker.get('GitLab', 'GREENHOUSE');
    expect(record?.status).toBe('DEGRADED');
    expect(record?.consecutiveFailures).toBe(1);
    expect(record?.errorMessage).toBe('HTTP 503 Service Unavailable');
    expect(record?.lastSuccessfulScanAt).toBe(successTime.toISOString());
    expect(record?.lastFailureAt).toBe(failTime.toISOString());
    expect(record?.jobsDiscovered).toBe(218); // preserved from last successful scan
  });

  it('transitions to UNAVAILABLE on 2+ consecutive failures', () => {
    sourceHealthTracker.recordScanFailure({
      company: 'Palantir',
      source: 'LEVER',
      failedAt: new Date('2026-08-27T11:00:00Z'),
      errorMessage: 'Network timeout',
    });
    expect(sourceHealthTracker.get('Palantir', 'LEVER')?.status).toBe('DEGRADED');

    sourceHealthTracker.recordScanFailure({
      company: 'Palantir',
      source: 'LEVER',
      failedAt: new Date('2026-08-27T11:30:00Z'),
      errorMessage: 'Network timeout',
    });
    expect(sourceHealthTracker.get('Palantir', 'LEVER')?.status).toBe('UNAVAILABLE');
    expect(sourceHealthTracker.get('Palantir', 'LEVER')?.consecutiveFailures).toBe(2);
  });

  it('recovers from UNAVAILABLE back to HEALTHY on successful scan', () => {
    sourceHealthTracker.recordScanFailure({
      company: 'GitLab',
      source: 'GREENHOUSE',
      failedAt: new Date(),
      errorMessage: 'Error 1',
    });
    sourceHealthTracker.recordScanFailure({
      company: 'GitLab',
      source: 'GREENHOUSE',
      failedAt: new Date(),
      errorMessage: 'Error 2',
    });
    expect(sourceHealthTracker.get('GitLab', 'GREENHOUSE')?.status).toBe('UNAVAILABLE');

    sourceHealthTracker.recordScanSuccess({
      company: 'GitLab',
      source: 'GREENHOUSE',
      completedAt: new Date(),
      jobsDiscovered: 150,
      jobsVerified: 150,
    });

    const record = sourceHealthTracker.get('GitLab', 'GREENHOUSE');
    expect(record?.status).toBe('HEALTHY');
    expect(record?.consecutiveFailures).toBe(0);
    expect(record?.errorMessage).toBeNull();
  });

  it('getAll returns all registered sources', () => {
    sourceHealthTracker.registerSource('GitLab', 'GREENHOUSE');
    sourceHealthTracker.registerSource('Palantir', 'LEVER');

    const all = sourceHealthTracker.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.company).sort()).toEqual(['GitLab', 'Palantir']);
  });
});
