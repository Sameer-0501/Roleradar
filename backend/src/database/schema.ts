/**
 * Database schema definitions using Drizzle ORM.
 *
 * All tables are created here. Migrations are generated from this
 * file using `npm run migrate:generate`.
 *
 * IMPORTANT:
 * - jobs.verification_status must NEVER be set to VERIFIED based
 *   solely on discovery. A real verification check must pass.
 * - job_verifications is an append-only audit log. Rows are never
 *   updated or deleted.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  real,
  date,
  AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const atsTypeEnum = pgEnum('ats_type', [
  'WORKDAY',
  'GREENHOUSE',
  'LEVER',
  'SAP',
  'SMARTRECRUITERS',
  'CUSTOM',
  'UNKNOWN',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'DISCOVERED',
  'VERIFYING',
  'ACTIVE',
  'UPDATED',
  'CLOSED',
  'VERIFICATION_FAILED',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'PENDING',
  'VERIFIED',
  'FAILED',
]);

export const scanRunStatusEnum = pgEnum('scan_run_status', [
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);

export const betaFeedbackCategoryEnum = pgEnum('beta_feedback_category', [
  'JOB_RELEVANCE',
  'JOB_CLOSED',
  'WRONG_ROLE',
  'WRONG_LOCATION',
  'WRONG_EXPERIENCE',
  'WORKPLACE_MISMATCH',
  'APPLICATION_URL_PROBLEM',
  'GENERAL_FEEDBACK',
  'OTHER',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'INSTANT_JOB',
  'DAILY_DIGEST',
  'WINDOWED_DIGEST',
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'FAILED_PERMANENT',
]);

// ─── companies ───────────────────────────────────────────────────────────────

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    official_domain: text('official_domain').notNull(),
    careers_url: text('careers_url').notNull(),
    ats_type: atsTypeEnum('ats_type').notNull().default('UNKNOWN'),
    /** JSON blob for ATS-specific config (selectors, API keys, etc.) */
    source_config: jsonb('source_config'),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('companies_name_unique').on(t.name),
    index('companies_domain_idx').on(t.official_domain),
  ]
);

// ─── jobs ────────────────────────────────────────────────────────────────────

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    company_id: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    /** e.g. "WORKDAY", "GREENHOUSE", "LEVER" */
    source_system: text('source_system').notNull(),
    /** The job's unique ID in the external source system */
    external_job_id: text('external_job_id').notNull(),
    title: text('title').notNull(),
    location: text('location'),
    workplace_type: text('workplace_type').default('UNKNOWN'),
    employment_type: text('employment_type'),
    official_url: text('official_url').notNull(),
    apply_url: text('apply_url'),
    official_posted_at: timestamp('official_posted_at', { withTimezone: true }),
    first_seen_at: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_verified_at: timestamp('last_verified_at', { withTimezone: true }),
    initial_verified_at: timestamp('initial_verified_at', { withTimezone: true }),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    status: jobStatusEnum('status').notNull().default('DISCOVERED'),
    verification_status: verificationStatusEnum('verification_status')
      .notNull()
      .default('PENDING'),
    description: text('description'),
    requirements: text('requirements'),
    /** SHA-256 of title+location+description+requirements to detect changes */
    content_hash: text('content_hash').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * CRITICAL: Logical identity of a job is company + source_system + external_job_id.
     * This constraint prevents duplicate active records.
     */
    uniqueIndex('jobs_identity_unique').on(
      t.company_id,
      t.source_system,
      t.external_job_id
    ),
    index('jobs_company_id_idx').on(t.company_id),
    index('jobs_status_idx').on(t.status),
    index('jobs_verification_status_idx').on(t.verification_status),
    index('jobs_first_seen_idx').on(t.first_seen_at),
    index('jobs_status_ver_first_seen_idx').on(t.status, t.verification_status, t.first_seen_at),
    index('jobs_status_ver_last_verified_idx').on(t.status, t.verification_status, t.last_verified_at),
    /** Used by rolling recent-job discovery window queries */
    index('jobs_official_posted_at_idx').on(t.official_posted_at),
  ]
);

// ─── job_verifications ────────────────────────────────────────────────────────

/**
 * Append-only audit log of every verification attempt.
 * Rows are NEVER updated or deleted.
 */
export const jobVerifications = pgTable(
  'job_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job_id: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    checked_at: timestamp('checked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Was the job URL on the official company domain? */
    domain_check: boolean('domain_check'),
    /** Did the external system confirm the job still exists? */
    job_exists_check: boolean('job_exists_check'),
    /** Did the external job ID match? */
    job_id_check: boolean('job_id_check'),
    /** Did the title match within acceptable tolerance? */
    title_check: boolean('title_check'),
    /** Did the location match? */
    location_check: boolean('location_check'),
    /** Was the job status active (not closed/filled)? */
    status_check: boolean('status_check'),
    /** Was the apply URL accessible and valid? */
    apply_url_check: boolean('apply_url_check'),
    /** 0.0–1.0 composite verification score */
    verification_score: real('verification_score'),
    /** Reason string if verification failed */
    failure_reason: text('failure_reason'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('job_verifications_job_id_idx').on(t.job_id),
    index('job_verifications_checked_at_idx').on(t.checked_at),
  ]
);

// ─── users ───────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    password_hash: text('password_hash'),
    is_admin: boolean('is_admin').notNull().default(false),
    is_beta_user: boolean('is_beta_user').notNull().default(false),
    email_verified: boolean('email_verified').notNull().default(false),
    email_verified_at: timestamp('email_verified_at', { withTimezone: true }),
    verification_token_hash: text('verification_token_hash'),
    verification_token_expires_at: timestamp('verification_token_expires_at', {
      withTimezone: true,
    }),
    last_verification_sent_at: timestamp('last_verification_sent_at', {
      withTimezone: true,
    }),
    /**
     * Server-side token version counter for session revocation.
     * Incremented on logout, password changes, or manual revocation.
     */
    token_version: integer('token_version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(t.email),
    uniqueIndex('users_verification_token_hash_unique').on(
      t.verification_token_hash
    ),
  ]
);

// ─── user_preferences ────────────────────────────────────────────────────────

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Array of company IDs (UUIDs) the user wants to track (empty = all active companies) */
  companies: jsonb('companies').$type<string[]>().default([]),
  /** Array of preferred location strings */
  locations: jsonb('locations').$type<string[]>().default([]),
  /** Array of preferred workplace types: ONSITE | HYBRID | REMOTE (empty = any workplace) */
  workplace_types: jsonb('workplace_types').$type<string[]>().default([]),
  /** Array of role/title keywords */
  roles: jsonb('roles').$type<string[]>().default([]),
  /** Additive array of canonical role IDs representing the single source of truth for taxonomy */
  canonical_roles: jsonb('canonical_roles').$type<string[]>().default([]),
  /** Experience level: FRESHER | EXPERIENCED | ANY */
  experience_level: text('experience_level').notNull().default('FRESHER'),
  /** Whether the user completed the initial onboarding wizard */
  onboarding_completed: boolean('onboarding_completed').notNull().default(false),
  /** Free-text keyword strings for matching */
  keywords: jsonb('keywords').$type<string[]>().default([]),
  /** Master toggle: allow email alerts */
  email_alerts_enabled: boolean('email_alerts_enabled').notNull().default(true),
  /** Send a notification immediately when a new verified job matches */
  instant_notifications: boolean('instant_notifications').notNull().default(true),
  /** Send a daily digest email */
  daily_digest: boolean('daily_digest').notNull().default(false),
  /** User preferred timezone (e.g. "UTC", "Asia/Kolkata", "America/New_York") */
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── notifications ───────────────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    job_id: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    digest_id: uuid('digest_id').references((): AnyPgColumn => notifications.id, { onDelete: 'cascade' }),
    notification_type: notificationTypeEnum('notification_type').notNull(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    delivery_status: deliveryStatusEnum('delivery_status')
      .notNull()
      .default('PENDING'),
    failure_reason: text('failure_reason'),
    attempt_count: integer('attempt_count').notNull().default(0),
    last_attempted_at: timestamp('last_attempted_at', { withTimezone: true }),
    provider_message_id: text('provider_message_id'),
    is_read: boolean('is_read').notNull().default(false),
    read_at: timestamp('read_at', { withTimezone: true }),
    idempotency_key: text('idempotency_key'),
    /**
     * Observability: which discovery path created this notification.
     * 'NEW_JOB'    = normal per-collector discovery scan.
     * 'RECENT_JOB' = rolling recent-source or DB-reconciliation sweep.
     * NULL         = legacy notifications (pre-migration).
     */
    discovery_reason: text('discovery_reason'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * CRITICAL IDEMPOTENCY: Exactly one notification intent per (user, job, type).
     * Prevents duplicate alert records at the database engine level.
     */
    uniqueIndex('notifications_user_job_type_unique').on(
      t.user_id,
      t.job_id,
      t.notification_type
    ),
    uniqueIndex('notifications_idempotency_key_unique').on(t.idempotency_key),
    index('notifications_user_id_idx').on(t.user_id),
    index('notifications_job_id_idx').on(t.job_id),
    index('notifications_delivery_status_idx').on(t.delivery_status),
    index('notifications_created_at_idx').on(t.created_at),
  ]
);

// ─── email_daily_budget ──────────────────────────────────────────────────────

export const emailDailyBudget = pgTable('email_daily_budget', {
  date_utc: date('date_utc').primaryKey(),
  sent_count: integer('sent_count').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── scan_runs ───────────────────────────────────────────────────────────────

export const scanRuns = pgTable(
  'scan_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** e.g. "WORKDAY", "GREENHOUSE", "CUSTOM" */
    source_type: text('source_type').notNull(),
    /** Human-readable name of the collector/source */
    source_name: text('source_name').notNull(),
    started_at: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    status: scanRunStatusEnum('status').notNull().default('RUNNING'),
    jobs_discovered: integer('jobs_discovered').notNull().default(0),
    jobs_verified: integer('jobs_verified').notNull().default(0),
    jobs_rejected: integer('jobs_rejected').notNull().default(0),
    error_message: text('error_message'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('scan_runs_status_idx').on(t.status),
    index('scan_runs_started_at_idx').on(t.started_at),
    index('scan_runs_source_type_idx').on(t.source_type),
  ]
);

// ─── user_job_interactions ───────────────────────────────────────────────────

export const userJobInteractions = pgTable(
  'user_job_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    job_id: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    is_saved: boolean('is_saved').notNull().default(false),
    saved_at: timestamp('saved_at', { withTimezone: true }),
    is_applied: boolean('is_applied').notNull().default(false),
    applied_at: timestamp('applied_at', { withTimezone: true }),
    is_dismissed: boolean('is_dismissed').notNull().default(false),
    dismissed_at: timestamp('dismissed_at', { withTimezone: true }),
    is_viewed: boolean('is_viewed').notNull().default(false),
    viewed_at: timestamp('viewed_at', { withTimezone: true }),
    view_count: integer('view_count').notNull().default(0),
    notes: text('notes'),
    notes_updated_at: timestamp('notes_updated_at', { withTimezone: true }),
    application_status: text('application_status').notNull().default('SAVED'),
    selected_resume_id: uuid('selected_resume_id').references(() => resumes.id, { onDelete: 'set null' }),
    cover_letter: text('cover_letter'),
    cover_letter_updated_at: timestamp('cover_letter_updated_at', { withTimezone: true }),
    checklist: jsonb('checklist').$type<{ id: string; text: string; done: boolean }[]>().default([]),
    checklist_updated_at: timestamp('checklist_updated_at', { withTimezone: true }),
    reminder_at: timestamp('reminder_at', { withTimezone: true }),
    interview_notes: text('interview_notes'),
    interview_notes_updated_at: timestamp('interview_notes_updated_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * CRITICAL USER ISOLATION & IDEMPOTENCY:
     * Exactly one personal interaction record per (user, job).
     */
    uniqueIndex('user_job_interactions_user_job_unique').on(t.user_id, t.job_id),
    index('user_job_interactions_user_id_idx').on(t.user_id),
    index('user_job_interactions_job_id_idx').on(t.job_id),
    index('user_job_interactions_user_saved_idx').on(t.user_id, t.is_saved),
    index('user_job_interactions_user_applied_idx').on(t.user_id, t.is_applied),
    index('user_job_interactions_user_dismissed_idx').on(t.user_id, t.is_dismissed),
    index('user_job_interactions_user_viewed_idx').on(t.user_id, t.viewed_at),
    index('user_job_interactions_user_app_status_idx').on(t.user_id, t.application_status),
    index('user_job_interactions_reminder_idx').on(t.user_id, t.reminder_at),
  ]
);

// ─── resumes ──────────────────────────────────────────────────────────────────

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    file_size: integer('file_size').notNull(),
    mime_type: text('mime_type').notNull(),
    storage_path: text('storage_path').notNull(),
    parsed_text: text('parsed_text'),
    is_active: boolean('is_active').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('resumes_user_id_idx').on(t.user_id),
    index('resumes_user_active_idx').on(t.user_id, t.is_active),
  ]
);

// ─── candidate_profiles ───────────────────────────────────────────────────────

export const candidateProfiles = pgTable(
  'candidate_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    full_name: text('full_name'),
    headline: text('headline'),
    summary: text('summary'),
    primary_role: text('primary_role'),
    target_roles: jsonb('target_roles'),
    experience_level: text('experience_level').default('FRESHER'),
    total_experience_months: integer('total_experience_months').default(0),
    completeness_score: integer('completeness_score').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('candidate_profiles_user_id_unique').on(t.user_id),
    index('candidate_profiles_user_id_idx').on(t.user_id),
  ]
);

// ─── candidate_skills ─────────────────────────────────────────────────────────

export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skill_name: text('skill_name').notNull(),
    canonical_name: text('canonical_name').notNull(),
    category: text('category').default('Technical'),
    source: text('source').notNull().default('PARSED'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('candidate_skills_user_skill_unique').on(t.user_id, t.canonical_name),
    index('candidate_skills_user_id_idx').on(t.user_id),
  ]
);

// ─── candidate_educations ─────────────────────────────────────────────────────

export const candidateEducations = pgTable(
  'candidate_educations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institution: text('institution').notNull(),
    degree: text('degree').notNull(),
    field_of_study: text('field_of_study'),
    start_year: integer('start_year'),
    end_year: integer('end_year'),
    grade: text('grade'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('candidate_educations_user_id_idx').on(t.user_id),
  ]
);

// ─── candidate_projects ───────────────────────────────────────────────────────

export const candidateProjects = pgTable(
  'candidate_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    technologies: jsonb('technologies'),
    url: text('url'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('candidate_projects_user_id_idx').on(t.user_id),
  ]
);

// ─── candidate_certifications ─────────────────────────────────────────────────

export const candidateCertifications = pgTable(
  'candidate_certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    issuer: text('issuer'),
    issue_year: integer('issue_year'),
    url: text('url'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('candidate_certifications_user_id_idx').on(t.user_id),
  ]
);

// ─── candidate_experiences ───────────────────────────────────────────────────

export const candidateExperiences = pgTable(
  'candidate_experiences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    company_name: text('company_name').notNull(),
    title: text('title').notNull(),
    location: text('location'),
    is_internship: boolean('is_internship').notNull().default(false),
    start_date: timestamp('start_date', { withTimezone: true }),
    end_date: timestamp('end_date', { withTimezone: true }),
    is_current: boolean('is_current').notNull().default(false),
    description: text('description'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('candidate_experiences_user_id_idx').on(t.user_id),
  ]
);

// ─── beta_feedback ────────────────────────────────────────────────────────────

export const betaFeedback = pgTable(
  'beta_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    job_id: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    category: betaFeedbackCategoryEnum('category').notNull(),
    message: text('message').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('beta_feedback_user_id_idx').on(t.user_id),
    index('beta_feedback_job_id_idx').on(t.job_id),
    index('beta_feedback_category_idx').on(t.category),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const companiesRelations = relations(companies, ({ many }) => ({
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.company_id],
    references: [companies.id],
  }),
  verifications: many(jobVerifications),
  notifications: many(notifications),
  interactions: many(userJobInteractions),
  betaFeedback: many(betaFeedback),
}));

export const jobVerificationsRelations = relations(jobVerifications, ({ one }) => ({
  job: one(jobs, {
    fields: [jobVerifications.job_id],
    references: [jobs.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.user_id],
  }),
  profile: one(candidateProfiles, {
    fields: [users.id],
    references: [candidateProfiles.user_id],
  }),
  resumes: many(resumes),
  skills: many(candidateSkills),
  educations: many(candidateEducations),
  projects: many(candidateProjects),
  certifications: many(candidateCertifications),
  experiences: many(candidateExperiences),
  notifications: many(notifications),
  interactions: many(userJobInteractions),
  betaFeedback: many(betaFeedback),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.user_id],
    references: [users.id],
  }),
}));

export const candidateProfilesRelations = relations(candidateProfiles, ({ one }) => ({
  user: one(users, {
    fields: [candidateProfiles.user_id],
    references: [users.id],
  }),
}));

export const resumesRelations = relations(resumes, ({ one }) => ({
  user: one(users, {
    fields: [resumes.user_id],
    references: [users.id],
  }),
}));

export const candidateSkillsRelations = relations(candidateSkills, ({ one }) => ({
  user: one(users, {
    fields: [candidateSkills.user_id],
    references: [users.id],
  }),
}));

export const candidateEducationsRelations = relations(candidateEducations, ({ one }) => ({
  user: one(users, {
    fields: [candidateEducations.user_id],
    references: [users.id],
  }),
}));

export const candidateProjectsRelations = relations(candidateProjects, ({ one }) => ({
  user: one(users, {
    fields: [candidateProjects.user_id],
    references: [users.id],
  }),
}));

export const candidateCertificationsRelations = relations(candidateCertifications, ({ one }) => ({
  user: one(users, {
    fields: [candidateCertifications.user_id],
    references: [users.id],
  }),
}));

export const candidateExperiencesRelations = relations(candidateExperiences, ({ one }) => ({
  user: one(users, {
    fields: [candidateExperiences.user_id],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.user_id],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [notifications.job_id],
    references: [jobs.id],
  }),
}));

export const userJobInteractionsRelations = relations(userJobInteractions, ({ one }) => ({
  user: one(users, {
    fields: [userJobInteractions.user_id],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [userJobInteractions.job_id],
    references: [jobs.id],
  }),
  selectedResume: one(resumes, {
    fields: [userJobInteractions.selected_resume_id],
    references: [resumes.id],
  }),
}));

// ─── admin_audit_logs ────────────────────────────────────────────────────────

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actor_user_id: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    resource_type: text('resource_type').notNull(),
    resource_id: text('resource_id').notNull(),
    outcome: text('outcome').notNull(),
    http_status: integer('http_status'),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    metadata: jsonb('metadata'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('admin_audit_logs_actor_idx').on(t.actor_user_id),
    index('admin_audit_logs_action_idx').on(t.action),
    index('admin_audit_logs_resource_idx').on(t.resource_type, t.resource_id),
    index('admin_audit_logs_created_at_idx').on(t.created_at),
  ]
);

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [adminAuditLogs.actor_user_id],
    references: [users.id],
  }),
}));

export const betaFeedbackRelations = relations(betaFeedback, ({ one }) => ({
  user: one(users, {
    fields: [betaFeedback.user_id],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [betaFeedback.job_id],
    references: [jobs.id],
  }),
}));
