/**
 * Async Semaphore for Concurrency Control.
 *
 * Implements Step 5 of the Network Consumption Optimization Master Plan.
 * Guarantees:
 * - Strict FIFO fairness (no starvation).
 * - Bounded concurrency (maximum N simultaneous acquisitions).
 * - Exception safety (release() is caller-safe in finally blocks).
 */

export class AsyncSemaphore {
  private currentCount = 0;
  private readonly maxConcurrency: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrency: number = 5) {
    if (maxConcurrency < 1) {
      throw new Error(`maxConcurrency must be at least 1, received ${maxConcurrency}`);
    }
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Acquire a permit. Resolves immediately if available, or waits in FIFO queue.
   */
  async acquire(): Promise<void> {
    if (this.currentCount < this.maxConcurrency) {
      this.currentCount++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a permit and unblock the next waiting task in FIFO order.
   */
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    } else {
      this.currentCount = Math.max(0, this.currentCount - 1);
    }
  }

  /**
   * Current number of acquired permits.
   */
  get activeCount(): number {
    return this.currentCount;
  }

  /**
   * Current number of waiting tasks in the queue.
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Maximum allowed concurrency.
   */
  get limit(): number {
    return this.maxConcurrency;
  }

  /**
   * Reset semaphore state (primarily for testing).
   */
  reset(): void {
    this.currentCount = 0;
    this.queue.length = 0;
  }
}
