import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import type { CandidateJobData, UserPreferencesData } from '../matching/matching-types.js';

const isIndiaLocation = (loc: string | null): boolean => {
  if (!loc) return false;
  const l = loc.toLowerCase();
  return (
    l.includes('india') ||
    l.includes('bengaluru') ||
    l.includes('bangalore') ||
    l.includes('hyderabad') ||
    l.includes('pune') ||
    l.includes('chennai') ||
    l.includes('mumbai') ||
    l.includes('gurgaon') ||
    l.includes('gurugram') ||
    l.includes('noida') ||
    l.includes('delhi') ||
    l.includes('remote, in') ||
    l.includes('remote (india') ||
    l.includes('india (remote') ||
    l.includes('remote - india')
  );
};

const getCityCategory = (loc: string | null): string => {
  if (!loc) return 'Unknown';
  const l = loc.toLowerCase();
  if (l.includes('bengaluru') || l.includes('bangalore')) return 'Bangalore';
  if (l.includes('hyderabad')) return 'Hyderabad';
  if (l.includes('pune')) return 'Pune';
  if (l.includes('chennai')) return 'Chennai';
  if (l.includes('mumbai')) return 'Mumbai';
  if (l.includes('gurgaon') || l.includes('gurugram') || l.includes('noida') || l.includes('delhi')) return 'Delhi NCR';
  if (l.includes('remote')) return 'India Remote';
  return 'Other India';
};

const STANDARD_TECH_ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'DevOps Engineer',
  'Cloud Engineer',
  'Data Engineer',
  'Data Scientist',
  'Data Analyst',
  'QA Engineer',
  'Security Engineer',
  'Solutions Engineer',
  'Business Analyst',
  'Product Manager',
  'Mobile Developer',
  'iOS Developer',
  'Android Developer',
  'Machine Learning Engineer',
  'Site Reliability Engineer',
  'IT Support Engineer',
  'Technical Support Engineer',
  'Associate',
  'Graduate Engineer Trainee',
  'Intern',
];

async function runAudit() {
  console.log('-------------------------------------------------------------------');
  console.log('      ROLE RADAR PHASE 8.1A INDIAN FRESHER ACCEPTANCE AUDIT       ');
  console.log('-------------------------------------------------------------------\n');

  const db = getDb();

  // --- 1. GATHER SYSTEM INVENTORY & METRICS ---------------------------------
  const allVerifiedJobs = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      employmentType: schema.jobs.employment_type,
      workplaceType: schema.jobs.workplace_type,
      officialUrl: schema.jobs.official_url,
      applyUrl: schema.jobs.apply_url,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      officialPostedAt: schema.jobs.official_posted_at,
      firstSeenAt: schema.jobs.first_seen_at,
      lastSeenAt: schema.jobs.last_seen_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(
      and(
        eq(schema.jobs.status, 'ACTIVE'),
        eq(schema.jobs.verification_status, 'VERIFIED')
      )
    );

  const dbCompanies = await db.select().from(schema.companies);

  const indianJobs = allVerifiedJobs.filter((j) => isIndiaLocation(j.location));

  // Evaluate Fresher vs Experienced across inventory
  let indianFresherCount = 0;
  let indianExperiencedCount = 0;
  const fresherSamples: Array<{ company: string; title: string; location: string; reason: string }> = [];

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

  for (const job of indianJobs) {
    const parsedExp = parseExperienceRequirements(job.title, job.description, job.requirements);
    const fresherRes = matchExperience(parsedExp, 'FRESHER');
    const expRes = matchExperience(parsedExp, 'EXPERIENCED');

    if (fresherRes.matched) {
      indianFresherCount++;
      if (fresherSamples.length < 10) {
        fresherSamples.push({
          company: job.companyName,
          title: job.title,
          location: job.location || 'India',
          reason: fresherRes.reason,
        });
      }
    }
    if (expRes.matched) {
      indianExperiencedCount++;
    }

    const city = getCityCategory(job.location);
    cityCounts[city] = (cityCounts[city] || 0) + 1;

    const wp = job.workplaceType || 'UNKNOWN';
    workplaceCounts[wp] = (workplaceCounts[wp] || 0) + 1;
  }

  const fresherRatio =
    indianJobs.length > 0
      ? `${((indianFresherCount / indianJobs.length) * 100).toFixed(1)}%`
      : '0.0%';

  console.log('--- 1. INVENTORY & BEFORE/AFTER METRICS ---');
  console.log(`• Catalog Companies Defined: ${SOURCE_CATALOG.length}`);
  console.log(`• Database Companies Seeded: ${dbCompanies.length}`);
  console.log(`• Total Active + Verified Jobs: ${allVerifiedJobs.length}`);
  console.log(`• Indian Verified Jobs: ${indianJobs.length}`);
  console.log(`• Indian Fresher-Compatible Jobs: ${indianFresherCount}`);
  console.log(`• Indian Experienced Jobs: ${indianExperiencedCount}`);
  console.log(`• Indian Fresher-to-Total Ratio: ${fresherRatio}`);
  console.log(`• Indian Geographic Distribution:`, cityCounts);
  console.log(`• Indian Workplace Distribution:`, workplaceCounts);
  console.log('\n  Top Fresher Discoveries:');
  fresherSamples.forEach((s, idx) => {
    console.log(`    [${idx + 1}] ${s.company} | "${s.title}" (${s.location}) -> ${s.reason}`);
  });
  console.log('');

  // --- 2. ACCEPTANCE TEST A: INDIAN FRESHER BANGALORE -----------------------
  console.log('--- 2. ACCEPTANCE TEST A: INDIAN FRESHER BANGALORE ---');
  const blrFresherPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Bangalore', 'Bengaluru'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
  };
  const testAJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, blrFresherPrefs).matched);
  const testASeniorLeaks = testAJobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|manager|vp)\b/i.test(j.title)
  );
  const testAForeignRemoteLeaks = testAJobs.filter(
    (j) =>
      /\b(us|usa|united states|uk|emea|canada|germany|europe|latam)\b/i.test(j.location || '')
  );

  console.log(`• Jobs Returned: ${testAJobs.length}`);
  console.log(`• Senior/Lead/Principal Leaks: ${testASeniorLeaks.length}`);
  console.log(`• Foreign Remote Leaks: ${testAForeignRemoteLeaks.length}`);
  testAJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName} (${j.location})`);
  });
  console.log('');

  // --- 3. ACCEPTANCE TEST B: INDIAN FRESHER HYDERABAD -----------------------
  console.log('--- 3. ACCEPTANCE TEST B: INDIAN FRESHER HYDERABAD ---');
  const hydFresherPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Hyderabad'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
  };
  const testBJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, hydFresherPrefs).matched);
  const testBSeniorLeaks = testBJobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|manager|vp)\b/i.test(j.title)
  );
  console.log(`• Jobs Returned: ${testBJobs.length}`);
  console.log(`• Senior Leaks: ${testBSeniorLeaks.length}`);
  testBJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName} (${j.location})`);
  });
  console.log('');

  // --- 4. ACCEPTANCE TEST C: INDIAN FRESHER PUNE ----------------------------
  console.log('--- 4. ACCEPTANCE TEST C: INDIAN FRESHER PUNE ---');
  const puneFresherPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Pune'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
  };
  const testCJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, puneFresherPrefs).matched);
  const testCSeniorLeaks = testCJobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|manager|vp)\b/i.test(j.title)
  );
  console.log(`• Jobs Returned: ${testCJobs.length}`);
  console.log(`• Senior Leaks: ${testCSeniorLeaks.length}`);
  testCJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName} (${j.location})`);
  });
  console.log('');

  // --- 5. ACCEPTANCE TEST D: INDIAN FRESHER CHENNAI -------------------------
  console.log('--- 5. ACCEPTANCE TEST D: INDIAN FRESHER CHENNAI ---');
  const chennaiFresherPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Chennai'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
  };
  const testDJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, chennaiFresherPrefs).matched);
  const testDSeniorLeaks = testDJobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|manager|vp)\b/i.test(j.title)
  );
  console.log(`• Jobs Returned: ${testDJobs.length}`);
  console.log(`• Senior Leaks: ${testDSeniorLeaks.length}`);
  testDJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName} (${j.location})`);
  });
  console.log('');

  // --- 6. ACCEPTANCE TEST E: INDIAN FRESHER MUMBAI --------------------------
  console.log('--- 6. ACCEPTANCE TEST E: INDIAN FRESHER MUMBAI ---');
  const mumbaiFresherPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Mumbai'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
  };
  const testEJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, mumbaiFresherPrefs).matched);
  const testESeniorLeaks = testEJobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|manager|vp)\b/i.test(j.title)
  );
  console.log(`• Jobs Returned: ${testEJobs.length}`);
  console.log(`• Senior Leaks: ${testESeniorLeaks.length}`);
  testEJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName} (${j.location})`);
  });
  console.log('');

  // --- 7. ACCEPTANCE TEST F: INDIAN FRESHER DELHI NCR -----------------------
  console.log('--- 7. ACCEPTANCE TEST F: INDIAN FRESHER DELHI NCR ---');
  const delhiFresherPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Delhi', 'Noida', 'Gurgaon', 'Gurugram', 'Delhi NCR'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
  };
  const testFJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, delhiFresherPrefs).matched);
  const testFSeniorLeaks = testFJobs.filter((j) =>
    /\b(senior|staff|principal|lead|director|manager|vp)\b/i.test(j.title)
  );
  console.log(`• Jobs Returned: ${testFJobs.length}`);
  console.log(`• Senior Leaks: ${testFSeniorLeaks.length}`);
  testFJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName} (${j.location})`);
  });
  console.log('');

  // --- 8. ACCEPTANCE TEST G: INDIAN EXPERIENCED BANGALORE -------------------
  console.log('--- 8. ACCEPTANCE TEST G: INDIAN EXPERIENCED BANGALORE ---');
  const blrExpPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Bangalore', 'Bengaluru'],
    experienceLevel: 'EXPERIENCED',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
  };
  const testGJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, blrExpPrefs).matched);
  console.log(`• Experienced Jobs Returned: ${testGJobs.length}`);
  testGJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName}`);
  });
  console.log('');

  // --- 9. ACCEPTANCE TEST H: INDIA REMOTE (Strict Foreign Exclusion) --------
  console.log('--- 9. ACCEPTANCE TEST H: INDIA REMOTE (Strict Foreign Exclusion) ---');
  const remoteIndiaPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Remote', 'India'],
    experienceLevel: 'ANY',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['REMOTE'],
  };
  const testHJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, remoteIndiaPrefs).matched);
  const foreignLeaks = testHJobs.filter((j) =>
    /\b(united states|usa|us|united kingdom|uk|london|germany|berlin|canada|toronto|emea|apac only|australia)\b/i.test(
      j.location || ''
    )
  );
  console.log(`• Remote Matching Jobs Returned: ${testHJobs.length}`);
  console.log(`• Foreign Remote Leaks (US/EMEA/UK/Canada): ${foreignLeaks.length}`);
  testHJobs.slice(0, 5).forEach((j) => {
    console.log(`  ? "${j.title}" at ${j.companyName} (${j.location})`);
  });
  console.log('');

  // --- 10. ACCEPTANCE TEST I: ON-SITE / HYBRID INTEGRITY --------------------
  console.log('--- 10. ACCEPTANCE TEST I: ON-SITE / HYBRID INTEGRITY ---');
  const onsiteBangalorePrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Bangalore'],
    experienceLevel: 'ANY',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID'],
  };
  const testIJobs = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, onsiteBangalorePrefs).matched);
  const pureRemoteMisclassified = testIJobs.filter(
    (j) => j.workplaceType === 'REMOTE' && !(j.location || '').toLowerCase().includes('bangalore')
  );
  console.log(`• On-site/Hybrid Bangalore Jobs: ${testIJobs.length}`);
  console.log(`• Misclassified pure remote jobs: ${pureRemoteMisclassified.length}`);
  console.log('');

  // --- 11. ACCEPTANCE TEST J: COMPANY FILTER --------------------------------
  console.log('--- 11. ACCEPTANCE TEST J: COMPANY FILTER ---');
  const allCompanyPrefs: UserPreferencesData = {
    roles: STANDARD_TECH_ROLES,
    locations: ['Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Mumbai', 'Delhi', 'Noida', 'Gurgaon', 'Gurugram'],
    experienceLevel: 'ANY',
    companyIds: [],
    keywords: [],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE', 'UNKNOWN'],
  };
  const allCompanyMatches = indianJobs.filter((j) => evaluateJobMatch(j as CandidateJobData, allCompanyPrefs).matched);
  const distinctCompanies = new Set(allCompanyMatches.map((j) => j.companyName));

  const sampleComp = SOURCE_CATALOG.find((s) => s.companyName === 'MongoDB') || SOURCE_CATALOG[0]!;
  const compRecord = dbCompanies.find((c) => c.name === sampleComp.companyName);

  if (compRecord) {
    const singleCompanyMatches = indianJobs.filter((j) =>
      evaluateJobMatch(j as CandidateJobData, { ...allCompanyPrefs, companyIds: [compRecord.id] }).matched
    );
    const nonTargetLeaks = singleCompanyMatches.filter((j) => j.companyId !== compRecord.id);
    console.log(
      `• All Companies Mode (companyIds = []): ${allCompanyMatches.length} jobs across ${distinctCompanies.size} distinct companies`
    );
    console.log(
      `• Specific Company Mode (${sampleComp.companyName}): ${singleCompanyMatches.length} jobs returned, Non-target leaks: ${nonTargetLeaks.length}`
    );
  }
  console.log('');

  // --- 12. ACCEPTANCE TEST K: FRESHNESS -------------------------------------
  console.log('--- 12. ACCEPTANCE TEST K: FRESHNESS & NOTIFICATIONS ---');
  const recentJobs = indianJobs.filter((j) => {
    const now = Date.now();
    const seen = new Date(j.firstSeenAt).getTime();
    return now - seen < 7 * 24 * 60 * 60 * 1000;
  });
  console.log(`• Recent Active Indian Jobs (last 7d): ${recentJobs.length}`);
  console.log('');

  // --- 13. ACCEPTANCE TEST L: DEDUPLICATION INVARIANT -----------------------
  console.log('--- 13. ACCEPTANCE TEST L: DEDUPLICATION INVARIANT ---');
  const duplicates = await db.execute(sql`
    SELECT external_job_id, company_id, source_system, COUNT(*) as count
    FROM jobs
    GROUP BY external_job_id, company_id, source_system
    HAVING COUNT(*) > 1
  `);
  console.log(`• Database Duplicate Job Records: ${duplicates.rows.length} (Expected: 0)`);
  console.log('');

  // --- 14. ACCEPTANCE TEST M: LIVE REACHABILITY OF OFFICIAL ATS URLS --------
  console.log('--- 14. ACCEPTANCE TEST M: TOP 10 OFFICIAL ATS URLS REACHABILITY ---');
  const sample10 = indianJobs.slice(0, 10);
  let livePassed = 0;

  for (let i = 0; i < sample10.length; i++) {
    const j = sample10[i]!;
    try {
      const res = await fetch(j.officialUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'RoleRadar-Audit/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      const ok = res.status < 400 || res.status === 403;
      if (ok) livePassed++;
      console.log(`  [${i + 1}/10] HTTP ${res.status} | ${j.companyName} | ${j.title} | ${j.officialUrl}`);
    } catch {
      try {
        const res2 = await fetch(j.officialUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(6000),
        });
        if (res2.status < 400) livePassed++;
        console.log(`  [${i + 1}/10] (GET) HTTP ${res2.status} | ${j.companyName} | ${j.title} | ${j.officialUrl}`);
      } catch {
        console.log(`  [${i + 1}/10] ? Unreachable: ${j.companyName} | ${j.officialUrl}`);
      }
    }
  }

  console.log(`\n• Live Official URLs Reachability: ${livePassed} / ${sample10.length} PASSED`);
  console.log('\n-------------------------------------------------------------------');
  console.log('          ROLE RADAR PHASE 8.1A ACCEPTANCE AUDIT COMPLETE          ');
  console.log('-------------------------------------------------------------------\n');

  await closeConnection();
}

runAudit().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
