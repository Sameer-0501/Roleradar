import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function run() {
  const db = getDb();
  
  const query = `
    EXPLAIN ANALYZE
    SELECT "jobs"."id", "jobs"."company_id", "companies"."name", "jobs"."source_system", "jobs"."external_job_id", "jobs"."title", "jobs"."location", "jobs"."workplace_type", "jobs"."employment_type", "jobs"."official_url", "jobs"."apply_url", "jobs"."description", "jobs"."requirements", "jobs"."status", "jobs"."verification_status", "jobs"."official_posted_at", "jobs"."first_seen_at", "jobs"."last_seen_at", "jobs"."last_verified_at" 
    FROM "jobs" 
    INNER JOIN "companies" ON "jobs"."company_id" = "companies"."id" 
    WHERE ("jobs"."status" = 'ACTIVE' AND "jobs"."verification_status" = 'VERIFIED' AND "companies"."is_active" = true) 
    ORDER BY "jobs"."first_seen_at" DESC;
  `;

  console.log("Running EXPLAIN ANALYZE before index...");
  const resBefore = await db.execute(sql.raw(query));
  
  console.log("Creating proposed index: (status, verification_status, first_seen_at)");
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "jobs_status_ver_first_seen_idx" ON "jobs" ("status", "verification_status", "first_seen_at" DESC);`);
  
  console.log("Running EXPLAIN ANALYZE after index...");
  const resAfter = await db.execute(sql.raw(query));
  
  // Clean up
  await db.execute(sql`DROP INDEX IF EXISTS "jobs_status_ver_first_seen_idx";`);

  const output = {
    before: resBefore.rows.map((r: any) => r['QUERY PLAN']),
    after: resAfter.rows.map((r: any) => r['QUERY PLAN'])
  };

  fs.writeFileSync('explain-results.json', JSON.stringify(output, null, 2));
  console.log("EXPLAIN ANALYZE complete. Results in explain-results.json");
  process.exit(0);
}

run().catch(console.error);
