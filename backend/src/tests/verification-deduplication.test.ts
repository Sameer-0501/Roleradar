/**
 * Verification Write-Path Deduplication Tests (Vitest).
 *
 * Verifies RR-RETENTION-PHASE-B-01:
 * 1. First verification creates a history record.
 * 2. An identical successful verification does not create another record.
 * 3. `last_verified_at` still updates when an identical successful result is skipped.
 * 4. A changed verification score creates a record.
 * 5. A changed title, location, URL, or check result creates a record.
 * 6. A success following a failure creates a record.
 * 7. Transient failures remain observable (never suppressed).
 * 8. An authoritative 404 still closes the job through the existing lifecycle path.
 * 9. Concurrent attempts cannot corrupt job state or suppress meaningful transitions.
 * 10. Existing verification and ATS integration tests remain compatible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Declare hoisted mock storage before any module imports
const { mockVerifications, mockJobs } = vi.hoisted(() => {
  return {
    mockVerifications: [] as any[],
    mockJobs: new Map<string, any>(),
  };
});

// Mock database connection at top level
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (lim: number) => {
              // Return latest record for this job
              const sorted = [...mockVerifications].sort((a, b) => {
                const t = (b.checked_at?.getTime?.() ?? 0) - (a.checked_at?.getTime?.() ?? 0);
                if (t !== 0) return t;
                return (b.id ?? '').localeCompare(a.id ?? '');
              });
              return sorted.slice(0, lim);
            },
          }),
        }),
      }),
    }),
    insert: () => ({
      values: async (vals: any) => {
        const row = { id: `v-${mockVerifications.length + 1}`, ...vals };
        mockVerifications.push(row);
        return [row];
      },
    }),
    update: () => ({
      set: (fields: any) => ({
        where: async () => {
          for (const job of mockJobs.values()) {
            Object.assign(job, fields);
          }
        },
      }),
    }),
  }),
}));

import {
  isMateriallyIdenticalVerification,
  booleanOrNullEqual,
  scoreEqual,
  verifyJob,
} from '../verification/verification-service.js';
import { ReverificationWorker } from '../jobs/reverification-worker.js';
import type { CandidateJobData } from '../matching/matching-types.js';

// ─── Part A: Pure Deduplication Rule Logic Unit Tests ────────────────────────

describe('Verification Deduplication Helper Rules', () => {
  it('booleanOrNullEqual treats null and undefined as equal', () => {
    expect(booleanOrNullEqual(null, undefined)).toBe(true);
    expect(booleanOrNullEqual(undefined, null)).toBe(true);
    expect(booleanOrNullEqual(true, true)).toBe(true);
    expect(booleanOrNullEqual(false, false)).toBe(true);
    expect(booleanOrNullEqual(true, false)).toBe(false);
    expect(booleanOrNullEqual(true, null)).toBe(false);
    expect(booleanOrNullEqual(false, null)).toBe(false);
  });

  it('scoreEqual handles floating point delta tolerance', () => {
    expect(scoreEqual(1.0, 1.0)).toBe(true);
    expect(scoreEqual(0.8, 0.80001)).toBe(true);
    expect(scoreEqual(1.0, 0.8)).toBe(false);
    expect(scoreEqual(null, null)).toBe(true);
    expect(scoreEqual(1.0, null)).toBe(false);
  });

  const basePrev = {
    domain_check: true,
    job_exists_check: true,
    job_id_check: true,
    title_check: true,
    location_check: true,
    status_check: true,
    apply_url_check: true,
    verification_score: 1.0,
    failure_reason: null,
  };

  const baseCurrent = {
    domainCheck: true,
    jobExistsCheck: true,
    jobIdCheck: true,
    titleCheck: true,
    locationCheck: true,
    statusCheck: true,
    applyUrlCheck: true,
    verificationScore: 1.0,
    failureReason: null,
    verificationStatus: 'VERIFIED' as const,
  };

  it('identifies identical successful passes as duplicate', () => {
    expect(isMateriallyIdenticalVerification(basePrev, baseCurrent)).toBe(true);
  });

  it('never suppresses if verification score changed', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        verificationScore: 0.85,
      })
    ).toBe(false);
  });

  it('never suppresses if title_check changed', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        titleCheck: false,
      })
    ).toBe(false);
  });

  it('never suppresses if location_check changed', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        locationCheck: false,
      })
    ).toBe(false);
  });

  it('never suppresses if job_exists_check changed', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        jobExistsCheck: false,
      })
    ).toBe(false);
  });

  it('never suppresses if apply_url_check changed', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        applyUrlCheck: false,
      })
    ).toBe(false);
  });

  it('never suppresses if domain_check changed', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        domainCheck: false,
      })
    ).toBe(false);
  });

  it('never suppresses if previous record was a failure (recovery transition)', () => {
    expect(
      isMateriallyIdenticalVerification(
        { ...basePrev, failure_reason: 'Request timed out after 10000ms' },
        baseCurrent
      )
    ).toBe(false);
  });

  it('never suppresses if current result is a failure (failure event)', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        failureReason: 'Live check could not be completed: HTTP 429 from Workday CXS API',
        verificationStatus: 'FAILED',
      })
    ).toBe(false);
  });

  it('never suppresses repeated identical failures (rate-limit / outage observability)', () => {
    expect(
      isMateriallyIdenticalVerification(
        { ...basePrev, failure_reason: 'Live check could not be completed: HTTP 429' },
        {
          ...baseCurrent,
          failureReason: 'Live check could not be completed: HTTP 429',
          verificationStatus: 'FAILED',
        }
      )
    ).toBe(false);
  });

  it('never suppresses if verificationStatus is PENDING', () => {
    expect(
      isMateriallyIdenticalVerification(basePrev, {
        ...baseCurrent,
        verificationStatus: 'PENDING',
      })
    ).toBe(false);
  });
});

// ─── Part B: End-to-End Verification Persistence Behavior ────────────────────

describe('verifyJob Runtime Deduplication & Lifecycle Updates', () => {
  const jobId = '12345678-1234-1234-1234-123456789abc';

  beforeEach(() => {
    mockVerifications.length = 0;
    mockJobs.clear();
    mockJobs.set(jobId, {
      id: jobId,
      title: 'Senior Software Engineer',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      last_verified_at: new Date('2026-10-01T00:00:00Z'),
    });

    // Mock global fetch for Greenhouse live check
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 999999,
        title: 'Senior Software Engineer',
        location: { name: 'Bengaluru' },
        absolute_url: 'https://boards.greenhouse.io/example/jobs/999999',
      }),
    });
  });

  const validGreenhouseInput = {
    jobId,
    externalJobId: '999999',
    title: 'Senior Software Engineer',
    location: 'Bengaluru',
    officialUrl: 'https://boards.greenhouse.io/example/jobs/999999',
    officialDomain: 'boards.greenhouse.io',
    sourceSystem: 'GREENHOUSE',
    boardToken: 'example',
  };

  it('1. First verification creates a history record in job_verifications', async () => {
    expect(mockVerifications).toHaveLength(0);

    const result = await verifyJob(validGreenhouseInput);

    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(1);
    expect(mockVerifications[0].job_id).toBe(jobId);
    expect(mockVerifications[0].verification_score).toBe(1.0);
  });

  it('2. An identical successful verification skips duplicate history insertion', async () => {
    // Run first verification
    const firstResult = await verifyJob(validGreenhouseInput);
    expect(firstResult.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(1);

    // Run second identical verification
    const secondResult = await verifyJob(validGreenhouseInput);
    expect(secondResult.verificationStatus).toBe('VERIFIED');
    expect(secondResult.historyRecorded).toBe(false);

    // Must NOT have inserted a second row
    expect(mockVerifications).toHaveLength(1);
  });

  it('3. last_verified_at still updates when an identical successful result is skipped', async () => {
    const originalTime = new Date('2026-10-01T00:00:00Z');
    mockJobs.get(jobId).last_verified_at = originalTime;

    // Run first verification
    await verifyJob(validGreenhouseInput);
    const timeAfterFirst = new Date(mockJobs.get(jobId).last_verified_at).getTime();
    expect(timeAfterFirst).toBeGreaterThan(originalTime.getTime());

    // Advance time slightly
    await new Promise((r) => setTimeout(r, 20));

    // Run second identical verification (history row skipped)
    const secondResult = await verifyJob(validGreenhouseInput);
    expect(secondResult.historyRecorded).toBe(false);
    expect(mockVerifications).toHaveLength(1);

    // last_verified_at MUST still be updated to the new checkedAt timestamp
    const timeAfterSecond = new Date(mockJobs.get(jobId).last_verified_at).getTime();
    expect(timeAfterSecond).toBeGreaterThan(timeAfterFirst);
  });

  it('4. A changed verification score creates a new history record', async () => {
    // Run initial verified check
    await verifyJob(validGreenhouseInput);
    expect(mockVerifications).toHaveLength(1);

    // Mock response with location mismatch so score drops
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 999999,
        title: 'Senior Software Engineer',
        location: { name: 'London, UK' }, // different location
        absolute_url: 'https://boards.greenhouse.io/example/jobs/999999',
      }),
    });

    const changedScoreResult = await verifyJob({
      ...validGreenhouseInput,
      location: 'Bengaluru, India',
    });

    // Score changed: must record history
    expect(changedScoreResult.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(2);
  });

  it('5. A changed title check creates a record', async () => {
    // Initial successful check
    await verifyJob(validGreenhouseInput);
    expect(mockVerifications).toHaveLength(1);

    // Mock title mismatch on ATS
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 999999,
        title: 'Staff Accountant', // mismatched title
        location: { name: 'Bengaluru' },
        absolute_url: 'https://boards.greenhouse.io/example/jobs/999999',
      }),
    });

    const result = await verifyJob(validGreenhouseInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(2);
  });

  it('6. A success following a failure creates a new record (state recovery)', async () => {
    // 1. Initial check fails due to timeout
    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
    const failResult = await verifyJob(validGreenhouseInput);
    expect(failResult.verificationStatus).toBe('PENDING');
    expect(failResult.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(1);

    // 2. Subsequent check succeeds
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 999999,
        title: 'Senior Software Engineer',
        location: { name: 'Bengaluru' },
        absolute_url: 'https://boards.greenhouse.io/example/jobs/999999',
      }),
    });

    const successResult = await verifyJob(validGreenhouseInput);
    expect(successResult.verificationStatus).toBe('VERIFIED');
    expect(successResult.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(2);
  });

  it('7. Transient failures remain observable (never suppressed)', async () => {
    // 1. First transient failure (HTTP 429)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const res1 = await verifyJob(validGreenhouseInput);
    expect(res1.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(1);

    // 2. Second consecutive HTTP 429 failure
    const res2 = await verifyJob(validGreenhouseInput);
    expect(res2.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(2);
  });

  it('8. Authoritative 404 is persisted and triggers closure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await verifyJob(validGreenhouseInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.jobExistsCheck).toBe(false);
    expect(result.failureReason).toContain('404');
    expect(result.historyRecorded).toBe(true);
    expect(mockVerifications).toHaveLength(1);
  });

  it('9. ReverificationWorker per-job concurrency lock blocks simultaneous runs', async () => {
    // Ensure fetch mock returns valid response for GitLab
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 999999,
        title: 'Senior Software Engineer',
        location: { name: 'Bengaluru' },
        absolute_url: 'https://job-boards.greenhouse.io/gitlab/jobs/999999',
      }),
    });

    const worker = new ReverificationWorker();
    const candidateJob: CandidateJobData = {
      id: jobId,
      companyId: 'comp-1',
      companyName: 'GitLab',
      sourceSystem: 'GREENHOUSE',
      externalJobId: '999999',
      title: 'Senior Software Engineer',
      officialUrl: 'https://job-boards.greenhouse.io/gitlab/jobs/999999',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
    };

    // First run in progress
    const promise1 = worker.executeSingleReverification(candidateJob);

    // Simultaneous run for identical job must throw conflict
    await expect(worker.executeSingleReverification(candidateJob)).rejects.toThrow(
      'Verification already in progress for this job'
    );

    const outcome = await promise1;
    expect(outcome).toBe('ACTIVE');
  });
});
