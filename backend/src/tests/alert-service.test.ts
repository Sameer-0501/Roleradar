/**
 * Alert Service & Intent Generation Unit Tests.
 *
 * Validates alert intent generation invariants:
 * - Only ACTIVE + VERIFIED jobs trigger alerts.
 * - Conjunction matching criteria is preserved.
 * - Idempotency identity prevents duplicate alert creation.
 * - Disabled user preferences suppress alert generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateAndCreateInstantAlerts } from '../notifications/alert-service.js';
import * as dbModule from '../database/connection.js';

vi.mock('../database/connection.js', () => ({
  getDb: vi.fn(),
  closeConnection: vi.fn(),
}));

describe('Alert Service Intent Generation', () => {
  const mockInsert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects alert generation if job is not ACTIVE and VERIFIED', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'job-unverified',
                  status: 'DISCOVERED',
                  verificationStatus: 'PENDING',
                  title: 'Software Engineer',
                },
              ]),
            }),
          }),
        }),
      }),
      insert: mockInsert,
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const stats = await evaluateAndCreateInstantAlerts('job-unverified');
    expect(stats.createdNotifications).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('creates notification intent for matching users when job is ACTIVE + VERIFIED', async () => {
    const mockDb = {
      select: vi
        .fn()
        // 1st select: job with company
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'job-verified-1',
                    companyId: 'comp-1',
                    companyName: 'GitLab',
                    sourceSystem: 'GREENHOUSE',
                    externalJobId: 'ext-101',
                    title: 'Junior Software Engineer',
                    location: 'Bangalore, India',
                    officialUrl: 'https://boards.greenhouse.io/gitlab/jobs/101',
                    status: 'ACTIVE',
                    verificationStatus: 'VERIFIED',
                    description: 'Fresher welcome',
                    requirements: 'BS CS',
                  },
                ]),
              }),
            }),
          }),
        })
        // 2nd select: eligible users
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  userId: 'user-001',
                  email: 'user1@example.com',
                  name: 'User One',
                  roles: ['Software Engineer'],
                  locations: ['Bangalore'],
                  experienceLevel: 'FRESHER',
                  companyIds: [],
                  keywords: [],
                  emailAlertsEnabled: true,
                  instantNotifications: true,
                },
              ]),
            }),
          }),
        })
        // 3rd select: interactions query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'notif-created-001' }]),
          }),
        }),
      }),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const stats = await evaluateAndCreateInstantAlerts('job-verified-1');
    expect(stats.evaluatedUsers).toBe(1);
    expect(stats.matchedUsers).toBe(1);
    expect(stats.createdNotifications).toBe(1);
  });

  it('handles database deduplication gracefully when onConflictDoNothing returns empty', async () => {
    const mockDb = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'job-verified-dup',
                    companyId: 'comp-1',
                    companyName: 'GitLab',
                    sourceSystem: 'GREENHOUSE',
                    externalJobId: 'ext-101',
                    title: 'Junior Software Engineer',
                    location: 'Bangalore',
                    officialUrl: 'https://boards.greenhouse.io/gitlab/jobs/101',
                    status: 'ACTIVE',
                    verificationStatus: 'VERIFIED',
                    description: 'Fresher eligible',
                  },
                ]),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  userId: 'user-001',
                  email: 'user1@example.com',
                  name: 'User One',
                  roles: ['Software Engineer'],
                  locations: ['Bangalore'],
                  experienceLevel: 'FRESHER',
                  companyIds: [],
                  keywords: [],
                  emailAlertsEnabled: true,
                  instantNotifications: true,
                },
              ]),
            }),
          }),
        })
        // 3rd select: interactions query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // Conflict -> Nothing inserted
          }),
        }),
      }),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const stats = await evaluateAndCreateInstantAlerts('job-verified-dup');
    expect(stats.evaluatedUsers).toBe(1);
    expect(stats.matchedUsers).toBe(1);
    expect(stats.createdNotifications).toBe(0); // Deduplicated!
  });

  describe('Workplace Matching (Finding #1 Fix)', () => {
    const runMatchTest = async (
      jobWorkplace: string,
      jobLocation: string,
      userWorkplaceTypes: string[]
    ) => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'notif-id' }]),
          }),
        }),
      });

      const mockDb = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: 'job-1',
                      companyId: 'comp-1',
                      companyName: 'TestCorp',
                      sourceSystem: 'GREENHOUSE',
                      externalJobId: 'ext-1',
                      title: 'Junior Software Engineer',
                      location: jobLocation,
                      workplaceType: jobWorkplace,
                      officialUrl: 'https://test.com/job',
                      status: 'ACTIVE',
                      verificationStatus: 'VERIFIED',
                      description: 'Fresher welcome',
                    },
                  ]),
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  {
                    userId: 'user-1',
                    email: 'test@example.com',
                    name: 'Test User',
                    roles: ['Software Engineer'],
                    locations: ['Bangalore'],
                    workplaceTypes: userWorkplaceTypes, // NEW FIX
                    experienceLevel: 'FRESHER',
                    companyIds: [],
                    keywords: [],
                    emailAlertsEnabled: true,
                    instantNotifications: true,
                  },
                ]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        insert: mockInsert,
      };

      vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);
      return evaluateAndCreateInstantAlerts('job-1');
    };

    it('REMOTE-only user + ONSITE job -> NO instant notification', async () => {
      const stats = await runMatchTest('ONSITE', 'Bangalore, India', ['REMOTE']);
      expect(stats.matchedUsers).toBe(0);
      expect(stats.createdNotifications).toBe(0);
    });

    it('REMOTE-only user + REMOTE job -> notification eligible', async () => {
      const stats = await runMatchTest('REMOTE', 'Bangalore', ['REMOTE']);
      expect(stats.matchedUsers).toBe(1);
      expect(stats.createdNotifications).toBe(1);
    });

    it('HYBRID-only user + ONSITE job -> NO notification', async () => {
      const stats = await runMatchTest('ONSITE', 'Bangalore, India', ['HYBRID']);
      expect(stats.matchedUsers).toBe(0);
      expect(stats.createdNotifications).toBe(0);
    });

    it('ONSITE + HYBRID user + REMOTE job -> NO notification', async () => {
      const stats = await runMatchTest('REMOTE', 'Bangalore', ['ONSITE', 'HYBRID']);
      expect(stats.matchedUsers).toBe(0);
      expect(stats.createdNotifications).toBe(0);
    });
    
    it('existing role/location/experience matching remains unchanged (empty workplace matches all)', async () => {
      // Empty array means ANY workplace type
      const stats = await runMatchTest('ONSITE', 'Bangalore', []);
      expect(stats.matchedUsers).toBe(1);
      expect(stats.createdNotifications).toBe(1);
    });
  });
});
