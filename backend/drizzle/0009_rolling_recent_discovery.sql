-- Rolling Recent-Job Discovery — Migration 0009
--
-- Adds:
--   1. discovery_reason column to notifications table
--      Observability field storing which discovery path triggered the notification:
--      'NEW_JOB'    = discovered during a normal per-collector scan
--      'RECENT_JOB' = discovered by the rolling recent-source or DB-reconciliation sweep
--      NULL         = legacy notifications created before this migration
--
--   2. Index on jobs.official_posted_at for efficient rolling window queries
--      Used by getRecentlyPostedJobs() and runRecentSourceSweep() date-filter step

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "discovery_reason" text;

CREATE INDEX IF NOT EXISTS "jobs_official_posted_at_idx" ON "jobs" ("official_posted_at");
