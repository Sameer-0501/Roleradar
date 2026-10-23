/**
 * RoleRadar Rate Limiters.
 *
 * Pre-configured express-rate-limit instances for protecting public and
 * semi-public endpoints from abuse, brute force, and data harvesting.
 *
 * Limits:
 *   - Auth endpoints (register, login, resend-verification): strict short windows
 *   - Search endpoints: generous but bounded to prevent scraping
 *   - Engine scan triggers: extremely restrictive
 *
 * The in-memory store resets on server restart. Acceptable for single-process
 * deployments. Replace with a Redis store (rate-limit-redis) when scaling horizontally.
 *
 * NEVER rate-limit:
 *   - Internal scheduler execution
 *   - Normal authenticated user actions (dashboard, workspace, profile, notifications)
 *   - Database-internal operations
 */

import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { auditService, AuditActions, AuditOutcomes } from '../audit/audit-service.js';
import type { AuthenticatedRequest } from '../auth/middleware.js';

const SKIP_SUCCESSFUL_REQUESTS = false; // count all requests, not just failures

/**
 * Robust IP resolver that honors Express req.ip (when trust proxy is enabled)
 * while safely falling back to socket address without throwing in unmounted unit tests.
 */
function getClientIp(req: any): string {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

const COMMON_LIMITER_CONFIG = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    keyGeneratorIpFallback: false,
    default: true,
  },
  keyGenerator: (req: any) => ipKeyGenerator(getClientIp(req)),
};

/** POST /auth/register — 5 attempts per 15 minutes */
export const registerLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: SKIP_SUCCESSFUL_REQUESTS,
  message: {
    error: 'Too many registration attempts. Please try again in 15 minutes.',
    retryAfter: 15,
  },
});

/** POST /auth/login — 10 attempts per 15 minutes */
export const loginLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: SKIP_SUCCESSFUL_REQUESTS,
  message: {
    error: 'Too many login attempts. Please try again in 15 minutes.',
    retryAfter: 15,
  },
});

/** POST /auth/resend-verification — 3 attempts per 15 minutes */
export const resendVerificationLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 15 * 60 * 1000,
  max: 3,
  skipSuccessfulRequests: SKIP_SUCCESSFUL_REQUESTS,
  message: {
    error: 'Too many verification email requests. Please try again in 15 minutes.',
    retryAfter: 15,
  },
});

/**
 * Search endpoints (GET /search, GET /search/suggestions, POST /search/explain)
 * 60 requests per minute — generous for normal use, blocks scrapers.
 */
export const searchLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 60 * 1000,
  max: 60,
  skipSuccessfulRequests: false,
  message: {
    error: 'Too many search requests. Please slow down.',
    retryAfter: 1,
  },
});

/**
 * POST /jobs/engine/scan/trigger (bulk) — 2 per 15 minutes.
 * Extremely restrictive: triggers all collectors simultaneously.
 */
export const bulkScanTriggerLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 15 * 60 * 1000,
  max: 2,
  skipSuccessfulRequests: false,
  message: {
    error: 'Bulk scan trigger rate limit exceeded. Try again in 15 minutes.',
    retryAfter: 15,
  },
});

/**
 * POST /jobs/engine/sources/:id/scan (per-source) — 3 per 15 minutes.
 */
export const perSourceScanTriggerLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 15 * 60 * 1000,
  max: 3,
  skipSuccessfulRequests: false,
  message: {
    error: 'Per-source scan trigger rate limit exceeded. Try again in 15 minutes.',
    retryAfter: 15,
  },
  handler: async (req, res, _next, options) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user) {
      try {
        await auditService.logAdminAction({
          actorUserId: authReq.user.id,
          action: AuditActions.ADMIN_RATE_LIMIT_EXCEEDED,
          resourceType: 'admin_endpoint',
          resourceId: req.originalUrl,
          outcome: AuditOutcomes.REJECTED,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { limit: options.max, windowMs: options.windowMs }
        });
      } catch (err) {}
    }
    res.status(options.statusCode).json(options.message);
  }
});

/**
 * POST /api/admin/jobs/:id/reverify (admin operation) — 50 per 15 minutes.
 */
export const adminReverifyLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: false,
  message: {
    error: 'Admin reverification rate limit exceeded. Try again in 15 minutes.',
    retryAfter: 15,
  },
  handler: async (req, res, _next, options) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user) {
      try {
        await auditService.logAdminAction({
          actorUserId: authReq.user.id,
          action: AuditActions.ADMIN_RATE_LIMIT_EXCEEDED,
          resourceType: 'admin_endpoint',
          resourceId: req.originalUrl,
          outcome: AuditOutcomes.REJECTED,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { limit: options.max, windowMs: options.windowMs }
        });
      } catch (err) {}
    }
    res.status(options.statusCode).json(options.message);
  }
});

/**
 * POST /api/admin/notifications/:id/retry (admin operation) — 50 per 15 minutes.
 */
export const adminRetryLimiter = rateLimit({
  ...COMMON_LIMITER_CONFIG,
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: false,
  message: {
    error: 'Admin notification retry rate limit exceeded. Try again in 15 minutes.',
    retryAfter: 15,
  },
  handler: async (req, res, _next, options) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user) {
      try {
        await auditService.logAdminAction({
          actorUserId: authReq.user.id,
          action: AuditActions.ADMIN_RATE_LIMIT_EXCEEDED,
          resourceType: 'admin_endpoint',
          resourceId: req.originalUrl,
          outcome: AuditOutcomes.REJECTED,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { limit: options.max, windowMs: options.windowMs }
        });
      } catch (err) {}
    }
    res.status(options.statusCode).json(options.message);
  }
});
