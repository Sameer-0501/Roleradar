/**
 * Step 2: Safe Unchanged-Job Verification Policy & Freshness TTL Tests
 *
 * Verifies that:
 * 1. Brand-new jobs (isNew: true) ALWAYS undergo live verification.
 * 2. Changed jobs (contentChanged: true) ALWAYS undergo live re-verification.
 * 3. Existing active & verified jobs within Freshness TTL bypass redundant live verification.
 * 4. Expired Freshness TTL (>24h) forces periodic re-verification.
 * 5. Inactive or unverified jobs (PENDING, FAILED, CLOSED, UPDATED) ALWAYS undergo live verification.
 * 6. Explicit forceVerification flag forces live verification.
 * 7. Candidate presence tracking for absence reconciliation is preserved.
 * 8. Apply URL changes are captured by content_hash to prevent bypassing verification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'dotenv/config';
import type { JobCandidate } from '../collectors/types.js';

// Mock database connection so unit tests run in isolation
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
  }),
}));

// Mock DB and external services
vi.mock('../jobs/job-service.js', () => ({
  upsertDiscoveredJob: vi.fn(),
  markJobVerifying: vi.fn(),
  markJobActive: vi.fn(),
  markJobVerificationFailed: vi.fn(),
  markJobClosed: vi.fn(),
  reconcileAbsentJobs: vi.fn().mockResolvedValue({ checked: 1, closed: 0, skipped: 1 }),
}));

vi.mock('../verification/verification-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../verification/verification-service.js')>();
  return {
    ...actual,
    verifyJob: vi.fn(),
  };
});

vi.mock('../notifications/alert-service.js', () => ({
  evaluateAndCreateInstantAlerts: vi.fn().mockResolvedValue({
    evaluatedUsers: 0,
    matchedUsers: 0,
    createdNotifications: 0,
  }),
}));

import { runPipeline, VERIFICATION_FRESHNESS_TTL_HOURS } from '../pipeline/pipeline.js';
import {
  upsertDiscoveredJob,
  markJobVerifying,
  markJobActive,
  reconcileAbsentJobs,
} from '../jobs/job-service.js';
import { verifyJob, computeContentHash } from '../verification/verification-service.js';

function makeCandidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    externalJobId: 'job-step2-001',
    title: 'Staff Platform Engineer',
    location: 'Bangalore, India',
    officialUrl: 'https://job-boards.greenhouse.io/gitlab/jobs/job-step2-001',
    applyUrl: 'https://job-boards.greenhouse.io/gitlab/jobs/job-step2-001#apply',
    sourceSystem: 'GREENHOUSE',
    ...overrides,
  };
}

const SOURCE_CONFIG = {
  officialDomain: 'job-boards.greenhouse.io',
  boardToken: 'gitlab',
  sourceSystem: 'GREENHOUSE',
};
const COMPANY_ID = 'company-test-123';
const JOB_ID = 'job-uuid-step2-test';

describe('Step 2: Safe Unchanged-Job Verification Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Brand new job ALWAYS executes live verification', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: true,
      contentChanged: false,
      status: 'DISCOVERED',
      verificationStatus: 'PENDING',
      lastVerifiedAt: null,
    });

    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: true,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    expect(upsertDiscoveredJob).toHaveBeenCalledOnce();
    expect(markJobVerifying).toHaveBeenCalledWith(JOB_ID);
    expect(verifyJob).toHaveBeenCalledOnce();
    expect(markJobActive).toHaveBeenCalledWith(JOB_ID);
    expect(stats.verified).toBe(1);
  });

  it('2. Changed job (contentChanged: true) ALWAYS executes live re-verification', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: true,
      status: 'UPDATED',
      verificationStatus: 'PENDING',
      lastVerifiedAt: new Date(),
    });

    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: true,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate({ title: 'Principal Engineer' })], COMPANY_ID, SOURCE_CONFIG);

    expect(markJobVerifying).toHaveBeenCalledWith(JOB_ID);
    expect(verifyJob).toHaveBeenCalledOnce();
    expect(markJobActive).toHaveBeenCalledWith(JOB_ID);
    expect(stats.verified).toBe(1);
  });

  it('3. Unchanged active job within Freshness TTL skips live verification (ZERO HTTP calls)', async () => {
    const verifiedTenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: false,
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      lastVerifiedAt: verifiedTenMinutesAgo,
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    // Verified and active preserved
    expect(stats.verified).toBe(1);
    // Crucial: ZERO outbound calls and no redundant markJobVerifying
    expect(markJobVerifying).not.toHaveBeenCalled();
    expect(verifyJob).not.toHaveBeenCalled();
    expect(markJobActive).not.toHaveBeenCalled();
  });

  it('4. Unchanged active job with EXPIRED Freshness TTL (> 24h) triggers periodic re-verification', async () => {
    const verifiedTwentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: false,
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      lastVerifiedAt: verifiedTwentyFiveHoursAgo,
    });

    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: true,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    // TTL expired -> live re-verification ran
    expect(markJobVerifying).toHaveBeenCalledWith(JOB_ID);
    expect(verifyJob).toHaveBeenCalledOnce();
    expect(markJobActive).toHaveBeenCalledWith(JOB_ID);
    expect(stats.verified).toBe(1);
  });

  it('5. Existing job with non-ACTIVE status (e.g. CLOSED) forces live re-verification', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: false,
      status: 'CLOSED',
      verificationStatus: 'VERIFIED',
      lastVerifiedAt: new Date(),
    });

    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: true,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    expect(markJobVerifying).toHaveBeenCalledWith(JOB_ID);
    expect(verifyJob).toHaveBeenCalledOnce();
    expect(markJobActive).toHaveBeenCalledWith(JOB_ID);
    expect(stats.verified).toBe(1);
  });

  it('6. Existing job with non-VERIFIED verification_status (e.g. PENDING or FAILED) forces live verification', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: false,
      status: 'ACTIVE',
      verificationStatus: 'PENDING',
      lastVerifiedAt: new Date(),
    });

    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: true,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    expect(markJobVerifying).toHaveBeenCalledWith(JOB_ID);
    expect(verifyJob).toHaveBeenCalledOnce();
    expect(markJobActive).toHaveBeenCalledWith(JOB_ID);
    expect(stats.verified).toBe(1);
  });

  it('7. forceVerification flag overrides TTL reuse and forces live verification', async () => {
    const verifiedJustNow = new Date();

    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: false,
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      lastVerifiedAt: verifiedJustNow,
    });

    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: true,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline(
      [makeCandidate()],
      COMPANY_ID,
      SOURCE_CONFIG,
      false,
      { forceVerification: true }
    );

    expect(markJobVerifying).toHaveBeenCalledWith(JOB_ID);
    expect(verifyJob).toHaveBeenCalledOnce();
    expect(stats.verified).toBe(1);
  });

  it('8. Reused jobs are preserved in presentJobIds for absence reconciliation', async () => {
    const verifiedTenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const candidate = makeCandidate({ externalJobId: 'present-job-xyz' });

    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: 'present-job-uuid',
      isNew: false,
      contentChanged: false,
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      lastVerifiedAt: verifiedTenMinutesAgo,
    });

    await runPipeline([candidate], COMPANY_ID, SOURCE_CONFIG, true);

    expect(reconcileAbsentJobs).toHaveBeenCalledOnce();
    const passedPresentJobIds = vi.mocked(reconcileAbsentJobs).mock.calls[0]![2];
    expect(passedPresentJobIds.has('present-job-xyz')).toBe(true);
  });

  it('9. Safeguard 2: Apply URL changes alter computeContentHash to prevent bypass', () => {
    const base = {
      title: 'Senior Engineer',
      location: 'Remote',
      officialUrl: 'https://careers.example.com/job/101',
      applyUrl: 'https://careers.example.com/job/101/apply',
    };
    const same = { ...base };
    const changedApplyUrl = {
      ...base,
      applyUrl: 'https://careers.example.com/job/101/apply?source=linkedin',
    };

    expect(computeContentHash(base)).toBe(computeContentHash(same));
    expect(computeContentHash(base)).not.toBe(computeContentHash(changedApplyUrl));
  });
});
