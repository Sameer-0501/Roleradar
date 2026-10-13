/**
 * Jobs API — Verification History Response Bounding Tests (Vitest).
 *
 * Verifies stage 1 of RR-AUDIT-RETENTION-2026-10:
 * - GET /api/jobs/:id returns at most 20 most recent verification records.
 * - Deterministic ordering with checked_at DESC and id DESC tie-breaker.
 * - Fewer than 20 records returned unchanged.
 * - Zero records handled gracefully.
 * - Input validation (invalid UUID -> 400, not found -> 404).
 * - Full backward compatibility with frontend consumers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getJobByIdHandler, MAX_JOB_VERIFICATIONS_LIMIT } from '../api/jobs.js';
import type { Request, Response } from 'express';

// ─── Test Mock State ──────────────────────────────────────────────────────────

interface MockVerification {
  id: string;
  checked_at: Date;
  domain_check: boolean | null;
  job_exists_check: boolean | null;
  job_id_check: boolean | null;
  title_check: boolean | null;
  location_check: boolean | null;
  status_check: boolean | null;
  apply_url_check: boolean | null;
  verification_score: number | null;
  failure_reason: string | null;
}

let mockJobRow: any = null;
let mockVerificationRecords: MockVerification[] = [];
let capturedOrderByArgs: any[] = [];
let capturedLimitArg: number | null = null;

vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: async () => (mockJobRow ? [mockJobRow] : []),
          }),
        }),
        where: () => ({
          orderBy: (...args: any[]) => {
            capturedOrderByArgs = args;
            return {
              limit: async (lim: number) => {
                capturedLimitArg = lim;
                // Emulate SQL ordering: ORDER BY checked_at DESC, id DESC LIMIT lim
                const sorted = [...mockVerificationRecords].sort((a, b) => {
                  const timeDiff = b.checked_at.getTime() - a.checked_at.getTime();
                  if (timeDiff !== 0) return timeDiff;
                  return b.id.localeCompare(a.id);
                });
                return sorted.slice(0, lim);
              },
            };
          },
        }),
      }),
    }),
  }),
}));

function createMockResponse() {
  let statusCode = 200;
  let responseData: any = null;

  const res: Partial<Response> = {
    status: (code: number) => {
      statusCode = code;
      return res as Response;
    },
    json: (data: any) => {
      responseData = data;
      return res as Response;
    },
  };

  return {
    res: res as Response,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

describe('Jobs API — GET /api/jobs/:id Verification History Bounding', () => {
  const validJobId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    capturedOrderByArgs = [];
    capturedLimitArg = null;
    mockJobRow = {
      job: {
        id: validJobId,
        company_id: 'c1111111-1111-1111-1111-111111111111',
        title: 'Senior Software Engineer',
        source_system: 'GREENHOUSE',
        external_job_id: 'ext-12345',
        official_url: 'https://careers.example.com/jobs/12345',
        apply_url: 'https://careers.example.com/jobs/12345/apply',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
        first_seen_at: new Date('2026-10-01T10:00:00Z'),
        last_verified_at: new Date('2026-10-11T12:00:00Z'),
        official_posted_at: new Date('2026-09-28T09:00:00Z'),
        description: 'Building high throughput systems with Node.js and TypeScript.',
        requirements: '5+ years experience required.',
        location: 'Bengaluru, India',
        workplace_type: 'HYBRID',
      },
      companyName: 'Example Corp',
      companyCareersUrl: 'https://careers.example.com',
    };
    mockVerificationRecords = [];
  });

  it('exports MAX_JOB_VERIFICATIONS_LIMIT equal to 20', () => {
    expect(MAX_JOB_VERIFICATIONS_LIMIT).toBe(20);
  });

  it('returns exactly the 20 most recent records when more than 20 records exist', async () => {
    // Generate 35 verification records with ascending timestamps
    const records: MockVerification[] = [];
    const baseTime = new Date('2026-10-01T00:00:00Z').getTime();

    for (let i = 1; i <= 35; i++) {
      records.push({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
        checked_at: new Date(baseTime + i * 3600 * 1000), // each 1 hour later
        domain_check: true,
        job_exists_check: true,
        job_id_check: true,
        title_check: true,
        location_check: true,
        status_check: true,
        apply_url_check: true,
        verification_score: 1.0,
        failure_reason: null,
      });
    }
    mockVerificationRecords = records;

    const req = { params: { id: validJobId } } as unknown as Request;
    const { res, getStatus, getData } = createMockResponse();

    await getJobByIdHandler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData();
    expect(data).toHaveProperty('job');
    expect(data).toHaveProperty('verifications');

    // Verification bounding assertions
    expect(data.verifications).toHaveLength(20);
    expect(capturedLimitArg).toBe(20);

    // Most recent record should be index 35 (the latest timestamp)
    expect(data.verifications[0].id).toBe('00000000-0000-0000-0000-000000000035');
    // 20th record should be index 16
    expect(data.verifications[19].id).toBe('00000000-0000-0000-0000-000000000016');

    // Records 1..15 must be omitted
    const returnedIds = new Set(data.verifications.map((v: any) => v.id));
    expect(returnedIds.has('00000000-0000-0000-0000-000000000001')).toBe(false);
    expect(returnedIds.has('00000000-0000-0000-0000-000000000015')).toBe(false);
  });

  it('returns all records unchanged when fewer than 20 records exist (e.g. 5 records)', async () => {
    const records: MockVerification[] = [];
    const baseTime = new Date('2026-10-10T00:00:00Z').getTime();

    for (let i = 1; i <= 5; i++) {
      records.push({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
        checked_at: new Date(baseTime + i * 3600 * 1000),
        domain_check: true,
        job_exists_check: true,
        job_id_check: true,
        title_check: true,
        location_check: true,
        status_check: true,
        apply_url_check: true,
        verification_score: 1.0,
        failure_reason: null,
      });
    }
    mockVerificationRecords = records;

    const req = { params: { id: validJobId } } as unknown as Request;
    const { res, getStatus, getData } = createMockResponse();

    await getJobByIdHandler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData();
    expect(data.verifications).toHaveLength(5);
    expect(capturedLimitArg).toBe(20);

    // Ordered descending by checked_at
    expect(data.verifications[0].id).toBe('00000000-0000-0000-0000-000000000005');
    expect(data.verifications[4].id).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('handles zero verification records correctly without error', async () => {
    mockVerificationRecords = [];

    const req = { params: { id: validJobId } } as unknown as Request;
    const { res, getStatus, getData } = createMockResponse();

    await getJobByIdHandler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData();
    expect(data.verifications).toEqual([]);
    expect(data.job.title).toBe('Senior Software Engineer');
    expect(data.job.freshness_state).toBeDefined();
  });

  it('applies deterministic tie-breaking by id DESC when timestamps tie', async () => {
    const tiedTimestamp = new Date('2026-10-11T12:00:00.000Z');

    // Two records with identical timestamp
    mockVerificationRecords = [
      {
        id: '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        checked_at: tiedTimestamp,
        domain_check: true,
        job_exists_check: true,
        job_id_check: true,
        title_check: true,
        location_check: true,
        status_check: true,
        apply_url_check: true,
        verification_score: 1.0,
        failure_reason: null,
      },
      {
        id: '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        checked_at: tiedTimestamp,
        domain_check: true,
        job_exists_check: true,
        job_id_check: true,
        title_check: true,
        location_check: true,
        status_check: true,
        apply_url_check: true,
        verification_score: 1.0,
        failure_reason: null,
      },
    ];

    const req = { params: { id: validJobId } } as unknown as Request;
    const { res, getStatus, getData } = createMockResponse();

    await getJobByIdHandler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData();
    expect(data.verifications).toHaveLength(2);

    // Primary: checked_at (tied). Stable tie-breaker: id DESC ('2222...' > '1111...')
    expect(data.verifications[0].id).toBe('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(data.verifications[1].id).toBe('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    // Confirm that two order expressions were passed to orderBy
    expect(capturedOrderByArgs).toHaveLength(2);
  });

  it('rejects invalid job ID formats with 400 Bad Request', async () => {
    const invalidIds = [
      'not-a-uuid',
      '12345',
      '../../etc/passwd',
      "'; DROP TABLE jobs; --",
      '',
    ];

    for (const badId of invalidIds) {
      const req = { params: { id: badId } } as unknown as Request;
      const { res, getStatus, getData } = createMockResponse();

      await getJobByIdHandler(req, res);

      expect(getStatus()).toBe(400);
      expect(getData()).toEqual({ error: 'Invalid job ID format' });
    }
  });

  it('returns 404 Not Found when job does not exist', async () => {
    mockJobRow = null;

    const req = { params: { id: '99999999-9999-9999-9999-999999999999' } } as unknown as Request;
    const { res, getStatus, getData } = createMockResponse();

    await getJobByIdHandler(req, res);

    expect(getStatus()).toBe(404);
    expect(getData()).toEqual({ error: 'Job not found' });
  });

  it('preserves the exact response contract expected by frontend consumers', async () => {
    mockVerificationRecords = [
      {
        id: '33333333-3333-3333-3333-333333333333',
        checked_at: new Date('2026-10-11T10:00:00Z'),
        domain_check: true,
        job_exists_check: true,
        job_id_check: true,
        title_check: true,
        location_check: true,
        status_check: true,
        apply_url_check: true,
        verification_score: 1.0,
        failure_reason: null,
      },
    ];

    const req = { params: { id: validJobId } } as unknown as Request;
    const { res, getStatus, getData } = createMockResponse();

    await getJobByIdHandler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData();

    // Verify top-level contract
    expect(Object.keys(data).sort()).toEqual(['job', 'verifications'].sort());

    // Verify job augmentation contract
    expect(data.job).toHaveProperty('company_name', 'Example Corp');
    expect(data.job).toHaveProperty('company_careers_url', 'https://careers.example.com');
    expect(data.job).toHaveProperty('freshness_state');
    expect(data.job).toHaveProperty('freshness_reason');
    expect(data.job).toHaveProperty('days_since_discovered');
    expect(data.job).toHaveProperty('days_since_verified');
    expect(data.job).toHaveProperty('experience_classification');
    expect(data.job).toHaveProperty('experience_reason');

    // Verify verification fields contract (frontend app.js compatibility)
    const verif = data.verifications[0];
    const expectedVerifKeys = [
      'id',
      'checked_at',
      'domain_check',
      'job_exists_check',
      'job_id_check',
      'title_check',
      'location_check',
      'status_check',
      'apply_url_check',
      'verification_score',
      'failure_reason',
    ].sort();

    expect(Object.keys(verif).sort()).toEqual(expectedVerifKeys);

    // Verify frontend app.js consumption: verifications.slice(0, 3)
    const frontendSlice = data.verifications.slice(0, 3);
    expect(frontendSlice).toHaveLength(1);
    expect(frontendSlice[0].job_exists_check).toBe(true);
    expect(frontendSlice[0].verification_score).toBe(1.0);
  });
});
