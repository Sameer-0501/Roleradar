import 'dotenv/config';
import { getDb, closeConnection } from './connection.js';
import { sql } from 'drizzle-orm';
import { createLogger } from '../utils/logger.js';

const log = createLogger('database:init-phase13');

export async function initPhase13Tables(): Promise<void> {
  const db = getDb();
  log.info('Initializing Phase 13 Resume and Candidate Profile tables...');

  // 1. resumes table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "resumes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "filename" text NOT NULL,
      "file_size" integer NOT NULL,
      "mime_type" text NOT NULL,
      "storage_path" text NOT NULL,
      "parsed_text" text,
      "is_active" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "resumes_user_id_idx" ON "resumes" ("user_id");
    CREATE INDEX IF NOT EXISTS "resumes_user_active_idx" ON "resumes" ("user_id", "is_active");
  `);

  // 2. candidate_profiles table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "candidate_profiles" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "full_name" text,
      "headline" text,
      "summary" text,
      "primary_role" text,
      "target_roles" jsonb,
      "experience_level" text DEFAULT 'FRESHER',
      "total_experience_months" integer DEFAULT 0,
      "completeness_score" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "candidate_profiles_user_id_unique" ON "candidate_profiles" ("user_id");
    CREATE INDEX IF NOT EXISTS "candidate_profiles_user_id_idx" ON "candidate_profiles" ("user_id");
  `);

  // 3. candidate_skills table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "candidate_skills" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "skill_name" text NOT NULL,
      "canonical_name" text NOT NULL,
      "category" text DEFAULT 'Technical',
      "source" text NOT NULL DEFAULT 'PARSED',
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "candidate_skills_user_skill_unique" ON "candidate_skills" ("user_id", "canonical_name");
    CREATE INDEX IF NOT EXISTS "candidate_skills_user_id_idx" ON "candidate_skills" ("user_id");
  `);

  // 4. candidate_educations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "candidate_educations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "institution" text NOT NULL,
      "degree" text NOT NULL,
      "field_of_study" text,
      "start_year" integer,
      "end_year" integer,
      "grade" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "candidate_educations_user_id_idx" ON "candidate_educations" ("user_id");
  `);

  // 5. candidate_projects table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "candidate_projects" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "description" text,
      "technologies" jsonb,
      "url" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "candidate_projects_user_id_idx" ON "candidate_projects" ("user_id");
  `);

  // 6. candidate_certifications table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "candidate_certifications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "issuer" text,
      "issue_year" integer,
      "url" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "candidate_certifications_user_id_idx" ON "candidate_certifications" ("user_id");
  `);

  // 7. candidate_experiences table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "candidate_experiences" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "company_name" text NOT NULL,
      "title" text NOT NULL,
      "location" text,
      "is_internship" boolean NOT NULL DEFAULT false,
      "start_date" timestamp with time zone,
      "end_date" timestamp with time zone,
      "is_current" boolean NOT NULL DEFAULT false,
      "description" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "candidate_experiences_user_id_idx" ON "candidate_experiences" ("user_id");
  `);

  log.info('Phase 13 tables successfully initialized in PostgreSQL.');
}

if (process.argv[1]?.includes('init-phase13')) {
  initPhase13Tables()
    .then(async () => {
      console.log('Phase 13 schema initialization complete.');
      await closeConnection();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Phase 13 schema initialization failed:', err);
      await closeConnection();
      process.exit(1);
    });
}
