/**
 * Phase 8.1 Complete Indian Job Coverage Expansion Acceptance Audit Script.
 *
 * Implements and verifies:
 * 1. Inventory & Before/After comparison.
 * 2. Acceptance Test A: Indian Fresher Bangalore.
 * 3. Acceptance Test B: Indian Fresher Hyderabad.
 * 4. Acceptance Test C: Indian Fresher Pune.
 * 5. Acceptance Test D: Indian Fresher Chennai.
 * 6. Acceptance Test E: Indian Experienced Bangalore.
 * 7. Acceptance Test F: India Remote (Strict foreign remote exclusion).
 * 8. Acceptance Test G: Company Filter (All vs specific).
 * 9. Acceptance Test H: Alert Deduplication & Notification Invariant.
 * 10. Live reachability & authenticity of official ATS URLs.
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import { findMatchesForUser } from '../matching/matching-service.js';
import { saveUserPreferences } from '../preferences/preference-service.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

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

const FOREIGN_TOKENS = ['us', 'u.s.', 'usa', 'united states', 'emea', 'uk', 'canada', 'germany', 'australia', 'london', 'toronto'];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('       ROLERADAR PHASE 8.1 INDIAN JOB COVERAGE ACCEPTANCE AUDIT     ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const db = getDb();

  // ── 1. Catalog & Database Inventory ─────────────────────────────────────────
  console.log('─── 1. INVENTORY & BEFORE/AFTER METRICS ───');
  const companiesInDb = await db.select().from(schema.companies);
  const jobsInDb = await db.select({
    id: schema.jobs.id,
    companyId: schema.jobs.company_id,
    title: schema.jobs.title,
    location: schema.jobs.location,
    workplaceType: schema.jobs.workplace_type,
    status: schema.jobs.status,
    verificationStatus: schema.jobs.verification_status,
    officialUrl: schema.jobs.official_url,
    description: schema.jobs.description,
    requirements: schema.jobs.requirements,
  }).from(schema.jobs);

  const activeVerifiedJobs = jobsInDb.filter(
    (j) => j.status === 'ACTIVE' && j.verificationStatus === 'VERIFIED'
  );

  const indiaKeywordList = [
    'india', 'bangalore', 'bengaluru', 'blr', 'hyderabad', 'hyd',
    'pune', 'chennai', 'madras', 'mumbai', 'bombay', 'delhi', 'ncr', 'noida', 'gurgaon', 'gurugram'
  ];

  function isIndia(loc: string | null): boolean {
    if (!loc) return false;
    const l = loc.toLowerCase();
    return indiaKeywordList.some((k) => l.includes(k));
  }

  const indianVerifiedJobs = activeVerifiedJobs.filter((j) => isIndia(j.location));

  let indianFresherJobs = 0;
  let indianExpJobs = 0;
  const cityCounts: Record<string, number> = {
    Bangalore: 0,
    Hyderabad: 0,
    Pune: 0,
    Chennai: 0,
    Mumbai: 0,
    'Delhi NCR': 0,
    'India Remote': 0,
    'Other India': 0,
  };

  const workplaceCounts: Record<string, number> = {
    ONSITE: 0,
    HYBRID: 0,
    REMOTE: 0,
    UNKNOWN: 0,
  };

  for (const j of indianVerifiedJobs) {
    const parsed = parseExperienceRequirements(j.title, j.description, j.requirements);
    if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
      indianFresherJobs++;
    }
    if (parsed.classification === 'EXPERIENCED' || parsed.classification === 'BOTH') {
      indianExpJobs++;
    }

    const loc = (j.location || '').toLowerCase();
    if (loc.includes('bangalore') || loc.includes('bengaluru') || loc.includes('blr')) cityCounts['Bangalore']++;
    else if (loc.includes('hyderabad') || loc.includes('hyd')) cityCounts['Hyderabad']++;
    else if (loc.includes('pune')) cityCounts['Pune']++;
    else if (loc.includes('chennai') || loc.includes('madras')) cityCounts['Chennai']++;
    else if (loc.includes('mumbai') || loc.includes('bombay')) cityCounts['Mumbai']++;
    else if (loc.includes('delhi') || loc.includes('ncr') || loc.includes('noida') || loc.includes('gurgaon') || loc.includes('gurugram')) cityCounts['Delhi NCR']++;
    else if (j.workplaceType === 'REMOTE' || loc.includes('remote')) cityCounts['India Remote']++;
    else cityCounts['Other India']++;

    const wp = j.workplaceType || 'UNKNOWN';
    workplaceCounts[wp] = (workplaceCounts[wp] || 0) + 1;
  }

  console.log('• Catalog Companies Defined:', SOURCE_CATALOG.length);
  console.log('• Database Companies Seeded:', companiesInDb.length);
  console.log('• Total Active + Verified Jobs:', activeVerifiedJobs.length);
  console.log('• Indian Verified Jobs:', indianVerifiedJobs.length);
  console.log('• Indian Fresher-Compatible Jobs:', indianFresherJobs);
  console.log('• Indian Experienced Jobs:', indianExpJobs);
  console.log('• Indian Geographic Distribution:', cityCounts);
  console.log('• Indian Workplace Distribution:', workplaceCounts);

  // ── 2. Create / Get Verified Test User ──────────────────────────────────────
  let [testUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'audit.phase81@kcarrier.internal'))
    .limit(1);

  if (!testUser) {
    const [inserted] = await db
      .insert(schema.users)
      .values({
        email: 'audit.phase81@kcarrier.internal',
        password_hash: '$2b$10$dummyHashForAuditUserPhase81...',
        email_verified: true,
        full_name: 'Phase 8.1 Audit User',
      })
      .returning();
    testUser = inserted!;
  }
  console.log(`\n• Audit Test User: ${testUser.email} (ID: ${testUser.id})`);

  // ── 3. TEST A: Indian Fresher Bangalore ─────────────────────────────────────
  console.log('\n─── 2. ACCEPTANCE TEST A: INDIAN FRESHER BANGALORE ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: ['Bangalore'],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const testAMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Jobs Returned: ${testAMatches.jobs.length}`);
  const seniorLeaksA = testAMatches.jobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|vp|head of|manager)\b/i.test(j.title)
  );
  const foreignLeaksA = testAMatches.jobs.filter((j) => {
    const loc = (j.location || '').toLowerCase();
    return FOREIGN_TOKENS.some((t) => loc.includes(t)) && !loc.includes('india');
  });
  console.log(`• Senior/Lead/Principal Leaks: ${seniorLeaksA.length}`);
  console.log(`• Foreign Remote Leaks: ${foreignLeaksA.length}`);
  if (testAMatches.jobs.length > 0) {
    console.log(`  Sample Job: "${testAMatches.jobs[0]?.title}" at ${testAMatches.jobs[0]?.companyName} (${testAMatches.jobs[0]?.location}) [${testAMatches.jobs[0]?.workplaceType}]`);
  }

  // ── 4. TEST B: Indian Fresher Hyderabad ─────────────────────────────────────
  console.log('\n─── 3. ACCEPTANCE TEST B: INDIAN FRESHER HYDERABAD ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: ['Hyderabad'],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const testBMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Jobs Returned: ${testBMatches.jobs.length}`);
  const seniorLeaksB = testBMatches.jobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|vp|head of|manager)\b/i.test(j.title)
  );
  console.log(`• Senior Leaks: ${seniorLeaksB.length}`);
  if (testBMatches.jobs.length > 0) {
    console.log(`  Sample Job: "${testBMatches.jobs[0]?.title}" at ${testBMatches.jobs[0]?.companyName} (${testBMatches.jobs[0]?.location})`);
  }

  // ── 5. TEST C: Indian Fresher Pune ──────────────────────────────────────────
  console.log('\n─── 4. ACCEPTANCE TEST C: INDIAN FRESHER PUNE ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: ['Pune'],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const testCMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Jobs Returned: ${testCMatches.jobs.length}`);
  const seniorLeaksC = testCMatches.jobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|vp|head of|manager)\b/i.test(j.title)
  );
  console.log(`• Senior Leaks: ${seniorLeaksC.length}`);
  if (testCMatches.jobs.length > 0) {
    console.log(`  Sample Job: "${testCMatches.jobs[0]?.title}" at ${testCMatches.jobs[0]?.companyName} (${testCMatches.jobs[0]?.location})`);
  }

  // ── 6. TEST D: Indian Fresher Chennai ───────────────────────────────────────
  console.log('\n─── 5. ACCEPTANCE TEST D: INDIAN FRESHER CHENNAI ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: ['Chennai'],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const testDMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Jobs Returned: ${testDMatches.jobs.length}`);
  const seniorLeaksD = testDMatches.jobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|vp|head of|manager)\b/i.test(j.title)
  );
  console.log(`• Senior Leaks: ${seniorLeaksD.length}`);
  if (testDMatches.jobs.length > 0) {
    console.log(`  Sample Job: "${testDMatches.jobs[0]?.title}" at ${testDMatches.jobs[0]?.companyName} (${testDMatches.jobs[0]?.location})`);
  }

  // ── 7. TEST E: Indian Experienced Bangalore ─────────────────────────────────
  console.log('\n─── 6. ACCEPTANCE TEST E: INDIAN EXPERIENCED BANGALORE ───');
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: ['Bangalore'],
    workplaceTypes: [],
    experienceLevel: 'EXPERIENCED',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });

  const testEMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Experienced Jobs Returned: ${testEMatches.jobs.length}`);
  if (testEMatches.jobs.length > 0) {
    console.log(`  Sample Experienced Job: "${testEMatches.jobs[0]?.title}" at ${testEMatches.jobs[0]?.companyName} (${testEMatches.jobs[0]?.location})`);
  }

  // ── 8. TEST F: India Remote (Strict Foreign Exclusion) ──────────────────────
  console.log('\n─── 7. ACCEPTANCE TEST F: INDIA REMOTE (Strict Foreign Exclusion) ───');
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

  const testFMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  console.log(`• Remote Matching Jobs Returned: ${testFMatches.jobs.length}`);
  const foreignRemoteLeaksF = testFMatches.jobs.filter((j) => {
    const loc = (j.location || '').toLowerCase();
    return FOREIGN_TOKENS.some((t) => loc.includes(t)) && !loc.includes('india');
  });
  console.log(`• Foreign Remote Leaks (US/EMEA/UK/Canada): ${foreignRemoteLeaksF.length}`);
  if (testFMatches.jobs.length > 0) {
    console.log(`  Sample India Remote Job: "${testFMatches.jobs[0]?.title}" at ${testFMatches.jobs[0]?.companyName} (${testFMatches.jobs[0]?.location})`);
  }

  // ── 9. TEST G: Company Filter (All vs Specific) ─────────────────────────────
  console.log('\n─── 8. ACCEPTANCE TEST G: COMPANY FILTER ───');
  // Case 1: Empty companyIds = all supported companies
  await saveUserPreferences(testUser.id, {
    roles: ['Software Engineer'],
    locations: INDIA_LOCATIONS,
    workplaceTypes: [],
    experienceLevel: 'ANY',
    companyIds: [],
    keywords: [],
    emailAlertsEnabled: true,
    instantNotifications: true,
    dailyDigest: false,
    timezone: 'Asia/Kolkata',
  });
  const allCoMatches = await findMatchesForUser(testUser.id, { limit: 100 });
  const companiesRepresented = new Set(allCoMatches.jobs.map((j) => j.companyName));
  console.log(`• All Companies Mode (companyIds = []): ${allCoMatches.jobs.length} jobs across ${companiesRepresented.size} distinct companies`);

  // Case 2: Specific company selection
  const targetCompany = companiesInDb.find((c) => c.name === 'Razorpay' || c.name === 'Meesho' || c.name === 'InMobi');
  if (targetCompany) {
    await saveUserPreferences(testUser.id, {
      roles: ['Software Engineer'],
      locations: INDIA_LOCATIONS,
      workplaceTypes: [],
      experienceLevel: 'ANY',
      companyIds: [targetCompany.id],
      keywords: [],
      emailAlertsEnabled: true,
      instantNotifications: true,
      dailyDigest: false,
      timezone: 'Asia/Kolkata',
    });
    const specificMatches = await findMatchesForUser(testUser.id, { limit: 100 });
    const nonTargetJobs = specificMatches.jobs.filter((j) => j.companyId !== targetCompany.id);
    console.log(`• Specific Company Mode (${targetCompany.name}): ${specificMatches.jobs.length} jobs returned, Non-target leaks: ${nonTargetJobs.length}`);
  }

  // ── 10. TEST H: Alerts & Notification Invariant ─────────────────────────────
  console.log('\n─── 9. ACCEPTANCE TEST H: ALERT DEDUPLICATION & INVARIANT ───');
  const userNotifications = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.user_id, testUser.id));

  console.log(`• Total Notifications Created for Audit User: ${userNotifications.length}`);
  // Check for duplicates
  const seenJobTypes = new Set<string>();
  let duplicates = 0;
  for (const n of userNotifications) {
    const key = `${n.user_id}|${n.job_id}|${n.notification_type}`;
    if (seenJobTypes.has(key)) duplicates++;
    seenJobTypes.add(key);
  }
  console.log(`• Duplicate Notification Intents: ${duplicates} (Expected: 0)`);

  // ── 11. TEST I: Top 10 Official ATS URLs Live Reachability ───────────────────
  console.log('\n─── 10. TEST I: TOP 10 OFFICIAL ATS URLS VERIFICATION ───');
  const sampleJobs = indianVerifiedJobs.slice(0, 10);
  let passedUrls = 0;
  for (const [idx, job] of sampleJobs.entries()) {
    try {
      const res = await fetch(job.officialUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000),
      });
      const ok = res.status >= 200 && res.status < 400;
      if (ok) passedUrls++;
      const company = companiesInDb.find((c) => c.id === job.companyId)?.name || 'Unknown';
      console.log(`  [${idx + 1}/10] HTTP ${res.status} | ${company} | ${job.title} | ${job.officialUrl}`);
    } catch (e) {
      console.log(`  [${idx + 1}/10] ERR | ${job.officialUrl} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  console.log(`\n• Live Official URLs Reachability: ${passedUrls} / ${sampleJobs.length} PASSED`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('            PHASE 8.1 ACCEPTANCE AUDIT COMPLETE                   ');
  console.log('═══════════════════════════════════════════════════════════════════');

  await closeConnection();
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
