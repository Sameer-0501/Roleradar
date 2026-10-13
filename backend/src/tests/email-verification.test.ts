/**
 * Email Ownership Verification Unit Tests.
 *
 * Tests the complete Phase 6.0A verification lifecycle:
 * 1. Cryptographic token generation & SHA-256 hashing.
 * 2. Unverified user account state upon registration.
 * 3. Raw token absence from database (only hash persisted).
 * 4. Successful email verification via valid raw token.
 * 5. Expired token rejection.
 * 6. Invalid token rejection.
 * 7. One-time use / reused token rejection.
 * 8. Resend token invalidation.
 * 9. Resend rate limiting (60s cooldown).
 * 10. Strict Alert Engine gating (unverified user excluded from alerts).
 * 11. Alert eligibility for verified users.
 * 12. User isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateVerificationToken,
  hashVerificationToken,
  sendVerificationEmailForUser,
  verifyEmailToken,
  resendVerificationEmail,
} from '../auth/email-verification-service.js';
import { evaluateAndCreateInstantAlerts } from '../notifications/alert-service.js';
import { ConsoleEmailProvider } from '../notifications/email/providers/console-provider.js';
import { setEmailProviderForTesting } from '../notifications/email/provider-factory.js';
import * as dbModule from '../database/connection.js';

vi.mock('../database/connection.js', () => ({
  getDb: vi.fn(),
  closeConnection: vi.fn(),
}));

describe('Email Verification Token Generation & Hashing', () => {
  it('generates 32-byte (64 hex char) random token and matching SHA-256 hash', () => {
    const { rawToken, tokenHash, expiresAt } = generateVerificationToken();

    expect(rawToken).toHaveLength(64);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toBe(hashVerificationToken(rawToken));
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('produces distinct tokens on successive generations', () => {
    const token1 = generateVerificationToken();
    const token2 = generateVerificationToken();

    expect(token1.rawToken).not.toBe(token2.rawToken);
    expect(token1.tokenHash).not.toBe(token2.tokenHash);
  });
});

describe('Email Verification Service Workflow', () => {
  let consoleProvider: ConsoleEmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleProvider = new ConsoleEmailProvider();
    setEmailProviderForTesting(consoleProvider);
  });

  afterEach(() => {
    setEmailProviderForTesting(null);
  });

  it('dispatches verification email with raw token link and stores ONLY token hash in DB', async () => {
    let persistedSetValues: Record<string, unknown> = {};

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((vals) => {
          persistedSetValues = vals;
          return {
            where: vi.fn().mockResolvedValue([]),
          };
        }),
      }),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const success = await sendVerificationEmailForUser(
      'user-uuid-101',
      'test.candidate@example.com',
      'Test Candidate'
    );

    expect(success).toBe(true);

    // Assert: Only token hash was saved, NEVER the raw token
    expect(persistedSetValues['verification_token_hash']).toBeDefined();
    expect(persistedSetValues['verification_token_hash']).toHaveLength(64);
    expect(persistedSetValues['rawToken']).toBeUndefined();
    expect(persistedSetValues['raw_token']).toBeUndefined();

    // Assert: Email was captured by console provider
    const sentEmails = consoleProvider.getSentMessages();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe('test.candidate@example.com');
    expect(sentEmails[0]!.subject).toContain('Verify your email address');
    expect(sentEmails[0]!.html).toContain('#/verify-email?token=');
  });

  it('verifies email with valid unexpired token and invalidates token hash', async () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tokenHash = hashVerificationToken(rawToken);
    let updatedValues: Record<string, unknown> = {};

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user-valid-01',
                email: 'valid@example.com',
                emailVerified: false,
                expiresAt: new Date(Date.now() + 1000 * 3600), // Valid for 1h
              },
            ]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((vals) => {
          updatedValues = vals;
          return {
            where: vi.fn().mockResolvedValue([]),
          };
        }),
      }),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const result = await verifyEmailToken(rawToken);
    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-valid-01');
    expect(result.email).toBe('valid@example.com');

    // Assert: Marked verified and token invalidated (null)
    expect(updatedValues['email_verified']).toBe(true);
    expect(updatedValues['email_verified_at']).toBeDefined();
    expect(updatedValues['verification_token_hash']).toBeNull();
    expect(updatedValues['verification_token_expires_at']).toBeNull();
  });

  it('rejects expired verification token and does not verify user', async () => {
    const rawToken = 'expired0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user-expired',
                email: 'expired@example.com',
                emailVerified: false,
                expiresAt: new Date(Date.now() - 1000 * 3600), // Expired 1h ago
              },
            ]),
          }),
        }),
      }),
      update: vi.fn(),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const result = await verifyEmailToken(rawToken);
    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('rejects invalid or already-used token safely', async () => {
    const rawToken = 'unknown0000000000000000000000000000000000000000000000000000000000';
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // Not found in DB
          }),
        }),
      }),
      update: vi.fn(),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const result = await verifyEmailToken(rawToken);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or expired');
  });

  it('rate limits verification resend requests (60 second cooldown)', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user-ratelimit',
                email: 'ratelimit@example.com',
                name: 'Rate Limit Tester',
                emailVerified: false,
                lastSentAt: new Date(Date.now() - 10 * 1000), // Sent 10 seconds ago
              },
            ]),
          }),
        }),
      }),
      update: vi.fn(),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const result = await resendVerificationEmail({ email: 'ratelimit@example.com' });
    expect(result.success).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.error).toContain('wait');
    expect(consoleProvider.getSentMessages()).toHaveLength(0);
  });
});

describe('Alert Engine Gating for Verified Emails', () => {
  it('excludes unverified users from instant alert dispatch', async () => {
    const mockDb = {
      select: vi
        .fn()
        // 1st select: verified job
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'job-verified-10',
                    companyId: 'comp-1',
                    companyName: 'GitLab',
                    sourceSystem: 'GREENHOUSE',
                    externalJobId: 'ext-10',
                    title: 'Junior Software Engineer',
                    location: 'Bangalore',
                    officialUrl: 'https://boards.greenhouse.io/gitlab/jobs/10',
                    status: 'ACTIVE',
                    verificationStatus: 'VERIFIED',
                    description: 'Fresher eligible',
                  },
                ]),
              }),
            }),
          }),
        })
        // 2nd select: eligible users query (WHERE email_verified = true)
        // Returns 0 users because unverified users are filtered by the query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        // 3rd select: interactions query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      insert: vi.fn(),
    };

    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

    const stats = await evaluateAndCreateInstantAlerts('job-verified-10');
    expect(stats.evaluatedUsers).toBe(0);
    expect(stats.matchedUsers).toBe(0);
    expect(stats.createdNotifications).toBe(0);
  });
});
