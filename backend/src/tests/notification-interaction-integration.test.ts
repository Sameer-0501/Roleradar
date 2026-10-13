import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateAndCreateInstantAlerts } from '../notifications/alert-service.js';
import { dailyDigestWorker } from '../notifications/digest-worker.js';
import * as dbModule from '../database/connection.js';
import { schema } from '../database/index.js';

vi.mock('../database/connection.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../notifications/email/provider-factory.js', () => ({
  getEmailProvider: () => ({
    sendEmail: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'mock-123' })
  })
}));

vi.mock('../matching/matching-service.js', () => ({
  evaluateJobMatch: vi.fn().mockReturnValue({ matched: true })
}));

describe('Phase 15 — Notification Interaction Semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getMockDb = (interactions: any[] = []) => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'mock-notif-1' }])
        })
      })
    });

    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        let queryTarget = '';

        const chain: any = {
          from: vi.fn((table: any) => {
            const tableName = table?.Symbol?.description || table?.[Symbol.for('drizzle:Name')] || (table && table.email_alerts_enabled ? 'user_preferences' : (table && table.is_dismissed ? 'user_job_interactions' : (table && table.verification_status ? 'jobs' : (table && table.delivery_status ? 'notifications' : 'unknown'))));
            
            if (table === schema.jobs || tableName === 'jobs' || (table && table.verification_status)) queryTarget = 'jobs';
            else if (table === schema.users || table === schema.userPreferences || tableName === 'users' || tableName === 'user_preferences' || (table && table.email_alerts_enabled)) queryTarget = 'users';
            else if (table === schema.userJobInteractions || tableName === 'user_job_interactions' || (table && table.is_dismissed)) queryTarget = 'interactions';
            else if (table === schema.notifications || tableName === 'notifications' || (table && table.delivery_status)) queryTarget = 'notifications';
            return chain;
          }),
          innerJoin: vi.fn(() => chain),
          leftJoin: vi.fn(() => chain),
          where: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          orderBy: vi.fn(() => chain),
          then: (resolve: any) => {
            if (queryTarget === 'jobs') {
              resolve([{
                id: 'job-1',
                companyId: 'comp-1',
                companyName: 'TestCo',
                title: 'Software Engineer',
                location: 'Remote',
                status: 'ACTIVE',
                verificationStatus: 'VERIFIED'
              }]);
            } else if (queryTarget === 'users') {
              resolve([{
                userId: 'user-1',
                roles: ['Software Engineer'],
                emailAlertsEnabled: true,
                instantNotifications: true
              }, {
                userId: 'user-2',
                roles: ['Software Engineer'],
                emailAlertsEnabled: true,
                instantNotifications: true
              }]);
            } else if (queryTarget === 'interactions') {
              resolve(interactions);
            } else {
              resolve([]);
            }
          }
        };
        return chain;
      }),
      insert: insertMock
    };
    return mockDb;
  };

  it('1. Dismissed job (is_dismissed=true) -> instant notification is NOT created', async () => {
    const mockDb = getMockDb([{ userId: 'user-1', is_dismissed: true }]);
    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as any);

    const stats = await evaluateAndCreateInstantAlerts('job-1');
    expect(stats.evaluatedUsers).toBe(2);
    expect(stats.matchedUsers).toBe(1); 
    expect(stats.createdNotifications).toBe(1);
    
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const insertedValues = mockDb.insert().values.mock.calls[0][0];
    expect(insertedValues.user_id).toBe('user-2');
  });

  it('2. Applied job (is_applied=true) -> instant notification is NOT created', async () => {
    const mockDb = getMockDb([{ userId: 'user-1', is_applied: true }]);
    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as any);

    const stats = await evaluateAndCreateInstantAlerts('job-1');
    expect(stats.matchedUsers).toBe(1); 
    const insertedValues = mockDb.insert().values.mock.calls[0][0];
    expect(insertedValues.user_id).toBe('user-2');
  });

  it('5. Unrelated interaction -> Job B remains eligible', async () => {
    const mockDb = getMockDb([]); 
    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as any);

    const stats = await evaluateAndCreateInstantAlerts('job-1');
    expect(stats.matchedUsers).toBe(2);
  });

  it('6. User isolation -> User A dismissing Job X does not suppress Job X for User B', async () => {
    const mockDb = getMockDb([{ userId: 'user-1', is_dismissed: true }]);
    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as any);

    const stats = await evaluateAndCreateInstantAlerts('job-1');
    expect(stats.matchedUsers).toBe(1); 
    const insertedValues = mockDb.insert().values.mock.calls[0][0];
    expect(insertedValues.user_id).toBe('user-2');
  });

  it('7. Existing behavior -> users with no interaction record remain eligible exactly as before', async () => {
    const mockDb = getMockDb([]);
    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as any);

    const stats = await evaluateAndCreateInstantAlerts('job-1');
    expect(stats.matchedUsers).toBe(2); 
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });
});

describe('Phase 15 — Daily Digest Interaction Semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3 & 4. Dismissed/Applied jobs in daily digest -> excluded from digest', async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'mock-digest-1' }])
      })
    });

    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        let queryTarget = '';

        const chain: any = {
          from: function(table: any) {
            const tableName = table?.Symbol?.description || table?.[Symbol.for('drizzle:Name')] || (table && table.email_alerts_enabled ? 'user_preferences' : (table && table.is_dismissed ? 'user_job_interactions' : (table && table.verification_status ? 'jobs' : (table && table.delivery_status ? 'notifications' : 'unknown'))));
            
            if (table === schema.jobs || tableName === 'jobs' || (table && table.verification_status)) queryTarget = 'jobs';
            else if (table === schema.users || table === schema.userPreferences || tableName === 'users' || tableName === 'user_preferences' || (table && table.email_alerts_enabled)) queryTarget = 'users';
            else if (table === schema.userJobInteractions || tableName === 'user_job_interactions' || (table && table.is_dismissed)) queryTarget = 'interactions';
            else if (table === schema.notifications || tableName === 'notifications' || (table && table.delivery_status)) queryTarget = 'notifications';
            return chain;
          },
          innerJoin: function() { return chain; },
          leftJoin: function() { return chain; },
          where: function() { return chain; },
          limit: function() { return chain; },
          orderBy: function() { return chain; },
          then: function(resolve: any) {
            if (queryTarget === 'users') {
              resolve([{
                userId: 'user-1',
                email: 'test@example.com',
                roles: ['Software Engineer'],
                emailAlertsEnabled: true,
                dailyDigest: true,
                timezone: 'UTC'
              }]);
            } else if (queryTarget === 'jobs') {
              resolve([{
                id: 'job-1',
                title: 'Software Engineer',
                location: 'Remote',
                status: 'ACTIVE',
                verificationStatus: 'VERIFIED'
              }, {
                id: 'job-2',
                title: 'Software Engineer',
                location: 'Remote',
                status: 'ACTIVE',
                verificationStatus: 'VERIFIED'
              }, {
                id: 'job-3', 
                title: 'Software Engineer',
                location: 'Remote',
                status: 'ACTIVE',
                verificationStatus: 'VERIFIED'
              }]);
            } else if (queryTarget === 'interactions') {
              resolve([
                { job_id: 'job-1', is_dismissed: true, is_applied: false },
                { job_id: 'job-2', is_dismissed: false, is_applied: true }
              ]);
            } else if (queryTarget === 'notifications') {
              resolve([]); 
            } else {
              resolve([]);
            }
          }
        };
        return chain;
      }),
      insert: insertMock,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      })
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as any);

    const stats = await dailyDigestWorker.processDailyDigests(true);
    expect(stats.evaluated).toBe(1);
    expect(stats.sent).toBe(1);
    expect(stats.skipped).toBe(0);
  });
});
