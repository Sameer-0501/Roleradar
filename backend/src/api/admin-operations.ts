import { type Response } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { scheduler } from '../scheduler/scheduler.js';
import { reverificationWorker } from '../jobs/reverification-worker.js';
import { windowedDigestWorker } from '../notifications/digest-worker.js';
import { auditService, AuditActions, AuditOutcomes, AuditAction, AuditOutcome } from '../audit/audit-service.js';
import type { AuthenticatedRequest } from '../auth/middleware.js';

const log = createLogger('api:admin-operations');

/**
 * POST /api/admin/sources/:companyName/scan
 * Triggers a source scan safely via the scheduler.
 */
export async function adminTriggerSourceScanHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const companyName = String(req.params['companyName'] || '').trim();
  if (!companyName) {
    res.status(400).json({ error: 'Company name parameter is required.' });
    return;
  }

  try {
    const schedulerState = scheduler.getState();
    const matchingJob = schedulerState.jobs.find((j) =>
      j.name.toLowerCase().includes(companyName.toLowerCase())
    );

    if (!matchingJob) {
      res.status(404).json({
        error: `No active collector found for company: "${companyName}".`,
      });
      return;
    }

    // Rely on scheduler's inherent concurrency protection.
    // If it's already running, scheduler.triggerScan internally rejects or logs it.
    // triggerScan executes asynchronously.
    const user = req.user!;
    scheduler.triggerScan(matchingJob.name)
      .then(async () => {
        await auditService.logAdminAction({
          actorUserId: user.id,
          action: AuditActions.ADMIN_SOURCE_SCAN,
          resourceType: 'source',
          resourceId: matchingJob.name,
          outcome: AuditOutcomes.SUCCESS,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      })
      .catch(async (err) => {
        log.error(
          { company: companyName, err: err instanceof Error ? err.message : String(err) },
          'Admin triggered scan failed'
        );
        await auditService.logAdminAction({
          actorUserId: user.id,
          action: AuditActions.ADMIN_SOURCE_SCAN,
          resourceType: 'source',
          resourceId: matchingJob.name,
          outcome: AuditOutcomes.FAILURE,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { error: err instanceof Error ? err.message : String(err) },
        }).catch(() => {});
      });

    res.status(202).json({
      message: `Scan triggered for ${matchingJob.name}`,
    });
  } catch (err) {
    console.error('API ERROR (adminTriggerSourceScanHandler):', err);
    log.error({ err: err instanceof Error ? err.message : String(err), companyName }, 'Failed to trigger scan via admin');
    res.status(500).json({ error: 'Failed to trigger scan.' });
  }
}

/**
 * POST /api/admin/jobs/:id/reverify
 * Re-verifies a single job safely using the canonical verification pipeline.
 */
export async function adminReverifyJobHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const rawId = req.params['id'];
  const jobId = Array.isArray(rawId) ? String(rawId[0] || '') : String(rawId || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const db = getDb();
    
    // Fetch canonical job data required by the verification pipeline
    const records = await db
      .select({
        id: schema.jobs.id,
        externalJobId: schema.jobs.external_job_id,
        title: schema.jobs.title,
        location: schema.jobs.location,
        officialUrl: schema.jobs.official_url,
        applyUrl: schema.jobs.apply_url,
        sourceSystem: schema.jobs.source_system,
        companyName: schema.companies.name,
        companyId: schema.jobs.company_id,
        status: schema.jobs.status,
        verificationStatus: schema.jobs.verification_status,
        firstSeenAt: schema.jobs.first_seen_at,
        lastSeenAt: schema.jobs.last_seen_at,
      })
      .from(schema.jobs)
      .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
      .where(eq(schema.jobs.id, jobId))
      .limit(1);

    if (records.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = records[0]!;
    const user = req.user!;
    
    // Attempt verification using the exact canonical worker method (which is now concurrency-protected)
    try {
      const outcome = await reverificationWorker.executeSingleReverification(job);
      
      await auditService.logAdminAction({
        actorUserId: user.id,
        action: AuditActions.ADMIN_JOB_REVERIFY,
        resourceType: 'job',
        resourceId: jobId,
        outcome: AuditOutcomes.SUCCESS,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { verificationStatus: outcome },
      });

      res.status(200).json({
        message: 'Re-verification complete',
        status: outcome
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'Verification already in progress for this job') {
        await auditService.logAdminAction({
          actorUserId: user.id,
          action: AuditActions.ADMIN_JOB_REVERIFY,
          resourceType: 'job',
          resourceId: jobId,
          outcome: AuditOutcomes.CONFLICT,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { error: err.message },
        });
        res.status(409).json({ error: 'Verification already in progress for this job' });
        return;
      }
      
      await auditService.logAdminAction({
        actorUserId: user.id,
        action: AuditActions.ADMIN_JOB_REVERIFY,
        resourceType: 'job',
        resourceId: jobId,
        outcome: AuditOutcomes.FAILURE,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  } catch (err) {
    console.error('API ERROR (adminReverifyJobHandler):', err);
    log.error({ err: err instanceof Error ? err.message : String(err), jobId }, 'Admin failed to re-verify job');
    res.status(500).json({ error: 'Failed to re-verify job.' });
  }
}

/**
 * POST /api/admin/notifications/:id/retry
 * Resets a failed notification to PENDING and immediately kicks the worker.
 */
export async function adminRetryNotificationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const rawId = req.params['id'];
  const notificationId = Array.isArray(rawId) ? String(rawId[0] || '') : String(rawId || '');
  if (!notificationId) {
    res.status(400).json({ error: 'Notification ID is required' });
    return;
  }

  try {
    const db = getDb();
    const user = req.user!;
    
    const result = await db.transaction(async (tx) => {
      // Safely attempt state transition using atomic UPDATE + IN clause
      const [updated] = await tx
        .update(schema.notifications)
        .set({
          delivery_status: 'PENDING',
          last_attempted_at: null,
          failure_reason: null,
        })
        .where(
          and(
            eq(schema.notifications.id, notificationId),
            inArray(schema.notifications.delivery_status, ['FAILED', 'FAILED_PERMANENT'])
          )
        )
        .returning({ id: schema.notifications.id });

      if (!updated) {
        // It's possible the notification doesn't exist, or it's in a non-retryable state (e.g. PROCESSING).
        // Check if it exists to return 404 vs 400.
        const [existing] = await tx
          .select({ status: schema.notifications.delivery_status })
          .from(schema.notifications)
          .where(eq(schema.notifications.id, notificationId))
          .limit(1);

        if (!existing) {
          await auditService.logAdminAction({
            actorUserId: user.id,
            action: AuditActions.ADMIN_NOTIFICATION_RETRY,
            resourceType: 'notification',
            resourceId: notificationId,
            outcome: AuditOutcomes.FAILURE,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { error: 'Notification not found' },
            tx
          });
          return 'NOT_FOUND';
        }
        
        await auditService.logAdminAction({
          actorUserId: user.id,
          action: AuditActions.ADMIN_NOTIFICATION_RETRY,
          resourceType: 'notification',
          resourceId: notificationId,
          outcome: AuditOutcomes.FAILURE,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { error: `Cannot retry notification in ${existing.status} state. Only FAILED or FAILED_PERMANENT allowed.` },
          tx
        });
        if (existing.status !== 'FAILED' && existing.status !== 'FAILED_PERMANENT') {
          return 'BAD_STATE';
        }
      }

      await auditService.logAdminAction({
        actorUserId: user.id,
        action: AuditActions.ADMIN_NOTIFICATION_RETRY,
        resourceType: 'notification',
        resourceId: notificationId,
        outcome: AuditOutcomes.SUCCESS,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        tx
      });
      return 'SUCCESS';
    });

    if (result === 'NOT_FOUND') {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    if (result === 'BAD_STATE') {
      res.status(400).json({ 
        error: `Cannot retry notification. Only FAILED or FAILED_PERMANENT allowed.` 
      });
      return;
    }

    // Trigger immediate background batch via canonical mechanism
    void windowedDigestWorker.processCycle();

    res.json({ success: true, message: 'Notification queued for immediate retry' });
  } catch (err) {
    console.error('API ERROR (adminRetryNotificationHandler):', err);
    log.error({ err: err instanceof Error ? err.message : String(err), notificationId }, 'Failed to retry notification via admin');
    res.status(500).json({ error: 'Failed to retry notification' });
  }
}

/**
 * GET /api/admin/audit-logs
 * Retrieves paginated audit logs.
 */
export async function adminGetAuditLogsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rawPage = parseInt(String(req.query['page'] || '1'), 10);
    const rawPageSize = parseInt(String(req.query['pageSize'] || '50'), 10);
    
    const page = (isNaN(rawPage) || rawPage < 1) ? 1 : rawPage;
    const pageSize = (isNaN(rawPageSize) || rawPageSize < 1) ? 50 : Math.min(rawPageSize, 100);
    
    // Safely parse filters from query params
    const action = req.query['action'] as any;
    const resourceType = req.query['resourceType'] as any;
    const resourceId = req.query['resourceId'] as any;
    const actorId = req.query['actorId'] as any;
    const outcome = req.query['outcome'] as any;

    const result = await auditService.getAuditLogs({
      page,
      pageSize,
      actorId: actorId ? String(actorId) : undefined,
      action: action ? (String(action) as AuditAction) : undefined,
      resourceType: resourceType ? String(resourceType) : undefined,
      resourceId: resourceId ? String(resourceId) : undefined,
      outcome: outcome ? (String(outcome) as AuditOutcome) : undefined,
    });

    res.json(result);
  } catch (err) {
    console.error('API ERROR (adminGetAuditLogsHandler):', err);
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Failed to get audit logs');
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
}
