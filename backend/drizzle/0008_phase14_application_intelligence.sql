-- Migration 0008: Phase 14 Application Intelligence & Job Application Assistant
-- Extends user_job_interactions with checklist, application status, resume selection,
-- cover letter, reminders, and interview notes.

ALTER TABLE "user_job_interactions"
  ADD COLUMN IF NOT EXISTS "application_status" text NOT NULL DEFAULT 'SAVED',
  ADD COLUMN IF NOT EXISTS "selected_resume_id" uuid REFERENCES "resumes"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "cover_letter" text,
  ADD COLUMN IF NOT EXISTS "cover_letter_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "checklist" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "checklist_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "reminder_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "interview_notes" text,
  ADD COLUMN IF NOT EXISTS "interview_notes_updated_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "user_job_interactions_user_app_status_idx"
  ON "user_job_interactions" ("user_id", "application_status");

CREATE INDEX IF NOT EXISTS "user_job_interactions_reminder_idx"
  ON "user_job_interactions" ("user_id", "reminder_at");
