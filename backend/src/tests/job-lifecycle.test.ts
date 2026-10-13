/**
 * Tests: Job Lifecycle
 *
 * Tests the job service state machine logic in isolation.
 * The DB is mocked — these are pure logic tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeContentHash } from '../verification/verification-service.js';

// Track DB calls for assertions
const mockSet = vi.fn().mockReturnValue({
  where: vi.fn().mockResolvedValue([]),
});

const mockUpdate = vi.fn().mockReturnValue({
  set: mockSet,
});

const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: 'mock-job-id-abc' }]),
  }),
});

const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    }),
  }),
});

vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  }),
}));

vi.mock('../verification/verification-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../verification/verification-service.js')>();
  return actual;
});

const {
  upsertDiscoveredJob,
  markJobVerifying,
  markJobActive,
  markJobVerificationFailed,
  markJobClosed,
} = await import('../jobs/job-service.js');

describe('Job Lifecycle — state transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertDiscoveredJob — new job', () => {
    it('inserts a new job with DISCOVERED status when none exists', async () => {
      // mockSelect returns [] meaning no existing job
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await upsertDiscoveredJob(
        {
          externalJobId: 'WD-1234',
          title: 'Software Engineer',
          location: 'Bangalore',
          officialUrl: 'https://careers.example.com/job/WD-1234',
          sourceSystem: 'WORKDAY',
        },
        'company-uuid-001'
      );

      expect(result.isNew).toBe(true);
      expect(result.contentChanged).toBe(false);
      expect(result.jobId).toBe('mock-job-id-abc');
      expect(mockInsert).toHaveBeenCalledOnce();
    });
  });

  describe('upsertDiscoveredJob — existing unchanged job', () => {
    it('does not insert a new record; updates last_seen_at only', async () => {
      const existingHash = computeContentHash({
        title: 'Software Engineer',
        location: 'Bangalore',
        officialUrl: 'https://careers.example.com/job/WD-1234',
      });

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'existing-job-uuid',
                content_hash: existingHash,
                status: 'ACTIVE',
              },
            ]),
          }),
        }),
      });

      const result = await upsertDiscoveredJob(
        {
          externalJobId: 'WD-1234',
          title: 'Software Engineer',
          location: 'Bangalore',
          officialUrl: 'https://careers.example.com/job/WD-1234',
          sourceSystem: 'WORKDAY',
        },
        'company-uuid-001'
      );

      expect(result.isNew).toBe(false);
      expect(result.contentChanged).toBe(false);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('upsertDiscoveredJob — content changed', () => {
    it('marks existing job as UPDATED and resets verification_status to PENDING when content hash changes', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'existing-job-uuid',
                content_hash: 'old-hash-that-wont-match',
                status: 'ACTIVE',
              },
            ]),
          }),
        }),
      });

      const result = await upsertDiscoveredJob(
        {
          externalJobId: 'WD-1234',
          title: 'Senior Software Engineer', // title changed
          location: 'Bangalore',
          officialUrl: 'https://careers.example.com/job/WD-1234',
          sourceSystem: 'WORKDAY',
        },
        'company-uuid-001'
      );

      expect(result.isNew).toBe(false);
      expect(result.contentChanged).toBe(true);
      expect(mockInsert).not.toHaveBeenCalled();
      // update should have been called to set status: 'UPDATED' and verification_status: 'PENDING'
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UPDATED',
          verification_status: 'PENDING',
          title: 'Senior Software Engineer',
        })
      );
    });
  });

  describe('markJobVerifying', () => {
    it('calls update on the job record', async () => {
      await markJobVerifying('job-uuid-1');
      expect(mockUpdate).toHaveBeenCalledOnce();
    });
  });

  describe('markJobActive', () => {
    it('calls update on the job record', async () => {
      await markJobActive('job-uuid-1');
      expect(mockUpdate).toHaveBeenCalledOnce();
    });
  });

  describe('markJobVerificationFailed', () => {
    it('calls update on the job record', async () => {
      await markJobVerificationFailed('job-uuid-1', 'domain check failed');
      expect(mockUpdate).toHaveBeenCalledOnce();
    });
  });

  describe('markJobClosed', () => {
    it('calls update on the job record', async () => {
      await markJobClosed('job-uuid-1');
      expect(mockUpdate).toHaveBeenCalledOnce();
    });
  });
});

describe('Job deduplication logic', () => {
  it('same external job ID with same content → no duplicate insert', async () => {
    const hash = computeContentHash({ 
      title: 'SDE', 
      location: 'Pune',
      officialUrl: 'https://careers.example.com/jobs/DUP-001'
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: 'dup-job-id', content_hash: hash, status: 'ACTIVE' },
          ]),
        }),
      }),
    });

    const result = await upsertDiscoveredJob(
      {
        externalJobId: 'DUP-001',
        title: 'SDE',
        location: 'Pune',
        officialUrl: 'https://careers.example.com/jobs/DUP-001',
        sourceSystem: 'GREENHOUSE',
      },
      'company-uuid-002'
    );

    expect(result.isNew).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('Finding #11 Test D: changing officialUrl must NOT create a new job identity or duplicate database record', async () => {
    // The DB will return the existing job (same external ID) with the old hash
    const oldHash = 'old-hash-that-wont-match-new-url';
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: 'dup-job-id', content_hash: oldHash, status: 'ACTIVE' },
          ]),
        }),
      }),
    });

    const result = await upsertDiscoveredJob(
      {
        externalJobId: 'DUP-001',
        title: 'SDE',
        location: 'Pune',
        officialUrl: 'https://careers.example.com/jobs/DUP-001?new=param', // URL changed
        sourceSystem: 'GREENHOUSE',
      },
      'company-uuid-002'
    );

    expect(result.isNew).toBe(false);
    expect(result.contentChanged).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });
});
