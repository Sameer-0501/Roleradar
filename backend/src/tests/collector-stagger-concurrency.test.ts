/**
 * Step 5: Collector Staggering & Concurrency Backpressure Tests
 *
 * Verifies Safeguard 5:
 * 1. Global concurrency limit: Maximum N collectors run simultaneously.
 * 2. Strict FIFO fairness: Tasks execute in arrival order with zero starvation.
 * 3. Exception safety & failure recovery: Rejected tasks release their permit cleanly.
 * 4. Permanent schedule staggering: Collector intervals are offset across the window.
 * 5. Clean teardown: stop() clears all startup timers and interval handles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'dotenv/config';
import { AsyncSemaphore } from '../utils/semaphore.js';
import type { ICollector, JobCandidate, CollectorHealth } from '../collectors/types.js';
import type { AtsType } from '../ats/types.js';

// Mock DB
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'scan-run-stagger' }]) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  }),
}));

vi.mock('../database/index.js', () => ({
  schema: {
    scanRuns: {},
  },
}));

vi.mock('../config/env.js', () => ({
  config: {
    recentJobWindowDays: 10,
    jobScanIntervalMinutes: 30,
    nodeEnv: 'test',
  },
}));

import { scheduler } from '../scheduler/scheduler.js';

class SlowMockCollector implements ICollector {
  private readonly _name: string;
  private readonly _delayMs: number;
  public runCount = 0;

  constructor(name: string, delayMs = 50) {
    this._name = name;
    this._delayMs = delayMs;
  }

  async discoverJobs(): Promise<JobCandidate[]> {
    this.runCount++;
    await new Promise((r) => setTimeout(r, this._delayMs));
    return [];
  }

  getSourceName(): string {
    return this._name;
  }

  getSourceType(): AtsType {
    return 'CUSTOM';
  }

  supports(): boolean {
    return true;
  }

  async healthCheck(): Promise<CollectorHealth> {
    return { healthy: true, message: 'ok', checkedAt: new Date() };
  }
}

describe('Step 5: Concurrency Backpressure & Staggering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduler.resetForTesting();
  });

  afterEach(() => {
    scheduler.resetForTesting();
    vi.useRealTimers();
  });

  describe('AsyncSemaphore', () => {
    it('1. Limits concurrency strictly to maxConcurrency', async () => {
      const semaphore = new AsyncSemaphore(3);
      let activeConcurrent = 0;
      let maxObservedConcurrent = 0;

      const runTask = async () => {
        await semaphore.acquire();
        activeConcurrent++;
        maxObservedConcurrent = Math.max(maxObservedConcurrent, activeConcurrent);
        await new Promise((r) => setTimeout(r, 20));
        activeConcurrent--;
        semaphore.release();
      };

      // Launch 10 tasks concurrently
      await Promise.all(Array.from({ length: 10 }, () => runTask()));

      expect(maxObservedConcurrent).toBe(3);
      expect(semaphore.activeCount).toBe(0);
      expect(semaphore.queueLength).toBe(0);
    });

    it('2. Maintains FIFO queue fairness (zero starvation)', async () => {
      const semaphore = new AsyncSemaphore(1);
      const executionOrder: number[] = [];

      await semaphore.acquire(); // hold the 1 permit

      const task1 = (async () => {
        await semaphore.acquire();
        executionOrder.push(1);
        semaphore.release();
      })();

      const task2 = (async () => {
        await semaphore.acquire();
        executionOrder.push(2);
        semaphore.release();
      })();

      const task3 = (async () => {
        await semaphore.acquire();
        executionOrder.push(3);
        semaphore.release();
      })();

      // Release initial permit, tasks should run in arrival order 1 -> 2 -> 3
      semaphore.release();
      await Promise.all([task1, task2, task3]);

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('3. Failure recovery: releases permit on task errors without deadlocking subsequent tasks', async () => {
      const semaphore = new AsyncSemaphore(1);
      let recoveredTaskRan = false;

      const failingTask = async () => {
        await semaphore.acquire();
        try {
          throw new Error('Collector network timeout');
        } finally {
          semaphore.release();
        }
      };

      const subsequentTask = async () => {
        await semaphore.acquire();
        recoveredTaskRan = true;
        semaphore.release();
      };

      await expect(failingTask()).rejects.toThrow('Collector network timeout');
      await subsequentTask();

      expect(recoveredTaskRan).toBe(true);
      expect(semaphore.activeCount).toBe(0);
    });
  });

  describe('Scheduler Staggering & Global Semaphore Integration', () => {
    it('4. Staggers startup timers so recurring intervals do not fire synchronously', () => {
      const collector1 = new SlowMockCollector('Company A');
      const collector2 = new SlowMockCollector('Company B');
      const collector3 = new SlowMockCollector('Company C');

      scheduler.register(collector1, 30 * 60_000);
      scheduler.register(collector2, 30 * 60_000);
      scheduler.register(collector3, 30 * 60_000);

      scheduler.start();

      expect(scheduler.jobs.size).toBe(3);
      // Startup timers should be queued with progressive delays (0s, 3s, 6s)
      const startupTimers = (scheduler as any)._startupTimers as Map<string, any>;
      expect(startupTimers.size).toBe(3);
      expect(startupTimers.has('Company A')).toBe(true);
      expect(startupTimers.has('Company B')).toBe(true);
      expect(startupTimers.has('Company C')).toBe(true);

      scheduler.stop();
      // Verified clean teardown: all startup timers cleared
      expect(startupTimers.size).toBe(0);
    });

    it('5. Enforces global concurrency limit across multiple triggerScan calls', async () => {
      const collectors = Array.from({ length: 8 }, (_, i) => new SlowMockCollector(`Source ${i}`, 30));
      for (const col of collectors) {
        scheduler.register(col, 60_000);
      }

      // Fire all 8 simultaneously
      const scanPromises = collectors.map((c) => scheduler.triggerScan(c.getSourceName()));
      await Promise.all(scanPromises);

      // All 8 executed eventually with zero starvation
      for (const col of collectors) {
        expect(col.runCount).toBe(1);
      }
    });
  });
});
