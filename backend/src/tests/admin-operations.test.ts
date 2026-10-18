import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray } from 'drizzle-orm';
import { generateToken } from '../auth/token.js';
import { requireAdmin } from '../auth/middleware.js';
import { createAdminRouter } from '../api/admin.js';
import { scheduler } from '../scheduler/scheduler.js';
import { reverificationWorker } from '../jobs/reverification-worker.js';
import { windowedDigestWorker } from '../notifications/digest-worker.js';
import { perSourceScanTriggerLimiter } from '../api/rate-limiters.js';

// Setup inline app for testing
const app = express();
app.use(express.json());
// Important: mock IP for rate limiter to work reliably
app.set('trust proxy', true);
app.use((req, res, next) => {
  Object.defineProperty(req, 'ip', { value: '127.0.0.1' });
  next();
});
app.use('/api/admin', requireAdmin, createAdminRouter());
app.use((err: any, req: any, res: any, next: any) => {
  console.error('TEST APP ERROR:', err);
  res.status(500).json({ error: err.message });
});

describe('Admin Operations (Phase 16.4A)', () => {
  let regularUserToken: string;
  let adminUserToken: string;
  let regularUserId: string;
  let adminUserId: string;

  beforeEach(async () => {
    const db = getDb();
    
    const existingRegular = await db.select().from(schema.users).where(eq(schema.users.email, 'regular_ops@test.com'));
    const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, 'admin_ops@test.com'));
    if (existingRegular.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingRegular[0]!.id));
    if (existingAdmin.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingAdmin[0]!.id));

    await db.delete(schema.users).where(inArray(schema.users.email, ['regular_ops@test.com', 'admin_ops@test.com']));
    
    // Create users
    const [regularUser] = await db.insert(schema.users).values({
      email: 'regular_ops@test.com',
      name: 'Regular Ops User',
      password_hash: 'hash',
      email_verified: true,
      is_admin: false,
    }).returning();
    regularUserId = regularUser!.id;
    regularUserToken = generateToken({ userId: regularUserId, email: regularUser!.email, name: regularUser!.name });

    const [adminUser] = await db.insert(schema.users).values({
      email: 'admin_ops@test.com',
      name: 'Admin Ops User',
      password_hash: 'hash',
      email_verified: true,
      is_admin: true,
    }).returning();
    adminUserId = adminUser!.id;
    adminUserToken = generateToken({ userId: adminUserId, email: adminUser!.email, name: adminUser!.name });
    
    // Clear mocks
    vi.restoreAllMocks();
    
    // Mock async background workers to prevent race conditions during teardown
    vi.spyOn(scheduler, 'triggerScan').mockResolvedValue(undefined);
    vi.spyOn(windowedDigestWorker, 'processCycle').mockResolvedValue();
  });

  beforeEach(async () => {
    vi.spyOn(windowedDigestWorker, 'processCycle').mockResolvedValue({ processed: 0, successful: 0, failed: 0 });
  });

  afterEach(async () => {
    // Wait for any dangling background promises (like async audit logs) to settle
    await new Promise(r => setTimeout(r, 50));
    
    const db = getDb();
    
    // Clean up notifications and jobs and companies created in tests
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, adminUserId));
    
    // First find the test company to delete its jobs
    const gitlabCompany = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.name, 'GitLab')).limit(1);
    if (gitlabCompany.length > 0) {
      const companyId = gitlabCompany[0]!.id;
      const createdJobs = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.company_id, companyId));
      const jobIds = createdJobs.map(j => j.id);
      if (jobIds.length > 0) {
        await db.delete(schema.userJobInteractions).where(inArray(schema.userJobInteractions.job_id, jobIds));
        await db.delete(schema.jobVerifications).where(inArray(schema.jobVerifications.job_id, jobIds));
        await db.delete(schema.jobs).where(inArray(schema.jobs.id, jobIds));
      }
      await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    }
    // Reset rate limiter so it doesn't affect subsequent tests
    perSourceScanTriggerLimiter.resetKey('127.0.0.1');
    perSourceScanTriggerLimiter.resetKey('10.0.0.10');
  });

  describe('Authorization', () => {
    it('1. guest -> 401', async () => {
      const res = await request(app).post('/api/admin/sources/GitLab/scan');
      expect(res.status).toBe(401);
    });

    it('2. authenticated normal user -> 403', async () => {
      const res = await request(app)
        .post('/api/admin/sources/GitLab/scan')
        .set('Authorization', `Bearer ${regularUserToken}`);
      expect(res.status).toBe(403);
    });

    it('3. admin -> allowed (if source exists, returns 202, else 404)', async () => {
      const res = await request(app)
        .post('/api/admin/sources/UnknownSource/scan')
        .set('Authorization', `Bearer ${adminUserToken}`);
      // As long as it's not 401 or 403, admin is allowed through auth boundary
      expect([202, 404, 429]).toContain(res.status);
    });
  });

  describe('Source Scan', () => {
    beforeEach(() => {
      // Mock scheduler state
      vi.spyOn(scheduler, 'getState').mockReturnValue({
        status: 'running',
        registeredJobs: 1,
        jobs: [{ name: 'GitLab Greenhouse Source', intervalMs: 1000 }] as any
      });
    });

    it('5. valid admin scan -> 202', async () => {
      const triggerSpy = vi.spyOn(scheduler, 'triggerScan').mockResolvedValue();
      const res = await request(app)
        .post('/api/admin/sources/GitLab/scan')
        .set('Authorization', `Bearer ${adminUserToken}`);
      
      if (res.status !== 202) console.log('5. valid admin scan FAIL BODY:', res.body);
      expect(res.status).toBe(202);
      expect(triggerSpy).toHaveBeenCalledWith('GitLab Greenhouse Source');
    });

    it('6. unknown source -> 404', async () => {
      const res = await request(app)
        .post('/api/admin/sources/NonExistent/scan')
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(404);
    });

    it('10. INTERNAL_API_KEY is not required by admin browser route', async () => {
      // Request succeeds without X-Internal-Key
      const triggerSpy = vi.spyOn(scheduler, 'triggerScan').mockResolvedValue();
      const res = await request(app)
        .post('/api/admin/sources/GitLab/scan')
        .set('Authorization', `Bearer ${adminUserToken}`)
        .set('X-Forwarded-For', '10.0.0.10'); // distinct IP to bypass limit interference
      expect(res.status).toBe(202);
    });

    it('9. existing per-source limiter remains active', async () => {
      // Use different company for rate limit test to avoid 429 affecting other tests
      const testCompany = 'Figma';
      vi.spyOn(scheduler, 'getState').mockReturnValue({
        status: 'running',
        registeredJobs: 1,
        jobs: [{ name: 'Figma Greenhouse Source', intervalMs: 1000 }] as any
      });
      vi.spyOn(scheduler, 'triggerScan').mockResolvedValue();
      
      // Hit limit (3 requests)
      for (let i = 0; i < 3; i++) {
        await request(app).post(`/api/admin/sources/${testCompany}/scan`).set('Authorization', `Bearer ${adminUserToken}`);
      }
      const res = await request(app).post(`/api/admin/sources/${testCompany}/scan`).set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(429);
    });

    it('concurrent source scan race via Promise.all', async () => {
      const testCompany = 'GitLab';
      vi.spyOn(scheduler, 'getState').mockReturnValue({
        status: 'running',
        registeredJobs: 1,
        jobs: [{ name: 'GitLab Source', intervalMs: 1000 }] as any
      });
      const triggerSpy = vi.spyOn(scheduler, 'triggerScan').mockResolvedValue();

      // Fire 3 concurrent requests (limit is 3)
      const requests = Array.from({ length: 3 }).map((_, i) => 
        request(app)
          .post(`/api/admin/sources/${testCompany}/scan`)
          .set('Authorization', `Bearer ${adminUserToken}`)
          .set('X-Forwarded-For', `10.0.0.${100 + i}`) // distinct IPs to avoid rate limits blocking the test
      );

      const responses = await Promise.all(requests);
      
      // Some might hit rate limits if they are too fast on the same IP, but we used different IPs.
      // Expected: they all get 202 because the controller triggers the scheduler
      const successCount = responses.filter(r => r.status === 202).length;
      expect(successCount).toBe(3);
      
      // Scheduler deduplicates internal execution. The API just queues it.
      expect(triggerSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Re-verification', () => {
    let jobId: string;
    
    beforeEach(async () => {
      const db = getDb();
      const [company] = await db.insert(schema.companies).values({
        name: 'GitLab',
        official_domain: 'gitlab.com',
        careers_url: 'gitlab.com/careers',
        ats_type: 'GREENHOUSE'
      }).returning();

      const [job] = await db.insert(schema.jobs).values({
        company_id: company!.id,
        source_system: 'GREENHOUSE',
        external_job_id: '123',
        title: 'Engineer',
        official_url: 'url',
        content_hash: 'hash'
      }).returning();
      jobId = job!.id;
    });

    it('14. unknown job -> 404', async () => {
      const res = await request(app)
        .post(`/api/admin/jobs/00000000-0000-0000-0000-000000000000/reverify`)
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(404);
    });

    it('15. valid admin reverify -> 200', async () => {
      vi.spyOn(reverificationWorker, 'executeSingleReverification').mockResolvedValue('ACTIVE');
      const res = await request(app)
        .post(`/api/admin/jobs/${jobId}/reverify`)
        .set('Authorization', `Bearer ${adminUserToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('23. simultaneous admin/automatic verification cannot corrupt state (returns 409)', async () => {
      vi.spyOn(reverificationWorker, 'executeSingleReverification').mockRejectedValue(new Error('Verification already in progress for this job'));
      const res = await request(app)
        .post(`/api/admin/jobs/${jobId}/reverify`)
        .set('Authorization', `Bearer ${adminUserToken}`);
      
      expect(res.status).toBe(409);
    });

    it('genuine Promise.all reverification race on same job', async () => {
      // Simulate slow worker execution to ensure overlap, while preserving the lock logic
      const activeJobs = new Set<string>();
      let activeCalls = 0;
      vi.spyOn(reverificationWorker, 'executeSingleReverification').mockImplementation(async (job) => {
        if (activeJobs.has(job.id)) {
          throw new Error('Verification already in progress for this job');
        }
        activeJobs.add(job.id);
        try {
          activeCalls++;
          await new Promise(r => setTimeout(r, 300));
          return 'ACTIVE';
        } finally {
          activeJobs.delete(job.id);
        }
      });

      // Fire 5 concurrent requests for the SAME job
      const requests = Array.from({ length: 5 }).map(() =>
        request(app)
          .post(`/api/admin/jobs/${jobId}/reverify`)
          .set('Authorization', `Bearer ${adminUserToken}`)
      );

      const responses = await Promise.all(requests);

      // We expect EXACTLY one 200, and the rest should be 400 or 409 because the lock rejects them
      const successCount = responses.filter(r => r.status === 200).length;
      const conflictCount = responses.filter(r => r.status === 400 || r.status === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(4);
      expect(activeCalls).toBe(1);
    });
  });

  describe('Notification Retry', () => {
    let notificationId: string;
    let successNotificationId: string;
    let processingNotificationId: string;

    beforeEach(async () => {
      const db = getDb();
      const [n1] = await db.insert(schema.notifications).values({
        user_id: adminUserId, // Just need a user ID
        notification_type: 'INSTANT_JOB',
        delivery_status: 'FAILED',
        attempt_count: 2,
        idempotency_key: 'test_failed_1'
      }).returning();
      notificationId = n1!.id;

      const [n2] = await db.insert(schema.notifications).values({
        user_id: adminUserId,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'SENT',
        attempt_count: 1,
        idempotency_key: 'test_sent_1'
      }).returning();
      successNotificationId = n2!.id;

      const [n3] = await db.insert(schema.notifications).values({
        user_id: adminUserId,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PROCESSING',
        attempt_count: 1,
        idempotency_key: 'test_proc_1'
      }).returning();
      processingNotificationId = n3!.id;
    });

    it('25. unknown notification -> 404', async () => {
      const res = await request(app)
        .post(`/api/admin/notifications/00000000-0000-0000-0000-000000000000/retry`)
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(404);
    });

    it('26. FAILED -> PENDING', async () => {
      const processSpy = vi.spyOn(windowedDigestWorker, 'processCycle').mockResolvedValue({ processed: 0, successful: 0, failed: 0 });
      
      const res = await request(app)
        .post(`/api/admin/notifications/${notificationId}/retry`)
        .set('Authorization', `Bearer ${adminUserToken}`);
      
      expect(res.status).toBe(200);
      expect(processSpy).toHaveBeenCalled();
      
      const db = getDb();
      const [updated] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId));
      expect(updated!.delivery_status).toBe('PENDING');
      expect(updated!.attempt_count).toBe(2); // explicitly NOT resetting to preserve canonical max-attempts logic
      expect(updated!.last_attempted_at).toBeNull(); // explicitly nullified to bypass backoff for manual admin retry
      expect(updated!.idempotency_key).toBe('test_failed_1'); // idempotency unchanged
    });

    it('28. PROCESSING -> rejected (400)', async () => {
      const res = await request(app)
        .post(`/api/admin/notifications/${processingNotificationId}/retry`)
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot retry notification/);
    });

    it('29. SENT -> rejected (400)', async () => {
      const res = await request(app)
        .post(`/api/admin/notifications/${successNotificationId}/retry`)
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(400);
    });

    it('genuine Promise.all notification retry race on FAILED', async () => {
      const processSpy = vi.spyOn(windowedDigestWorker, 'processCycle').mockResolvedValue({ processed: 0, successful: 0, failed: 0 });
      
      // Fire 5 concurrent requests for the SAME notification
      const requests = Array.from({ length: 5 }).map(() =>
        request(app)
          .post(`/api/admin/notifications/${notificationId}/retry`)
          .set('Authorization', `Bearer ${adminUserToken}`)
      );

      const responses = await Promise.all(requests);

      // Exactly one should succeed (200), rest should be rejected (400) because DB atomic update fails
      const successCount = responses.filter(r => r.status === 200).length;
      const rejectCount = responses.filter(r => r.status === 400).length;

      expect(successCount).toBe(1);
      expect(rejectCount).toBe(4);

      // Verify the final database state
      const db = getDb();
      const [updated] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId));
      expect(updated!.delivery_status).toBe('PENDING');
      expect(updated!.attempt_count).toBe(2);
      expect(updated!.last_attempted_at).toBeNull();
      expect(updated!.idempotency_key).toBe('test_failed_1');
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });
});
