/**
 * Tests: Verification Service
 *
 * These tests exercise the verification logic in isolation.
 * No database connection required — we mock the DB insert.
 *
 * KEY INVARIANT TESTED:
 * A missing or unavailable official source must NEVER produce
 * a VERIFIED result. Phase 1 always returns PENDING or FAILED.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeContentHash } from '../verification/verification-service.js';

// Mock the database module so tests don't need a live DB
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  }),
}));

// Import after mocking
const { verifyJob } = await import('../verification/verification-service.js');

describe('computeContentHash', () => {
  it('produces a 64-char hex string (SHA-256)', () => {
    const hash = computeContentHash({ title: 'Software Engineer', location: 'Remote' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic — same input always produces same hash', () => {
    const input = { title: 'SDE', location: 'Bangalore', description: 'desc', requirements: 'req' };
    expect(computeContentHash(input)).toBe(computeContentHash(input));
  });

  it('changes when title changes', () => {
    const base = { title: 'Engineer', location: 'Pune' };
    const changed = { title: 'Senior Engineer', location: 'Pune' };
    expect(computeContentHash(base)).not.toBe(computeContentHash(changed));
  });

  it('changes when location changes', () => {
    const base = { title: 'Engineer', location: 'Pune' };
    const changed = { title: 'Engineer', location: 'Mumbai' };
    expect(computeContentHash(base)).not.toBe(computeContentHash(changed));
  });

  it('Finding #11 Test A: identical officialUrl yields same hash', () => {
    const base = { title: 'Eng', officialUrl: 'https://example.com/job' };
    const same = { title: 'Eng', officialUrl: 'https://example.com/job' };
    expect(computeContentHash(base)).toBe(computeContentHash(same));
  });

  it('Finding #11 Test B: changing officialUrl changes the hash', () => {
    const base = { title: 'Eng', officialUrl: 'https://example.com/job' };
    const changed = { title: 'Eng', officialUrl: 'https://example.com/job?ref=updated' };
    expect(computeContentHash(base)).not.toBe(computeContentHash(changed));
  });

  it('Finding #11 Test C: officialUrl normalises casing and whitespace', () => {
    const base = { title: 'Eng', officialUrl: 'https://example.com/job ' };
    const changed = { title: 'eng', officialUrl: 'HTTPS://EXAMPLE.COM/JOB' };
    expect(computeContentHash(base)).toBe(computeContentHash(changed));
  });

  it('is case-insensitive (normalises to lowercase)', () => {
    const upper = { title: 'ENGINEER', location: 'PUNE' };
    const lower = { title: 'engineer', location: 'pune' };
    expect(computeContentHash(upper)).toBe(computeContentHash(lower));
  });

  it('handles missing optional fields', () => {
    const hash = computeContentHash({ title: 'Engineer' });
    expect(hash).toHaveLength(64);
  });
});

describe('verifyJob — Phase 1 invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseInput = {
    jobId: 'test-job-id-123',
    externalJobId: 'EXT-001',
    title: 'Software Engineer',
    location: 'Remote',
    officialUrl: 'https://careers.example.com/jobs/EXT-001',
    officialDomain: 'careers.example.com',
    sourceSystem: 'WORKDAY',
  };

  it('INVARIANT: never returns VERIFIED in Phase 1 (domain check passes but live check absent)', async () => {
    const result = await verifyJob(baseInput);
    expect(result.verificationStatus).not.toBe('VERIFIED');
  });

  it('returns PENDING when domain check passes (Phase 1: live check not implemented)', async () => {
    const result = await verifyJob(baseInput);
    expect(result.verificationStatus).toBe('PENDING');
    expect(result.domainCheck).toBe(true);
  });

  it('returns FAILED when job URL is NOT on the official domain', async () => {
    const result = await verifyJob({
      ...baseInput,
      officialUrl: 'https://totally-different-site.com/jobs/EXT-001',
    });
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.domainCheck).toBe(false);
  });

  it('returns FAILED when officialUrl is not a valid URL', async () => {
    const result = await verifyJob({
      ...baseInput,
      officialUrl: 'not-a-url',
    });
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.domainCheck).toBe(false);
  });

  it('live checks are null (not performed) in Phase 1', async () => {
    const result = await verifyJob(baseInput);
    expect(result.jobExistsCheck).toBeNull();
    expect(result.jobIdCheck).toBeNull();
    expect(result.titleCheck).toBeNull();
    expect(result.locationCheck).toBeNull();
    expect(result.statusCheck).toBeNull();
    expect(result.applyUrlCheck).toBeNull();
  });

  it('verification score is between 0 and 1', async () => {
    const result = await verifyJob(baseInput);
    expect(result.verificationScore).toBeGreaterThanOrEqual(0);
    expect(result.verificationScore).toBeLessThanOrEqual(1);
  });

  it('FAILED result includes a failure reason', async () => {
    const result = await verifyJob({
      ...baseInput,
      officialUrl: 'https://scam-site.com/jobs/EXT-001',
    });
    expect(result.failureReason).toBeTruthy();
    expect(typeof result.failureReason).toBe('string');
  });

  it('domain check allows subdomain of official domain', async () => {
    const result = await verifyJob({
      ...baseInput,
      officialUrl: 'https://jobs.careers.example.com/EXT-001',
      officialDomain: 'example.com',
    });
    // subdomain of example.com — domain check should pass
    expect(result.domainCheck).toBe(true);
  });

  it('includes checkedAt timestamp', async () => {
    const before = new Date();
    const result = await verifyJob(baseInput);
    const after = new Date();
    expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('verifyJob — Lever Live Verification (Phase 2B)', () => {
  const leverInput = {
    jobId: 'job-123',
    externalJobId: 'ac978161-6f46-4f6b-ad9e-a258e642751c',
    title: 'Software Engineer',
    location: 'New York, NY',
    officialUrl: 'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c',
    officialDomain: 'jobs.lever.co',
    sourceSystem: 'LEVER',
    siteToken: 'palantir',
  };

  it('VERIFIED when Lever per-job API returns 200 with matching job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'ac978161-6f46-4f6b-ad9e-a258e642751c',
            text: 'Software Engineer',
            hostedUrl: 'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c',
            categories: { location: 'New York, NY' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await verifyJob(leverInput);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.domainCheck).toBe(true);
    expect(result.jobExistsCheck).toBe(true);
    expect(result.jobIdCheck).toBe(true);
    expect(result.titleCheck).toBe(true);
    expect(result.statusCheck).toBe(true);
    expect(result.locationCheck).toBe(true);
  });

  it('FAILED when Lever per-job API returns 404 (confirmed removed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    );

    const result = await verifyJob(leverInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.jobExistsCheck).toBe(false);
    expect(result.failureReason).toMatch(/404/);
  });

  it('PENDING when Lever per-job API returns 500 (transient error — conservative)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
    );

    const result = await verifyJob(leverInput);
    expect(result.verificationStatus).toBe('PENDING');
    expect(result.jobExistsCheck).toBeNull();
    expect(result.failureReason).toMatch(/transient/i);
  });

  it('FAILED when Lever returns job with mismatched title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'ac978161-6f46-4f6b-ad9e-a258e642751c',
            text: 'Accountant',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await verifyJob(leverInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.titleCheck).toBe(false);
  });

  it('PENDING when Lever returns 200 with malformed/empty payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await verifyJob(leverInput);
    expect(result.verificationStatus).toBe('PENDING');
  });

  // ── Workday Live Verification ──────────────────────────────────────────────

  const workdayInput: VerificationInput = {
    jobId: 'workday-job-1',
    externalJobId: '26WD100698',
    title: 'Principal Experience Designer',
    location: 'Tel Aviv, ISR',
    officialUrl: 'https://autodesk.wd1.myworkdayjobs.com/Ext/job/Tel-Aviv-ISR/Principal-Experience-Designer_26WD100698',
    officialDomain: 'autodesk.wd1.myworkdayjobs.com',
    sourceSystem: 'WORKDAY',
    workdayConfig: {
      host: 'autodesk.wd1.myworkdayjobs.com',
      tenant: 'autodesk',
      clientSite: 'Ext',
    },
  };

  it('VERIFIED when Workday CXS returns matching active jobPostingInfo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobPostingInfo: {
              jobReqId: '26WD100698',
              title: 'Principal Experience Designer',
              location: 'Tel Aviv, ISR',
              externalUrl: 'https://autodesk.wd1.myworkdayjobs.com/Ext/job/Tel-Aviv-ISR/Principal-Experience-Designer_26WD100698',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await verifyJob(workdayInput);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.domainCheck).toBe(true);
    expect(result.jobExistsCheck).toBe(true);
    expect(result.jobIdCheck).toBe(true);
    expect(result.titleCheck).toBe(true);
    expect(result.statusCheck).toBe(true);
    expect(result.verificationScore).toBe(1.0);
  });

  it('FAILED when Workday per-job API returns 404 (confirmed closed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    );

    const result = await verifyJob(workdayInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.jobExistsCheck).toBe(false);
    expect(result.statusCheck).toBe(false);
    expect(result.failureReason).toMatch(/404/i);
  });

  it('PENDING when Workday per-job API returns 500 (transient error — conservative)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
    );

    const result = await verifyJob(workdayInput);
    expect(result.verificationStatus).toBe('PENDING');
    expect(result.jobExistsCheck).toBeNull();
    expect(result.failureReason).toMatch(/transient/i);
  });

  it('FAILED when Workday returns job with mismatched title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobPostingInfo: {
              jobReqId: '26WD100698',
              title: 'Accountant',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await verifyJob(workdayInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.titleCheck).toBe(false);
  });

  // ── Custom Live Verification (CERN) ────────────────────────────────────────

  const customInput: VerificationInput = {
    jobId: 'custom-job-1',
    externalJobId: '744000145967675',
    title: 'Experimental Physicist (EP-DI-2026-29-LD)',
    location: 'Geneva, ch',
    officialUrl: 'https://jobs.smartrecruiters.com/cern/744000145967675',
    officialDomain: 'jobs.smartrecruiters.com',
    sourceSystem: 'CUSTOM',
    customConfig: {
      perJobApiEndpointTemplate: 'https://api.smartrecruiters.com/v1/companies/cern/postings/{id}',
    },
  };

  it('VERIFIED when Custom API returns matching active job detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '744000145967675',
            name: 'Experimental Physicist (EP-DI-2026-29-LD)',
            location: {
              city: 'Geneva',
              country: 'ch',
            },
            applyUrl: 'https://jobs.smartrecruiters.com/CERN/744000145967675-apply',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await verifyJob(customInput);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.domainCheck).toBe(true);
    expect(result.jobExistsCheck).toBe(true);
    expect(result.jobIdCheck).toBe(true);
    expect(result.titleCheck).toBe(true);
    expect(result.statusCheck).toBe(true);
    expect(result.verificationScore).toBe(1.0);
  });

  it('FAILED when Custom per-job API returns 404 (confirmed closed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    );

    const result = await verifyJob(customInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.jobExistsCheck).toBe(false);
    expect(result.statusCheck).toBe(false);
    expect(result.failureReason).toMatch(/404/i);
  });

  it('PENDING when Custom per-job API returns 500 (transient error — conservative)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
    );

    const result = await verifyJob(customInput);
    expect(result.verificationStatus).toBe('PENDING');
    expect(result.jobExistsCheck).toBeNull();
    expect(result.failureReason).toMatch(/transient/i);
  });

  it('FAILED when Custom returns job with mismatched title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '744000145967675',
            name: 'Administrative Assistant',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await verifyJob(customInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.titleCheck).toBe(false);
  });
});

describe('verifyJob — SmartRecruiters Live Verification', () => {
  const srInput: VerificationInput = {
    jobId: '2b4c1070-07cc-445a-8b8b-e60dccb99784',
    externalJobId: '744000145967675',
    title: 'Experimental Physicist (EP-DI-2026-29-LD)',
    location: 'Geneva, ch',
    officialUrl: 'https://jobs.smartrecruiters.com/CERN/744000145967675',
    officialDomain: 'jobs.smartrecruiters.com',
    sourceSystem: 'SMARTRECRUITERS',
    smartrecruitersConfig: {
      companyIdentifier: 'CERN',
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('VERIFIED when SmartRecruiters API returns matching active job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '744000145967675',
            name: 'Experimental Physicist (EP-DI-2026-29-LD)',
            location: {
              city: 'Geneva',
              country: 'ch',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const result = await verifyJob(srInput);
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.domainCheck).toBe(true);
    expect(result.jobExistsCheck).toBe(true);
    expect(result.jobIdCheck).toBe(true);
    expect(result.titleCheck).toBe(true);
    expect(result.statusCheck).toBe(true);
    expect(result.verificationScore).toBe(1.0);
  });

  it('FAILED when SmartRecruiters API returns 404 (confirmed closed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    );

    const result = await verifyJob(srInput);
    expect(result.verificationStatus).toBe('FAILED');
    expect(result.jobExistsCheck).toBe(false);
    expect(result.statusCheck).toBe(false);
    expect(result.failureReason).toMatch(/404/i);
  });

  it('PENDING when SmartRecruiters API returns malformed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ wrongField: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await verifyJob(srInput);
    expect(result.verificationStatus).toBe('PENDING');
    expect(result.jobExistsCheck).toBeNull();
    expect(result.failureReason).toMatch(/missing name/i);
  });
});
