import 'dotenv/config';
import { getDb } from '../database/index.js';
import { sql } from 'drizzle-orm';
import { performance } from 'perf_hooks';

const db = getDb();

async function measureQuery(name: string, q: string) {
  const start = performance.now();
  const res = await db.execute(sql.raw(`EXPLAIN ANALYZE ${q}`));
  const end = performance.now();
  console.log(`\n=== QUERY: ${name} ===`);
  console.log(`Execution Time: ${(end - start).toFixed(2)}ms`);
  for (const row of res.rows) {
    console.log((row as any)['QUERY PLAN']);
  }
}

async function run() {
  console.log("=== DB COUNTS ===");
  const tables = ['users', 'companies', 'jobs', 'job_verifications', 'notifications', 'user_job_interactions', 'user_preferences', 'admin_audit_logs'];
  for (const table of tables) {
    try {
        const res = await db.execute(sql.raw(`SELECT count(*) FROM ${table}`));
        console.log(`${table}: ${res.rows[0].count}`);
    } catch(e: any) {
        console.log(`${table}: Error or missing - ${e.message}`);
    }
  }

  try {
    const jobsByStatus = await db.execute(sql.raw(`SELECT status, count(*) FROM jobs GROUP BY status`));
    console.log("\nJobs by Status:");
    jobsByStatus.rows.forEach(r => console.log(`${r.status}: ${r.count}`));
  } catch(e) {}

  try {
    const notificationsByState = await db.execute(sql.raw(`SELECT delivery_status as status, count(*) FROM notifications GROUP BY delivery_status`));
    console.log("\nNotifications by State:");
    notificationsByState.rows.forEach(r => console.log(`${r.status}: ${r.count}`));
  } catch(e) {}
  
  console.log("\n=== MEMORY USAGE ===");
  const mem = process.memoryUsage();
  console.log(`RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
  console.log(`Heap Total: ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
  console.log(`Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);

  console.log("\n=== API PERFORMANCE BASELINE ===");
  const endpoints = ['/api/jobs', '/api/sources/health', '/api/jobs/recent', '/api/users/me'];
  for (const ep of endpoints) {
    const start = performance.now();
    try {
      const res = await fetch(`http://localhost:4000${ep}`);
      const text = await res.text();
      const end = performance.now();
      console.log(`GET ${ep}: ${res.status} - ${(end - start).toFixed(2)}ms - Size: ${text.length} bytes`);
    } catch(e: any) {
      console.log(`GET ${ep}: FAILED - ${e.message}`);
    }
  }

  // EXPLAIN important queries
  try {
      await measureQuery("Job Feed", `SELECT * FROM jobs WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 20`);
      await measureQuery("Notification Acquisition", `SELECT * FROM notifications WHERE delivery_status = 'PENDING' LIMIT 50 FOR UPDATE SKIP LOCKED`);
      await measureQuery("Admin Jobs Pagination", `SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50 OFFSET 100`);
  } catch(e: any) {
      console.log("Error running EXPLAIN: ", e.message);
  }
  
  process.exit(0);
}

run().catch(console.error);
