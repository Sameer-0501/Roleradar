/**
 * Authentication API Handlers.
 *
 * Provides registration, login, profile retrieval, email verification,
 * and verification email resend endpoints.
 */

import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateToken } from '../auth/token.js';
import {
  sendVerificationEmailForUser,
  verifyEmailToken,
  resendVerificationEmail,
} from '../auth/email-verification-service.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import { config } from '../config/env.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const { email, password, name } = req.body ?? {};

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanedName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;

  try {
    const db = getDb();
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);

    const [inserted] = await db
      .insert(schema.users)
      .values({
        email: normalizedEmail,
        name: cleanedName,
        password_hash: passwordHash,
        email_verified: false,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        emailVerified: schema.users.email_verified,
        emailVerifiedAt: schema.users.email_verified_at,
        tokenVersion: schema.users.token_version,
        createdAt: schema.users.created_at,
      });

    // Dispatch verification email with cryptographically random token
    void sendVerificationEmailForUser(inserted!.id, inserted!.email, inserted!.name);

    const token = generateToken({
      userId: inserted!.id,
      email: inserted!.email,
      name: inserted!.name,
      tokenVersion: inserted!.tokenVersion,
    });

    res.status(201).json({
      message: 'Registration successful. A verification link has been sent to your email.',
      token,
      user: inserted,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user account.' });
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const db = getDb();
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        passwordHash: schema.users.password_hash,
        emailVerified: schema.users.email_verified,
        emailVerifiedAt: schema.users.email_verified_at,
        createdAt: schema.users.created_at,
        isAdmin: schema.users.is_admin,
        is_beta_user: schema.users.is_beta_user,
        tokenVersion: schema.users.token_version,
      })
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.tokenVersion,
    });

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        isAdmin: user.isAdmin,
        is_beta_user: user.is_beta_user,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process login request.' });
  }
}

export async function meHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    const db = getDb();
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        emailVerified: schema.users.email_verified,
        emailVerifiedAt: schema.users.email_verified_at,
        createdAt: schema.users.created_at,
        isAdmin: schema.users.is_admin,
        is_beta_user: schema.users.is_beta_user,
      })
      .from(schema.users)
      .where(eq(schema.users.id, req.user.id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
}

/**
 * GET or POST /api/auth/verify-email
 * Validates a verification token and activates the account.
 */
export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const rawToken =
    (typeof req.query['token'] === 'string' ? req.query['token'] : null) ||
    (typeof req.body?.['token'] === 'string' ? req.body['token'] : null);

  if (!rawToken) {
    if (req.method === 'GET') {
      const frontendUrl = config.corsOrigins[0] || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/#/verify-email?status=error&error=Missing+verification+token`);
      return;
    }
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }

  try {
    const result = await verifyEmailToken(rawToken);

    if (!result.success) {
      if (req.method === 'GET') {
        const frontendUrl = config.corsOrigins[0] || 'http://localhost:5173';
        res.redirect(
          `${frontendUrl}/#/verify-email?status=error&error=${encodeURIComponent(
            result.error || 'Verification failed'
          )}`
        );
        return;
      }
      res.status(400).json({ error: result.error });
      return;
    }

    if (req.method === 'GET') {
      const frontendUrl = config.corsOrigins[0] || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/#/verify-email?status=success`);
      return;
    }

    res.json({
      success: true,
      message: 'Email address verified successfully. You can now receive job alerts.',
      email: result.email,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process email verification.' });
  }
}

/**
 * POST /api/auth/resend-verification
 * Resends a verification email with rate limiting.
 */
export async function resendVerificationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;
  const userId = req.user?.id;

  if (!email && !userId) {
    res.status(400).json({ error: 'Email address or authenticated session is required.' });
    return;
  }

  try {
    const result = await resendVerificationEmail({ email, userId });

    if (result.rateLimited) {
      res.status(429).json({ error: result.error });
      return;
    }

    res.json({ message: result.message });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process verification resend request.' });
  }
}

/**
 * POST /api/auth/revoke-sessions
 * Invalidates all active tokens for the authenticated user by incrementing token_version.
 */
export async function revokeTokensHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.users)
      .set({
        token_version: sql`${schema.users.token_version} + 1`,
        updated_at: new Date(),
      })
      .where(eq(schema.users.id, req.user.id))
      .returning({ tokenVersion: schema.users.token_version });

    res.json({
      message: 'All active sessions have been revoked.',
      tokenVersion: updated?.tokenVersion ?? 1,
    });
  } catch {
    res.status(500).json({ error: 'Failed to revoke sessions.' });
  }
}

