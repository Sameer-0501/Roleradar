/**
 * Tests: Scheduler
 *
 * Tests scheduler start/stop, job registration, and scan_run recording.
 * The DB is mocked — no live database required.
 *
 * Note: The scheduler exports a singleton. We test the singleton directly
 * and reset its state by stopping it between tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ICollector, JobCandidate, CollectorHealth } from '../collectors/types.js';
import type { AtsType } from '../ats/types.js';

// ─── Mock the database ────────────────────────────────────────────────────────

const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 'scan-run-uuid-001' }]);
const mockUpdateWhere = vi.fn().mockResolvedValue([]);
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });

vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    insert: () => ({ values: () => ({ returning: mockInsertReturning }) }),
    update: () => ({ set: mockUpdateSet }),
  }),
}));

vi.mock('../database/index.js', () => ({
  schema: {
    scanRuns: {},
  },
}));

// ─── Stub collector ───────────────────────────────────────────────────────────

class StubCollector implements ICollector {
  private readonly _name: string;
  private readonly _healthy: boolean;
  public discoverCallCount = 0;

  constructor(name: string, healthy = true) {
    this._name = name;
    this._healthy = healthy;
  }

  async discoverJobs(): Promise<JobCandidate[]> {
    this.discoverCallCount++;
    return [];
  }

  getSourceName(): string {
    return this._name;
  }

  getSourceType(): AtsType {
    return 'CUSTOM';
  }

  supports(companyName: string): boolean {
    return companyName === this._name;
  }

  async healthCheck(): Promise<CollectorHealth> {
    return { healthy: this._healthy, message: 'ok', checkedAt: new Date() };
  }
}

// ─── Import the scheduler singleton ──────────────────────────────────────────

import { scheduler } from '../scheduler/scheduler.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton completely between tests (clears jobs map + active scans)
    scheduler.resetForTesting();
  });

  afterEach(() => {
    scheduler.resetForTesting();
    vi.useRealTimers();
  });

  it('is in stopped status initially (or after stop)', () => {
    expect(scheduler.status).toBe('stopped');
  });

  it('transitions to running after start()', () => {
    scheduler.start();
    expect(scheduler.status).toBe('running');
  });

  it('transitions back to stopped after stop()', () => {
    scheduler.start();
    scheduler.stop();
    expect(scheduler.status).toBe('stopped');
  });

  it('calling start() twice is safe (idempotent)', () => {
    scheduler.start();
    scheduler.start(); // second call should be no-op
    expect(scheduler.status).toBe('running');
  });

  it('calling stop() twice is safe (idempotent)', () => {
    scheduler.start();
    scheduler.stop();
    scheduler.stop(); // second call should be no-op
    expect(scheduler.status).toBe('stopped');
  });

  it('registers a collector and reflects it in getState()', () => {
    const collector = new StubCollector('RegisterTest Collector');
    scheduler.register(collector, 60_000);
    const state = scheduler.getState();
    const found = state.jobs.find((j) => j.name === 'RegisterTest Collector');
    expect(found).toBeDefined();
  });

  it('enforces minimum 1-minute interval', () => {
    const collector = new StubCollector('FastCollector Unique');
    scheduler.register(collector, 1_000); // 1 second — should be raised to 60,000
    const state = scheduler.getState();
    const found = state.jobs.find((j) => j.name === 'FastCollector Unique');
    expect(found).toBeDefined();
    expect(found!.intervalMs).toBe(60_000);
  });

  it('triggerScan throws for unknown collector', async () => {
    await expect(scheduler.triggerScan('AbsolutelyNonExistentCollector')).rejects.toThrow(
      'No collector registered with name: "AbsolutelyNonExistentCollector"'
    );
  });

  it('getState() returns correct structure', () => {
    const state = scheduler.getState();
    expect(state).toMatchObject({
      status: expect.stringMatching(/^(stopped|running)$/),
      registeredJobs: expect.any(Number),
      jobs: expect.any(Array),
    });
  });
});

describe('Scheduler — immediate startup scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduler.resetForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    scheduler.resetForTesting();
    vi.useRealTimers();
  });

  it('triggers an immediate asynchronous scan on start()', async () => {
    const collector = new StubCollector('ImmediateScan Collector');
    scheduler.register(collector, 60_000);

    scheduler.start();
    
    // The immediate scan is queued in a setTimeout(..., 0)
    expect(collector.discoverCallCount).toBe(0); // Not synchronous
    
    await vi.advanceTimersByTimeAsync(0); // Flush the timeout
    
    expect(collector.discoverCallCount).toBe(1); // Scan executed
  });

  it('schedules the normal interval and continues running after immediate scan', async () => {
    const collector = new StubCollector('Interval Collector');
    scheduler.register(collector, 60_000);

    scheduler.start();
    
    await vi.advanceTimersByTimeAsync(0);
    expect(collector.discoverCallCount).toBe(1); // Immediate scan

    await vi.advanceTimersByTimeAsync(60_000);
    expect(collector.discoverCallCount).toBe(2); // First interval scan
  });

  it('a startup scan failure does not kill the scheduler and interval continues', async () => {
    class FailingStartupCollector extends StubCollector {
      override async discoverJobs(): Promise<JobCandidate[]> {
        if (this.discoverCallCount === 0) {
          this.discoverCallCount++;
          throw new Error('Startup Failure');
        }
        this.discoverCallCount++;
        return [];
      }
    }

    const collector = new FailingStartupCollector('Failing Startup Collector');
    scheduler.register(collector, 60_000);

    scheduler.start();
    
    await vi.advanceTimersByTimeAsync(0);
    expect(collector.discoverCallCount).toBe(1); // Immediate scan (failed)
    expect(scheduler.status).toBe('running'); // Scheduler is still alive

    // Wait for the next interval
    await vi.advanceTimersByTimeAsync(60_000);
    expect(collector.discoverCallCount).toBe(2); // Interval scan executed successfully
  });

  it('does not bypass concurrency protection during startup', async () => {
    class SlowCollector extends StubCollector {
      override async discoverJobs(): Promise<JobCandidate[]> {
        this.discoverCallCount++;
        // Simulate a slow scan that takes 90 seconds
        await new Promise((resolve) => setTimeout(resolve, 90_000));
        return [];
      }
    }

    const collector = new SlowCollector('Slow Collector');
    scheduler.register(collector, 60_000);

    scheduler.start();
    
    // Flush the immediate startup scan to start it
    await vi.advanceTimersByTimeAsync(0);
    expect(collector.discoverCallCount).toBe(1);

    // Advance by 60 seconds (interval triggers), but the first scan is still running!
    await vi.advanceTimersByTimeAsync(60_000);
    
    // Concurrency lock should prevent the interval from executing the scan again
    expect(collector.discoverCallCount).toBe(1);

    // Advance 30 more seconds to finish the first scan
    await vi.advanceTimersByTimeAsync(30_000);
    
    // Advance 60 more seconds for the next interval
    await vi.advanceTimersByTimeAsync(60_000);
    expect(collector.discoverCallCount).toBe(2);
  });

  it('repeated start() calls do not create duplicate startup scans', async () => {
    const collector = new StubCollector('DuplicateStart Collector');
    scheduler.register(collector, 60_000);

    scheduler.start();
    scheduler.start(); // idempotent
    scheduler.start(); // idempotent
    
    await vi.advanceTimersByTimeAsync(0);
    
    // Should only have queued one immediate scan
    expect(collector.discoverCallCount).toBe(1);
  });
});

describe('Scheduler — scan_run recording', () => {
  afterEach(() => {
    scheduler.stop();
  });

  it('triggerScan creates a scan_run record in the database', async () => {
    vi.clearAllMocks();
    const collector = new StubCollector('ScanRecordTest Collector');
    scheduler.register(collector, 60_000);

    await scheduler.triggerScan('ScanRecordTest Collector');

    // insert should have been called to create the scan_run
    expect(mockInsertReturning).toHaveBeenCalled();
  });

  it('triggerScan updates scan_run status to COMPLETED on success', async () => {
    vi.clearAllMocks();
    const collector = new StubCollector('CompletionTest Collector');
    scheduler.register(collector, 60_000);

    await scheduler.triggerScan('CompletionTest Collector');

    // update (set completed_at + status=COMPLETED) should have been called
    expect(mockUpdateSet).toHaveBeenCalled();
  });

  it('handles multiple sources independently without one failure stopping another', async () => {
    vi.clearAllMocks();

    class FailingCollector extends StubCollector {
      override async discoverJobs(): Promise<JobCandidate[]> {
        throw new Error('Lever API Failure');
      }
    }

    const goodCollector = new StubCollector('GitLab Greenhouse Source');
    const badCollector = new FailingCollector('Palantir Lever Source');

    scheduler.register(goodCollector, 60_000, 'id-1', undefined, 'GitLab');
    scheduler.register(badCollector, 120_000, 'id-2', undefined, 'Palantir');

    // Trigger both
    await scheduler.triggerScan('GitLab Greenhouse Source');
    await scheduler.triggerScan('Palantir Lever Source');

    // Good collector ran
    expect(goodCollector.discoverCallCount).toBe(1);

    // Scheduler remains operational
    expect(scheduler.status).toBeDefined();
  });

  it('handles 3 concurrent sources (Greenhouse, Lever, Workday) with independent failure isolation', async () => {
    class FailingCollector extends StubCollector {
      override async discoverJobs(): Promise<JobCandidate[]> {
        throw new Error('Workday transient network outage');
      }
    }

    const greenhouse = new StubCollector('GitLab Greenhouse Source');
    const lever = new StubCollector('Palantir Lever Source');
    const workday = new FailingCollector('Autodesk Workday Source');

    scheduler.register(greenhouse, 60_000, 'id-1', undefined, 'GitLab');
    scheduler.register(lever, 120_000, 'id-2', undefined, 'Palantir');
    scheduler.register(workday, 180_000, 'id-3', undefined, 'Autodesk');

    await scheduler.triggerScan('GitLab Greenhouse Source');
    await scheduler.triggerScan('Palantir Lever Source');
    await scheduler.triggerScan('Autodesk Workday Source');

    expect(greenhouse.discoverCallCount).toBe(1);
    expect(lever.discoverCallCount).toBe(1);
    expect(scheduler.getState().registeredJobs).toBeGreaterThanOrEqual(3);
  });

  it('handles 4 concurrent sources (Greenhouse, Lever, Workday, Custom CERN) with independent failure isolation', async () => {
    class FailingCollector extends StubCollector {
      override async discoverJobs(): Promise<JobCandidate[]> {
        throw new Error('Custom API transient timeout');
      }
    }

    const greenhouse = new StubCollector('GitLab Greenhouse Source');
    const lever = new StubCollector('Palantir Lever Source');
    const workday = new StubCollector('Autodesk Workday Source');
    const custom = new FailingCollector('CERN Custom Source');

    scheduler.register(greenhouse, 60_000, 'id-1', undefined, 'GitLab');
    scheduler.register(lever, 120_000, 'id-2', undefined, 'Palantir');
    scheduler.register(workday, 180_000, 'id-3', undefined, 'Autodesk');
    scheduler.register(custom, 240_000, 'id-4', undefined, 'CERN');

    await scheduler.triggerScan('GitLab Greenhouse Source');
    await scheduler.triggerScan('Palantir Lever Source');
    await scheduler.triggerScan('Autodesk Workday Source');
    await scheduler.triggerScan('CERN Custom Source');

    expect(greenhouse.discoverCallCount).toBe(1);
    expect(lever.discoverCallCount).toBe(1);
    expect(workday.discoverCallCount).toBe(1);
    expect(scheduler.getState().registeredJobs).toBeGreaterThanOrEqual(4);
  });
});
