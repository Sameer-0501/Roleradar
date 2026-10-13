import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { sql } from 'drizzle-orm';

async function run() {
  const db = getDb();
  
  console.log("=========================================");
  console.log("TABLE ROW COUNTS");
  console.log("=========================================");
  
  const tables = [
    'users', 'user_preferences', 'companies', 'jobs', 'user_job_interactions', 
    'notifications', 'job_verifications', 'scan_runs', 'admin_audit_logs'
  ];
  
  for (const table of tables) {
    const res = await db.execute(sql.raw(`SELECT count(*) FROM ${table}`));
    console.log(`${table}: ${res.rows[0].count}`);
  }

  console.log("\n=========================================");
  console.log("QUERY EXPLAIN ANALYZE BASELINES");
  console.log("=========================================");

  // Get a user ID to test with
  const users = await db.execute(sql.raw(`SELECT id FROM users LIMIT 1`));
  const testUserId = users.rows.length > 0 ? users.rows[0].id : '00000000-0000-0000-0000-000000000000';

  const queries = [
    {
      name: "1. Workspace Saved Jobs (Pagination with Count)",
      query: `EXPLAIN (ANALYZE, BUFFERS) 
              SELECT count(*)::int 
              FROM user_job_interactions uji
              INNER JOIN jobs j ON uji.job_id = j.id
              INNER JOIN companies c ON j.company_id = c.id
              WHERE uji.user_id = '${testUserId}' AND uji.is_saved = true;`
    },
    {
      name: "2. Workspace Saved Jobs (Data Fetch)",
      query: `EXPLAIN (ANALYZE, BUFFERS) 
              SELECT uji.*, j.*, c.*
              FROM user_job_interactions uji
              INNER JOIN jobs j ON uji.job_id = j.id
              INNER JOIN companies c ON j.company_id = c.id
              WHERE uji.user_id = '${testUserId}' AND uji.is_saved = true
              ORDER BY uji.saved_at DESC LIMIT 15 OFFSET 0;`
    },
    {
      name: "3. Notification Worker Acquisition (FOR UPDATE SKIP LOCKED)",
      query: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id FROM notifications 
              WHERE delivery_status = 'PENDING' 
                 OR (delivery_status = 'FAILED' AND attempt_count < 4)
              ORDER BY created_at ASC
              LIMIT 50
              FOR UPDATE SKIP LOCKED;`
    },
    {
      name: "4. Reverification Worker Acquisition",
      query: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT id FROM jobs 
              WHERE status = 'ACTIVE' 
                AND verification_status = 'VERIFIED'
                AND (last_verified_at IS NULL OR last_verified_at < NOW() - INTERVAL '12 hours')
              ORDER BY last_verified_at ASC NULLS FIRST
              LIMIT 25;`
    },
    {
      name: "5. Daily Digest Eligible Users",
      query: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT u.id, up.roles
              FROM user_preferences up
              INNER JOIN users u ON up.user_id = u.id
              WHERE u.email_verified = true 
                AND up.email_alerts_enabled = true 
                AND up.daily_digest = true;`
    },
    {
      name: "6. User Preferences Fetch",
      query: `EXPLAIN (ANALYZE, BUFFERS)
              SELECT * FROM user_preferences WHERE user_id = '${testUserId}';`
    }
  ];

  for (const q of queries) {
    console.log(`\n--- ${q.name} ---`);
    const res = await db.execute(sql.raw(q.query));
    for (const row of res.rows) {
      console.log(row['QUERY PLAN']);
    }
  }

  process.exit(0);
}

run().catch(console.error);
