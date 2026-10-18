/**
 * Windowed Digest Background Worker.
 *
 * Runs periodically to evaluate and dispatch aggregated job digests.
 * Groups PENDING INSTANT_JOB notifications into a single WINDOWED_DIGEST
 * per user per active window (09:00, 11:30, 14:00, 16:30, 19:00, 21:30).
 *
 * Enforces atomic database-backed global safety budgets and strict deduplication.
 */

import { eq, and, inArray, sql, lte } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { getEmailProvider } from './email/provider-factory.js';
import { renderWindowedDigestEmail, WindowedDigestJob } from './email/templates/windowed-digest.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

const log = createLogger('digest-worker');


const STALE_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
const DIGEST_WINDOWS = ['09:00', '11:30', '14:00', '16:30', '19:00', '21:30'];

export class WindowedDigestWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private _status: 'stopped' | 'running' = 'stopped';

  get status(): 'stopped' | 'running' {
    return this._status;
  }

  start(): void {
    if (this._status === 'running') return;
    this._status = 'running';
    log.info({ intervalMs: config.notificationWorkerIntervalMs }, 'Windowed digest worker started');

    this.timer = setInterval(() => {
      void this.processCycle().catch((err: unknown) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'DIGEST_WORKER_ERROR unhandled error in digest cycle'
        );
      });
    }, config.notificationWorkerIntervalMs);

    setTimeout(() => {
      void this.processCycle();
    }, 1000);
  }

  stop(): void {
    if (this._status === 'stopped') return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._status = 'stopped';
    log.info('Windowed digest worker stopped');
  }

  /**
   * Main processing cycle:
   * 1. Recover stale PROCESSING digests.
   * 2. Retry FAILED digests.
   * 3. Create new WINDOWED_DIGESTs for users in active windows with PENDING jobs.
   */
  async processCycle(targetUserId?: string | string[]): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    try {
      await this.recoverStaleDigests(targetUserId);
      await this.processNewDigests(targetUserId);
    } finally {
      this.isProcessing = false;
    }
  }

  private async recoverStaleDigests(targetUserId?: string | string[]) {
    const db = getDb();
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS);
    const staleConditions = [
      eq(schema.notifications.notification_type, 'WINDOWED_DIGEST'),
      eq(schema.notifications.delivery_status, 'PROCESSING'),
      lte(schema.notifications.last_attempted_at, staleThreshold),
    ];
    if (targetUserId) {
      if (Array.isArray(targetUserId)) {
        staleConditions.push(inArray(schema.notifications.user_id, targetUserId));
      } else {
        staleConditions.push(eq(schema.notifications.user_id, targetUserId));
      }
    }
    const staleDigests = await db.select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(and(...staleConditions));

    if (staleDigests.length > 0) {
      const digestIds = staleDigests.map(d => d.id);
      
      await db.transaction(async (tx) => {
        await tx.update(schema.notifications)
          .set({ digest_id: null })
          .where(inArray(schema.notifications.digest_id, digestIds));
          
        await tx.update(schema.notifications)
          .set({ delivery_status: 'FAILED', failure_reason: 'Worker timeout - jobs released to next window' })
          .where(inArray(schema.notifications.id, digestIds));
      });
      log.info({ recoveredCount: digestIds.length }, 'Recovered stale digests by releasing jobs');
    }
  }

  private async acquireGlobalBudget(): Promise<boolean> {
    if (config.emailDailySafetyBudget <= 0) {
      return false;
    }
    const db = getDb();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = formatter.format(new Date()); // YYYY-MM-DD in IST
    
    const [result] = (await db.execute(sql`
      INSERT INTO email_daily_budget (date_utc, sent_count)
      VALUES (${today}::date, 1)
      ON CONFLICT (date_utc) DO UPDATE 
      SET sent_count = email_daily_budget.sent_count + 1
      WHERE email_daily_budget.sent_count < ${config.emailDailySafetyBudget}
      RETURNING sent_count;
    `)).rows;
    
    return !!result;
  }

  private getActiveWindowForTimezone(tz: string): string | null {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      // Example output: "14:00" or "09:30"
      const parts = formatter.formatToParts(new Date());
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      if (!hour || !minute) return null;
      
      // Determine which window we are in.
      // A window is active if the current time is >= window and < next window.
      // However, to keep it simple and ensure we don't spam, we just check if
      // the current time falls within the first 30 minutes of the window.
      for (const w of DIGEST_WINDOWS) {
        const [wH, wM] = w.split(':').map(Number);
        const [cH, cM] = [Number(hour), Number(minute)];
        
        const wTotal = wH * 60 + wM;
        const cTotal = cH * 60 + cM;
        
        // Window is active for 30 minutes
        if (cTotal >= wTotal && cTotal < wTotal + 30) {
          return w;
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  
  private getLocalDateString(tz: string): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      return formatter.format(new Date());
    } catch {
      return new Date().toISOString().split('T')[0]!;
    }
  }

  private async processNewDigests(targetUserId?: string | string[]) {
    const db = getDb();
    
    // 1. Find users who have PENDING INSTANT_JOB notifications with an ACTIVE + VERIFIED job
    let usersWithPendingJobsResult;
    if (targetUserId) {
      if (Array.isArray(targetUserId)) {
        const idList = sql.join(targetUserId.map(id => sql`${id}`), sql`, `);
        usersWithPendingJobsResult = await db.execute(sql`
          SELECT DISTINCT n.user_id 
          FROM notifications n
          INNER JOIN jobs j ON n.job_id = j.id
          WHERE n.notification_type = 'INSTANT_JOB' 
            AND n.delivery_status = 'PENDING'
            AND n.digest_id IS NULL
            AND n.job_id IS NOT NULL
            AND j.status = 'ACTIVE'
            AND j.verification_status = 'VERIFIED'
            AND n.user_id IN (${idList})
        `);
      } else {
        usersWithPendingJobsResult = await db.execute(sql`
          SELECT DISTINCT n.user_id 
          FROM notifications n
          INNER JOIN jobs j ON n.job_id = j.id
          WHERE n.notification_type = 'INSTANT_JOB' 
            AND n.delivery_status = 'PENDING'
            AND n.digest_id IS NULL
            AND n.job_id IS NOT NULL
            AND j.status = 'ACTIVE'
            AND j.verification_status = 'VERIFIED'
            AND n.user_id = ${targetUserId}
        `);
      }
    } else {
      usersWithPendingJobsResult = await db.execute(sql`
        SELECT DISTINCT n.user_id 
        FROM notifications n
        INNER JOIN jobs j ON n.job_id = j.id
        WHERE n.notification_type = 'INSTANT_JOB' 
          AND n.delivery_status = 'PENDING'
          AND n.digest_id IS NULL
          AND n.job_id IS NOT NULL
          AND j.status = 'ACTIVE'
          AND j.verification_status = 'VERIFIED'
      `);
    }
    
    if (usersWithPendingJobsResult.rows.length === 0) return;
    
    const userIds = usersWithPendingJobsResult.rows.map((r: any) => r.user_id as string);
    
    // 2. Fetch their preferences
    const users = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        emailVerified: schema.users.email_verified,
        emailAlertsEnabled: schema.userPreferences.email_alerts_enabled,
        instantNotifications: schema.userPreferences.instant_notifications,
        dailyDigest: schema.userPreferences.daily_digest,
        timezone: schema.userPreferences.timezone,
      })
      .from(schema.users)
      .innerJoin(schema.userPreferences, eq(schema.users.id, schema.userPreferences.user_id))
      .where(inArray(schema.users.id, userIds));

    for (const user of users) {
      if (!user.emailVerified || !user.emailAlertsEnabled) continue;

      const tz = (user.timezone && user.timezone !== 'UTC') ? user.timezone : 'Asia/Kolkata';
      const activeWindow = this.getActiveWindowForTimezone(tz);
      
      if (!activeWindow) continue;

      // Check preference semantics
      if (!user.instantNotifications && !user.dailyDigest) continue;
      
      // If they only have daily_digest, they ONLY get the 09:00 window.
      if (!user.instantNotifications && user.dailyDigest && activeWindow !== '09:00') {
        continue;
      }

      const localDate = this.getLocalDateString(tz);
      const idempotencyKey = `${user.id}:${localDate}:${activeWindow}:WINDOWED_DIGEST`;

      // 3. Atomically attempt to create the WINDOWED_DIGEST intent for this window
      let digestRecord: any = null;
      try {
        const [inserted] = await db
          .insert(schema.notifications)
          .values({
            user_id: user.id,
            notification_type: 'WINDOWED_DIGEST',
            delivery_status: 'PROCESSING',
            attempt_count: 1,
            last_attempted_at: new Date(),
            idempotency_key: idempotencyKey,
          })
          .onConflictDoNothing({
            target: schema.notifications.idempotency_key
          })
          .returning({ id: schema.notifications.id });
        
        if (!inserted) {
          // Another worker already claimed this window for this user
          continue; 
        }
        digestRecord = inserted;
      } catch (err) {
        log.error({ err, userId: user.id }, 'Failed to create digest intent');
        continue;
      }

      // 4. Acquire ALL PENDING jobs and link them to this digest
      // Use FOR UPDATE OF n SKIP LOCKED to ensure atomic claiming of the specific jobs
      const acquiredJobsResult = await db.execute(sql`
        UPDATE notifications 
        SET digest_id = ${digestRecord.id}
        WHERE id IN (
          SELECT n.id FROM notifications n
          INNER JOIN jobs j ON n.job_id = j.id
          WHERE n.user_id = ${user.id} 
            AND n.notification_type = 'INSTANT_JOB' 
            AND n.delivery_status = 'PENDING'
            AND n.digest_id IS NULL
            AND n.job_id IS NOT NULL
            AND j.status = 'ACTIVE'
            AND j.verification_status = 'VERIFIED'
          ORDER BY n.created_at ASC
          FOR UPDATE OF n SKIP LOCKED
        )
        RETURNING id, job_id
      `);

      if (acquiredJobsResult.rows.length === 0) {
        // Nothing to send, mark digest as permanent failure or delete it
        await db.delete(schema.notifications).where(eq(schema.notifications.id, digestRecord.id));
        continue;
      }

      // Check if there are MORE pending jobs we didn't pick up
      const [remainingCountResult] = (await db.execute(sql`
        SELECT count(*) as count 
        FROM notifications n
        INNER JOIN jobs j ON n.job_id = j.id
        WHERE n.user_id = ${user.id} 
          AND n.notification_type = 'INSTANT_JOB' 
          AND n.delivery_status = 'PENDING'
          AND n.digest_id IS NULL
          AND n.job_id IS NOT NULL
          AND j.status = 'ACTIVE'
          AND j.verification_status = 'VERIFIED'
      `)).rows;
      const additionalMatchesCount = Number(remainingCountResult?.count || 0);

      const acquiredNotifs = acquiredJobsResult.rows.map((j: any) => ({
        id: j.id as string,
        jobId: j.job_id as string | null,
      }));

      // We have jobs to send!
      await this.sendDigest(
        digestRecord.id,
        { email: user.email, name: user.name || 'User' },
        localDate,
        activeWindow,
        acquiredNotifs,
        idempotencyKey,
        additionalMatchesCount
      );
    }
  }

  private async sendDigest(
    digestId: string,
    user: { email: string; name: string },
    digestDateStr: string,
    windowStr: string,
    acquiredNotifs: { id: string; jobId: string | null }[],
    idempotencyKey: string,
    additionalMatchesCount: number,
    attemptCount: number = 1
  ) {
    const db = getDb();
    
    // Acquire budget atomically
    const hasBudget = await this.acquireGlobalBudget();
    if (!hasBudget) {
      log.warn('EMAIL_DAILY_SAFETY_BUDGET reached. Aborting send.');
      // Revert digest to FAILED (preserves idempotency for this window).
      // Unlink jobs so they return to the pool for the next window.
      await db.transaction(async (tx) => {
        await tx.update(schema.notifications)
          .set({ digest_id: null })
          .where(eq(schema.notifications.digest_id, digestId));

        await tx.update(schema.notifications)
          .set({ delivery_status: 'FAILED', failure_reason: 'Budget exceeded - jobs released to next window' })
          .where(eq(schema.notifications.id, digestId));
      });
      return;
    }

    // Fetch rich job data for valid job IDs — ONLY ACTIVE + VERIFIED (strictly prevent ghost jobs)
    const validJobIds = acquiredNotifs
      .map((n) => n.jobId)
      .filter((id): id is string => Boolean(id));

    const jobsData = validJobIds.length > 0
      ? await db
          .select({
            id: schema.jobs.id,
            title: schema.jobs.title,
            location: schema.jobs.location,
            workplaceType: schema.jobs.workplace_type,
            description: schema.jobs.description,
            requirements: schema.jobs.requirements,
            externalJobId: schema.jobs.external_job_id,
            officialUrl: schema.jobs.official_url,
            sourceSystem: schema.jobs.source_system,
            companyName: schema.companies.name,
          })
          .from(schema.jobs)
          .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
          .where(
            and(
              inArray(schema.jobs.id, validJobIds),
              eq(schema.jobs.status, 'ACTIVE'),
              eq(schema.jobs.verification_status, 'VERIFIED')
            )
          )
      : [];

    const fetchedJobMap = new Map(jobsData.map((j) => [j.id, j]));
    const matchedNotifs = acquiredNotifs.filter((n) => n.jobId && fetchedJobMap.has(n.jobId));
    const unmatchedNotifs = acquiredNotifs.filter((n) => !n.jobId || !fetchedJobMap.has(n.jobId));

    if (unmatchedNotifs.length > 0) {
      log.warn(
        { digestId, acquired: acquiredNotifs.length, fetched: matchedNotifs.length, unmatched: unmatchedNotifs.length },
        'Discrepancy: some acquired jobs could not be fetched or are no longer ACTIVE + VERIFIED. Marking orphaned/unverified notifications as FAILED_PERMANENT.'
      );
      const unmatchedIds = unmatchedNotifs.map((n) => n.id);
      await db.transaction(async (tx) => {
        await tx
          .update(schema.notifications)
          .set({
            digest_id: null,
            delivery_status: 'FAILED_PERMANENT',
            failure_reason: 'Job is missing or no longer ACTIVE and VERIFIED (ghost or closed job excluded)',
          })
          .where(inArray(schema.notifications.id, unmatchedIds));
      });
    }

    if (jobsData.length === 0) {
      await this.markDigestPermanentFailure(digestId, 'No ACTIVE and VERIFIED jobs found to deliver in digest');
      return;
    }

    const digestJobs: WindowedDigestJob[] = jobsData.map((j) => {
      const parsedExp = parseExperienceRequirements(j.title, j.description, j.requirements);
      let experience: string | null = null;
      if (parsedExp.minYears !== undefined && parsedExp.minYears > 0) {
        experience = `${parsedExp.minYears}+ yrs exp`;
      } else if (parsedExp.classification === 'FRESHER_COMPATIBLE') {
        experience = 'Fresher / Entry Level';
      } else if (parsedExp.classification === 'EXPERIENCED') {
        experience = 'Experienced';
      }

      let workplace: string | null = null;
      if (j.workplaceType === 'REMOTE') workplace = 'Remote';
      else if (j.workplaceType === 'HYBRID') workplace = 'Hybrid';
      else if (j.workplaceType === 'ONSITE') workplace = 'On-site';

      return {
        companyName: j.companyName,
        title: j.title,
        location: j.location,
        workplaceType: workplace,
        experience,
        externalJobId: j.externalJobId,
        officialUrl: j.officialUrl,
        sourceSystem: j.sourceSystem,
        matchSummary: `${j.location || 'Any Location'} \u00b7 Verified Genuine`,
      };
    });

    const emailData = renderWindowedDigestEmail({
      recipientName: user.name,
      digestDateStr,
      windowStr,
      jobs: digestJobs,
      additionalMatchesCount,
    });

    const emailProvider = getEmailProvider();
    const sendResult = await emailProvider.sendEmail({
      to: user.email,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      idempotencyKey,
      category: 'windowed-digest',
    });

    if (sendResult.success) {
      // SUCCESS! Mark the parent digest AND the matched linked jobs as SENT.
      // Unmatched notifications were unlinked above and safely remain PENDING.
      await db.transaction(async (tx) => {
        await tx.update(schema.notifications)
          .set({
            delivery_status: 'SENT',
            sent_at: new Date(),
            provider_message_id: sendResult.providerMessageId,
            failure_reason: null,
          })
          .where(eq(schema.notifications.id, digestId));

        const matchedIds = matchedNotifs.map((n) => n.id);
        if (matchedIds.length > 0) {
          await tx.update(schema.notifications)
            .set({
              delivery_status: 'SENT',
              sent_at: new Date(),
            })
            .where(inArray(schema.notifications.id, matchedIds));
        }
      });
      log.info({ digestId, jobsSent: matchedNotifs.length, userEmail: user.email }, 'Digest successfully sent');
    } else {
      // FAILED!
      // Unlink jobs so they can be picked up by the next available window.
      // Mark this digest intent as FAILED to preserve idempotency for THIS window.
      await db.transaction(async (tx) => {
        await tx.update(schema.notifications)
          .set({ digest_id: null })
          .where(eq(schema.notifications.digest_id, digestId));

        await tx.update(schema.notifications)
          .set({
            delivery_status: 'FAILED',
            failure_reason: sendResult.errorMessage || 'Email provider delivery failed - jobs released to next window',
            attempt_count: attemptCount + 1,
          })
          .where(eq(schema.notifications.id, digestId));
      });
    }
  }

  private async markDigestPermanentFailure(digestId: string, reason: string) {
    const db = getDb();
    await db.update(schema.notifications)
      .set({
        delivery_status: 'FAILED',
        failure_reason: reason,
      })
      .where(eq(schema.notifications.id, digestId));
  }
}

export const windowedDigestWorker = new WindowedDigestWorker();
