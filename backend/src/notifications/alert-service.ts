/**
 * Alert Eligibility and Intent Generation Service.
 *
 * Connects verified active jobs to user preference matching and creates
 * deterministic, deduplicated notification intents in PostgreSQL.
 *
 * CRITICAL INVARIANTS:
 * - Alerts are generated ONLY for jobs with status = 'ACTIVE' and verification_status = 'VERIFIED'.
 * - Reuses matching-service.ts (no duplicated matching logic).
 * - Guaranteed database-level idempotency via (user_id, job_id, notification_type).
 * - Non-blocking: scanner triggers this asynchronously.
 */

import { eq, and, or } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { getRecentlyPostedJobs } from '../jobs/job-service.js';
import type { CandidateJobData, UserPreferencesData, WorkplaceType } from '../matching/matching-types.js';
import type { ExperienceLevel } from '../preferences/taxonomy.js';

const log = createLogger('alert-service');

export interface AlertEvaluationStats {
  evaluatedUsers: number;
  matchedUsers: number;
  createdNotifications: number;
}

export interface AlertOptions {
  /**
   * Which discovery path triggered this alert evaluation.
   * Stored on the notification record for observability and email wording.
   * Defaults to 'NEW_JOB'.
   */
  discoveryReason?: 'NEW_JOB' | 'RECENT_JOB';
}

export interface RecentJobAlertStats {
  jobsEvaluated: number;
  totalAlerts: number;
  totalSkipped: number;
}

/**
 * Evaluate an active, verified job against all eligible users and create
 * instant notification intents in the database.
 *
 * @param jobId   - UUID of the verified job in PostgreSQL
 * @param options - Optional alert options (discoveryReason)
 * @returns Statistics on evaluation outcomes
 */
export async function evaluateAndCreateInstantAlerts(
  jobId: string,
  options: AlertOptions = {}
): Promise<AlertEvaluationStats> {
  const stats: AlertEvaluationStats = {
    evaluatedUsers: 0,
    matchedUsers: 0,
    createdNotifications: 0,
  };

  const db = getDb();

  // 1. Fetch the candidate job with its company data
  const [jobRecord] = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      employmentType: schema.jobs.employment_type,
      officialUrl: schema.jobs.official_url,
      applyUrl: schema.jobs.apply_url,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      officialPostedAt: schema.jobs.official_posted_at,
      firstSeenAt: schema.jobs.first_seen_at,
      lastSeenAt: schema.jobs.last_seen_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  // Strict check: Only ACTIVE + VERIFIED jobs trigger alerts
  if (!jobRecord || jobRecord.status !== 'ACTIVE' || jobRecord.verificationStatus !== 'VERIFIED') {
    log.warn(
      { jobId, status: jobRecord?.status, verificationStatus: jobRecord?.verificationStatus },
      'ALERT_SKIP job is not ACTIVE + VERIFIED'
    );
    return stats;
  }

  const candidateJob: CandidateJobData = {
    ...jobRecord,
  };

  // 2. Query all verified users with instant email alerts enabled who have preferences configured
  const eligibleUsers = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      roles: schema.userPreferences.roles,
      locations: schema.userPreferences.locations,
      workplaceTypes: schema.userPreferences.workplace_types,
      experienceLevel: schema.userPreferences.experience_level,
      companyIds: schema.userPreferences.companies,
      keywords: schema.userPreferences.keywords,
      emailAlertsEnabled: schema.userPreferences.email_alerts_enabled,
      instantNotifications: schema.userPreferences.instant_notifications,
    })
    .from(schema.userPreferences)
    .innerJoin(schema.users, eq(schema.userPreferences.user_id, schema.users.id))
    .where(
      and(
        eq(schema.users.email_verified, true),
        eq(schema.userPreferences.email_alerts_enabled, true),
        eq(schema.userPreferences.instant_notifications, true)
      )
    );

  // Fetch users who have dismissed or applied to this job to exclude them
  const interactions = await db
    .select({ userId: schema.userJobInteractions.user_id })
    .from(schema.userJobInteractions)
    .where(
      and(
        eq(schema.userJobInteractions.job_id, jobId),
        or(
          eq(schema.userJobInteractions.is_dismissed, true),
          eq(schema.userJobInteractions.is_applied, true)
        )
      )
    );
  
  const excludedUserIds = new Set(interactions.map((i) => i.userId));

  stats.evaluatedUsers = eligibleUsers.length;

  for (const user of eligibleUsers) {
    if (excludedUserIds.has(user.userId)) continue;

    const roles = (user.roles as string[]) ?? [];
    if (roles.length === 0) continue; // No roles defined

    const userPrefData: UserPreferencesData = {
      userId: user.userId,
      roles,
      locations: (user.locations as string[]) ?? [],
      workplaceTypes: (user.workplaceTypes as WorkplaceType[]) ?? [],
      experienceLevel: (user.experienceLevel as ExperienceLevel) ?? 'FRESHER',
      companyIds: (user.companyIds as string[]) ?? [],
      keywords: (user.keywords as string[]) ?? [],
    };

    // 3. Deterministic Matching Conjunction
    const matchResult = evaluateJobMatch(candidateJob, userPrefData);

    if (matchResult.matched) {
      stats.matchedUsers++;
      const idempotencyKey = `${user.userId}:${jobId}:INSTANT_JOB`;

      try {
        const [inserted] = await db
          .insert(schema.notifications)
          .values({
            user_id: user.userId,
            job_id: jobId,
            notification_type: 'INSTANT_JOB',
            delivery_status: 'PENDING',
            attempt_count: 0,
            idempotency_key: idempotencyKey,
            discovery_reason: options.discoveryReason ?? 'NEW_JOB',
          })
          .onConflictDoNothing({
            target: [
              schema.notifications.user_id,
              schema.notifications.job_id,
              schema.notifications.notification_type,
            ],
          })
          .returning({ id: schema.notifications.id });

        if (inserted?.id) {
          stats.createdNotifications++;
          log.info(
            { notificationId: inserted.id, userId: user.userId, jobId, jobTitle: candidateJob.title },
            'ALERT_INTENT_CREATED notification queued'
          );
        } else {
          log.debug(
            { userId: user.userId, jobId },
            'ALERT_INTENT_DEDUPLICATED notification intent already exists'
          );
        }
      } catch (err) {
        log.error(
          { userId: user.userId, jobId, err: err instanceof Error ? err.message : String(err) },
          'ALERT_INTENT_FAILED failed to create notification record'
        );
      }
    }
  }

  log.info(
    {
      jobId,
      jobTitle: candidateJob.title,
      evaluated: stats.evaluatedUsers,
      matched: stats.matchedUsers,
      created: stats.createdNotifications,
    },
    'ALERT_EVALUATION_COMPLETED'
  );

  return stats;
}

/**
 * DB Reconciliation Sweep: evaluate all recently-posted ACTIVE + VERIFIED jobs
 * against all eligible users and create any missing INSTANT_JOB notifications.
 *
 * This is the third layer of the rolling recent-job discovery architecture.
 * It catches jobs that are already in the database but whose matching
 * notification was somehow never created (e.g. alert-service crash, user
 * registered after the job was first discovered).
 *
 * The existing unique constraint on (user_id, job_id, notification_type) means
 * calling this repeatedly is always safe — already-notified users are silently
 * skipped via onConflictDoNothing.
 *
 * @param options.windowDays - Rolling window for which jobs to consider
 * @returns Aggregate stats across all evaluated jobs
 */
export async function evaluateAndCreateRecentJobAlerts(options: {
  windowDays: number;
}): Promise<RecentJobAlertStats> {
  const result: RecentJobAlertStats = {
    jobsEvaluated: 0,
    totalAlerts: 0,
    totalSkipped: 0,
  };

  log.info({ windowDays: options.windowDays }, 'RECENT_DB_RECONCILIATION_STARTED');

  let jobs: CandidateJobData[];
  try {
    jobs = await getRecentlyPostedJobs({ windowDays: options.windowDays });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'RECENT_DB_RECONCILIATION_FETCH_ERROR failed to query recent jobs'
    );
    return result;
  }

  result.jobsEvaluated = jobs.length;
  log.info({ count: jobs.length }, 'RECENT_DB_RECONCILIATION_FETCHED');

  for (const job of jobs) {
    try {
      const stats = await evaluateAndCreateInstantAlerts(job.id, { discoveryReason: 'RECENT_JOB' });
      result.totalAlerts += stats.createdNotifications;
      result.totalSkipped += stats.evaluatedUsers - stats.matchedUsers;
    } catch (err) {
      log.error(
        { jobId: job.id, err: err instanceof Error ? err.message : String(err) },
        'RECENT_DB_RECONCILIATION_JOB_ERROR'
      );
    }
  }

  log.info(
    {
      jobsEvaluated: result.jobsEvaluated,
      totalAlerts: result.totalAlerts,
      totalSkipped: result.totalSkipped,
    },
    'RECENT_DB_RECONCILIATION_COMPLETED'
  );

  return result;
}
