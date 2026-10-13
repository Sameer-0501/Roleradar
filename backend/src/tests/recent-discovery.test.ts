/**
 * Rolling Recent-Job Discovery Unit Tests.
 *
 * Tests the three layers of recent-job discovery:
 *
 * Layer 1: filterCandidatesByRecentWindow (pure function)
 *   - Date confidence filtering (CONFIRMED / INFERRED / UNKNOWN)
 *   - Rolling window boundary conditions
 *   - Future-date exclusion
 *   - Null date exclusion
 *
 * Layer 2: runRecentSourceSweep (orchestrator)
 *   - Previously undiscovered job found in window → pipeline fires
 *   - Jobs outside window are excluded
 *   - isCompleteScan=false is enforced (no accidental absence closure)
 *   - Fetch errors do not throw, return zero stats
 *
 * Layer 3: posting-date-confidence module (pure)
 *   - CONFIRMED for Greenhouse / Lever
 *   - INFERRED for Workday / Custom
 *   - UNKNOWN for null dates regardless of source
 *   - isDateEligibleForRecentSweep: true for CONFIRMED/INFERRED, false for UNKNOWN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JobCandidate } from '../collectors/types.js';
import type { PipelineSourceConfig } from '../pipeline/pipeline.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../pipeline/pipeline.js', () => ({
  runPipeline: vi.fn().mockResolvedValue({
    total: 0,
    verified: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    closed: 0,
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  filterCandidatesByRecentWindow,
  runRecentSourceSweep,
} from '../pipeline/recent-source-sweep.js';
import { runPipeline } from '../pipeline/pipeline.js';
import {
  getPostingDateConfidence,
  isDateEligibleForRecentSweep,
} from '../jobs/posting-date-confidence.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-05T06:00:00.000Z');

function daysAgo(n: number, base: Date = NOW): Date {
  return new Date(base.getTime() - n * 24 * 60 * 60 * 1_000);
}

function daysFromNow(n: number, base: Date = NOW): Date {
  return new Date(base.getTime() + n * 24 * 60 * 60 * 1_000);
}

function makeCandidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    externalJobId: `job-${Math.random().toString(36).slice(2)}`,
    title: 'Software Engineer',
    location: 'Remote',
    officialUrl: 'https://job-boards.greenhouse.io/gitlab/jobs/12345',
    sourceSystem: 'GREENHOUSE',
    officialPostedAt: daysAgo(3),
    ...overrides,
  };
}

function makeMockCollector(candidates: JobCandidate[]) {
  return {
    discoverJobs: vi.fn().mockResolvedValue(candidates),
    getSourceName: vi.fn().mockReturnValue('Greenhouse Test Collector'),
    getSourceType: vi.fn().mockReturnValue('GREENHOUSE'),
    supports: vi.fn().mockReturnValue(true),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, message: 'ok', checkedAt: new Date() }),
    safeDiscover: vi.fn().mockResolvedValue(candidates),
  };
}

const SOURCE_CONFIG: PipelineSourceConfig = {
  officialDomain: 'job-boards.greenhouse.io',
  boardToken: 'gitlab',
  sourceSystem: 'GREENHOUSE',
};
const COMPANY_ID = 'company-uuid-test-1234';
const WINDOW_DAYS = 10;

// ─── Tests: PostingDateConfidence module ──────────────────────────────────────

describe('getPostingDateConfidence', () => {
  const someDate = daysAgo(3);

  it('returns CONFIRMED for GREENHOUSE with a date', () => {
    expect(getPostingDateConfidence('GREENHOUSE', someDate)).toBe('CONFIRMED');
  });

  it('returns CONFIRMED for LEVER with a date', () => {
    expect(getPostingDateConfidence('LEVER', someDate)).toBe('CONFIRMED');
  });

  it('returns INFERRED for WORKDAY with a date', () => {
    expect(getPostingDateConfidence('WORKDAY', someDate)).toBe('INFERRED');
  });

  it('returns INFERRED for CUSTOM with a date', () => {
    expect(getPostingDateConfidence('CUSTOM', someDate)).toBe('INFERRED');
  });

  it('returns INFERRED for unknown source strings with a date', () => {
    expect(getPostingDateConfidence('ASHBY', someDate)).toBe('INFERRED');
    expect(getPostingDateConfidence('WORKABLE', someDate)).toBe('INFERRED');
    expect(getPostingDateConfidence('SAP', someDate)).toBe('INFERRED');
  });

  it('returns UNKNOWN for null date regardless of source', () => {
    expect(getPostingDateConfidence('GREENHOUSE', null)).toBe('UNKNOWN');
    expect(getPostingDateConfidence('LEVER', null)).toBe('UNKNOWN');
    expect(getPostingDateConfidence('WORKDAY', null)).toBe('UNKNOWN');
    expect(getPostingDateConfidence('CUSTOM', null)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for undefined date regardless of source', () => {
    expect(getPostingDateConfidence('GREENHOUSE', undefined)).toBe('UNKNOWN');
  });

  it('is case-insensitive for source system string', () => {
    expect(getPostingDateConfidence('greenhouse', someDate)).toBe('CONFIRMED');
    expect(getPostingDateConfidence('lever', someDate)).toBe('CONFIRMED');
    expect(getPostingDateConfidence('workday', someDate)).toBe('INFERRED');
  });
});

describe('isDateEligibleForRecentSweep', () => {
  const someDate = daysAgo(3);

  it('returns true for CONFIRMED dates (Greenhouse, Lever)', () => {
    expect(isDateEligibleForRecentSweep('GREENHOUSE', someDate)).toBe(true);
    expect(isDateEligibleForRecentSweep('LEVER', someDate)).toBe(true);
  });

  it('returns true for INFERRED dates (Workday, Custom)', () => {
    expect(isDateEligibleForRecentSweep('WORKDAY', someDate)).toBe(true);
    expect(isDateEligibleForRecentSweep('CUSTOM', someDate)).toBe(true);
  });

  it('returns false for null dates (UNKNOWN confidence)', () => {
    expect(isDateEligibleForRecentSweep('GREENHOUSE', null)).toBe(false);
    expect(isDateEligibleForRecentSweep('WORKDAY', undefined)).toBe(false);
  });
});

// ─── Tests: filterCandidatesByRecentWindow (pure function) ────────────────────

describe('filterCandidatesByRecentWindow', () => {
  it('includes candidates within the window', () => {
    const candidates = [
      makeCandidate({ externalJobId: 'j1', officialPostedAt: daysAgo(1) }),
      makeCandidate({ externalJobId: 'j2', officialPostedAt: daysAgo(5) }),
      makeCandidate({ externalJobId: 'j3', officialPostedAt: daysAgo(10) }), // boundary
    ];
    const result = filterCandidatesByRecentWindow(candidates, WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(3);
    expect(result.outsideWindow).toBe(0);
    expect(result.unknownDate).toBe(0);
    expect(result.futureDate).toBe(0);
  });

  it('excludes candidates older than the window', () => {
    const candidates = [
      makeCandidate({ externalJobId: 'old1', officialPostedAt: daysAgo(11) }),
      makeCandidate({ externalJobId: 'old2', officialPostedAt: daysAgo(30) }),
      makeCandidate({ externalJobId: 'ok',   officialPostedAt: daysAgo(9) }),
    ];
    const result = filterCandidatesByRecentWindow(candidates, WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]!.externalJobId).toBe('ok');
    expect(result.outsideWindow).toBe(2);
  });

  it('excludes candidates with null officialPostedAt', () => {
    const candidates = [
      makeCandidate({ externalJobId: 'no-date', officialPostedAt: undefined }),
      makeCandidate({ externalJobId: 'has-date', officialPostedAt: daysAgo(3) }),
    ];
    const result = filterCandidatesByRecentWindow(candidates, WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(1);
    expect(result.unknownDate).toBe(1);
  });

  it('excludes candidates with future posting dates', () => {
    const candidates = [
      makeCandidate({ externalJobId: 'future', officialPostedAt: daysFromNow(2) }),
      makeCandidate({ externalJobId: 'present', officialPostedAt: daysAgo(1) }),
    ];
    const result = filterCandidatesByRecentWindow(candidates, WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(1);
    expect(result.futureDate).toBe(1);
    expect(result.eligible[0]!.externalJobId).toBe('present');
  });

  it('returns all zero counts and empty eligible for an empty input', () => {
    const result = filterCandidatesByRecentWindow([], WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(0);
    expect(result.unknownDate).toBe(0);
    expect(result.outsideWindow).toBe(0);
    expect(result.futureDate).toBe(0);
  });

  it('handles window boundary correctly: exactly 10 days ago is included', () => {
    const exactBoundary = daysAgo(10);
    const justOutside = new Date(exactBoundary.getTime() - 1); // 1ms before window start
    const candidates = [
      makeCandidate({ externalJobId: 'boundary', officialPostedAt: exactBoundary }),
      makeCandidate({ externalJobId: 'outside',  officialPostedAt: justOutside }),
    ];
    const result = filterCandidatesByRecentWindow(candidates, WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]!.externalJobId).toBe('boundary');
    expect(result.outsideWindow).toBe(1);
  });

  it('excludes Greenhouse candidates with null date (UNKNOWN confidence) even though source is CONFIRMED', () => {
    const candidates = [
      makeCandidate({ sourceSystem: 'GREENHOUSE', officialPostedAt: undefined }),
    ];
    const result = filterCandidatesByRecentWindow(candidates, WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(0);
    expect(result.unknownDate).toBe(1);
  });

  it('includes Workday INFERRED candidates within window', () => {
    const candidates = [
      makeCandidate({ sourceSystem: 'WORKDAY', officialPostedAt: daysAgo(4) }),
    ];
    const result = filterCandidatesByRecentWindow(candidates, WINDOW_DAYS, NOW);
    expect(result.eligible).toHaveLength(1);
  });
});

// ─── Tests: runRecentSourceSweep (orchestrator) ───────────────────────────────

describe('runRecentSourceSweep', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    vi.mocked(runPipeline).mockResolvedValue({
      total: 1,
      verified: 1,
      failed: 0,
      pending: 0,
      skipped: 0,
      closed: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('discovers a job not previously in the DB that was posted 3 days ago', async () => {
    // A job posted 3 days ago — RoleRadar never saw it before
    const freshJob = makeCandidate({
      externalJobId: 'newly-discovered-456',
      officialPostedAt: daysAgo(3),
    });
    const collector = makeMockCollector([freshJob]);

    const stats = await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    expect(stats.jobsFetched).toBe(1);
    expect(stats.jobsWithinWindow).toBe(1);
    expect(stats.verified).toBe(1); // pipeline verified it
    // Pipeline must be called with isCompleteScan=false and discoveryReason=RECENT_JOB
    expect(runPipeline).toHaveBeenCalledWith(
      [freshJob],
      COMPANY_ID,
      SOURCE_CONFIG,
      false,
      { discoveryReason: 'RECENT_JOB' }
    );
  });

  it('does NOT feed jobs older than the window to the pipeline', async () => {
    const oldJob = makeCandidate({
      externalJobId: 'old-job-789',
      officialPostedAt: daysAgo(15), // 15 days ago — outside 10-day window
    });
    const recentJob = makeCandidate({
      externalJobId: 'recent-job-abc',
      officialPostedAt: daysAgo(5),
    });
    const collector = makeMockCollector([oldJob, recentJob]);

    const stats = await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    expect(stats.jobsFetched).toBe(2);
    expect(stats.jobsWithinWindow).toBe(1);
    expect(stats.jobsOutsideWindow).toBe(1);
    // Pipeline should only receive the recent job
    expect(runPipeline).toHaveBeenCalledWith(
      [recentJob],
      COMPANY_ID,
      SOURCE_CONFIG,
      false,
      { discoveryReason: 'RECENT_JOB' }
    );
  });

  it('NEVER passes isCompleteScan=true to the pipeline (absence closure safety)', async () => {
    const job = makeCandidate({ officialPostedAt: daysAgo(2) });
    const collector = makeMockCollector([job]);

    await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    const pipelineCallArgs = vi.mocked(runPipeline).mock.calls[0];
    // 4th argument is isCompleteScan — must be false
    expect(pipelineCallArgs?.[3]).toBe(false);
  });

  it('always passes discoveryReason=RECENT_JOB to the pipeline', async () => {
    const job = makeCandidate({ officialPostedAt: daysAgo(2) });
    const collector = makeMockCollector([job]);

    await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    const pipelineCallArgs = vi.mocked(runPipeline).mock.calls[0];
    expect(pipelineCallArgs?.[4]).toEqual({ discoveryReason: 'RECENT_JOB' });
  });

  it('does not call the pipeline if no candidates fall within the window', async () => {
    const oldJob = makeCandidate({ officialPostedAt: daysAgo(20) });
    const collector = makeMockCollector([oldJob]);

    const stats = await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    expect(stats.jobsFetched).toBe(1);
    expect(stats.jobsWithinWindow).toBe(0);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it('does not call the pipeline if all candidates have null posting dates', async () => {
    const noDateJob1 = makeCandidate({ officialPostedAt: undefined });
    const noDateJob2 = makeCandidate({ officialPostedAt: undefined });
    const collector = makeMockCollector([noDateJob1, noDateJob2]);

    const stats = await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    expect(stats.jobsFetched).toBe(2);
    expect(stats.jobsUnknownDate).toBe(2);
    expect(stats.jobsWithinWindow).toBe(0);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it('handles collector fetch errors gracefully and returns zero stats', async () => {
    const errorCollector = {
      ...makeMockCollector([]),
      discoverJobs: vi.fn().mockRejectedValue(new Error('ATS API timeout')),
    };

    const stats = await runRecentSourceSweep(errorCollector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    expect(stats.jobsFetched).toBe(0);
    expect(stats.jobsWithinWindow).toBe(0);
    expect(runPipeline).not.toHaveBeenCalled();
    // Must not throw — sweep errors are contained
  });

  it('handles pipeline errors gracefully without propagating', async () => {
    vi.mocked(runPipeline).mockRejectedValue(new Error('DB connection lost'));
    const job = makeCandidate({ officialPostedAt: daysAgo(2) });
    const collector = makeMockCollector([job]);

    // Must not throw
    await expect(
      runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, { windowDays: WINDOW_DAYS })
    ).resolves.toBeDefined();
  });

  it('counts fetched/usableDate/unknownDate stats correctly', async () => {
    const candidates = [
      makeCandidate({ externalJobId: 'a', officialPostedAt: daysAgo(2) }),        // within window
      makeCandidate({ externalJobId: 'b', officialPostedAt: daysAgo(15) }),       // outside window
      makeCandidate({ externalJobId: 'c', officialPostedAt: undefined }),          // unknown date
      makeCandidate({ externalJobId: 'd', officialPostedAt: daysFromNow(1) }),     // future
    ];
    const collector = makeMockCollector(candidates);

    const stats = await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
    });

    expect(stats.jobsFetched).toBe(4);
    expect(stats.jobsWithinWindow).toBe(1);
    expect(stats.jobsOutsideWindow).toBe(1);
    expect(stats.jobsUnknownDate).toBe(1);
    expect(stats.jobsFutureDate).toBe(1);
    expect(stats.jobsWithUsableDate).toBe(3); // all except the null-date one
  });

  it('respects an explicit options.now anchor override', async () => {
    const customNow = new Date('2026-10-01T00:00:00.000Z');
    const job = makeCandidate({ officialPostedAt: new Date('2026-09-28T00:00:00.000Z') }); // 3 days before customNow
    const collector = makeMockCollector([job]);

    const stats = await runRecentSourceSweep(collector, COMPANY_ID, SOURCE_CONFIG, {
      windowDays: WINDOW_DAYS,
      now: customNow,
    });

    expect(stats.jobsWithinWindow).toBe(1);
  });
});
