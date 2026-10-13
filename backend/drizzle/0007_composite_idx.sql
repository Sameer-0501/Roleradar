-- Migration 0007: Composite index on (status, verification_status)
--
-- Justification:
--   The hot-path matching query is:
--     WHERE jobs.status = 'ACTIVE' AND jobs.verification_status = 'VERIFIED'
--   Using two separate single-column indexes (index intersection) is less
--   efficient than a single composite index covering both columns in order.
--
-- Uses CREATE INDEX CONCURRENTLY so no table lock is acquired during creation.
-- Safe to run against a live production database.

CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_status_verification_idx
  ON jobs(status, verification_status);
