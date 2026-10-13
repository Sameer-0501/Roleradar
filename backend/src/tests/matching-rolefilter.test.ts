import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findMatchesForUser } from '../matching/matching-service.js';

// Mocks
vi.mock('../database/connection.js', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(Object.assign(
      Promise.resolve([
        { id: 'job-1', officialUrl: '', applyUrl: '', description: '', requirements: '' },
        { id: 'job-2', officialUrl: '', applyUrl: '', description: '', requirements: '' }
      ]),
      {
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 'job-1',
            companyId: 'comp-1',
            companyName: 'Company 1',
            title: 'Business Analyst',
            location: 'Remote',
            workplaceType: 'REMOTE',
            status: 'ACTIVE',
            verificationStatus: 'VERIFIED',
            firstSeenAt: new Date(),
            officialPostedAt: new Date(),
          },
          {
            id: 'job-2',
            companyId: 'comp-1',
            companyName: 'Company 1',
            title: 'Software Engineer',
            location: 'Remote',
            workplaceType: 'REMOTE',
            status: 'ACTIVE',
            verificationStatus: 'VERIFIED',
            firstSeenAt: new Date(),
            officialPostedAt: new Date(),
          }
        ])
      }
    )),
  })),
}));

vi.mock('../preferences/preference-service.js', () => ({
  getUserPreferences: vi.fn().mockResolvedValue({
    userId: 'user-001',
    roles: ['Software Engineer'],
    locations: ['Remote'],
    workplaceTypes: ['REMOTE'],
    experienceLevel: 'ANY',
    companyIds: [],
    keywords: [],
  }),
}));

vi.mock('../workspace/user-job-service.js', () => ({
  getDismissedJobIds: vi.fn().mockResolvedValue(new Set()),
  getInteractionsBatch: vi.fn().mockResolvedValue(new Map()),
}));

describe('findMatchesForUser RoleFilter Overrides', () => {
  it('preserves existing saved roles when no roleFilter is provided', async () => {
    const result = await findMatchesForUser('user-001', {});
    // Saved role is Software Engineer, so job-2 should match. job-1 (BA) fails role match.
    expect(result.jobs.length).toBe(1);
    expect(result.jobs[0].title).toBe('Software Engineer');
  });

  it('overrides saved roles when specific roleFilter is provided', async () => {
    const result = await findMatchesForUser('user-001', {
      roleFilter: 'Business Analyst'
    });
    // roleFilter is Business Analyst. Saved role (Software Engineer) is ignored.
    expect(result.jobs.length).toBe(1);
    expect(result.jobs[0].title).toBe('Business Analyst');
    expect(result.jobs[0].matchExplanations.some(e => e.includes('Software Engineer'))).toBe(false);
  });

  it('removes role restriction when roleFilter is ALL', async () => {
    const result = await findMatchesForUser('user-001', {
      roleFilter: 'ALL'
    });
    // ALL skips role restriction, so both jobs should match.
    expect(result.jobs.length).toBe(2);
  });
});
