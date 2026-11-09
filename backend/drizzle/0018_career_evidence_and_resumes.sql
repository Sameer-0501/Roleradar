-- Migration 0018: Engine 3 Career Evidence Profile & Resume Studio 2.0
-- Establishes Master Career Evidence Vault, Claim Provenance, and Role Variant Documents.

CREATE TABLE IF NOT EXISTS "candidate_career_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "professional_headline" text,
  "career_objective" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "candidate_career_profiles_user_id_unique" UNIQUE ("user_id")
);

CREATE TABLE IF NOT EXISTS "candidate_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "evidence_type" text NOT NULL,
  "reference_id" uuid,
  "claim_text" text NOT NULL,
  "verified_status" text DEFAULT 'SELF_REPORTED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "resume_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" uuid NOT NULL REFERENCES "candidate_career_profiles"("id") ON DELETE CASCADE,
  "variant_name" text NOT NULL,
  "is_master" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "resume_bullets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resume_id" uuid NOT NULL REFERENCES "resume_documents"("id") ON DELETE CASCADE,
  "evidence_id" uuid REFERENCES "candidate_evidence"("id") ON DELETE SET NULL,
  "bullet_text" text NOT NULL,
  "provenance_state" text DEFAULT 'UNLINKED' NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "candidate_career_profiles_user_idx" ON "candidate_career_profiles" ("user_id");
CREATE INDEX IF NOT EXISTS "candidate_evidence_user_idx" ON "candidate_evidence" ("user_id");
CREATE INDEX IF NOT EXISTS "candidate_evidence_type_idx" ON "candidate_evidence" ("user_id", "evidence_type");
CREATE INDEX IF NOT EXISTS "resume_documents_user_idx" ON "resume_documents" ("user_id");
CREATE INDEX IF NOT EXISTS "resume_documents_profile_idx" ON "resume_documents" ("profile_id");
CREATE INDEX IF NOT EXISTS "resume_bullets_resume_idx" ON "resume_bullets" ("resume_id");
CREATE INDEX IF NOT EXISTS "resume_bullets_evidence_idx" ON "resume_bullets" ("evidence_id");
