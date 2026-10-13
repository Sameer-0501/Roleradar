/**
 * Email Ownership Verification Service.
 *
 * Implements genuine, cryptographically secure email verification:
 * - 32-byte (256-bit) cryptographically random raw tokens.
 * - Stores ONLY the SHA-256 hash of tokens in PostgreSQL.
 * - 24-hour expiration window.
 * - One-time use: token hash is cleared immediately upon successful verification.
 * - Rate-limited resend (60s cooldown).
 * - Zero raw token logging or API leakage.
 */

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { getEmailProvider } from '../notifications/email/provider-factory.js';
import { renderVerificationEmail } from '../notifications/email/templates/verification-email.js';

const log = createLogger('auth:verification');

export const TOKEN_EXPIRY_HOURS = 24;
export const RESEND_COOLDOWN_SECONDS = 60;

export interface TokenGenerationResult {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface VerificationResult {
  success: boolean;
  error?: string;
  userId?: string;
  email?: string;
}

export interface ResendResult {
  success: boolean;
  rateLimited?: boolean;
  error?: string;
  message?: string;
}

/**
 * Generate a cryptographically secure random verification token and its SHA-256 hash.
 */
export function generateVerificationToken(): TokenGenerationResult {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  return { rawToken, tokenHash, expiresAt };
}

/**
 * Compute SHA-256 hash of a raw verification token.
 */
export function hashVerificationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a new verification token and dispatch the verification email.
 */
export async function sendVerificationEmailForUser(
  userId: string,
  email: string,
  name?: string | null
): Promise<boolean> {
  const db = getDb();
  const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
  const now = new Date();

  // Persist only the token hash to PostgreSQL
  await db
    .update(schema.users)
    .set({
      verification_token_hash: tokenHash,
      verification_token_expires_at: expiresAt,
      last_verification_sent_at: now,
      updated_at: now,
    })
    .where(eq(schema.users.id, userId));

  // Determine frontend base URL (default localhost:5173)
  const frontendUrl = config.corsOrigins[0] || 'http://localhost:5173';
  const verificationUrl = `${frontendUrl}/#/verify-email?token=${rawToken}`;

  const emailContent = renderVerificationEmail({
    recipientName: name,
    verificationUrl,
    expiresInHours: TOKEN_EXPIRY_HOURS,
  });

  const emailProvider = getEmailProvider();
  const sendResult = await emailProvider.sendEmail({
    to: email,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    idempotencyKey: `verify:${userId}:${tokenHash.slice(0, 16)}`,
    category: 'email-verification',
  });

  log.info(
    { userId, emailDomain: email.split('@')[1], success: sendResult.success },
    'VERIFICATION_EMAIL_DISPATCHED'
  );

  return sendResult.success;
}

/**
 * Verify an email using the raw token provided by the user link.
 */
export async function verifyEmailToken(rawToken: string): Promise<VerificationResult> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return { success: false, error: 'Verification token is required.' };
  }

  const trimmedToken = rawToken.trim();
  const tokenHash = hashVerificationToken(trimmedToken);
  const db = getDb();

  // Look up user by the SHA-256 token hash
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      emailVerified: schema.users.email_verified,
      expiresAt: schema.users.verification_token_expires_at,
    })
    .from(schema.users)
    .where(eq(schema.users.verification_token_hash, tokenHash))
    .limit(1);

  if (!user) {
    return {
      success: false,
      error: 'Invalid or expired verification token. It may have already been used.',
    };
  }

  // Expiration check
  if (user.expiresAt && user.expiresAt < new Date()) {
    return {
      success: false,
      error: 'Verification link has expired. Please request a new verification email.',
    };
  }

  const now = new Date();

  // Atomically mark verified and invalidate the token (prevents reuse)
  await db
    .update(schema.users)
    .set({
      email_verified: true,
      email_verified_at: now,
      verification_token_hash: null,
      verification_token_expires_at: null,
      updated_at: now,
    })
    .where(eq(schema.users.id, user.id));

  log.info({ userId: user.id }, 'EMAIL_VERIFIED_SUCCESSFULLY');

  return {
    success: true,
    userId: user.id,
    email: user.email,
  };
}

/**
 * Safely resend a verification email with rate limiting and generic responses.
 */
export async function resendVerificationEmail(
  identifier: { email?: string; userId?: string }
): Promise<ResendResult> {
  const db = getDb();
  let userRecord: {
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean;
    lastSentAt: Date | null;
  } | undefined;

  if (identifier.userId) {
    const [found] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        emailVerified: schema.users.email_verified,
        lastSentAt: schema.users.last_verification_sent_at,
      })
      .from(schema.users)
      .where(eq(schema.users.id, identifier.userId))
      .limit(1);
    userRecord = found;
  } else if (identifier.email) {
    const normalized = identifier.email.trim().toLowerCase();
    const [found] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        emailVerified: schema.users.email_verified,
        lastSentAt: schema.users.last_verification_sent_at,
      })
      .from(schema.users)
      .where(eq(schema.users.email, normalized))
      .limit(1);
    userRecord = found;
  }

  // Generic response to prevent arbitrary email enumeration
  if (!userRecord) {
    return {
      success: true,
      message: 'If an unverified account exists with that email, a verification link has been sent.',
    };
  }

  // Already verified
  if (userRecord.emailVerified) {
    return {
      success: true,
      message: 'This email address is already verified.',
    };
  }

  // Rate limit cooldown check (60s)
  const now = new Date();
  if (userRecord.lastSentAt) {
    const elapsedSeconds = (now.getTime() - userRecord.lastSentAt.getTime()) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);
      return {
        success: false,
        rateLimited: true,
        error: `Please wait ${waitSeconds} second${waitSeconds !== 1 ? 's' : ''} before requesting another verification email.`,
      };
    }
  }

  // Invalidate previous token and generate new one
  await sendVerificationEmailForUser(userRecord.id, userRecord.email, userRecord.name);

  return {
    success: true,
    message: 'A new verification email has been sent. Please check your inbox.',
  };
}
