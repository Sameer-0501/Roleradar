import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('Admin Dashboard Read-Only Endpoints (Phase 16.3)', () => {
  let regularUserToken: string;
  let adminUserToken: string;
  let regularUserId: string;
  let adminUserId: string;

  beforeEach(async () => {
    const db = getDb();
    
    const existingRegular = await db.select().from(schema.users).where(eq(schema.users.email, 'reg-dash@test.com'));
    const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, 'admin-dash@test.com'));
    if (existingRegular.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingRegular[0]!.id));
    if (existingAdmin.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingAdmin[0]!.id));

    await db.delete(schema.users).where(inArray(schema.users.email, ['reg-dash@test.com', 'admin-dash@test.com']));
    
    const [regularUser] = await db.insert(schema.users).values({
      email: 'reg-dash@test.com', name: 'Reg Dash', password_hash: 'hash', email_verified: true, is_admin: false,
    }).returning();
    regularUserId = regularUser!.id;
    regularUserToken = generateToken({ userId: regularUserId, email: regularUser!.email, name: regularUser!.name });

    const [adminUser] = await db.insert(schema.users).values({
      email: 'admin-dash@test.com', name: 'Admin Dash', password_hash: 'hash', email_verified: true, is_admin: true,
    }).returning();
    adminUserId = adminUser!.id;
    adminUserToken = generateToken({ userId: adminUserId, email: adminUser!.email, name: adminUser!.name });
  });

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50));
    
    const db = getDb();
    await db.delete(schema.adminAuditLogs).where(inArray(schema.adminAuditLogs.actor_user_id, [regularUserId, adminUserId]));
    await db.delete(schema.users).where(eq(schema.users.id, regularUserId));
    await db.delete(schema.users).where(eq(schema.users.id, adminUserId));
  });

  // Array of new endpoints to test standard auth
  const endpoints = [
    '/api/admin/overview',
    '/api/admin/sources',
    '/api/admin/scans',
    '/api/admin/verifications',
    '/api/admin/jobs',
    '/api/admin/notifications',
    '/api/admin/workers',
    '/api/admin/coverage'
  ];

  endpoints.forEach((ep) => {
    describe(`Endpoint ${ep}`, () => {
      it('rejects unauthenticated request', async () => {
        const res = await request(app).get(ep);
        expect(res.status).toBe(401);
      });

      it('rejects authenticated regular user', async () => {
        const res = await request(app).get(ep).set('Authorization', `Bearer ${regularUserToken}`);
        expect(res.status).toBe(403);
      });

      it('allows authenticated admin', async () => {
        const res = await request(app).get(ep).set('Authorization', `Bearer ${adminUserToken}`);
        expect(res.status).toBe(200);
      }, 30_000);
      
      it('returns safe bounded data without exposing secrets', async () => {
        const res = await request(app).get(ep).set('Authorization', `Bearer ${adminUserToken}`);
        expect(res.status).toBe(200);
        const strBody = JSON.stringify(res.body);
        
        // Assert no leaking of typical secret keys
        expect(strBody).not.toMatch(/api_key|jwt_secret/i);
        
        // Assert structure depending on endpoint type
        if (ep.includes('overview')) {
          expect(res.body).toHaveProperty('system');
          expect(res.body).toHaveProperty('jobs');
        } else if (res.body.pagination) {
          // Assert pagination limit respects upper bound
          expect(res.body.pagination.limit).toBeLessThanOrEqual(100);
          expect(Array.isArray(res.body.data)).toBe(true);
        }
      }, 30_000);
    });
  });
});
