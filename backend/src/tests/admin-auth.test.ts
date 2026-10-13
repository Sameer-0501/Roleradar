import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray } from 'drizzle-orm';
import { generateToken } from '../auth/token.js';
import { config } from '../config/env.js';
import { requireAdmin, requireInternalKey } from '../auth/middleware.js';
import { createAdminRouter } from '../api/admin.js';

// Setup inline app for testing
const app = express();
app.use(express.json());
app.use('/api/admin', requireAdmin, createAdminRouter());
// Setup internal endpoint
app.post('/api/jobs/engine/scan/trigger', requireInternalKey, (req, res) => {
  res.json({ message: 'scan triggered' });
});

describe('Admin Authentication & Authorization (Phase 16.2)', () => {
  let regularUserToken: string;
  let adminUserToken: string;
  let regularUserId: string;
  let adminUserId: string;

  beforeEach(async () => {
    const db = getDb();
    
    const existingRegular = await db.select().from(schema.users).where(eq(schema.users.email, 'regular@test.com'));
    const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, 'admin@test.com'));
    if (existingRegular.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingRegular[0]!.id));
    if (existingAdmin.length) await db.delete(schema.adminAuditLogs).where(eq(schema.adminAuditLogs.actor_user_id, existingAdmin[0]!.id));

    await db.delete(schema.users).where(inArray(schema.users.email, ['regular@test.com', 'admin@test.com']));
    
    // Create a regular user
    const [regularUser] = await db.insert(schema.users).values({
      email: 'regular@test.com',
      name: 'Regular User',
      password_hash: 'hash',
      email_verified: true,
      is_admin: false,
    }).returning();
    
    regularUserId = regularUser!.id;
    regularUserToken = generateToken({
      userId: regularUserId,
      email: regularUser!.email,
      name: regularUser!.name,
    });

    // Create an admin user
    const [adminUser] = await db.insert(schema.users).values({
      email: 'admin@test.com',
      name: 'Admin User',
      password_hash: 'hash',
      email_verified: true,
      is_admin: true,
    }).returning();
    
    adminUserId = adminUser!.id;
    adminUserToken = generateToken({
      userId: adminUserId,
      email: adminUser!.email,
      name: adminUser!.name,
    });
  });

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50));
    
    const db = getDb();
    await db.delete(schema.adminAuditLogs).where(inArray(schema.adminAuditLogs.actor_user_id, [regularUserId, adminUserId]));
    await db.delete(schema.users).where(eq(schema.users.id, regularUserId));
    await db.delete(schema.users).where(eq(schema.users.id, adminUserId));
  });

  it('1. unauthenticated request to admin endpoint -> rejected', async () => {
    const res = await request(app).get('/api/admin/access-check');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/);
  });

  it('2. authenticated normal user -> 403', async () => {
    const res = await request(app)
      .get('/api/admin/access-check')
      .set('Authorization', `Bearer ${regularUserToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Administrator privileges required/);
  });

  it('3. authenticated admin -> allowed', async () => {
    const res = await request(app)
      .get('/api/admin/access-check')
      .set('Authorization', `Bearer ${adminUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.access).toBe('granted');
  });

  it('4. normal registration cannot create admin', async () => {
    const { registerHandler } = await import('../api/auth.js');
    
    const req = {
      body: {
        email: 'hacker@test.com',
        password: 'password123',
        name: 'Hacker',
        is_admin: true,
        role: 'admin'
      }
    } as any;
    
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await registerHandler(req, res);
    
    expect(res.status).toHaveBeenCalledWith(201);
    
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, 'hacker@test.com'),
    });
    
    expect(user).toBeDefined();
    expect(user!.is_admin).toBe(false); // Must still be false

    await db.delete(schema.users).where(eq(schema.users.id, user!.id));
  });

  it('5. internal scan trigger remains protected and rejects JWT', async () => {
    // A JWT should not work on internal engine endpoints.
    const res = await request(app)
      .post('/api/jobs/engine/scan/trigger')
      .set('Authorization', `Bearer ${adminUserToken}`);
    
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing X-Internal-Key header/);
  });

  it('6. internal scan trigger allows X-Internal-Key', async () => {
    // Only X-Internal-Key should work
    const res = await request(app)
      .post('/api/jobs/engine/scan/trigger')
      .set('X-Internal-Key', config.internalApiKey);
    
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('scan triggered');
  });
});
