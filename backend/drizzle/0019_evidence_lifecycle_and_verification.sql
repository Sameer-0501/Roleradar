-- Migration 0019: Evidence Lifecycle State and Verification Level Separation
-- Separates claim lifecycle (ACTIVE / WITHDRAWN) from epistemological verification level.

ALTER TABLE "candidate_evidence"
  ADD COLUMN IF NOT EXISTS "lifecycle_state" text DEFAULT 'ACTIVE' NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- Backfill: Any legacy record where verified_status was set to 'WITHDRAWN'
-- moves to lifecycle_state = 'WITHDRAWN' while restoring a valid verified_status ('SELF_REPORTED').
UPDATE "candidate_evidence"
  SET "lifecycle_state" = 'WITHDRAWN',
      "verified_status" = 'SELF_REPORTED'
  WHERE "verified_status" = 'WITHDRAWN';

CREATE INDEX IF NOT EXISTS "candidate_evidence_lifecycle_idx"
  ON "candidate_evidence" ("user_id", "lifecycle_state");

