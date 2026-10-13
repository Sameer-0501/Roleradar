/**
 * Notification API Handlers.
 *
 * Provides authenticated REST endpoints for viewing and managing
 * a user's job alert notifications.
 *
 * SECURITY & ISOLATION INVARIANT:
 * - All queries strictly filter by req.user.userId.
 * - User A can NEVER view or mutate User B's notification records.
 */

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/middleware.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { windowedDigestWorker } from '../notifications/digest-worker.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import type { ExperienceLevel } from '../preferences/taxonomy.js';

const log = createLogger('api:notifications');

export interface NotificationDto {
  id: string;
  notificationType: 'INSTANT_JOB' | 'DAILY_DIGEST' | 'WINDOWED_DIGEST';
  deliveryStatus: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'FAILED_PERMANENT';
  sentAt: string | null;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  job: {
    id: string;
    title: string;
    location: string | null;
    externalJobId: string;
    officialUrl: string;
    sourceSystem: string;
    companyName: string;
  } | null;
}

/**
 * GET /api/notifications
 * List user notifications with pagination.
 */
export async function listNotificationsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
  const offset = (page - 1) * limit;

  try {
    const db = getDb();

    // Total count (approximate, since we filter in memory, but good enough for UI)
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(eq(schema.notifications.user_id, userId));

    const total = countResult?.count ?? 0;

    // Fetch user experience preference
    const [userPref] = await db
      .select({ experienceLevel: schema.userPreferences.experience_level })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.user_id, userId))
      .limit(1);

    const userExperience = (userPref?.experienceLevel || 'FRESHER') as ExperienceLevel;

    // Fetch items with joined job and company info
    const rows = await db
      .select({
        id: schema.notifications.id,
        notificationType: schema.notifications.notification_type,
        deliveryStatus: schema.notifications.delivery_status,
        sentAt: schema.notifications.sent_at,
        createdAt: schema.notifications.created_at,
        isRead: schema.notifications.is_read,
        readAt: schema.notifications.read_at,
        failureReason: schema.notifications.failure_reason,
        attemptCount: schema.notifications.attempt_count,
        jobId: schema.jobs.id,
        jobTitle: schema.jobs.title,
        jobLocation: schema.jobs.location,
        externalJobId: schema.jobs.external_job_id,
        officialUrl: schema.jobs.official_url,
        sourceSystem: schema.jobs.source_system,
        description: schema.jobs.description,
        requirements: schema.jobs.requirements,
        companyName: schema.companies.name,
      })
      .from(schema.notifications)
      .leftJoin(schema.jobs, eq(schema.notifications.job_id, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
      .where(eq(schema.notifications.user_id, userId))
      .orderBy(desc(schema.notifications.created_at))
      .limit(limit)
      .offset(offset);

    const items: NotificationDto[] = [];
    
    for (const r of rows) {
      if (r.jobId) {
        // Filter historical incompatible recommendations
        const parsedExp = parseExperienceRequirements(
          r.jobTitle ?? '',
          r.description,
          r.requirements
        );
        const expMatch = matchExperience(parsedExp, userExperience);
        if (!expMatch.matched) {
          continue; // Skip historically incompatible notification
        }
      }

      items.push({
        id: r.id,
        notificationType: r.notificationType,
        deliveryStatus: r.deliveryStatus,
        sentAt: r.sentAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        isRead: r.isRead,
        readAt: r.readAt?.toISOString() ?? null,
        failureReason: r.failureReason,
        attemptCount: r.attemptCount,
        job: r.jobId
          ? {
              id: r.jobId,
              title: r.jobTitle ?? 'Job Opening',
              location: r.jobLocation,
              externalJobId: r.externalJobId ?? '',
              officialUrl: r.officialUrl ?? '#',
              sourceSystem: r.sourceSystem ?? 'DIRECT',
              companyName: r.companyName ?? 'Verified Company',
            }
          : null,
      });
    }

    res.json({
      notifications: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), userId }, 'Failed to list notifications');
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
}

/**
 * GET /api/notifications/unread-count
 * Returns the count of unread notifications for the user.
 */
export async function getUnreadCountHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = getDb();
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.user_id, userId),
          eq(schema.notifications.is_read, false)
        )
      );

    res.json({ unreadCount: result?.count ?? 0 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), userId }, 'Failed to get unread count');
    res.status(500).json({ error: 'Failed to retrieve unread notification count' });
  }
}

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read.
 */
export async function markNotificationReadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rawId = req.params['id'];
  const notificationId = Array.isArray(rawId) ? String(rawId[0] || '') : String(rawId || '');
  if (!notificationId) {
    res.status(400).json({ error: 'Notification ID is required' });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.notifications)
      .set({
        is_read: true,
        read_at: new Date(),
      })
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.user_id, userId)
        )
      )
      .returning({ id: schema.notifications.id });

    if (!updated) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), userId, notificationId }, 'Failed to mark notification read');
    res.status(500).json({ error: 'Failed to update notification' });
  }
}

/**
 * POST /api/notifications/read-all
 * Mark all user notifications as read.
 */
export async function markAllNotificationsReadHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = getDb();
    await db
      .update(schema.notifications)
      .set({
        is_read: true,
        read_at: new Date(),
      })
      .where(
        and(
          eq(schema.notifications.user_id, userId),
          eq(schema.notifications.is_read, false)
        )
      );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), userId }, 'Failed to mark all notifications read');
    res.status(500).json({ error: 'Failed to update notifications' });
  }
}

/**
 * POST /api/notifications/:id/retry
 * Reset a failed notification to PENDING and trigger processing.
 */
export async function retryNotificationHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rawId = req.params['id'];
  const notificationId = Array.isArray(rawId) ? String(rawId[0] || '') : String(rawId || '');
  if (!notificationId) {
    res.status(400).json({ error: 'Notification ID is required' });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.notifications)
      .set({
        delivery_status: 'PENDING',
        attempt_count: 0,
        failure_reason: null,
      })
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.user_id, userId)
        )
      )
      .returning({ id: schema.notifications.id });

    if (!updated) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Trigger immediate batch
    void windowedDigestWorker.processCycle();

    res.json({ success: true, message: 'Notification queued for immediate retry' });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), userId, notificationId }, 'Failed to retry notification');
    res.status(500).json({ error: 'Failed to retry notification' });
  }
}
