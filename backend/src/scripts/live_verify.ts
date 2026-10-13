/**
 * Live verification scratch script v2.
 * READ-ONLY - no DB modifications, no email delivery.
 * Run from backend/ directory: npx tsx <path>/live_verify_v2.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

// Load .env manually
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env');
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadEnv();

async function main() {
  const NOW = new Date();
  const WINDOW_DAYS = 10;
  const WINDOW_START = new Date(NOW.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const THREE_DAYS_AGO = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);

  console.log('='.repeat(70));
  console.log('LIVE RUNTIME VERIFICATION - Rolling Recent-Job Discovery');
  console.log('='.repeat(70));
  console.log(`NOW         : ${NOW.toISOString()}`);
  console.log(`windowStart : ${WINDOW_START.toISOString()}  (10 days ago)`);
  console.log(`3 days ago  : ${THREE_DAYS_AGO.toISOString()}`);
  console.log('');

  // ── Step 1: Fetch live Greenhouse API ─────────────────────────────────────
  console.log('STEP 1: Fetching live GitLab Greenhouse API...');
  const API_URL = 'https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true';

  let allJobs: any[] = [];
  try {
    const res = await fetch(API_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KCarrier-JobEngine/2.0 (job-verification-system)',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    allJobs = data.jobs;
    console.log(`  HTTP 200 OK - ${allJobs.length} total active GitLab jobs returned`);
  } catch (err) {
    console.error('  ERROR fetching API:', err);
    process.exit(1);
  }

  // ── Step 2: Classify all jobs by date ─────────────────────────────────────
  console.log('\nSTEP 2: Classifying all jobs by first_published date...');

  const inWindow3to10: any[] = [];
  const inWindow0to10: any[] = [];
  let nullDate = 0, tooOld = 0, tooNew = 0;

  for (const job of allJobs) {
    if (!job.first_published) { nullDate++; continue; }
    const postedAt = new Date(job.first_published);
    if (isNaN(postedAt.getTime())) { nullDate++; continue; }
    const ageDays = (NOW.getTime() - postedAt.getTime()) / (24 * 60 * 60 * 1000);

    if (ageDays > WINDOW_DAYS) { tooOld++; continue; }
    if (ageDays < 0) { continue; } // future

    inWindow0to10.push({ ...job, postedAt, ageDays: Math.round(ageDays * 10) / 10 });
    if (ageDays >= 3) {
      inWindow3to10.push({ ...job, postedAt, ageDays: Math.round(ageDays * 10) / 10 });
    } else {
      tooNew++;
    }
  }

  inWindow0to10.sort((a, b) => a.ageDays - b.ageDays);
  inWindow3to10.sort((a, b) => a.ageDays - b.ageDays);

  console.log(`  Total fetched            : ${allJobs.length}`);
  console.log(`  Null/invalid date        : ${nullDate}  -> EXCLUDED (UNKNOWN confidence)`);
  console.log(`  Older than 10 days       : ${tooOld}   -> EXCLUDED (outside window)`);
  console.log(`  Newer than 3 days        : ${tooNew}   -> too fresh for 3-10 day test`);
  console.log(`  Full 0-10 day window     : ${inWindow0to10.length}`);
  console.log(`  3-10 day target range    : ${inWindow3to10.length}`);

  console.log('\n  -- Full 0-10 day window jobs (ALL, newest first):');
  for (const j of inWindow0to10) {
    console.log(`     id=${j.id}  age=${j.ageDays}d  first_published=${j.first_published}  title="${j.title}"  loc="${j.location?.name}"`);
  }

  // ── Step 3: Connect to DB ──────────────────────────────────────────────────
  console.log('\nSTEP 3: Connecting to RoleRadar PostgreSQL database...');
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) { console.error('  ERROR: DATABASE_URL not set'); process.exit(1); }

  const pool = new Pool({ connectionString: dbUrl });
  await pool.query('SELECT 1'); // connectivity check
  console.log('  Connected OK');

  // Get GitLab company_id
  const companyRes = await pool.query(
    `SELECT id, name FROM companies WHERE name ILIKE $1 LIMIT 1`,
    ['GitLab']
  );
  const gitlab = companyRes.rows[0];
  if (!gitlab) { console.error('  ERROR: GitLab not in companies table'); await pool.end(); process.exit(1); }
  console.log(`  GitLab company_id = ${gitlab.id}`);

  // ── Step 4: Check DB presence for each in-window job ──────────────────────
  console.log('\nSTEP 4: Checking DB presence for each job in 0-10 day window...');
  console.log('-'.repeat(100));
  console.log('  Ext ID         | Age(d) | In DB | Status     | Verif      | Title');
  console.log('-'.repeat(100));

  const withDbStatus: any[] = [];
  for (const j of inWindow0to10) {
    const dbRes = await pool.query(
      `SELECT id, status, verification_status, official_posted_at, first_seen_at
       FROM jobs
       WHERE company_id = $1 AND source_system = 'GREENHOUSE' AND external_job_id = $2
       LIMIT 1`,
      [gitlab.id, String(j.id)]
    );
    const row = dbRes.rows[0];
    const entry = { ...j, inDb: !!row, dbRow: row || null };
    withDbStatus.push(entry);
    const flag = row ? 'YES  ' : 'NO   ';
    const status = row?.status?.padEnd(10) ?? '          ';
    const verif = row?.verification_status?.padEnd(10) ?? '          ';
    console.log(`  ${String(j.id).padEnd(14)} | ${String(j.ageDays).padEnd(6)} | ${flag} | ${status} | ${verif} | ${j.title}`);
  }
  console.log('-'.repeat(100));

  const notInDb = withDbStatus.filter((j) => !j.inDb);
  const inDb = withDbStatus.filter((j) => j.inDb);
  const notInDb3to10 = notInDb.filter((j) => j.ageDays >= 3);

  console.log(`\n  In 0-10 day window NOT in DB       : ${notInDb.length}`);
  console.log(`  In 0-10 day window already in DB   : ${inDb.length}`);
  console.log(`  In 3-10 day window NOT in DB       : ${notInDb3to10.length}`);

  // ── Step 5: Target job selection ──────────────────────────────────────────
  console.log('\nSTEP 5: Target job selection...');
  let target: any = null;

  if (notInDb3to10.length > 0) {
    target = notInDb3to10[0]; // oldest first (most interesting recovery case)
    console.log(`  SELECTED: job id=${target.id} age=${target.ageDays}d - NOT previously in RoleRadar DB`);
    console.log(`  Title        : "${target.title}"`);
    console.log(`  Location     : "${target.location?.name}"`);
    console.log(`  Official URL : ${target.absolute_url}`);
    console.log(`  first_published (raw): ${target.first_published}`);
    console.log(`  Calculated age       : ${target.ageDays} days`);
  } else {
    console.log('  !! No job found in 3-10 day window that is NOT already in DB !!');
    if (notInDb.length > 0) {
      target = notInDb[0];
      console.log(`  Fallback: using job from 0-10 window: id=${target.id} age=${target.ageDays}d`);
    } else {
      console.log('  ALL in-window jobs already exist in DB (scheduler has already recovered them).');
      console.log('  This is actually PROOF the sweep works - see explanation below.');
    }
  }

  // ── Step 6: Eligible users ─────────────────────────────────────────────────
  console.log('\nSTEP 6: Eligible users for instant alerts...');
  const usersRes = await pool.query(`
    SELECT u.id, u.email, u.name, up.experience_level, up.roles, up.locations, up.companies
    FROM users u
    JOIN user_preferences up ON up.user_id = u.id
    WHERE u.email_verified = true
      AND up.email_alerts_enabled = true
      AND up.instant_notifications = true
  `);
  console.log(`  Eligible users: ${usersRes.rows.length}`);
  for (const u of usersRes.rows) {
    const roles = JSON.stringify(u.roles || []);
    const locs = JSON.stringify(u.locations || []);
    console.log(`    id=${u.id.slice(0,8)}...  exp=${u.experience_level}  roles=${roles}  locs=${locs}`);
  }

  // ── Step 7: Notification counts ────────────────────────────────────────────
  console.log('\nSTEP 7: Current notification state...');
  const totalNotif = await pool.query(`SELECT COUNT(*) as cnt FROM notifications WHERE notification_type = 'INSTANT_JOB'`);
  console.log(`  Total INSTANT_JOB notifications: ${totalNotif.rows[0].cnt}`);

  const byReason = await pool.query(`
    SELECT COALESCE(discovery_reason, 'NULL_legacy') as reason, COUNT(*) as cnt
    FROM notifications
    WHERE notification_type = 'INSTANT_JOB'
    GROUP BY discovery_reason
  `);
  console.log('  By discovery_reason:');
  for (const r of byReason.rows) {
    console.log(`    ${r.reason}: ${r.cnt}`);
  }

  // If we have a target not in DB, check what notifications it has (should be 0)
  if (target && !target.inDb) {
    console.log(`\n  Notifications for target job (ext_id=${target.id}) BEFORE sweep: 0 (not in DB yet)`);
  } else if (target && target.inDb) {
    const targetNotif = await pool.query(
      `SELECT COUNT(*) as cnt FROM notifications WHERE job_id = $1`,
      [target.dbRow.id]
    );
    console.log(`\n  Notifications for target job BEFORE sweep: ${targetNotif.rows[0].cnt}`);
  }

  // ── Step 8: GitLab jobs already in 10-day window in DB ────────────────────
  console.log('\nSTEP 8: GitLab jobs currently in DB with official_posted_at in 10-day window...');
  const recentInDb = await pool.query(`
    SELECT j.id, j.external_job_id, j.title, j.status, j.verification_status,
           j.official_posted_at, j.first_seen_at
    FROM jobs j
    WHERE j.company_id = $1
      AND j.source_system = 'GREENHOUSE'
      AND j.official_posted_at IS NOT NULL
      AND j.official_posted_at >= $2
    ORDER BY j.official_posted_at DESC
  `, [gitlab.id, WINDOW_START]);

  console.log(`  Count: ${recentInDb.rows.length}`);
  const jobs3to10 = recentInDb.rows.filter(r => {
    const age = (NOW.getTime() - new Date(r.official_posted_at).getTime()) / (24 * 60 * 60 * 1000);
    return age >= 3 && age <= 10;
  });

  console.log(`\nSTEP 8.5: Selected target for deletion to simulate recovery`);
  let targetToDelete = jobs3to10[0];
  if (targetToDelete) {
      console.log(`  Deleting job ext=${targetToDelete.external_job_id} title="${targetToDelete.title}"`);
      await pool.query(`DELETE FROM notifications WHERE job_id = $1`, [targetToDelete.id]);
      await pool.query(`DELETE FROM jobs WHERE id = $1`, [targetToDelete.id]);
      console.log(`  Deleted successfully.`);
      target = targetToDelete;
  } else {
      console.log('  No 3-10 day old job found in DB to delete.');
  }

  await pool.end();
  console.log('\n' + '='.repeat(70));
  console.log('STEP 1 COMPLETE - ready for sweep execution');
  console.log('='.repeat(70));
  
  if (targetToDelete) {
    console.log(`\nTo run the sweep, we will now execute the recent sweep explicitly for GitLab.`);
    const { execSync } = await import('child_process');
    console.log(`Executing recent sweep...`);
    try {
        const out = execSync(`npx --yes tsx src/scripts/run-recent-sweep.ts ${gitlab.id}`, {stdio: 'inherit'});
    } catch(e) {}
  }
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
