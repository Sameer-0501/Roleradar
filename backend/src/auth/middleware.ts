/**
 * Authentication Middleware.
 *
 * Validates the Authorization: Bearer <token> header and attaches the
 * authenticated user to `req.user`.
 *
 * Responds with 401 Unauthorized for missing, expired, or invalid tokens.
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { verifyToken, type TokenPayload } from './token.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';
import { config } from '../config/env.js';
import { auditService, AuditActions, AuditOutcomes } from '../audit/audit-service.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  is_beta_user: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  tokenPayload?: TokenPayload;
}

export interface StrictlyAuthenticatedRequest extends AuthenticatedRequest {
  user: AuthenticatedUser;
  tokenPayload: TokenPayload;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please provide a valid Bearer token.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
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
        isAdmin: schema.users.is_admin,
        is_beta_user: schema.users.is_beta_user,
      })
      .from(schema.users)
      .where(eq(schema.users.id, payload.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'User account no longer exists.' });
      return;
    }

    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify user credentials.' });
  }
}

/**
 * Optional authentication middleware.
 * Attaches user if valid Bearer token is provided, but continues regardless.
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);

  if (!payload) {
    next();
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
        isAdmin: schema.users.is_admin,
        is_beta_user: schema.users.is_beta_user,
      })
      .from(schema.users)
      .where(eq(schema.users.id, payload.userId))
      .limit(1);

    if (user) {
      req.user = user;
      req.tokenPayload = payload;
    }
    next();
  } catch {
    next();
  }
}

/**
 * Require Admin Middleware.
 *
 * Enforces that the authenticated user has administrator privileges.
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireAuth(req, res, async () => {
    if (req.user && req.user.isAdmin === true) {
      next();
    } else {
      if (req.user) {
        try {
          await auditService.logAdminAction({
            actorUserId: req.user.id,
            action: AuditActions.ADMIN_AUTHORIZATION_FAILED,
            resourceType: 'admin_endpoint',
            resourceId: req.originalUrl,
            outcome: AuditOutcomes.REJECTED,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { reason: 'Administrator privileges required' }
          });
        } catch (err) {
          console.error('Audit log failed in requireAdmin:', err);
        }
      }
      res.status(403).json({ error: 'Access forbidden. Administrator privileges required.' });
    }
  });
}

/**
 * Internal API key middleware for engine admin / operational endpoints.
 *
 * Reads the `X-Internal-Key` request header and compares it timing-safely
 * against the configured INTERNAL_API_KEY environment variable.
 *
 * - If INTERNAL_API_KEY is not configured: returns 503 (not open access).
 * - If key is missing or wrong: returns 401.
 * - If key matches: continues to handler.
 *
 * Usage: apply to engine scan trigger and internal monitoring endpoints.
 */
export function requireInternalKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!config.internalApiKey) {
    res.status(503).json({
      error: 'This endpoint is not available. Set INTERNAL_API_KEY in your environment to enable it.',
    });
    return;
  }

  const providedKey = req.headers['x-internal-key'];
  if (typeof providedKey !== 'string' || providedKey.length === 0) {
    res.status(401).json({ error: 'Missing X-Internal-Key header.' });
    return;
  }

  // Timing-safe comparison to prevent timing attacks on the key
  const expected = Buffer.from(config.internalApiKey, 'utf8');
  const provided = Buffer.from(providedKey, 'utf8');

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Invalid internal API key.' });
    return;
  }

  next();
}
