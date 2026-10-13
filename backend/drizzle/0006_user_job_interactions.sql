CREATE TABLE IF NOT EXISTS "user_job_interactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "is_saved" boolean DEFAULT false NOT NULL,
  "saved_at" timestamp with time zone,
  "is_applied" boolean DEFAULT false NOT NULL,
  "applied_at" timestamp with time zone,
  "is_dismissed" boolean DEFAULT false NOT NULL,
  "dismissed_at" timestamp with time zone,
  "is_viewed" boolean DEFAULT false NOT NULL,
  "viewed_at" timestamp with time zone,
  "view_count" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "notes_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_job_interactions_user_job_unique" ON "user_job_interactions" ("user_id", "job_id");
CREATE INDEX IF NOT EXISTS "user_job_interactions_user_id_idx" ON "user_job_interactions" ("user_id");
CREATE INDEX IF NOT EXISTS "user_job_interactions_job_id_idx" ON "user_job_interactions" ("job_id");
CREATE INDEX IF NOT EXISTS "user_job_interactions_user_saved_idx" ON "user_job_interactions" ("user_id", "is_saved");
CREATE INDEX IF NOT EXISTS "user_job_interactions_user_applied_idx" ON "user_job_interactions" ("user_id", "is_applied");
CREATE INDEX IF NOT EXISTS "user_job_interactions_user_dismissed_idx" ON "user_job_interactions" ("user_id", "is_dismissed");
CREATE INDEX IF NOT EXISTS "user_job_interactions_user_viewed_idx" ON "user_job_interactions" ("user_id", "viewed_at");
