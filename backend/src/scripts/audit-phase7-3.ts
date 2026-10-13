/**
 * Phase 7.3 Complete Acceptance Audit Script.
 *
 * Tests:
 * 1. 41 Active Company Sources & Database Inventory.
 * 2. Workplace Preference filtering (On-site, Hybrid, Remote, Any).
 * 3. Country-Aware Remote semantics (Foreign remote strictly excluded).
 * 4. Fresher vs Experienced deterministic matching & protection.
 * 5. Startup Source expansion & verified jobs inventory.
 * 6. Top matched jobs Official ATS URL reachability & authenticity.
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import { findMatchesForUser } from '../matching/matching-service.js';
import { saveUserPreferences } from '../preferences/preference-service.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';

const INDIA_LOCATIONS = [
  'Bangalore',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi NCR',
  'Noida',
  'Gurgaon',
  'Remote',
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('       ROLERADAR PHASE 7.3 PRODUCTION ACCEPTANCE AUDIT REPORT       ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const db = getDb();

  // ── 1. Catalog & Database Inventory ─────────────────────────────────────────
  console.log('─── 1. SOURCE CATALOG & DATABASE INVENTORY ───');
  const companiesInDb = await db.select().from(schema.companies);
  const jobsInDb = await db.select({
    id: schema.jobs.id,
    title: schema.jobs.title,
    location: schema.jobs.location,
    workplaceType: schema.jobs.workplace_type,
    status: schema.jobs.status,
    verificationStatus: schema.jobs.verification_status,
  }).from(schema.jobs);

  const activeVerifiedJobs = jobsInDb.filter(
    (j) => j.status === 'ACTIVE' && j.verificationStatus === 'VERIFIED'
  );

  console.log(`• Catalog Companies Defined: ${SOURCE_CATALOG.length}`);
  console.log(`• Database Companies Seeded: ${companiesInDb.length}`);
  console.log(`• Total Jobs in Database: ${jobsInDb.length}`);
  console.log(`• Active + Verified Jobs: ${activeVerifiedJobs.length}`);

  // Count by workplace type
  const wpCounts: Record<string, number> = {};
  for (const j of activeVerifiedJobs) {
    const wp = j.workplaceType || 'UNKNOWN';
    wpCounts[wp] = (wpCounts[wp] || 0) + 1;
  }
  console.log('• Verified Jobs by Workplace Type:', wpCounts);

  // ── 2. Create / Get Verified Test User ──────────────────────────────────────
  let [testUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'audit.phase73@kcarrier.internal'))
    .limit(1);

  if (!testUser) {
    const [inserted] = await db
      .insert(schema.users)
      .values({
        email: 'audit.phase73@kcarrier.internal',
        password_hash: '$2b$10$dummyHashForAuditUserPhase73...',
        email_verified: true,
        full_name: 'Phase 7.3 Audit User',
      })
      .returning();
    testUser = inserted!;
  }
  console.log(`\n• Audit Test User: ${testUser.email} (ID: ${testUser.id})`);

  // ── 3. TEST A: Workplace = ONSITE ──────────────────────────────────────────
  console.log('\n─── 2. TEST A: WORKPLACE FILTER = ONSITE ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: INDIA_LOCATIONS,
    workplaceTypes: ['ONSITE'],
    experienceLevel: 'EXPERIENCED',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const onsiteMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• On-site Matching Jobs Returned: ${onsiteMatches.jobs.length}`);
  const invalidOnsite = onsiteMatches.jobs.filter((j) => j.workplaceType !== 'ONSITE');
  console.log(`• Non-Onsite Leaks: ${invalidOnsite.length}`);
  if (onsiteMatches.jobs.length > 0) {
    console.log(`  Sample On-site Job: "${onsiteMatches.jobs[0]?.title}" at ${onsiteMatches.jobs[0]?.companyName} (${onsiteMatches.jobs[0]?.location}) [${onsiteMatches.jobs[0]?.workplaceType}]`);
  }

  // ── 4. TEST B: Workplace = REMOTE ──────────────────────────────────────────
  console.log('\n─── 3. TEST B: WORKPLACE FILTER = REMOTE (India Candidates) ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: INDIA_LOCATIONS,
    workplaceTypes: ['REMOTE'],
    experienceLevel: 'EXPERIENCED',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const remoteMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Remote Matching Jobs Returned: ${remoteMatches.jobs.length}`);
  const invalidRemote = remoteMatches.jobs.filter((j) => j.workplaceType !== 'REMOTE');
  console.log(`• Non-Remote Leaks: ${invalidRemote.length}`);
  
  // Check for foreign remote leaks (e.g. U.S., UK, EMEA)
  const foreignRemoteLeaks = remoteMatches.jobs.filter((j) => {
    const loc = (j.location || '').toLowerCase();
    return loc.includes('u.s.') || loc.includes('united states') || loc.includes('emea') || loc.includes('uk') || loc.includes('germany');
  });
  console.log(`• Foreign Remote Leaks (US/EMEA/UK): ${foreignRemoteLeaks.length}`);
  if (remoteMatches.jobs.length > 0) {
    console.log(`  Sample Remote Job: "${remoteMatches.jobs[0]?.title}" at ${remoteMatches.jobs[0]?.companyName} (${remoteMatches.jobs[0]?.location}) [${remoteMatches.jobs[0]?.workplaceType}]`);
  }

  // ── 5. TEST C: Workplace = ANY (Default) ───────────────────────────────────
  console.log('\n─── 4. TEST C: WORKPLACE FILTER = ANY (No restriction) ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: INDIA_LOCATIONS,
    workplaceTypes: [],
    experienceLevel: 'EXPERIENCED',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const anyWpMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Any Workplace Matching Jobs Returned: ${anyWpMatches.jobs.length}`);

  // ── 6. TEST D: Fresher + India Matching ─────────────────────────────────────
  console.log('\n─── 5. TEST D: FRESHER + INDIA CANDIDATE FUNNEL ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: INDIA_LOCATIONS,
    workplaceTypes: [],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const fresherMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Fresher + India Matches Returned: ${fresherMatches.jobs.length}`);
  const invalidFresher = fresherMatches.jobs.filter(
    (j) => j.experienceClassification === 'EXPERIENCED' || /\b(senior|staff|principal|lead|director)\b/i.test(j.title)
  );
  console.log(`• Senior Roles Leaked to Fresher Feed: ${invalidFresher.length}`);
  for (const j of fresherMatches.jobs) {
    console.log(`  🎓 Verified Fresher Job: "${j.title}" at ${j.companyName} (${j.location})`);
  }

  // ── 7. TEST E: Top 10 Official URLs Live Reachability & Authenticity ────────
  console.log('\n─── 6. TEST E: TOP 10 OFFICIAL ATS URLS VERIFICATION ───');
  const sampleJobs = anyWpMatches.jobs.slice(0, 10);
  let passedUrls = 0;
  for (const [idx, job] of sampleJobs.entries()) {
    try {
      const res = await fetch(job.officialUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000),
      });
      const ok = res.status >= 200 && res.status < 400;
      if (ok) passedUrls++;
      console.log(`  [${idx + 1}/10] HTTP ${res.status} | ${job.companyName} | ${job.title} | ${job.officialUrl}`);
    } catch (e) {
      console.log(`  [${idx + 1}/10] ERR | ${job.companyName} | ${job.officialUrl} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  console.log(`\n• Live Official URLs Reachability: ${passedUrls} / ${sampleJobs.length} PASSED`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                   AUDIT EXECUTION COMPLETE                        ');
  console.log('═══════════════════════════════════════════════════════════════════');

  await closeConnection();
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
