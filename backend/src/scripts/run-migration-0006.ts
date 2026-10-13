import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  console.log('[Migration 0006] Creating user_job_interactions table & indexes...');
  
  await db.execute(sql`
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
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_job_interactions_user_job_unique" ON "user_job_interactions" ("user_id", "job_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_job_interactions_user_id_idx" ON "user_job_interactions" ("user_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_job_interactions_job_id_idx" ON "user_job_interactions" ("job_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_job_interactions_user_saved_idx" ON "user_job_interactions" ("user_id", "is_saved");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_job_interactions_user_applied_idx" ON "user_job_interactions" ("user_id", "is_applied");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_job_interactions_user_dismissed_idx" ON "user_job_interactions" ("user_id", "is_dismissed");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_job_interactions_user_viewed_idx" ON "user_job_interactions" ("user_id", "viewed_at");
  `);

  console.log('[Migration 0006] user_job_interactions table & indexes successfully created / verified.');
  await closeConnection();
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
  process.exit(1);
});
