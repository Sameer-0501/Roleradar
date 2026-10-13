/**
 * Tests: Tiered Job Lifecycle Service
 *
 * Validates:
 * 1. autoCloseStaleJobs auto-transitions jobs older than cutoff to CLOSED
 * 2. pruneUnreferencedClosedJobs deletes ancient closed jobs with zero user interactions
 * 3. getJobLifecycleStats returns aggregated counts
 * 4. runJobLifecycleSweep runs both phases safely
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockExecute = vi.fn();

vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    select: mockSelect,
    execute: mockExecute,
  }),
}));

const {
  autoCloseStaleJobs,
  pruneUnreferencedClosedJobs,
  getJobLifecycleStats,
  runJobLifecycleSweep,
} = await import('../jobs/job-lifecycle-service.js');

describe('Tiered Job Lifecycle Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('autoCloseStaleJobs', () => {
    it('returns closedCount 0 when no stale active jobs exist', async () => {
      mockExecute.mockResolvedValueOnce({ rowCount: 0 });

      const result = await autoCloseStaleJobs({ maxActiveDays: 30 });
      expect(result.closedCount).toBe(0);
      expect(mockExecute).toHaveBeenCalledOnce();
    });

    it('updates stale jobs to CLOSED when older than maxActiveDays', async () => {
      mockExecute.mockResolvedValueOnce({ rowCount: 2 });

      const result = await autoCloseStaleJobs({ maxActiveDays: 30 });
      expect(result.closedCount).toBe(2);
      expect(mockExecute).toHaveBeenCalledOnce();
    });
  });

  describe('pruneUnreferencedClosedJobs', () => {
    it('executes safe pruning query excluding user-interacted jobs', async () => {
      mockExecute.mockResolvedValue({ rowCount: 5 });

      const result = await pruneUnreferencedClosedJobs({ purgeRetentionDays: 60 });
      expect(result.purgedCount).toBe(5);
      expect(mockExecute).toHaveBeenCalledOnce();
    });
  });

  describe('getJobLifecycleStats', () => {
    it('returns lifecycle metrics', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              total_jobs: 100,
              active_count: 70,
              closed_count: 30,
              active_within_14: 50,
              active_15_to_30: 15,
              active_older_than_30: 5,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ jobs_with_interactions: 12 }],
        });

      const stats = await getJobLifecycleStats();
      expect(stats.totalJobs).toBe(100);
      expect(stats.activeCount).toBe(70);
      expect(stats.closedCount).toBe(30);
      expect(stats.activeWithin14Days).toBe(50);
      expect(stats.active15to30Days).toBe(15);
      expect(stats.activeOlderThan30Days).toBe(5);
      expect(stats.jobsWithUserInteractions).toBe(12);
    });
  });

  describe('runJobLifecycleSweep', () => {
    it('runs autoClose and prune sequentially and returns telemetry', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'job-stale-1' }]),
        }),
      });
      mockExecute
        .mockResolvedValueOnce({ rowCount: 1 }) // auto-close
        .mockResolvedValueOnce({ rowCount: 0 }); // prune

      const result = await runJobLifecycleSweep({
        maxActiveDays: 30,
        purgeRetentionDays: 60,
      });

      expect(result.closedCount).toBe(1);
      expect(result.purgedCount).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });
  });
});
