/**
 * User Job Workspace Service.
 *
 * Handles personal job interactions: Save/Unsave, Apply/Unapply, Dismiss/Restore,
 * View Tracking, and Private Notes.
 *
 * CRITICAL INVARIANTS:
 * 1. Global State != Personal State (Never modify global job records from user actions).
 * 2. Strict User Scoping (All queries and mutations must include user_id).
 * 3. Idempotency (Database unique constraint on user_id + job_id prevents duplicates).
 * 4. Closed != Deleted (Closed jobs remain in personal history with clear warning).
 */

import { eq, and, sql, desc, inArray, ilike, or } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { getCandidateProfile, listUserResumes } from '../resume/profile-service.js';
import { compareProfileWithJob } from '../resume/job-fit-evaluator.js';

const log = createLogger('workspace:user-job-service');

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type ApplicationStatus =
  | 'SAVED'
  | 'PREPARING'
  | 'APPLIED'
  | 'INTERVIEWING'
  | 'OFFERED'
  | 'REJECTED'
  | 'WITHDRAWN';

export const VALID_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'SAVED',
  'PREPARING',
  'APPLIED',
  'INTERVIEWING',
  'OFFERED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export const MAX_CHECKLIST_ITEMS = 20;
export const MAX_CHECKLIST_TEXT_LENGTH = 300;
export const MAX_COVER_LETTER_LENGTH = 5000;
export const MAX_INTERVIEW_NOTES_LENGTH = 10000;
export const MAX_NOTES_LENGTH = 5000;

export interface UserJobInteractionState {
  jobId: string;
  isSaved: boolean;
  savedAt: string | null;
  isApplied: boolean;
  appliedAt: string | null;
  isDismissed: boolean;
  dismissedAt: string | null;
  isViewed: boolean;
  viewedAt: string | null;
  viewCount: number;
  notes: string | null;
  notesUpdatedAt: string | null;
  applicationStatus: ApplicationStatus;
  selectedResumeId: string | null;
  coverLetter: string | null;
  coverLetterUpdatedAt: string | null;
  checklist: ChecklistItem[];
  checklistUpdatedAt: string | null;
  reminderAt: string | null;
  interviewNotes: string | null;
  interviewNotesUpdatedAt: string | null;
}

export interface ApplicationReadinessResult {
  jobId: string;
  jobTitle: string;
  companyName: string;
  location: string | null;
  workplaceType: string | null;
  officialUrl: string;
  applyUrl: string | null;
  isClosed: boolean;
  status: string;
  verificationStatus: string;
  interaction: UserJobInteractionState;
  readinessScore: number; // 0 to 100
  checklistSummary: {
    total: number;
    completed: number;
    remaining: number;
  };
  selectedResume: {
    id: string;
    filename: string;
    isActive: boolean;
  } | null;
  availableResumes: {
    id: string;
    filename: string;
    isActive: boolean;
    createdAt: string;
  }[];
  missingRequirements: string[];
  preparationGaps: string[];
  fitAnalysis?: {
    fitScore: number;
    fitTier: string;
    matchingSkills: string[];
    missingSkills: string[];
    fitReasons: string[];
  };
  officialApplicationNotice: string;
}

export function validateChecklistPayload(items: unknown): ChecklistItem[] {
  if (!Array.isArray(items)) {
    throw new Error('Checklist must be an array of items');
  }
  if (items.length > MAX_CHECKLIST_ITEMS) {
    throw new Error(`Checklist cannot exceed ${MAX_CHECKLIST_ITEMS} items (received ${items.length})`);
  }
  return items.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Checklist item at index ${idx} is invalid`);
    }
    const rawId = (item as any).id;
    const rawText = (item as any).text;
    const rawDone = (item as any).done;

    if (typeof rawId !== 'string' || rawId.trim().length === 0) {
      throw new Error(`Checklist item at index ${idx} must have a valid string id`);
    }
    if (typeof rawText !== 'string') {
      throw new Error(`Checklist item at index ${idx} must have a string text`);
    }
    const trimmedText = rawText.trim();
    if (trimmedText.length === 0) {
      throw new Error(`Checklist item at index ${idx} text cannot be empty`);
    }
    if (trimmedText.length > MAX_CHECKLIST_TEXT_LENGTH) {
      throw new Error(`Checklist item at index ${idx} exceeds maximum length of ${MAX_CHECKLIST_TEXT_LENGTH} characters`);
    }
    if (typeof rawDone !== 'boolean') {
      throw new Error(`Checklist item at index ${idx} must have a boolean done property`);
    }

    return {
      id: rawId.trim(),
      text: trimmedText,
      done: rawDone,
    };
  });
}

export interface WorkspaceJobItem {
  id: string;
  externalJobId: string;
  title: string;
  companyId: string;
  companyName: string;
  location: string | null;
  workplaceType: string | null;
  officialUrl: string;
  applyUrl: string | null;
  status: string;
  verificationStatus: string;
  closedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  interaction: UserJobInteractionState;
}

export interface WorkspaceQueryOptions {
  status?: 'ALL' | 'ACTIVE' | 'CLOSED';
  applied?: 'ALL' | 'APPLIED' | 'NOT_APPLIED';
  q?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedWorkspaceResult {
  items: WorkspaceJobItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Save a job for the authenticated user.
 */
export async function saveJob(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      is_saved: true,
      saved_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        is_saved: true,
        saved_at: now,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_SAVED');
  return formatInteraction(record!);
}

/**
 * Unsave a job for the authenticated user.
 */
export async function unsaveJob(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      is_saved: false,
      saved_at: null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        is_saved: false,
        saved_at: null,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_UNSAVED');
  return formatInteraction(record!);
}

/**
 * Mark a job as applied by the authenticated user.
 */
export async function markJobApplied(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      is_applied: true,
      applied_at: now,
      application_status: 'APPLIED',
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        is_applied: true,
        applied_at: sql`COALESCE(${schema.userJobInteractions.applied_at}, ${now})`,
        application_status: sql`CASE WHEN ${schema.userJobInteractions.application_status} IN ('SAVED', 'PREPARING') THEN 'APPLIED' ELSE ${schema.userJobInteractions.application_status} END`,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_APPLIED');
  return formatInteraction(record!);
}

/**
 * Unmark a job as applied.
 */
export async function unmarkJobApplied(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      is_applied: false,
      applied_at: null,
      application_status: 'SAVED',
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        is_applied: false,
        applied_at: null,
        application_status: sql`CASE WHEN ${schema.userJobInteractions.application_status} = 'APPLIED' THEN 'SAVED' ELSE ${schema.userJobInteractions.application_status} END`,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_UNAPPLIED');
  return formatInteraction(record!);
}

/**
 * Dismiss (hide) a job for the authenticated user.
 */
export async function dismissJob(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      is_dismissed: true,
      dismissed_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        is_dismissed: true,
        dismissed_at: now,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_DISMISSED');
  return formatInteraction(record!);
}

/**
 * Restore a dismissed job.
 */
export async function restoreDismissedJob(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      is_dismissed: false,
      dismissed_at: null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        is_dismissed: false,
        dismissed_at: null,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_RESTORED');
  return formatInteraction(record!);
}

/**
 * Record a job detail view event for the authenticated user.
 */
export async function recordJobView(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      is_viewed: true,
      viewed_at: now,
      view_count: 1,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        is_viewed: true,
        viewed_at: now,
        view_count: sql`${schema.userJobInteractions.view_count} + 1`,
        updated_at: now,
      },
    })
    .returning();

  return formatInteraction(record!);
}

/**
 * Save private notes for a job.
 */
export async function setJobNotes(userId: string, jobId: string, notes: string): Promise<UserJobInteractionState> {
  const trimmed = String(notes || '').trim();
  if (trimmed.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notes exceed maximum length of ${MAX_NOTES_LENGTH} characters`);
  }

  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      notes: trimmed,
      notes_updated_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        notes: notes.trim(),
        notes_updated_at: now,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_NOTES_UPDATED');
  return formatInteraction(record!);
}

/**
 * Delete private notes for a job.
 */
export async function deleteJobNotes(userId: string, jobId: string): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      notes: null,
      notes_updated_at: null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        notes: null,
        notes_updated_at: null,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_NOTES_DELETED');
  return formatInteraction(record!);
}

/**
 * Get user interaction state for a single job.
 */
export async function getUserJobInteraction(userId: string, jobId: string): Promise<UserJobInteractionState | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(schema.userJobInteractions)
    .where(
      and(
        eq(schema.userJobInteractions.user_id, userId),
        eq(schema.userJobInteractions.job_id, jobId)
      )
    )
    .limit(1);

  return record ? formatInteraction(record) : null;
}

/**
 * Bulk lookup of user interactions for a list of job IDs (Prevents N+1 queries).
 */
export async function getInteractionsBatch(
  userId: string,
  jobIds: string[]
): Promise<Map<string, UserJobInteractionState>> {
  const map = new Map<string, UserJobInteractionState>();
  if (!jobIds || jobIds.length === 0) return map;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid) return map;

  const db = getDb();
  const records = await db
    .select()
    .from(schema.userJobInteractions)
    .where(
      and(
        eq(schema.userJobInteractions.user_id, userId),
        inArray(schema.userJobInteractions.job_id, jobIds)
      )
    );

  for (const r of records) {
    map.set(r.job_id, formatInteraction(r));
  }

  return map;
}

/**
 * Get dismissed job IDs for filtering the live feed.
 */
export async function getDismissedJobIds(userId: string): Promise<Set<string>> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid) return new Set();

  const db = getDb();
  const records = await db
    .select({ jobId: schema.userJobInteractions.job_id })
    .from(schema.userJobInteractions)
    .where(
      and(
        eq(schema.userJobInteractions.user_id, userId),
        eq(schema.userJobInteractions.is_dismissed, true)
      )
    );

  return new Set(records.map((r) => r.jobId));
}

/**
 * Get saved jobs for the user with filtering and pagination.
 */
export async function getSavedJobs(
  userId: string,
  options: WorkspaceQueryOptions = {}
): Promise<PaginatedWorkspaceResult> {
  const db = getDb();
  const page = Math.max(options.page ?? 1, 1);
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 100);
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.userJobInteractions.user_id, userId),
    eq(schema.userJobInteractions.is_saved, true),
  ];

  if (options.status === 'ACTIVE') {
    conditions.push(eq(schema.jobs.status, 'ACTIVE'));
  } else if (options.status === 'CLOSED') {
    conditions.push(eq(schema.jobs.status, 'CLOSED'));
  }

  if (options.applied === 'APPLIED') {
    conditions.push(eq(schema.userJobInteractions.is_applied, true));
  } else if (options.applied === 'NOT_APPLIED') {
    conditions.push(eq(schema.userJobInteractions.is_applied, false));
  }

  if (options.q && options.q.trim().length > 0) {
    const qPattern = `%${options.q.trim()}%`;
    conditions.push(
      or(
        ilike(schema.jobs.title, qPattern),
        ilike(schema.companies.name, qPattern),
        ilike(schema.jobs.location, qPattern)
      )!
    );
  }

  const [countRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.userJobInteractions)
    .innerJoin(schema.jobs, eq(schema.userJobInteractions.job_id, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions));

  const total = countRes?.count ?? 0;

  const rows = await db
    .select({
      interaction: schema.userJobInteractions,
      job: schema.jobs,
      company: schema.companies,
    })
    .from(schema.userJobInteractions)
    .innerJoin(schema.jobs, eq(schema.userJobInteractions.job_id, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions))
    .orderBy(desc(schema.userJobInteractions.saved_at))
    .limit(limit)
    .offset(offset);

  const items: WorkspaceJobItem[] = rows.map((r) => ({
    id: r.job.id,
    externalJobId: r.job.external_job_id,
    title: r.job.title,
    companyId: r.company.id,
    companyName: r.company.name,
    location: r.job.location,
    workplaceType: r.job.workplace_type,
    officialUrl: r.job.official_url,
    applyUrl: r.job.apply_url,
    status: r.job.status,
    verificationStatus: r.job.verification_status,
    closedAt: r.job.closed_at?.toISOString() ?? null,
    firstSeenAt: r.job.first_seen_at.toISOString(),
    lastSeenAt: r.job.last_seen_at.toISOString(),
    interaction: formatInteraction(r.interaction),
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Get applied jobs for the user with filtering and pagination.
 */
export async function getAppliedJobs(
  userId: string,
  options: WorkspaceQueryOptions = {}
): Promise<PaginatedWorkspaceResult> {
  const db = getDb();
  const page = Math.max(options.page ?? 1, 1);
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 100);
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.userJobInteractions.user_id, userId),
    eq(schema.userJobInteractions.is_applied, true),
  ];

  if (options.status === 'ACTIVE') {
    conditions.push(eq(schema.jobs.status, 'ACTIVE'));
  } else if (options.status === 'CLOSED') {
    conditions.push(eq(schema.jobs.status, 'CLOSED'));
  }

  if (options.q && options.q.trim().length > 0) {
    const qPattern = `%${options.q.trim()}%`;
    conditions.push(
      or(
        ilike(schema.jobs.title, qPattern),
        ilike(schema.companies.name, qPattern),
        ilike(schema.jobs.location, qPattern)
      )!
    );
  }

  const [countRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.userJobInteractions)
    .innerJoin(schema.jobs, eq(schema.userJobInteractions.job_id, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions));

  const total = countRes?.count ?? 0;

  const rows = await db
    .select({
      interaction: schema.userJobInteractions,
      job: schema.jobs,
      company: schema.companies,
    })
    .from(schema.userJobInteractions)
    .innerJoin(schema.jobs, eq(schema.userJobInteractions.job_id, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions))
    .orderBy(desc(schema.userJobInteractions.applied_at))
    .limit(limit)
    .offset(offset);

  const items: WorkspaceJobItem[] = rows.map((r) => ({
    id: r.job.id,
    externalJobId: r.job.external_job_id,
    title: r.job.title,
    companyId: r.company.id,
    companyName: r.company.name,
    location: r.job.location,
    workplaceType: r.job.workplace_type,
    officialUrl: r.job.official_url,
    applyUrl: r.job.apply_url,
    status: r.job.status,
    verificationStatus: r.job.verification_status,
    closedAt: r.job.closed_at?.toISOString() ?? null,
    firstSeenAt: r.job.first_seen_at.toISOString(),
    lastSeenAt: r.job.last_seen_at.toISOString(),
    interaction: formatInteraction(r.interaction),
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Get dismissed (hidden) jobs for the user.
 */
export async function getDismissedJobs(
  userId: string,
  options: WorkspaceQueryOptions = {}
): Promise<PaginatedWorkspaceResult> {
  const db = getDb();
  const page = Math.max(options.page ?? 1, 1);
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 100);
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.userJobInteractions.user_id, userId),
    eq(schema.userJobInteractions.is_dismissed, true),
  ];

  if (options.q && options.q.trim().length > 0) {
    const qPattern = `%${options.q.trim()}%`;
    conditions.push(
      or(
        ilike(schema.jobs.title, qPattern),
        ilike(schema.companies.name, qPattern),
        ilike(schema.jobs.location, qPattern)
      )!
    );
  }

  const [countRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.userJobInteractions)
    .innerJoin(schema.jobs, eq(schema.userJobInteractions.job_id, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions));

  const total = countRes?.count ?? 0;

  const rows = await db
    .select({
      interaction: schema.userJobInteractions,
      job: schema.jobs,
      company: schema.companies,
    })
    .from(schema.userJobInteractions)
    .innerJoin(schema.jobs, eq(schema.userJobInteractions.job_id, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions))
    .orderBy(desc(schema.userJobInteractions.dismissed_at))
    .limit(limit)
    .offset(offset);

  const items: WorkspaceJobItem[] = rows.map((r) => ({
    id: r.job.id,
    externalJobId: r.job.external_job_id,
    title: r.job.title,
    companyId: r.company.id,
    companyName: r.company.name,
    location: r.job.location,
    workplaceType: r.job.workplace_type,
    officialUrl: r.job.official_url,
    applyUrl: r.job.apply_url,
    status: r.job.status,
    verificationStatus: r.job.verification_status,
    closedAt: r.job.closed_at?.toISOString() ?? null,
    firstSeenAt: r.job.first_seen_at.toISOString(),
    lastSeenAt: r.job.last_seen_at.toISOString(),
    interaction: formatInteraction(r.interaction),
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Get recently viewed jobs for the user (bounded at max 50).
 */
export async function getRecentlyViewedJobs(
  userId: string,
  limit: number = 10
): Promise<WorkspaceJobItem[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  const db = getDb();

  const rows = await db
    .select({
      interaction: schema.userJobInteractions,
      job: schema.jobs,
      company: schema.companies,
    })
    .from(schema.userJobInteractions)
    .innerJoin(schema.jobs, eq(schema.userJobInteractions.job_id, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(
      and(
        eq(schema.userJobInteractions.user_id, userId),
        eq(schema.userJobInteractions.is_viewed, true)
      )
    )
    .orderBy(desc(schema.userJobInteractions.viewed_at))
    .limit(boundedLimit);

  return rows.map((r) => ({
    id: r.job.id,
    externalJobId: r.job.external_job_id,
    title: r.job.title,
    companyId: r.company.id,
    companyName: r.company.name,
    location: r.job.location,
    workplaceType: r.job.workplace_type,
    officialUrl: r.job.official_url,
    applyUrl: r.job.apply_url,
    status: r.job.status,
    verificationStatus: r.job.verification_status,
    closedAt: r.job.closed_at?.toISOString() ?? null,
    firstSeenAt: r.job.first_seen_at.toISOString(),
    lastSeenAt: r.job.last_seen_at.toISOString(),
    interaction: formatInteraction(r.interaction),
  }));
}

/**
 * Get workspace count statistics for the user dashboard.
 */
export async function getWorkspaceStats(userId: string): Promise<{
  savedCount: number;
  appliedCount: number;
  dismissedCount: number;
  recentlyViewedCount: number;
}> {
  const db = getDb();

  const [stats] = await db
    .select({
      savedCount: sql<number>`count(*) filter (where ${schema.userJobInteractions.is_saved} = true)::int`,
      appliedCount: sql<number>`count(*) filter (where ${schema.userJobInteractions.is_applied} = true)::int`,
      dismissedCount: sql<number>`count(*) filter (where ${schema.userJobInteractions.is_dismissed} = true)::int`,
      recentlyViewedCount: sql<number>`count(*) filter (where ${schema.userJobInteractions.is_viewed} = true)::int`,
    })
    .from(schema.userJobInteractions)
    .where(eq(schema.userJobInteractions.user_id, userId));

  return {
    savedCount: stats?.savedCount ?? 0,
    appliedCount: stats?.appliedCount ?? 0,
    dismissedCount: stats?.dismissedCount ?? 0,
    recentlyViewedCount: stats?.recentlyViewedCount ?? 0,
  };
}

function formatInteraction(record: typeof schema.userJobInteractions.$inferSelect): UserJobInteractionState {
  return {
    jobId: record.job_id,
    isSaved: record.is_saved,
    savedAt: record.saved_at?.toISOString() ?? null,
    isApplied: record.is_applied,
    appliedAt: record.applied_at?.toISOString() ?? null,
    isDismissed: record.is_dismissed,
    dismissedAt: record.dismissed_at?.toISOString() ?? null,
    isViewed: record.is_viewed,
    viewedAt: record.viewed_at?.toISOString() ?? null,
    viewCount: record.view_count,
    notes: record.notes ?? null,
    notesUpdatedAt: record.notes_updated_at?.toISOString() ?? null,
    applicationStatus: (record.application_status as ApplicationStatus) || 'SAVED',
    selectedResumeId: record.selected_resume_id ?? null,
    coverLetter: record.cover_letter ?? null,
    coverLetterUpdatedAt: record.cover_letter_updated_at?.toISOString() ?? null,
    checklist: Array.isArray(record.checklist) ? (record.checklist as ChecklistItem[]) : [],
    checklistUpdatedAt: record.checklist_updated_at?.toISOString() ?? null,
    reminderAt: record.reminder_at?.toISOString() ?? null,
    interviewNotes: record.interview_notes ?? null,
    interviewNotesUpdatedAt: record.interview_notes_updated_at?.toISOString() ?? null,
  };
}

/**
 * Set application workflow status for a job.
 */
export async function setApplicationStatus(
  userId: string,
  jobId: string,
  status: string
): Promise<UserJobInteractionState> {
  const normalizedStatus = String(status || '').trim().toUpperCase() as ApplicationStatus;
  if (!VALID_APPLICATION_STATUSES.includes(normalizedStatus)) {
    throw new Error(
      `Invalid application status: "${status}". Allowed values: ${VALID_APPLICATION_STATUSES.join(', ')}`
    );
  }

  const db = getDb();
  const now = new Date();
  const isAppliedStatus = ['APPLIED', 'INTERVIEWING', 'OFFERED'].includes(normalizedStatus);

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      application_status: normalizedStatus,
      is_applied: isAppliedStatus,
      applied_at: isAppliedStatus ? now : null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        application_status: normalizedStatus,
        is_applied: isAppliedStatus ? true : sql`${schema.userJobInteractions.is_applied}`,
        applied_at: isAppliedStatus
          ? sql`COALESCE(${schema.userJobInteractions.applied_at}, ${now})`
          : sql`${schema.userJobInteractions.applied_at}`,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId, status: normalizedStatus }, 'USER_APPLICATION_STATUS_UPDATED');
  return formatInteraction(record!);
}

/**
 * Select a specific resume version for a job application.
 */
export async function selectResumeForJob(
  userId: string,
  jobId: string,
  resumeId: string | null
): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  if (resumeId) {
    const [ownedResume] = await db
      .select({ id: schema.resumes.id })
      .from(schema.resumes)
      .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.user_id, userId)))
      .limit(1);

    if (!ownedResume) {
      throw new Error('Selected resume not found or does not belong to authenticated user');
    }
  }

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      selected_resume_id: resumeId,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        selected_resume_id: resumeId,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId, resumeId }, 'USER_JOB_RESUME_SELECTED');
  return formatInteraction(record!);
}

/**
 * Save job-specific application checklist.
 */
export async function setChecklist(
  userId: string,
  jobId: string,
  rawItems: unknown
): Promise<UserJobInteractionState> {
  const items = validateChecklistPayload(rawItems);
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      checklist: items,
      checklist_updated_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        checklist: items,
        checklist_updated_at: now,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId, itemCount: items.length }, 'USER_JOB_CHECKLIST_UPDATED');
  return formatInteraction(record!);
}

/**
 * Generate default application checklist items tailored to role and company.
 */
export function getDefaultChecklist(jobTitle?: string, companyName?: string): ChecklistItem[] {
  const company = companyName ? ` at ${companyName}` : '';
  const role = jobTitle || 'the role';
  return [
    { id: 'item-1', text: `Review ${role} requirements and core skills`, done: false },
    { id: 'item-2', text: 'Select tailored resume version', done: false },
    { id: 'item-3', text: `Draft customized cover letter${company}`, done: false },
    { id: 'item-4', text: 'Verify GitHub, portfolio, and project links', done: false },
    { id: 'item-5', text: 'Submit application via official employer career portal', done: false },
    { id: 'item-6', text: 'Mark applied in RoleRadar and set follow-up reminder', done: false },
  ];
}

/**
 * Set cover letter text for a job.
 */
export async function setCoverLetter(
  userId: string,
  jobId: string,
  coverLetter: string
): Promise<UserJobInteractionState> {
  const text = String(coverLetter || '').trim();
  if (text.length > MAX_COVER_LETTER_LENGTH) {
    throw new Error(
      `Cover letter exceeds maximum length of ${MAX_COVER_LETTER_LENGTH} characters (received ${text.length})`
    );
  }

  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      cover_letter: text.length > 0 ? text : null,
      cover_letter_updated_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        cover_letter: text.length > 0 ? text : null,
        cover_letter_updated_at: now,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_COVER_LETTER_UPDATED');
  return formatInteraction(record!);
}

/**
 * Delete cover letter for a job.
 */
export async function deleteCoverLetter(
  userId: string,
  jobId: string
): Promise<UserJobInteractionState> {
  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      cover_letter: null,
      cover_letter_updated_at: null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        cover_letter: null,
        cover_letter_updated_at: null,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_COVER_LETTER_DELETED');
  return formatInteraction(record!);
}

/**
 * Set an application follow-up reminder.
 */
export async function setReminder(
  userId: string,
  jobId: string,
  reminderAt: string | null
): Promise<UserJobInteractionState> {
  let parsedDate: Date | null = null;
  if (reminderAt) {
    parsedDate = new Date(reminderAt);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid reminder date timestamp');
    }
  }

  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      reminder_at: parsedDate,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        reminder_at: parsedDate,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId, reminderAt }, 'USER_JOB_REMINDER_UPDATED');
  return formatInteraction(record!);
}

/**
 * Set private interview preparation notes for a job.
 */
export async function setInterviewNotes(
  userId: string,
  jobId: string,
  notes: string
): Promise<UserJobInteractionState> {
  const text = String(notes || '').trim();
  if (text.length > MAX_INTERVIEW_NOTES_LENGTH) {
    throw new Error(
      `Interview notes exceed maximum length of ${MAX_INTERVIEW_NOTES_LENGTH} characters (received ${text.length})`
    );
  }

  const db = getDb();
  const now = new Date();

  const [record] = await db
    .insert(schema.userJobInteractions)
    .values({
      user_id: userId,
      job_id: jobId,
      interview_notes: text.length > 0 ? text : null,
      interview_notes_updated_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.userJobInteractions.user_id, schema.userJobInteractions.job_id],
      set: {
        interview_notes: text.length > 0 ? text : null,
        interview_notes_updated_at: now,
        updated_at: now,
      },
    })
    .returning();

  log.info({ userId, jobId }, 'USER_JOB_INTERVIEW_NOTES_UPDATED');
  return formatInteraction(record!);
}

/**
 * Bounded, deterministic cover letter draft assistance.
 * Synthesizes candidate profile data with verified job requirements without external AI.
 */
export async function generateCoverLetterDraft(
  userId: string,
  jobId: string
): Promise<{ coverLetter: string; tailoredPoints: string[] }> {
  const db = getDb();

  const [jobRow] = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
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
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!jobRow) {
    throw new Error('Job listing not found');
  }

  const profile = await getCandidateProfile(userId);
  const candidateName = profile?.fullName || 'Candidate';
  const targetRole = profile?.primaryRole || jobRow.title;
  const companyName = jobRow.companyName || 'Hiring Team';

  const fit = profile
    ? compareProfileWithJob(profile, {
        id: jobRow.id,
        title: jobRow.title,
        companyName,
        location: jobRow.location,
        description: jobRow.description,
        requirements: jobRow.requirements,
      })
    : null;

  const matchingSkills = fit?.matchingSkills || [];
  const skillsList =
    matchingSkills.length > 0
      ? matchingSkills.slice(0, 5).join(', ')
      : (profile?.skills.map((s) => s.skillName).slice(0, 4).join(', ') || 'software development');

  const experienceNote =
    profile?.experienceLevel === 'FRESHER'
      ? `As an aspiring ${targetRole} with a strong academic foundation and hands-on project experience`
      : `With professional experience in ${targetRole}`;

  const topProject = profile?.projects && profile.projects.length > 0 ? profile.projects[0] : null;
  const projectSentence = topProject
    ? ` In particular, through my work on "${topProject.title}", I developed practical expertise that directly relates to this position.`
    : '';

  const tailoredPoints: string[] = [
    `Aligned with target role: ${targetRole}`,
    `Highlighted matching skills: ${skillsList}`,
    ...(topProject ? [`Referenced portfolio project: ${topProject.title}`] : []),
    `Addressed to ${companyName} official career posting`,
  ];

  const draft = [
    `Dear Hiring Team at ${companyName},`,
    '',
    `I am writing to express my enthusiastic interest in the ${jobRow.title} position at ${companyName}. ${experienceNote}, I am excited about the opportunity to contribute to your team.`,
    '',
    `My background in ${skillsList} aligns well with the key requirements of this role.${projectSentence} I pride myself on rapid learning, engineering rigor, and a collaborative approach to solving complex challenges.`,
    '',
    `I would welcome the opportunity to discuss how my background and enthusiasm can contribute to ${companyName}'s continued success. Thank you for your time and consideration.`,
    '',
    'Sincerely,',
    candidateName,
  ].join('\n');

  return {
    coverLetter: draft,
    tailoredPoints,
  };
}

/**
 * Application Readiness composite view.
 * Integrates job details, user interaction, checklist, resume, cover letter,
 * interview prep notes, fit analysis, and official employer application URL.
 */
export async function getApplicationReadiness(
  userId: string,
  jobId: string
): Promise<ApplicationReadinessResult> {
  const db = getDb();

  const [jobRow] = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      companyName: schema.companies.name,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      officialUrl: schema.jobs.official_url,
      applyUrl: schema.jobs.apply_url,
      closedAt: schema.jobs.closed_at,
    })
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!jobRow) {
    throw new Error('Job listing not found');
  }

  let interaction = await getUserJobInteraction(userId, jobId);
  if (!interaction) {
    interaction = await recordJobView(userId, jobId);
  }

  // Initialize checklist if currently empty
  if (!interaction.checklist || interaction.checklist.length === 0) {
    const defaultItems = getDefaultChecklist(jobRow.title, jobRow.companyName || undefined);
    interaction = await setChecklist(userId, jobId, defaultItems);
  }

  // Resumes
  const availableResumes = await listUserResumes(userId);
  let selectedResumeDto: { id: string; filename: string; isActive: boolean } | null = null;
  if (interaction.selectedResumeId) {
    const found = availableResumes.find((r) => r.id === interaction!.selectedResumeId);
    if (found) {
      selectedResumeDto = { id: found.id, filename: found.filename, isActive: found.isActive };
    }
  }
  if (!selectedResumeDto && availableResumes.length > 0) {
    const active = availableResumes.find((r) => r.isActive) || availableResumes[0]!;
    selectedResumeDto = { id: active.id, filename: active.filename, isActive: active.isActive };
  }

  // Fit Analysis
  const profile = await getCandidateProfile(userId);
  let fitResult: ReturnType<typeof compareProfileWithJob> | undefined;
  if (profile) {
    fitResult = compareProfileWithJob(profile, {
      id: jobRow.id,
      title: jobRow.title,
      companyName: jobRow.companyName || 'Company',
      location: jobRow.location,
      workplaceType: jobRow.workplaceType,
      description: jobRow.description,
      requirements: jobRow.requirements,
    });
  }

  // Checklist counts
  const checklist = interaction.checklist || [];
  const completedCount = checklist.filter((item) => item.done).length;
  const totalChecklist = checklist.length;
  const remainingCount = totalChecklist - completedCount;

  // Readiness score (0 to 100)
  let readinessScore = 0;
  if (selectedResumeDto) readinessScore += 25;
  if (totalChecklist > 0) {
    readinessScore += Math.round((completedCount / totalChecklist) * 35);
  }
  if (interaction.coverLetter && interaction.coverLetter.trim().length > 0) {
    readinessScore += 20;
  }
  if (fitResult) {
    readinessScore += Math.round((fitResult.fitScore / 100) * 20);
  } else {
    readinessScore += 10;
  }
  readinessScore = Math.min(100, Math.max(0, readinessScore));

  const missingRequirements: string[] = [];
  const preparationGaps: string[] = [];

  if (!selectedResumeDto) {
    missingRequirements.push('No resume selected for this application');
    preparationGaps.push('Upload or select an active resume version');
  }
  if (fitResult && fitResult.missingSkills.length > 0) {
    missingRequirements.push(
      ...fitResult.missingSkills.slice(0, 3).map((s) => `Missing skill evidence: ${s}`)
    );
    preparationGaps.push(
      `Highlight any project or academic experience with ${fitResult.missingSkills.slice(0, 2).join(', ')}`
    );
  }
  if (!interaction.coverLetter || interaction.coverLetter.trim().length === 0) {
    preparationGaps.push('Prepare a customized cover letter for this employer');
  }
  if (remainingCount > 0) {
    preparationGaps.push(`${remainingCount} checklist task${remainingCount > 1 ? 's' : ''} remaining`);
  }

  const isClosed = jobRow.status === 'CLOSED';

  return {
    jobId: jobRow.id,
    jobTitle: jobRow.title,
    companyName: jobRow.companyName || 'Company',
    location: jobRow.location,
    workplaceType: jobRow.workplaceType,
    officialUrl: jobRow.officialUrl,
    applyUrl: jobRow.applyUrl,
    isClosed,
    status: jobRow.status,
    verificationStatus: jobRow.verificationStatus,
    interaction,
    readinessScore,
    checklistSummary: {
      total: totalChecklist,
      completed: completedCount,
      remaining: remainingCount,
    },
    selectedResume: selectedResumeDto,
    availableResumes: availableResumes.map((r) => ({
      id: r.id,
      filename: r.filename,
      isActive: r.isActive,
      createdAt: r.createdAt,
    })),
    missingRequirements,
    preparationGaps,
    fitAnalysis: fitResult
      ? {
          fitScore: fitResult.fitScore,
          fitTier: fitResult.fitTier,
          matchingSkills: fitResult.matchingSkills,
          missingSkills: fitResult.missingSkills,
          fitReasons: fitResult.fitReasons,
        }
      : undefined,
    officialApplicationNotice:
      'RoleRadar never submits applications automatically. Follow the official link to apply directly on the employer website, then mark as applied.',
  };
}

export { getUserJobInteraction as getJobInteraction, restoreDismissedJob as restoreJob };

