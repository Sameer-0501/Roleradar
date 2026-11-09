-- Migration 0017: Product Release 1B Engine 2 Proof-Based Job Fit Controls
-- Adds fit_controls JSONB to user_job_interactions for candidate requirement disputes and clarifications.

ALTER TABLE "user_job_interactions"
  ADD COLUMN IF NOT EXISTS "fit_controls" jsonb DEFAULT '{}'::jsonb;

