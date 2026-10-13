import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { sql } from 'drizzle-orm';
import { jobs, companies, sourceHealth } from '../database/schema.js';

async function main() {
  const db = getDb();
  console.log('--- PHASE 20.2 FINAL EVIDENCE AUDIT ---\n');

  // 2. Runtime lifecycle for SmartRecruiters
  console.log('--- SMARTRECRUITERS RUNTIME LIFECYCLE ---');
  const srJobs = await db.execute(sql`
    SELECT c.name as company, j.status, COUNT(*) as count
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.source_system = 'SMARTRECRUITERS'
    GROUP BY c.name, j.status
    ORDER BY c.name, j.status
  `);
  console.table(srJobs.rows);

  // 3. Coverage
  console.log('\n--- COVERAGE METRICS (ALL SOURCES) ---');
  const coverage = await db.execute(sql`
    SELECT
      COUNT(*) as total_active_verified,
      SUM(CASE WHEN is_fresher_compatible = true THEN 1 ELSE 0 END) as fresher_compatible,
      SUM(CASE WHEN is_fresher_compatible = true AND role_category = 'IT' THEN 1 ELSE 0 END) as fresher_it,
      SUM(CASE WHEN is_fresher_compatible = true AND role_category = 'NON_IT' THEN 1 ELSE 0 END) as fresher_non_it,
      SUM(CASE WHEN location_tags @> '["Bengaluru"]' THEN 1 ELSE 0 END) as blr,
      SUM(CASE WHEN location_tags @> '["Hyderabad"]' THEN 1 ELSE 0 END) as hyd,
      SUM(CASE WHEN location_tags @> '["Pune"]' THEN 1 ELSE 0 END) as pune,
      SUM(CASE WHEN location_tags @> '["Chennai"]' THEN 1 ELSE 0 END) as chennai,
      SUM(CASE WHEN location_tags @> '["Mumbai"]' THEN 1 ELSE 0 END) as mum,
      SUM(CASE WHEN workplace_type = 'Remote' THEN 1 ELSE 0 END) as remote
    FROM jobs
    WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED'
  `);
  console.table(coverage.rows);
  
  console.log('\n--- COVERAGE METRICS (SMARTRECRUITERS ONLY) ---');
  const srCoverage = await db.execute(sql`
    SELECT
      COUNT(*) as total_active_verified,
      SUM(CASE WHEN is_fresher_compatible = true THEN 1 ELSE 0 END) as fresher_compatible,
      SUM(CASE WHEN is_fresher_compatible = true AND role_category = 'IT' THEN 1 ELSE 0 END) as fresher_it,
      SUM(CASE WHEN is_fresher_compatible = true AND role_category = 'NON_IT' THEN 1 ELSE 0 END) as fresher_non_it,
      SUM(CASE WHEN location_tags @> '["Bengaluru"]' THEN 1 ELSE 0 END) as blr,
      SUM(CASE WHEN location_tags @> '["Hyderabad"]' THEN 1 ELSE 0 END) as hyd,
      SUM(CASE WHEN location_tags @> '["Pune"]' THEN 1 ELSE 0 END) as pune,
      SUM(CASE WHEN location_tags @> '["Chennai"]' THEN 1 ELSE 0 END) as chennai,
      SUM(CASE WHEN location_tags @> '["Mumbai"]' THEN 1 ELSE 0 END) as mum,
      SUM(CASE WHEN workplace_type = 'Remote' THEN 1 ELSE 0 END) as remote
    FROM jobs
    WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED' AND source_system = 'SMARTRECRUITERS'
  `);
  console.table(srCoverage.rows);

  // 4. Source Regression & 6. Source Health
  console.log('\n--- SOURCE HEALTH STATUS ---');
  const health = await db.execute(sql`
    SELECT
      source_system,
      is_healthy,
      last_scan_at,
      jobs_discovered,
      error_message
    FROM source_health
    ORDER BY source_system
  `);
  console.table(health.rows);

  process.exit(0);
}

main().catch(console.error);
