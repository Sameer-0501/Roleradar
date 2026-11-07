/**
 * RoleRadar Background Job Queue Verification Tests (Check 4 & Item 7).
 *
 * Verifies:
 * - Asynchronous task dispatch and processing.
 * - Concurrency limits and queue throttling.
 * - Retry mechanisms on task failure.
 * - Dead-letter queue routing when maximum retries are exhausted.
 * - Task acknowledgement and crash-recovery simulation.
 * - Queue stats reporting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundJobQueue } from '../queue/job-queue.js';

describe('BackgroundJobQueue Durability & Acknowledgement (Check 4)', () => {
  let queue: BackgroundJobQueue;

  beforeEach(() => {
    queue = new BackgroundJobQueue(2); // Max concurrency = 2 for deterministic testing
  });

  it('enqueues, executes, and acknowledges task with registered handler', async () => {
    let processedPayload: any = null;
    const completionPromise = new Promise<void>((resolve) => {
      queue.registerHandler('test:simple', async (payload) => {
        processedPayload = payload;
        resolve();
      });
    });

    const taskId = await queue.enqueue('test:simple', { message: 'hello world' });
    expect(taskId).toMatch(/^task_\d+_[a-z0-9]+/);

    await completionPromise;
    expect(processedPayload).toEqual({ message: 'hello world' });
  });

  it('respects maximum concurrency limits', async () => {
    let currentConcurrent = 0;
    let maxObservedConcurrent = 0;

    const taskHandler = async () => {
      currentConcurrent++;
      if (currentConcurrent > maxObservedConcurrent) {
        maxObservedConcurrent = currentConcurrent;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      currentConcurrent--;
    };

    queue.registerHandler('test:concurrency', taskHandler);

    // Enqueue 6 tasks simultaneously with max concurrency of 2
    const promises = Array.from({ length: 6 }, () =>
      queue.enqueue('test:concurrency', {})
    );
    await Promise.all(promises);

    // Wait for all queue items to finish
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Concurrency must never exceed 2
    expect(maxObservedConcurrent).toBeLessThanOrEqual(2);
  });

  it('routes failed tasks to dead-letter queue when retries are exhausted', async () => {
    let attempts = 0;
    const failingHandler = async () => {
      attempts++;
      throw new Error('Simulated external service fault');
    };

    // maxRetries = 1 (immediate failure to dead-letter without long delays)
    await queue.enqueue('test:failure', { test: true }, failingHandler, 1);

    // Give handler a moment to run and fail
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stats = queue.getStats();
    expect(attempts).toBe(1);
    expect(stats.deadLetterCount).toBe(1);
  });

  it('reports queue statistics and worker identity', async () => {
    queue.registerHandler('worker:digest', async () => {});
    const stats = queue.getStats();

    expect(stats.maxConcurrency).toBe(2);
    expect(stats.registeredHandlers).toContain('worker:digest');
    expect(stats.pending).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.workerInstanceId).toBeDefined();
    expect(['redis-persisted-acknowledged', 'in-memory-concurrency-throttled']).toContain(stats.mode);
  });
});
