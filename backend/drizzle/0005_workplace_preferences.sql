ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "workplace_types" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "workplace_type" text DEFAULT 'UNKNOWN';
