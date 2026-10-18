import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import { windowedDigestWorker } from '../notifications/digest-worker.js';
import { config } from '../config/env.js';

describe('Windowed Digest Concurrency & Budget Constraints', () => {
  const db = getDb();
  let testUserId1: string;
  let testUserId2: string;
  let testCompanyId: string;
  let todayUtc = new Date().toISOString().split('T')[0];

  beforeAll(async () => {
    // Initial cleanup of any stale test data
    await db.execute(sql`DELETE FROM jobs WHERE company_id IN (SELECT id FROM companies WHERE name = 'Concurrency Test Corp')`);
    await db.delete(schema.companies).where(eq(schema.companies.name, 'Concurrency Test Corp'));
    await db.delete(schema.users).where(eq(schema.users.email, 'digest.concurrency1@roleradar.dev'));
    await db.delete(schema.users).where(eq(schema.users.email, 'digest.concurrency2@roleradar.dev'));

    // Create test users
    const [u1] = await db.insert(schema.users).values({
      email: 'digest.concurrency1@roleradar.dev',
      name: 'Test User 1',
      password_hash: 'hash',
      email_verified: true,
    }).returning({ id: schema.users.id });
    testUserId1 = u1!.id;

    const [u2] = await db.insert(schema.users).values({
      email: 'digest.concurrency2@roleradar.dev',
      name: 'Test User 2',
      password_hash: 'hash',
      email_verified: true,
    }).returning({ id: schema.users.id });
    testUserId2 = u2!.id;

    // Create preferences
    await db.insert(schema.userPreferences).values({
      user_id: testUserId1,
      email_alerts_enabled: true,
      instant_notifications: true,
      daily_digest: false,
      timezone: 'UTC', // Ensure predictable windowing
    });

    await db.insert(schema.userPreferences).values({
      user_id: testUserId2,
      email_alerts_enabled: true,
      instant_notifications: true,
      daily_digest: false,
      timezone: 'UTC',
    });

    // Create company
    const [comp] = await db.insert(schema.companies).values({
      name: 'Concurrency Test Corp',
      official_domain: 'concurrency.test',
      careers_url: 'https://concurrency.test/careers',
    }).returning({ id: schema.companies.id });
    testCompanyId = comp!.id;
  });

  afterAll(async () => {
    // Cleanup
    await db.execute(sql`DELETE FROM jobs WHERE company_id IN (SELECT id FROM companies WHERE name = 'Concurrency Test Corp')`);
    await db.delete(schema.companies).where(eq(schema.companies.name, 'Concurrency Test Corp'));
    await db.delete(schema.users).where(eq(schema.users.email, 'digest.concurrency1@roleradar.dev'));
    await db.delete(schema.users).where(eq(schema.users.email, 'digest.concurrency2@roleradar.dev'));
  });

  beforeEach(async () => {
    // Clear notifications and budget for test users
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, testUserId1));
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, testUserId2));
    await db.execute(sql`DELETE FROM email_daily_budget WHERE date_utc = ${todayUtc}::date`);
  });

  it('simultaneous budget acquisition does not exceed capacity', async () => {
    // Set capacity to 2 for this test
    const originalBudget = config.emailDailySafetyBudget;
    (config as any).emailDailySafetyBudget = 2;

    try {
      // Simulate 5 concurrent attempts to acquire budget
      const promises = Array.from({ length: 5 }).map(() => (windowedDigestWorker as any).acquireGlobalBudget());
      const results = await Promise.all(promises);

      const successfulAcquisitions = results.filter(r => r === true).length;
      
      // Should exactly equal the configured capacity of 2
      expect(successfulAcquisitions).toBe(2);

      const [budgetRow] = (await db.execute(sql`SELECT sent_count FROM email_daily_budget WHERE date_utc = ${todayUtc}::date`)).rows;
      expect(budgetRow?.sent_count).toBe(2);
    } finally {
      (config as any).emailDailySafetyBudget = originalBudget;
    }
  });

  it('two workers processing the same user/window do not create duplicate digests', async () => {
    // Override getActiveWindowForTimezone to force a consistent window
    const originalGetWindow = (windowedDigestWorker as any).getActiveWindowForTimezone;
    (windowedDigestWorker as any).getActiveWindowForTimezone = () => '09:00';

    try {
      // Insert 12 pending jobs for User 1
      for (let i = 0; i < 12; i++) {
        const [job] = await db.insert(schema.jobs).values({
          company_id: testCompanyId,
          source_system: 'CUSTOM',
          external_job_id: `ext-dup-${i}`,
          title: `Dup Job ${i}`,
          official_url: `https://concurrency.test/jobs/${i}`,
          content_hash: `hash-${i}`,
          status: 'ACTIVE',
          verification_status: 'VERIFIED',
        }).returning({ id: schema.jobs.id });

        await db.insert(schema.notifications).values({
          user_id: testUserId1,
          job_id: job!.id,
          notification_type: 'INSTANT_JOB',
          delivery_status: 'PENDING',
          idempotency_key: `test_dup_${i}`,
        });
      }

      // Run two processing cycles concurrently
      await Promise.all([
        windowedDigestWorker.processCycle(testUserId1),
        windowedDigestWorker.processCycle(testUserId1),
      ]);

      // Verify exactly ONE digest was created
      const digests = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE user_id = ${testUserId1} AND notification_type = 'WINDOWED_DIGEST'
      `)).rows;
      expect(digests.length).toBe(1);

      // Verify ALL 12 eligible jobs were marked SENT and linked to the digest (no arbitrary limit of 10)
      const sentJobs = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE user_id = ${testUserId1} 
          AND notification_type = 'INSTANT_JOB' 
          AND delivery_status = 'SENT'
          AND digest_id = ${digests[0]!.id}
      `)).rows;
      expect(sentJobs.length).toBe(12);

      // Verify 0 jobs remain PENDING
      const pendingJobs = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE user_id = ${testUserId1} 
          AND notification_type = 'INSTANT_JOB' 
          AND delivery_status = 'PENDING'
          AND digest_id IS NULL
      `)).rows;
      expect(pendingJobs.length).toBe(0);

    } finally {
      (windowedDigestWorker as any).getActiveWindowForTimezone = originalGetWindow;
      await db.execute(sql`DELETE FROM jobs WHERE external_job_id LIKE 'ext-dup-%'`);
    }
  });

  it('two workers processing different users safely process concurrently', async () => {
    const originalGetWindow = (windowedDigestWorker as any).getActiveWindowForTimezone;
    (windowedDigestWorker as any).getActiveWindowForTimezone = () => '11:30';

    try {
      // 1 job for user 1
      const [job1] = await db.insert(schema.jobs).values({
        company_id: testCompanyId,
        source_system: 'CUSTOM',
        external_job_id: `ext-diff-1`,
        title: `Diff Job 1`,
        official_url: `https://concurrency.test/jobs/diff-1`,
        content_hash: `hash-diff-1`,
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      }).returning({ id: schema.jobs.id });
      await db.insert(schema.notifications).values({
        user_id: testUserId1,
        job_id: job1!.id,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        idempotency_key: `test_diff_1`,
      });

      // 1 job for user 2
      const [job2] = await db.insert(schema.jobs).values({
        company_id: testCompanyId,
        source_system: 'CUSTOM',
        external_job_id: `ext-diff-2`,
        title: `Diff Job 2`,
        official_url: `https://concurrency.test/jobs/diff-2`,
        content_hash: `hash-diff-2`,
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      }).returning({ id: schema.jobs.id });
      await db.insert(schema.notifications).values({
        user_id: testUserId2,
        job_id: job2!.id,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        idempotency_key: `test_diff_2`,
      });

      // Ensure budget is sufficient
      (config as any).emailDailySafetyBudget = 10;

      await Promise.all([
        windowedDigestWorker.processCycle([testUserId1, testUserId2]),
        windowedDigestWorker.processCycle([testUserId1, testUserId2]),
      ]);

      // Verify both users got exactly one digest
      const digests1 = (await db.execute(sql`SELECT * FROM notifications WHERE user_id = ${testUserId1} AND notification_type = 'WINDOWED_DIGEST'`)).rows;
      const digests2 = (await db.execute(sql`SELECT * FROM notifications WHERE user_id = ${testUserId2} AND notification_type = 'WINDOWED_DIGEST'`)).rows;
      
      expect(digests1.length).toBe(1);
      expect(digests2.length).toBe(1);

      // Verify global budget was incremented by 2
      const [budgetRow] = (await db.execute(sql`SELECT sent_count FROM email_daily_budget WHERE date_utc = ${todayUtc}::date`)).rows;
      expect(budgetRow?.sent_count).toBe(2);

    } finally {
      (windowedDigestWorker as any).getActiveWindowForTimezone = originalGetWindow;
      await db.execute(sql`DELETE FROM jobs WHERE external_job_id LIKE 'ext-diff-%'`);
    }
  });

  it('budget exhaustion releases jobs for the next window and preserves idempotency', async () => {
    const originalGetWindow = (windowedDigestWorker as any).getActiveWindowForTimezone;
    (windowedDigestWorker as any).getActiveWindowForTimezone = () => '14:00';

    const originalBudget = config.emailDailySafetyBudget;
    (config as any).emailDailySafetyBudget = 0; // Force budget exhaustion

    try {
      // 1 job for user 1
      const [job] = await db.insert(schema.jobs).values({
        company_id: testCompanyId,
        source_system: 'CUSTOM',
        external_job_id: `ext-budget-1`,
        title: `Budget Job 1`,
        official_url: `https://concurrency.test/jobs/budget-1`,
        content_hash: `hash-budget-1`,
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      }).returning({ id: schema.jobs.id });

      await db.insert(schema.notifications).values({
        user_id: testUserId1,
        job_id: job!.id,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        idempotency_key: `test_budget_1`,
      });

      // 1. Process cycle - will fail on budget
      await windowedDigestWorker.processCycle(testUserId1);

      // Verify the digest intent was created but marked FAILED
      const digests = (await db.execute(sql`SELECT * FROM notifications WHERE user_id = ${testUserId1} AND notification_type = 'WINDOWED_DIGEST'`)).rows;
      expect(digests.length).toBe(1);
      expect(digests[0]!.delivery_status).toBe('FAILED');

      // Verify the job remains PENDING and unlinked
      const pendingJobs = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE user_id = ${testUserId1} AND notification_type = 'INSTANT_JOB'
      `)).rows;
      expect(pendingJobs[0]!.delivery_status).toBe('PENDING');
      expect(pendingJobs[0]!.digest_id).toBeNull();

      // 2. Replenish budget and advance to NEXT window
      (config as any).emailDailySafetyBudget = 10;
      (windowedDigestWorker as any).getActiveWindowForTimezone = () => '16:30';

      await windowedDigestWorker.processCycle(testUserId1);

      // Verify a new digest was created for the new window and it succeeded
      const allDigests = (await db.execute(sql`SELECT * FROM notifications WHERE user_id = ${testUserId1} AND notification_type = 'WINDOWED_DIGEST' ORDER BY created_at ASC`)).rows;
      expect(allDigests.length).toBe(2);
      expect(allDigests[0]!.delivery_status).toBe('FAILED'); // Old window
      expect(allDigests[1]!.delivery_status).toBe('SENT'); // New window

      // Verify the job was successfully linked and sent
      const sentJobs = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE user_id = ${testUserId1} AND notification_type = 'INSTANT_JOB'
      `)).rows;
      expect(sentJobs[0]!.delivery_status).toBe('SENT');
      expect(sentJobs[0]!.digest_id).toBe(allDigests[1]!.id);

    } finally {
      (windowedDigestWorker as any).getActiveWindowForTimezone = originalGetWindow;
      (config as any).emailDailySafetyBudget = originalBudget;
      await db.execute(sql`DELETE FROM jobs WHERE external_job_id LIKE 'ext-budget-%'`);
    }
  });
});
