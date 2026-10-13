import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '../utils/logger.js';
import {
  overviewHandler,
  sourcesHandler,
  scansHandler,
  verificationsHandler,
  jobsHandler,
  notificationsHandler,
  workersHandler,
  coverageHandler
} from './admin-dashboard.js';

import {
  adminTriggerSourceScanHandler,
  adminReverifyJobHandler,
  adminRetryNotificationHandler,
  adminGetAuditLogsHandler,
} from './admin-operations.js';
import {
  perSourceScanTriggerLimiter,
  adminReverifyLimiter,
  adminRetryLimiter,
} from './rate-limiters.js';

const log = createLogger('api:admin');

export function createAdminRouter(): Router {
  const router = Router();

  /**
   * GET /api/admin/access-check
   * 
   * Minimal foundation endpoint to verify that the `requireAdmin` middleware
   * successfully identifies an administrator and blocks non-administrators.
   */
  router.get('/access-check', (_req: Request, res: Response) => {
    log.info('Admin access check successful');
    res.json({
      access: 'granted',
      message: 'Admin access verified',
    });
  });

  // ─── Phase 16.3 Read-Only Operations Dashboard ──────────────────────────
  router.get('/overview', overviewHandler as any);
  router.get('/sources', sourcesHandler as any);
  router.get('/scans', scansHandler as any);
  router.get('/verifications', verificationsHandler as any);
  router.get('/jobs', jobsHandler as any);
  router.get('/notifications', notificationsHandler as any);
  router.get('/workers', workersHandler as any);
  router.get('/coverage', coverageHandler as any);

  // ─── Phase 16.4A Safe Operational Controls ──────────────────────────────
  router.post('/sources/:companyName/scan', perSourceScanTriggerLimiter, adminTriggerSourceScanHandler as any);
  router.post('/jobs/:id/reverify', adminReverifyLimiter, adminReverifyJobHandler as any);
  router.post('/notifications/:id/retry', adminRetryLimiter, adminRetryNotificationHandler as any);

  // ─── Phase 16.5 Audit Logging ───────────────────────────────────────────
  router.get('/audit-logs', adminGetAuditLogsHandler as any);

  return router;
}
