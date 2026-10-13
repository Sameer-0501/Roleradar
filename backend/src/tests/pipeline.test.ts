/**
 * Pipeline Unit Tests
 *
 * Tests the pipeline orchestrator with mocked DB and mocked verification.
 * Tests: first discovery, duplicate scan, content change, URL rejection,
 * verification outcomes, closed-job safety.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JobCandidate } from '../collectors/types.js';

// ─── Mock all pipeline dependencies ──────────────────────────────────────────

vi.mock('../jobs/job-service.js', () => ({
  upsertDiscoveredJob: vi.fn(),
  markJobVerifying: vi.fn(),
  markJobActive: vi.fn(),
  markJobVerificationFailed: vi.fn(),
  markJobClosed: vi.fn(),
  reconcileAbsentJobs: vi.fn().mockResolvedValue({ checked: 0, closed: 0, skipped: 0 }),
}));

vi.mock('../verification/verification-service.js', () => ({
  verifyJob: vi.fn(),
}));

vi.mock('../notifications/alert-service.js', () => ({
  evaluateAndCreateInstantAlerts: vi.fn().mockResolvedValue({
    evaluatedUsers: 0,
    matchedUsers: 0,
    createdNotifications: 0,
  }),
}));

import { runPipeline } from '../pipeline/pipeline.js';
import {
  upsertDiscoveredJob,
  markJobVerifying,
  markJobActive,
  markJobVerificationFailed,
  markJobClosed,
} from '../jobs/job-service.js';
import { verifyJob } from '../verification/verification-service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    externalJobId: '8556658002',
    title: 'Software Engineer',
    location: 'Remote, Bangalore',
    officialUrl: 'https://job-boards.greenhouse.io/gitlab/jobs/8556658002',
    sourceSystem: 'GREENHOUSE',
    ...overrides,
  };
}

const SOURCE_CONFIG = {
  officialDomain: 'job-boards.greenhouse.io',
  boardToken: 'gitlab',
  sourceSystem: 'GREENHOUSE',
};
const COMPANY_ID = 'company-uuid-1234';
const JOB_ID = 'job-uuid-5678';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── First discovery → creates one record ──────────────────────────────
  it('creates a new record for a newly discovered job', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: true,
      contentChanged: false,
    });
    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: null,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    expect(upsertDiscoveredJob).toHaveBeenCalledOnce();
    expect(markJobVerifying).toHaveBeenCalledWith(JOB_ID);
    expect(markJobActive).toHaveBeenCalledWith(JOB_ID);
    expect(stats.verified).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.skipped).toBe(0);
  });

  // ── Second discovery → same result, no duplicate ──────────────────────
  it('processes an existing unchanged job without creating a duplicate', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: false,
    });
    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: null,
      statusCheck: true,
      applyUrlCheck: null,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    // upsertDiscoveredJob handles deduplication — still called once
    expect(upsertDiscoveredJob).toHaveBeenCalledOnce();
    // Still verified and marked active
    expect(markJobActive).toHaveBeenCalledWith(JOB_ID);
    expect(stats.verified).toBe(1);
  });

  // ── Content change ────────────────────────────────────────────────────
  it('processes a job with changed content — updates without creating duplicate', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: true,
    });
    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'VERIFIED',
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: null,
      statusCheck: true,
      applyUrlCheck: null,
      verificationScore: 1.0,
      failureReason: null,
      checkedAt: new Date(),
    });

    const changedCandidate = makeCandidate({ title: 'Software Engineer II' });
    const stats = await runPipeline([changedCandidate], COMPANY_ID, SOURCE_CONFIG);

    expect(upsertDiscoveredJob).toHaveBeenCalledOnce();
    expect(markJobActive).toHaveBeenCalledOnce();
    expect(stats.verified).toBe(1);
  });

  // ── URL validation rejection ─────────────────────────────────────────
  it('skips a candidate with an invalid URL without touching the DB', async () => {
    const invalidCandidate = makeCandidate({
      officialUrl: 'http://scam-site.com/jobs/123', // HTTP, wrong domain
    });

    const stats = await runPipeline([invalidCandidate], COMPANY_ID, SOURCE_CONFIG);

    expect(upsertDiscoveredJob).not.toHaveBeenCalled();
    expect(verifyJob).not.toHaveBeenCalled();
    expect(stats.skipped).toBe(1);
    expect(stats.verified).toBe(0);
  });

  // ── Verification FAILED ───────────────────────────────────────────────
  it('marks a job VERIFICATION_FAILED when verification fails', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: true,
      contentChanged: false,
    });
    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'FAILED',
      domainCheck: true,
      jobExistsCheck: false,
      jobIdCheck: false,
      titleCheck: false,
      locationCheck: null,
      statusCheck: false,
      applyUrlCheck: null,
      verificationScore: 0.2,
      failureReason: 'Job does not exist',
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    expect(markJobVerificationFailed).toHaveBeenCalledWith(JOB_ID, 'Job does not exist');
    expect(markJobActive).not.toHaveBeenCalled();
    expect(stats.failed).toBe(1);
  });

  // ── Confirmed 404 → CLOSED ────────────────────────────────────────────
  it('marks a job CLOSED when verification confirms 404 (authoritative removal)', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: false,
      contentChanged: false,
    });
    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'FAILED',
      domainCheck: true,
      jobExistsCheck: false,
      jobIdCheck: false,
      titleCheck: false,
      locationCheck: null,
      statusCheck: false,
      applyUrlCheck: null,
      verificationScore: 0,
      failureReason: 'Job 8556658002 returned HTTP 404 — confirmed closed or removed',
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    expect(markJobClosed).toHaveBeenCalledWith(JOB_ID);
    expect(markJobVerificationFailed).not.toHaveBeenCalled();
    expect(stats.failed).toBe(1);
  });

  // ── Verification PENDING ──────────────────────────────────────────────
  it('leaves a job as VERIFYING when verification is PENDING', async () => {
    vi.mocked(upsertDiscoveredJob).mockResolvedValueOnce({
      jobId: JOB_ID,
      isNew: true,
      contentChanged: false,
    });
    vi.mocked(verifyJob).mockResolvedValueOnce({
      verificationStatus: 'PENDING',
      domainCheck: true,
      jobExistsCheck: null,
      jobIdCheck: null,
      titleCheck: null,
      locationCheck: null,
      statusCheck: null,
      applyUrlCheck: null,
      verificationScore: 0,
      failureReason: 'Live check could not be completed: timeout',
      checkedAt: new Date(),
    });

    const stats = await runPipeline([makeCandidate()], COMPANY_ID, SOURCE_CONFIG);

    expect(markJobActive).not.toHaveBeenCalled();
    expect(markJobVerificationFailed).not.toHaveBeenCalled();
    expect(markJobClosed).not.toHaveBeenCalled();
    expect(stats.pending).toBe(1);
  });

  // ── Empty candidates ─────────────────────────────────────────────────
  it('returns zero stats for an empty candidates array', async () => {
    const stats = await runPipeline([], COMPANY_ID, SOURCE_CONFIG);

    expect(stats.total).toBe(0);
    expect(stats.verified).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(upsertDiscoveredJob).not.toHaveBeenCalled();
  });

  // ── Mixed results ────────────────────────────────────────────────────
  it('processes multiple candidates and returns accurate stats', async () => {
    const candidates = [
      makeCandidate({ externalJobId: '1', title: 'A' }),
      makeCandidate({ externalJobId: '2', officialUrl: 'https://scam.com/jobs/2' }), // bad URL
      makeCandidate({ externalJobId: '3', title: 'C' }),
    ];

    // Job 1: VERIFIED
    vi.mocked(upsertDiscoveredJob)
      .mockResolvedValueOnce({ jobId: 'id-1', isNew: true, contentChanged: false })
      .mockResolvedValueOnce({ jobId: 'id-3', isNew: true, contentChanged: false });

    vi.mocked(verifyJob)
      .mockResolvedValueOnce({
        verificationStatus: 'VERIFIED',
        domainCheck: true,
        jobExistsCheck: true,
        jobIdCheck: true,
        titleCheck: true,
        locationCheck: null,
        statusCheck: true,
        applyUrlCheck: null,
        verificationScore: 1,
        failureReason: null,
        checkedAt: new Date(),
      })
      .mockResolvedValueOnce({
        verificationStatus: 'FAILED',
        domainCheck: true,
        jobExistsCheck: false,
        jobIdCheck: false,
        titleCheck: false,
        locationCheck: null,
        statusCheck: false,
        applyUrlCheck: null,
        verificationScore: 0,
        failureReason: 'Checks failed',
        checkedAt: new Date(),
      });

    const stats = await runPipeline(candidates, COMPANY_ID, SOURCE_CONFIG);

    expect(stats.total).toBe(3);
    expect(stats.verified).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.skipped).toBe(1);
  });
});
