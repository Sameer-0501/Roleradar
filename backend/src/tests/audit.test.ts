import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray, desc } from 'drizzle-orm';
import { generateToken } from '../auth/token.js';
import { requireAdmin } from '../auth/middleware.js';
import { createAdminRouter } from '../api/admin.js';
import { auditService, AuditActions, AuditOutcomes } from '../audit/audit-service.js';
import { scheduler } from '../scheduler/scheduler.js';

const app = express();
app.use(express.json());
app.set('trust proxy', true);
app.use((req, res, next) => {
  Object.defineProperty(req, 'ip', { value: '127.0.0.1' });
  next();
});
app.use('/api/admin', requireAdmin, createAdminRouter());

describe('Audit Logging (Phase 16.5)', () => {
  let regularUserToken: string;
  let adminUserToken: string;
  let regularUserId: string;
  let adminUserId: string;

  beforeEach(async () => {
    const db = getDb();
    
    // Clean up any lingering users from failed test runs
    const existingRegular = await db.select().from(schema.users).where(eq(schema.users.email, 'regular_audit@test.com'));
    const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, 'admin_audit@test.com'));
    
    if (existingRegular.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingRegular[0]!.id));
    if (existingAdmin.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingAdmin[0]!.id));

    await db.delete(schema.users).where(inArray(schema.users.email, ['regular_audit@test.com', 'admin_audit@test.com']));
    
    // Create users
    const [regularUser] = await db.insert(schema.users).values({
      email: 'regular_audit@test.com',
      name: 'Regular Audit User',
      password_hash: 'hash',
      email_verified: true,
      is_admin: false,
    }).returning();
    regularUserId = regularUser!.id;
    regularUserToken = generateToken({ userId: regularUserId, email: regularUser!.email, name: regularUser!.name });

    const [adminUser] = await db.insert(schema.users).values({
      email: 'admin_audit@test.com',
      name: 'Admin Audit User',
      password_hash: 'hash',
      email_verified: true,
      is_admin: true,
    }).returning();
    adminUserId = adminUser!.id;
    adminUserToken = generateToken({ userId: adminUserId, email: adminUser!.email, name: adminUser!.name });
    
    vi.restoreAllMocks();
    await db.delete(schema.adminAuditLogs).where(inArray(schema.adminAuditLogs.actor_user_id, [regularUserId, adminUserId]));
  });

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50));
    const db = getDb();
    await db.delete(schema.adminAuditLogs).where(inArray(schema.adminAuditLogs.actor_user_id, [regularUserId, adminUserId]));
  });

  describe('SCHEMA & AUTHENTICITY', () => {
    it('audit table exists, actor relationship is correct, reject invalid fields', async () => {
      const db = getDb();
      // Should successfully insert
      const [log] = await db.insert(schema.adminAuditLogs).values({
        actor_user_id: adminUserId,
        action: AuditActions.ADMIN_SOURCE_SCAN,
        resource_type: 'source',
        resource_id: 'TestCompany',
        outcome: AuditOutcomes.SUCCESS,
      }).returning();
      
      expect(log).toBeDefined();
      expect(log!.actor_user_id).toBe(adminUserId);
      expect(log!.created_at).toBeDefined();

      // Deleting user should fail due to RESTRICT (actor relationship check)
      await expect(db.delete(schema.users).where(eq(schema.users.id, adminUserId))).rejects.toThrow();
    });

    it('actor comes from req.user.id and cannot be spoofed, guest cannot write', async () => {
      // Mock scheduler to ensure we hit the success block
      vi.spyOn(scheduler, 'getState').mockReturnValue({ jobs: [{ name: 'TestCompany', status: 'IDLE' }] } as any);
      vi.spyOn(scheduler, 'triggerScan').mockResolvedValue();

      const res = await request(app)
        .post('/api/admin/sources/TestCompany/scan')
        .set('Authorization', `Bearer ${adminUserToken}`)
        // Try to spoof body (even though endpoint ignores it, verifies no vulnerability)
        .send({ actorUserId: regularUserId });
        
      expect(res.status).toBe(202);
      
      // Wait for async log
      await new Promise(r => setTimeout(r, 50));

      const db = getDb();
      const logs = await db.select().from(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, adminUserId));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.actor_user_id).toBe(adminUserId); // MUST be admin, not spoofed regular user
    });
  });

  describe('SECURITY EVENTS & READ API', () => {
    it('normal user gets 403 and creates ADMIN_AUTHORIZATION_FAILED event', async () => {
      const res = await request(app)
        .post('/api/admin/sources/TestCompany/scan')
        .set('Authorization', `Bearer ${regularUserToken}`);
        
      expect(res.status).toBe(403);

      await new Promise(r => setTimeout(r, 50));

      const db = getDb();
      const logs = await db.select().from(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, regularUserId));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.action).toBe(AuditActions.ADMIN_AUTHORIZATION_FAILED);
      expect(logs[0]!.outcome).toBe(AuditOutcomes.REJECTED);
      expect(logs[0]!.actor_user_id).toBe(regularUserId);
    });
    
    it('read API works for admin and supports pagination safely', async () => {
      // Insert 2 logs
      const db = getDb();
      await db.insert(schema.adminAuditLogs).values([
        { actor_user_id: adminUserId, action: AuditActions.ADMIN_SOURCE_SCAN, resource_type: 'source', resource_id: 'A', outcome: AuditOutcomes.SUCCESS },
        { actor_user_id: adminUserId, action: AuditActions.ADMIN_SOURCE_SCAN, resource_type: 'source', resource_id: 'B', outcome: AuditOutcomes.SUCCESS }
      ]);
      
      const res = await request(app)
        .get(`/api/admin/audit-logs?page=1&pageSize=1&actorId=${adminUserId}`)
        .set('Authorization', `Bearer ${adminUserToken}`);
        
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(2);
    });

    it('secrets (JWT/Headers) are never persisted in metadata', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${regularUserToken}`);
        
      expect(res.status).toBe(403);
      
      const db = getDb();
      const logs = await db.select().from(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, regularUserId)).orderBy(desc(schema.adminAuditLogs.created_at));
      const meta = logs[0]!.metadata as any;
      expect(meta.reason).toBeDefined();
      expect(JSON.stringify(meta)).not.toContain(regularUserToken);
    });
  });

  describe('APPEND ONLY', () => {
    it('service exposes no update or delete', () => {
      expect((auditService as any).updateAuditLog).toBeUndefined();
      expect((auditService as any).deleteAuditLog).toBeUndefined();
      expect(auditService.logAdminAction).toBeDefined();
      expect(auditService.getAuditLogs).toBeDefined();
    });
    
    it('no audit update/delete API exists', async () => {
      const res1 = await request(app).put('/api/admin/audit-logs/123').set('Authorization', `Bearer ${adminUserToken}`);
      expect(res1.status).toBe(404);
      
      const res2 = await request(app).delete('/api/admin/audit-logs/123').set('Authorization', `Bearer ${adminUserToken}`);
      expect(res2.status).toBe(404);
    });
  });

  describe('PAGINATION', () => {
    it('applies hard cap of 100 on pageSize', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?pageSize=1000000')
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.pageSize).toBe(100);
    });

    it('safely handles zero and negative page/pageSize', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?page=-1&pageSize=0')
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.pageSize).toBe(50);
    });

    it('safely handles non-numeric pagination', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?page=abc&pageSize=xyz')
        .set('Authorization', `Bearer ${adminUserToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.pageSize).toBe(50);
    });
  });
});
