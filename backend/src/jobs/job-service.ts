/**
 * Job Service — lifecycle management.
 *
 * Handles persistence of job candidates discovered by collectors,
 * deduplication using the (company_id + source_system + external_job_id)
 * unique constraint, content-hash-based change detection, absence-based
 * closure safety, background re-verification queries, and job
 * status state machine transitions.
 *
 * State machine:
 *
 *   DISCOVERED → VERIFYING → ACTIVE          (verification passed)
 *   DISCOVERED → VERIFYING → VERIFICATION_FAILED
 *   ACTIVE → UPDATED → ACTIVE               (content changed)
 *   ACTIVE → CLOSED                          (confirmed closed by authoritative source)
 *
 * Rules:
 * - A job is NEVER automatically closed due to a single failed scan,
 *   a partial scan, a pagination failure, or a transient network/HTTP error.
 * - Only verified absence from a confirmed 100% complete scan or an
 *   authoritative HTTP 404 from live per-job verification triggers CLOSED.
 * - Content changes trigger UPDATED status and PENDING verification, not duplicate records.
 */

import { eq, and, inArray, lte, or, isNull, isNotNull, gte, sql, asc } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { computeContentHash } from '../verification/verification-service.js';
import { detectWorkplaceType } from '../matching/location-matcher.js';
import { createLogger } from '../utils/logger.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import type { JobCandidate } from '../collectors/types.js';
import type { CandidateJobData } from '../matching/matching-types.js';

const log = createLogger('job-service');

export type JobStatus =
  | 'DISCOVERED'
  | 'VERIFYING'
  | 'ACTIVE'
  | 'UPDATED'
  | 'CLOSED'
  | 'VERIFICATION_FAILED';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

/**
 * Process a discovered job candidate:
 * 1. Check if the job already exists (by logical identity).
 * 2. If new: insert with status DISCOVERED.
 * 3. If existing and content changed: update to UPDATED.
 * 4. If existing and unchanged: update last_seen_at only.
 *
 * Returns the job ID and whether it was newly created.
 */
export async function upsertDiscoveredJob(
  candidate: JobCandidate,
  companyId: string
): Promise<{ jobId: string; isNew: boolean; contentChanged: boolean }> {
  const db = getDb();
  const contentHash = computeContentHash({
    title: candidate.title,
    location: candidate.location,
    description: candidate.description,
    requirements: candidate.requirements,
    officialUrl: candidate.officialUrl,
  });

  // Look up existing job by logical identity
  const existing = await db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.company_id, companyId),
        eq(schema.jobs.source_system, candidate.sourceSystem),
        eq(schema.jobs.external_job_id, candidate.externalJobId)
      )
    )
    .limit(1);

  const now = new Date();
  const workplaceType = detectWorkplaceType(candidate.location, candidate.workplaceType);

  if (existing.length === 0) {
    // New job — insert with DISCOVERED status
    const [inserted] = await db
      .insert(schema.jobs)
      .values({
        company_id: companyId,
        source_system: candidate.sourceSystem,
        external_job_id: candidate.externalJobId,
        title: candidate.title,
        location: candidate.location ?? null,
        workplace_type: workplaceType,
        employment_type: candidate.employmentType ?? null,
        official_url: candidate.officialUrl,
        apply_url: candidate.applyUrl ?? null,
        official_posted_at: candidate.officialPostedAt ?? null,
        first_seen_at: now,
        last_seen_at: now,
        status: 'DISCOVERED',
        verification_status: 'PENDING',
        description: candidate.description ?? null,
        requirements: candidate.requirements ?? null,
        content_hash: contentHash,
      })
      .returning({ id: schema.jobs.id });

    log.info(
      { jobId: inserted!.id, title: candidate.title, source: candidate.sourceSystem },
      'JOBS_DISCOVERED new job inserted'
    );

    return { jobId: inserted!.id, isNew: true, contentChanged: false };
  }

  const existingJob = existing[0]!;
  const contentChanged = existingJob.content_hash !== contentHash;

  if (contentChanged) {
    // Content changed — mark as UPDATED and reset verification to PENDING.
    // This ensures the job is not served as VERIFIED with stale content
    // until the pipeline's next verification pass completes and calls markJobActive().
    await db
      .update(schema.jobs)
      .set({
        title: candidate.title,
        location: candidate.location ?? null,
        employment_type: candidate.employmentType ?? null,
        official_url: candidate.officialUrl,
        apply_url: candidate.applyUrl ?? null,
        official_posted_at: candidate.officialPostedAt ?? null,
        last_seen_at: now,
        status: 'UPDATED',
        // Reset verification_status so this job is excluded from
        // matching (which requires ACTIVE + VERIFIED) until re-verified.
        verification_status: 'PENDING',
        description: candidate.description ?? null,
        requirements: candidate.requirements ?? null,
        content_hash: contentHash,
        updated_at: now,
      })
      .where(eq(schema.jobs.id, existingJob.id));

    log.info(
      { jobId: existingJob.id, title: candidate.title },
      'JOBS_DISCOVERED content changed, marked UPDATED'
    );
  } else {
    // No change — just refresh last_seen_at
    await db
      .update(schema.jobs)
      .set({ last_seen_at: now, updated_at: now })
      .where(eq(schema.jobs.id, existingJob.id));
  }

  return { jobId: existingJob.id, isNew: false, contentChanged };
}

/**
 * Transition a job to VERIFYING status.
 * Called before the verification service runs its checks.
 */
export async function markJobVerifying(jobId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.jobs)
    .set({ status: 'VERIFYING', verification_status: 'PENDING', updated_at: new Date() })
    .where(eq(schema.jobs.id, jobId));
  log.debug({ jobId }, 'Job status → VERIFYING (PENDING)');
}

/**
 * Transition a job to ACTIVE after successful verification.
 *
 * initial_verified_at semantics:
 *   - Set ONLY on the first ever ACTIVE+VERIFIED transition (COALESCE protects it).
 *   - If the column is already set (subsequent re-verification), it is never changed.
 *   - If the column is NULL (job predates the column or first-time activation):
 *     fall back to first_seen_at, NOT now(). This prevents old jobs with a NULL
 *     initial_verified_at from receiving today's re-verification timestamp and
 *     appearing as "Today's Verified Jobs" when they were actually discovered days ago.
 */
export async function markJobActive(jobId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(schema.jobs)
    .set({
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      last_verified_at: now,
      updated_at: now,
      // Use first_seen_at as the fallback, not now().
      // Rationale: a job first seen N days ago cannot have been "initially verified" today.
      // Using now() here caused old jobs (initial_verified_at IS NULL) to receive
      // today's timestamp on every re-verification, making them appear in the
      // "Today's Verified Jobs" filter incorrectly.
      initial_verified_at: sql`COALESCE(initial_verified_at, first_seen_at)`,
    })
    .where(eq(schema.jobs.id, jobId));
  log.info({ jobId }, 'Job status → ACTIVE (VERIFIED)');
}

/**
 * Transition a job to VERIFICATION_FAILED.
 */
export async function markJobVerificationFailed(
  jobId: string,
  reason: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.jobs)
    .set({
      status: 'VERIFICATION_FAILED',
      verification_status: 'FAILED',
      updated_at: new Date(),
    })
    .where(eq(schema.jobs.id, jobId));
  log.warn({ jobId, reason }, 'Job status → VERIFICATION_FAILED');
}

/**
 * Transition a job to CLOSED.
 *
 * IMPORTANT: Only call this when authoritative evidence confirms the job
 * is no longer available.
 */
export async function markJobClosed(jobId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(schema.jobs)
    .set({ status: 'CLOSED', closed_at: now, updated_at: now })
    .where(eq(schema.jobs.id, jobId));
  log.info({ jobId }, 'Job status → CLOSED');
}

/**
 * Reconcile jobs for a company when an authoritative complete scan finishes.
 *
 * Critical safety rule:
 * - If isCompleteScan is FALSE (due to pagination error, rate limit, timeout, partial scan):
 *   NO jobs are closed.
 * - If isCompleteScan is TRUE:
 *   Active jobs in DB for this company + source that were NOT present in the scan
 *   payload are safely transitioned to CLOSED.
 */
export async function reconcileAbsentJobs(
  companyId: string,
  sourceSystem: string,
  presentExternalJobIds: Set<string> | string[],
  isCompleteScan: boolean
): Promise<{ checked: number; closed: number; skipped: number }> {
  if (!isCompleteScan) {
    log.warn(
      { companyId, sourceSystem },
      'ABSENCE_CHECK_SKIPPED scan was partial or encountered errors — zero jobs closed for safety'
    );
    return { checked: 0, closed: 0, skipped: 0 };
  }

  const db = getDb();
  const presentSet = presentExternalJobIds instanceof Set
    ? presentExternalJobIds
    : new Set(presentExternalJobIds);

  const activeJobs = await db
    .select({
      id: schema.jobs.id,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
    })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.company_id, companyId),
        eq(schema.jobs.source_system, sourceSystem),
        inArray(schema.jobs.status, ['ACTIVE', 'UPDATED', 'VERIFYING'])
      )
    );

  let closedCount = 0;
  for (const job of activeJobs) {
    if (!presentSet.has(job.externalJobId)) {
      await markJobClosed(job.id);
      closedCount++;
      log.info(
        { jobId: job.id, externalJobId: job.externalJobId, title: job.title },
        'ABSENCE_CLOSED job missing from authoritative complete scan — marked CLOSED'
      );
    }
  }

  return { checked: activeJobs.length, closed: closedCount, skipped: activeJobs.length - closedCount };
}

/**
 * Retrieve active jobs needing background re-verification.
 * Prioritizes jobs with oldest last_verified_at or NULL last_verified_at.
 */
export async function getJobsForReverification(options?: {
  limit?: number;
  olderThanDate?: Date;
}): Promise<CandidateJobData[]> {
  const db = getDb();
  const limit = options?.limit ?? 20;
  const conditions = [
    eq(schema.jobs.status, 'ACTIVE'),
    eq(schema.jobs.verification_status, 'VERIFIED'),
  ];

  if (options?.olderThanDate) {
    conditions.push(
      or(
        isNull(schema.jobs.last_verified_at),
        lte(schema.jobs.last_verified_at, options.olderThanDate)
      )!
    );
  }

  const rows = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
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
      lastVerifiedAt: schema.jobs.last_verified_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions))
    .orderBy(asc(schema.jobs.last_verified_at))
    .limit(limit);

  return rows as CandidateJobData[];
}

/**
 * Return counts for the engine status endpoint.
 */
export async function getJobCounts(): Promise<{
  totalActive: number;
  totalVerified: number;
  totalClosed: number;
}> {
  const db = getDb();
  const [activeResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(eq(schema.jobs.status, 'ACTIVE'));
  const [verifiedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(eq(schema.jobs.verification_status, 'VERIFIED'));
  const [closedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(eq(schema.jobs.status, 'CLOSED'));

  return {
    totalActive: activeResult?.count ?? 0,
    totalVerified: verifiedResult?.count ?? 0,
    totalClosed: closedResult?.count ?? 0,
  };
}

/**
 * Retrieve a single job with company details by ID.
 */
export async function getJobById(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      officialUrl: schema.jobs.official_url,
    })
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const exp = parseExperienceRequirements(row.title, row.description, row.requirements);

  return {
    ...row,
    experienceClassification: exp.classification,
  };
}

/**
 * Retrieve recently-posted ACTIVE + VERIFIED jobs for DB-reconciliation alerting.
 *
 * Used by the Recent DB Reconciliation sweep (secondary safety net).
 * Queries jobs whose official_posted_at falls within the rolling window so that
 * any matching user who was not yet notified receives an INSTANT_JOB alert.
 *
 * Eligibility rules:
 * - status = 'ACTIVE' (only live jobs)
 * - verification_status = 'VERIFIED' (only verified jobs)
 * - official_posted_at IS NOT NULL (only jobs with a trustworthy posting date)
 * - official_posted_at >= windowStart (within rolling window)
 * - official_posted_at <= now (not a future-dated posting)
 *
 * The deduplication guarantee comes from the notifications table unique constraint:
 * (user_id, job_id, notification_type). A user already notified for this job
 * will silently receive no second notification.
 */
export async function getRecentlyPostedJobs(options: {
  windowDays: number;
}): Promise<CandidateJobData[]> {
  const db = getDb();
  const now = new Date();
  const windowStart = new Date(now.getTime() - options.windowDays * 24 * 60 * 60 * 1_000);

  const rows = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
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
    .where(
      and(
        eq(schema.jobs.status, 'ACTIVE'),
        eq(schema.jobs.verification_status, 'VERIFIED'),
        isNotNull(schema.jobs.official_posted_at),
        gte(schema.jobs.official_posted_at, windowStart),
        lte(schema.jobs.official_posted_at, now)
      )
    );

  return rows as CandidateJobData[];
}
