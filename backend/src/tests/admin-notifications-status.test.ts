import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray } from 'drizzle-orm';
import { generateToken } from '../auth/token.js';
import { requireAdmin } from '../auth/middleware.js';
import { createAdminRouter } from '../api/admin.js';

const app = express();
app.use(express.json());
app.use('/api/admin', requireAdmin, createAdminRouter());

describe('Admin Notifications & Digest Architecture Representation', () => {
  let adminUserToken: string;
  let adminUserId: string;
  let testUserId: string;
  let companyId: string;
  let jobId: string;
  let digestNotifId: string;
  let jobNotifId: string;
  let pendingJobNotifId: string;
  let failedDigestNotifId: string;

  beforeEach(async () => {
    const db = getDb();

    // Clean up test users
    const existingUsers = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.email, ['admin-notif-test@test.com', 'candidate-notif-test@test.com']));
    
    for (const u of existingUsers) {
      await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, u.id));
      await db.delete(schema.notifications).where(eq(schema.notifications.user_id, u.id));
      await db.delete(schema.users).where(eq(schema.users.id, u.id));
    }

    // Create admin user
    const [adminUser] = await db
      .insert(schema.users)
      .values({
        email: 'admin-notif-test@test.com',
        name: 'Admin Notif Tester',
        password_hash: 'hash',
        email_verified: true,
        is_admin: true,
      })
      .returning();
    adminUserId = adminUser!.id;
    adminUserToken = generateToken({
      userId: adminUserId,
      email: adminUser!.email,
      name: adminUser!.name,
    });

    // Create candidate user
    const [candidateUser] = await db
      .insert(schema.users)
      .values({
        email: 'candidate-notif-test@test.com',
        name: 'Jane Candidate',
        password_hash: 'hash',
        email_verified: true,
        is_admin: false,
      })
      .returning();
    testUserId = candidateUser!.id;

    // Create test company
    const [comp] = await db
      .insert(schema.companies)
      .values({
        name: 'Audit Tech Inc',
        official_domain: 'audittech.test',
        careers_url: 'https://audittech.test/careers',
        ats_type: 'GREENHOUSE',
        is_active: true,
      })
      .returning();
    companyId = comp!.id;

    // Create test jobs (one for included intent, one for pending intent)
    const [testJob] = await db
      .insert(schema.jobs)
      .values({
        company_id: companyId,
        external_job_id: 'ext-test-123',
        content_hash: 'hash-test-123',
        title: 'Senior Systems Architect',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
        source_system: 'GREENHOUSE',
        official_url: 'https://audittech.test/jobs/123',
      })
      .returning();
    jobId = testJob!.id;

    const [testJob2] = await db
      .insert(schema.jobs)
      .values({
        company_id: companyId,
        external_job_id: 'ext-test-456',
        content_hash: 'hash-test-456',
        title: 'Lead Platform Engineer',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
        source_system: 'GREENHOUSE',
        official_url: 'https://audittech.test/jobs/456',
      })
      .returning();
    const pendingJobId = testJob2!.id;

    // 1. Create a successful WINDOWED_DIGEST email notification
    const [digest] = await db
      .insert(schema.notifications)
      .values({
        user_id: testUserId,
        notification_type: 'WINDOWED_DIGEST',
        delivery_status: 'SENT',
        sent_at: new Date(),
        attempt_count: 1,
        provider_message_id: '<test-provider-id@mock.com>',
      })
      .returning();
    digestNotifId = digest!.id;

    // 2. Create an INSTANT_JOB intent included in that digest (digest_id points to digest)
    const [jobNotif] = await db
      .insert(schema.notifications)
      .values({
        user_id: testUserId,
        job_id: jobId,
        digest_id: digestNotifId,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'SENT',
        sent_at: new Date(),
        attempt_count: 0, // Intent was included in digest, NOT independently emailed
      })
      .returning();
    jobNotifId = jobNotif!.id;

    // 3. Create a pending INSTANT_JOB intent waiting for the next digest window
    const [pendingJobNotif] = await db
      .insert(schema.notifications)
      .values({
        user_id: testUserId,
        job_id: pendingJobId,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        attempt_count: 0,
      })
      .returning();
    pendingJobNotifId = pendingJobNotif!.id;

    // 4. Create a failed WINDOWED_DIGEST email
    const [failedDigest] = await db
      .insert(schema.notifications)
      .values({
        user_id: testUserId,
        notification_type: 'WINDOWED_DIGEST',
        delivery_status: 'FAILED',
        attempt_count: 2,
        failure_reason: 'Mock provider delivery failure',
      })
      .returning();
    failedDigestNotifId = failedDigest!.id;
  });

  afterEach(async () => {
    const db = getDb();
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, testUserId));
    await db.delete(schema.jobs).where(eq(schema.jobs.company_id, companyId));
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    await db.delete(schema.adminAuditLogs).where(inArray(schema.adminAuditLogs.actor_user_id, [adminUserId, testUserId]));
    await db.delete(schema.users).where(inArray(schema.users.id, [adminUserId, testUserId]));
  });

  describe('GET /api/admin/overview — Disaggregated Notification Counts', () => {
    it('disaggregates digest emails and job intents, avoiding double-counting', async () => {
      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${adminUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifications');
      const notifs = res.body.notifications;

      // Digest emails
      expect(notifs).toHaveProperty('digestEmails');
      expect(notifs.digestEmails.sent).toBeGreaterThanOrEqual(1);
      expect(notifs.digestEmails.failed).toBeGreaterThanOrEqual(1);

      // Job intents
      expect(notifs).toHaveProperty('jobIntents');
      expect(notifs.jobIntents.pending).toBeGreaterThanOrEqual(1);
      expect(notifs.jobIntents.includedInDigest).toBeGreaterThanOrEqual(1);

      // Top-level counts must match true email deliveries (not double-counted with job intents)
      expect(notifs.sent24h).toBe(notifs.digestEmails.sent);
      expect(notifs.failed24h).toBe(notifs.digestEmails.failed);
      expect(notifs.sentJobs24h).toBe(notifs.jobIntents.includedInDigest);
      expect(notifs.pendingJobs24h).toBe(notifs.jobIntents.pending);
    });
  });

  describe('GET /api/admin/notifications — Semantic Representation & Relationships', () => {
    it('returns enriched notification details with user, job, digest relationship, and error state', async () => {
      const res = await request(app)
        .get('/api/admin/notifications?limit=50')
        .set('Authorization', `Bearer ${adminUserToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      const items = res.body.data;
      const sentDigest = items.find((n: any) => n.id === digestNotifId);
      const includedJob = items.find((n: any) => n.id === jobNotifId);
      const pendingJob = items.find((n: any) => n.id === pendingJobNotifId);
      const failedDigest = items.find((n: any) => n.id === failedDigestNotifId);

      // 1. Sent digest representation
      expect(sentDigest).toBeDefined();
      expect(sentDigest.type).toBe('WINDOWED_DIGEST');
      expect(sentDigest.status).toBe('SENT');
      expect(sentDigest.attempts).toBe(1);
      expect(sentDigest.sentAt).not.toBeNull();
      expect(sentDigest.userEmail).toBe('candidate-notif-test@test.com');
      expect(sentDigest.userName).toBe('Jane Candidate');
      expect(sentDigest.digestId).toBeNull(); // It is the parent digest

      // 2. Included job intent representation (belonging to digest)
      expect(includedJob).toBeDefined();
      expect(includedJob.type).toBe('INSTANT_JOB');
      expect(includedJob.status).toBe('SENT');
      expect(includedJob.attempts).toBe(0); // Not an independent email delivery!
      expect(includedJob.digestId).toBe(digestNotifId); // Explicit digest relationship
      expect(includedJob.jobId).toBe(jobId);
      expect(includedJob.jobTitle).toBe('Senior Systems Architect');
      expect(includedJob.companyName).toBe('Audit Tech Inc');
      expect(includedJob.userEmail).toBe('candidate-notif-test@test.com');

      // 3. Pending job intent (waiting for next digest window)
      expect(pendingJob).toBeDefined();
      expect(pendingJob.type).toBe('INSTANT_JOB');
      expect(pendingJob.status).toBe('PENDING');
      expect(pendingJob.attempts).toBe(0);
      expect(pendingJob.digestId).toBeNull(); // Not yet acquired by any digest
      expect(pendingJob.jobTitle).toBe('Lead Platform Engineer');

      // 4. Failed digest representation
      expect(failedDigest).toBeDefined();
      expect(failedDigest.type).toBe('WINDOWED_DIGEST');
      expect(failedDigest.status).toBe('FAILED');
      expect(failedDigest.attempts).toBe(2);
      expect(failedDigest.failureReason).toBe('Mock provider delivery failure');
    });

    it('filters by status and type query parameters', async () => {
      const resPending = await request(app)
        .get('/api/admin/notifications?status=PENDING&type=INSTANT_JOB')
        .set('Authorization', `Bearer ${adminUserToken}`);

      expect(resPending.status).toBe(200);
      for (const item of resPending.body.data) {
        expect(item.status).toBe('PENDING');
        expect(item.type).toBe('INSTANT_JOB');
      }

      const resFailed = await request(app)
        .get('/api/admin/notifications?status=FAILED&type=WINDOWED_DIGEST')
        .set('Authorization', `Bearer ${adminUserToken}`);

      expect(resFailed.status).toBe(200);
      for (const item of resFailed.body.data) {
        expect(item.status).toBe('FAILED');
        expect(item.type).toBe('WINDOWED_DIGEST');
      }
    });
  });
});
