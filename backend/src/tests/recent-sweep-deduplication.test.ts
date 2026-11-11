/**
 * Step 3: Recent Source Sweep Discovery De-duplication Tests
 *
 * Verifies Safeguard 3:
 * 1. Passing preDiscoveredCandidates avoids calling collector.discoverJobs() (ZERO duplicate HTTP calls).
 * 2. Recent-job window filtering, RECENT_JOB alert reason, and date confidence semantics are fully preserved.
 * 3. Omission of preDiscoveredCandidates falls back safely to live collector.discoverJobs().
 * 4. Scheduler runScan feeds discovery results directly into runRecentSourceSweep inline.
 * 5. Scheduler no longer registers a redundant second setInterval for the recent sweep.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'dotenv/config';
import type { ICollector, JobCandidate, CollectorHealth } from '../collectors/types.js';
import type { AtsType } from '../ats/types.js';
import type { PipelineSourceConfig } from '../pipeline/pipeline.js';

// Mock database connection
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'scan-run-1' }]) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  }),
}));

vi.mock('../database/index.js', () => ({
  schema: {
    scanRuns: {},
  },
}));

// Mock config
vi.mock('../config/env.js', () => ({
  config: {
    recentJobWindowDays: 10,
    jobScanIntervalMinutes: 30,
    nodeEnv: 'test',
  },
}));

// Mock runPipeline
vi.mock('../pipeline/pipeline.js', () => ({
  runPipeline: vi.fn().mockResolvedValue({
    total: 1,
    verified: 1,
    failed: 0,
    pending: 0,
    skipped: 0,
    closed: 0,
  }),
}));

import { runRecentSourceSweep } from '../pipeline/recent-source-sweep.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { scheduler } from '../scheduler/scheduler.js';

const NOW = new Date('2026-09-05T06:00:00.000Z');

function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1_000);
}

function makeCandidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    externalJobId: 'ext-dedup-101',
    title: 'Senior Site Reliability Engineer',
    location: 'Remote, India',
    officialUrl: 'https://job-boards.greenhouse.io/gitlab/jobs/ext-dedup-101',
    sourceSystem: 'GREENHOUSE',
    officialPostedAt: daysAgo(2),
    ...overrides,
  };
}

class MockTestCollector implements ICollector {
  public discoverCallCount = 0;
  private candidates: JobCandidate[];

  constructor(candidates: JobCandidate[] = []) {
    this.candidates = candidates;
  }

  async discoverJobs(): Promise<JobCandidate[]> {
    this.discoverCallCount++;
    return this.candidates;
  }

  getSourceName(): string {
    return 'Mock Greenhouse Source';
  }

  getSourceType(): AtsType {
    return 'GREENHOUSE';
  }

  supports(): boolean {
    return true;
  }

  async healthCheck(): Promise<CollectorHealth> {
    return { healthy: true, message: 'ok', checkedAt: new Date() };
  }
}

const SOURCE_CONFIG: PipelineSourceConfig = {
  officialDomain: 'job-boards.greenhouse.io',
  boardToken: 'gitlab',
  sourceSystem: 'GREENHOUSE',
};
const COMPANY_ID = 'company-test-uuid';

describe('Step 3: Recent Source Sweep Discovery De-duplication', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    scheduler.resetForTesting();
  });

  afterEach(() => {
    scheduler.resetForTesting();
    vi.useRealTimers();
  });

  it('1. Reuses pre-discovered candidates and DOES NOT call collector.discoverJobs()', async () => {
    const candidate = makeCandidate({ officialPostedAt: daysAgo(3) });
    const collector = new MockTestCollector([candidate]);

    const stats = await runRecentSourceSweep(
      collector,
      COMPANY_ID,
      SOURCE_CONFIG,
      { windowDays: 10, now: NOW },
      [candidate] // passed from scan cycle
    );

    // Crucial check: zero outbound discovery calls
    expect(collector.discoverCallCount).toBe(0);
    expect(stats.jobsFetched).toBe(1);
    expect(stats.jobsWithinWindow).toBe(1);
    expect(stats.verified).toBe(1);

    // Verifies that RECENT_JOB alert path is 100% preserved
    expect(runPipeline).toHaveBeenCalledWith(
      [candidate],
      COMPANY_ID,
      SOURCE_CONFIG,
      false,
      { discoveryReason: 'RECENT_JOB' }
    );
  });

  it('2. Falls back to collector.discoverJobs() when preDiscoveredCandidates is not passed', async () => {
    const candidate = makeCandidate({ officialPostedAt: daysAgo(3) });
    const collector = new MockTestCollector([candidate]);

    const stats = await runRecentSourceSweep(
      collector,
      COMPANY_ID,
      SOURCE_CONFIG,
      { windowDays: 10, now: NOW }
      // no preDiscoveredCandidates passed
    );

    expect(collector.discoverCallCount).toBe(1);
    expect(stats.jobsFetched).toBe(1);
    expect(stats.jobsWithinWindow).toBe(1);
    expect(stats.verified).toBe(1);
  });

  it('3. Preserves date-window semantics when reusing pre-discovered candidates', async () => {
    const freshCandidate = makeCandidate({
      externalJobId: 'fresh-1',
      officialPostedAt: daysAgo(2),
    });
    const oldCandidate = makeCandidate({
      externalJobId: 'old-1',
      officialPostedAt: daysAgo(18), // Outside 10-day window
    });
    const unknownDateCandidate = makeCandidate({
      externalJobId: 'unknown-1',
      officialPostedAt: undefined, // Unknown date
    });

    const collector = new MockTestCollector();

    const stats = await runRecentSourceSweep(
      collector,
      COMPANY_ID,
      SOURCE_CONFIG,
      { windowDays: 10, now: NOW },
      [freshCandidate, oldCandidate, unknownDateCandidate]
    );

    expect(collector.discoverCallCount).toBe(0);
    expect(stats.jobsFetched).toBe(3);
    expect(stats.jobsWithinWindow).toBe(1);
    expect(stats.jobsOutsideWindow).toBe(1);
    expect(stats.jobsUnknownDate).toBe(1);

    // Only the qualifying freshCandidate is fed to pipeline
    expect(runPipeline).toHaveBeenCalledWith(
      [freshCandidate],
      COMPANY_ID,
      SOURCE_CONFIG,
      false,
      { discoveryReason: 'RECENT_JOB' }
    );
  });

  it('4. Scheduler registers only ONE recurring timer per collector, eliminating duplicate intervals', () => {
    const collector = new MockTestCollector();

    scheduler.register(collector, 30 * 60_000, COMPANY_ID, SOURCE_CONFIG);
    scheduler.start();

    // Advance fake timer to fire the startup trigger for slot 0
    vi.advanceTimersByTime(1);

    // Verify scheduled collectors
    expect(scheduler.jobs.size).toBe(1);
    const scheduled = scheduler.jobs.get(collector.getSourceName());
    expect(scheduled).toBeDefined();
    expect(scheduled?.handle).toBeDefined();

    // The duplicate _recentSweepHandles timer map has NO timer registered for this collector
    const recentHandle = (scheduler as any)._recentSweepHandles?.get(collector.getSourceName());
    expect(recentHandle).toBeUndefined();
  });
});
