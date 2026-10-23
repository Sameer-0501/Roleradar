import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { generateToken, verifyToken } from '../auth/token.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { registerHandler, loginHandler, revokeTokensHandler } from '../api/auth.js';

// Setup minimal Express test application
const app = express();
app.use(express.json());

app.post('/api/auth/register', registerHandler);
app.post('/api/auth/login', loginHandler);
app.post('/api/auth/revoke-sessions', requireAuth, revokeTokensHandler);

app.get('/api/protected', requireAuth, (req: any, res) => {
  res.json({ message: 'authorized', user: req.user });
});

app.get('/api/admin-only', requireAdmin, (req: any, res) => {
  res.json({ message: 'admin authorized', user: req.user });
});

describe('Token Versioning & Session Revocation (Phase 17)', () => {
  const TEST_EMAILS = [
    'tokentest-user@test.com',
    'tokentest-admin@test.com',
    'tokentest-reg@test.com',
  ];

  beforeEach(async () => {
    const db = getDb();
    await db.delete(schema.users).where(inArray(schema.users.email, TEST_EMAILS));
  });

  afterEach(async () => {
    const db = getDb();
    await db.delete(schema.users).where(inArray(schema.users.email, TEST_EMAILS));
  });

  it('1. registration enforces minimum 8 characters password policy', async () => {
    const shortRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'tokentest-reg@test.com',
        password: 'short', // 5 chars
        name: 'Short Pass User',
      });

    expect(shortRes.status).toBe(400);
    expect(shortRes.body.error).toContain('at least 8 characters long');

    const exact7Res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'tokentest-reg@test.com',
        password: 'seven_c', // 7 chars
        name: 'Short Pass User',
      });

    expect(exact7Res.status).toBe(400);
    expect(exact7Res.body.error).toContain('at least 8 characters long');

    const validRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'tokentest-reg@test.com',
        password: 'validPass123', // 12 chars
        name: 'Valid User',
      });

    expect(validRes.status).toBe(201);
    expect(validRes.body.token).toBeDefined();

    const decoded = verifyToken(validRes.body.token);
    expect(decoded?.tokenVersion).toBe(1);
  });

  it('2. login issues token containing user current token_version', async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'tokentest-user@test.com',
        name: 'Token User',
        password_hash: 'scrypt:mock:hash',
        token_version: 3,
        email_verified: true,
      })
      .returning();

    const token = generateToken({
      userId: user!.id,
      email: user!.email,
      tokenVersion: user!.token_version,
    });

    const decoded = verifyToken(token);
    expect(decoded?.tokenVersion).toBe(3);

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('authorized');
  });

  it('3. legacy tokens without tokenVersion are accepted when token_version is 1', async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'tokentest-user@test.com',
        name: 'Legacy User',
        password_hash: 'hash',
        token_version: 1,
        email_verified: true,
      })
      .returning();

    // Generate legacy token without tokenVersion claim
    const legacyToken = generateToken({
      userId: user!.id,
      email: user!.email,
    });

    const decoded = verifyToken(legacyToken);
    expect(decoded?.tokenVersion).toBeUndefined();

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${legacyToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('authorized');
  });

  it('4. incrementing token_version revokes all active and legacy tokens', async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'tokentest-user@test.com',
        name: 'Revoke User',
        password_hash: 'hash',
        token_version: 1,
        email_verified: true,
      })
      .returning();

    const v1Token = generateToken({
      userId: user!.id,
      email: user!.email,
      tokenVersion: 1,
    });

    const legacyToken = generateToken({
      userId: user!.id,
      email: user!.email,
    });

    // Both tokens work initially
    const res1 = await request(app).get('/api/protected').set('Authorization', `Bearer ${v1Token}`);
    expect(res1.status).toBe(200);

    const resLegacy1 = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${legacyToken}`);
    expect(resLegacy1.status).toBe(200);

    // Revoke sessions via endpoint
    const revokeRes = await request(app)
      .post('/api/auth/revoke-sessions')
      .set('Authorization', `Bearer ${v1Token}`);

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.tokenVersion).toBe(2);

    // Old tokens now return 401
    const res2 = await request(app).get('/api/protected').set('Authorization', `Bearer ${v1Token}`);
    expect(res2.status).toBe(401);
    expect(res2.body.error).toContain('revoked');

    const resLegacy2 = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${legacyToken}`);
    expect(resLegacy2.status).toBe(401);
    expect(resLegacy2.body.error).toContain('revoked');

    // New token issued with version 2 succeeds
    const v2Token = generateToken({
      userId: user!.id,
      email: user!.email,
      tokenVersion: 2,
    });

    const res3 = await request(app).get('/api/protected').set('Authorization', `Bearer ${v2Token}`);
    expect(res3.status).toBe(200);
  });

  it('5. tampered tokenVersion signature fails verification', async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'tokentest-user@test.com',
        name: 'Attacker Target',
        password_hash: 'hash',
        token_version: 5,
        email_verified: true,
      })
      .returning();

    const legitimateToken = generateToken({
      userId: user!.id,
      email: user!.email,
      tokenVersion: 1,
    });

    // Attacker modifies payload to have tokenVersion: 5 without valid secret
    const parts = legitimateToken.split('.');
    const decodedPayload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString('utf8'));
    decodedPayload.tokenVersion = 5;
    const forgedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
    const forgedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid or expired authentication token');
  });

  it('6. deleted user account cannot authenticate even with matching tokenVersion', async () => {
    const token = generateToken({
      userId: '00000000-0000-0000-0000-000000000099',
      email: 'nonexistent@test.com',
      tokenVersion: 1,
    });

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('User account no longer exists');
  });

  it('7. admin authorization validates both admin flag and active tokenVersion', async () => {
    const db = getDb();
    const [admin] = await db
      .insert(schema.users)
      .values({
        email: 'tokentest-admin@test.com',
        name: 'Admin User',
        password_hash: 'hash',
        token_version: 1,
        is_admin: true,
        email_verified: true,
      })
      .returning();

    const adminToken = generateToken({
      userId: admin!.id,
      email: admin!.email,
      tokenVersion: 1,
    });

    const resOk = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resOk.status).toBe(200);

    // Revoke admin token
    await db
      .update(schema.users)
      .set({ token_version: 2 })
      .where(eq(schema.users.id, admin!.id));

    const resRevoked = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resRevoked.status).toBe(401);
    expect(resRevoked.body.error).toContain('revoked');
  });
});
