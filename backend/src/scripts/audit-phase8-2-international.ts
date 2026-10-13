/**
 * RoleRadar Phase 8.2 — International Acceptance Audit Script.
 *
 * Validates international job discovery, country normalization, country-aware
 * remote matching, worldwide remote, international fresher-first classification,
 * Indian regression safety, live ATS verification reachability, and deduplication.
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { ATS_COMPATIBILITY_MATRIX } from '../sources/ats-compatibility-matrix.js';
import { analyzeLocation } from '../matching/country-normalizer.js';

async function verifyHttpUrl(url: string, timeoutMs: number = 7000): Promise<{ status: number; ok: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { status: res.status, ok: res.status >= 200 && res.status < 400 };
  } catch (err: any) {
    return { status: 0, ok: false };
  }
}

async function runAudit() {
  console.log('===================================================================');
  console.log('     ROLE RADAR PHASE 8.2 INTERNATIONAL COVERAGE ACCEPTANCE AUDIT   ');
  console.log('===================================================================\n');

  const db = getDb();
  const rawJobs = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      title: schema.jobs.title,
      location: schema.jobs.location,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      workplaceType: schema.jobs.workplace_type,
      sourceSystem: schema.jobs.source_system,
      officialUrl: schema.jobs.official_url,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      createdAt: schema.jobs.created_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(
      and(
        eq(schema.jobs.status, 'ACTIVE'),
        eq(schema.jobs.verification_status, 'VERIFIED')
      )
    );

  console.log(`Total Active & Verified Jobs in Database: ${rawJobs.length}`);

  // 1. Geography Classification
  const indianJobs = rawJobs.filter((j) => {
    const analysis = analyzeLocation(j.location);
    return analysis.detectedCountries.includes('India');
  });

  const internationalJobs = rawJobs.filter((j) => {
    const analysis = analyzeLocation(j.location);
    return analysis.detectedCountries.some((c) => c !== 'India') || analysis.isWorldwideRemote;
  });

  const countryDistribution: Record<string, { total: number; fresher: number; experienced: number; remote: number; hybrid: number; onsite: number }> = {};

  for (const j of rawJobs) {
    const analysis = analyzeLocation(j.location);
    const expParsed = parseExperienceRequirements(j.title, j.description, j.requirements);
    const countries = analysis.detectedCountries.length > 0 ? analysis.detectedCountries : (analysis.isWorldwideRemote ? ['Worldwide Remote'] : ['Unclassified']);

    for (const c of countries) {
      if (!countryDistribution[c]) {
        countryDistribution[c] = { total: 0, fresher: 0, experienced: 0, remote: 0, hybrid: 0, onsite: 0 };
      }
      countryDistribution[c].total++;
      if (expParsed.classification === 'FRESHER_COMPATIBLE' || expParsed.classification === 'BOTH') countryDistribution[c].fresher++;
      if (expParsed.classification === 'EXPERIENCED') countryDistribution[c].experienced++;
      if (j.workplaceType === 'REMOTE') countryDistribution[c].remote++;
      if (j.workplaceType === 'HYBRID') countryDistribution[c].hybrid++;
      if (j.workplaceType === 'ONSITE') countryDistribution[c].onsite++;
    }
  }

  console.log(`\n--- 1. OVERALL METRICS ---`);
  console.log(`Indian Active Verified Jobs:        ${indianJobs.length}`);
  console.log(`International Active Verified Jobs: ${internationalJobs.length}`);

  console.log(`\n--- 2. COUNTRY COVERAGE DISTRIBUTION ---`);
  console.table(countryDistribution);

  // --- ACCEPTANCE TEST SUITE ---

  console.log(`\n--- 3. ACCEPTANCE TEST A: US + FRESHER + SOFTWARE ENGINEER ---`);
  const testA = rawJobs.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer'],
        locations: ['United States', 'Remote'],
        experienceLevel: 'FRESHER',
        workplaceTypes: ['REMOTE', 'ONSITE', 'HYBRID'],
      }
    );
    return res.matched;
  });
  console.log(`✔ US Fresher Matching Jobs Returned: ${testA.length}`);
  testA.slice(0, 5).forEach((j) => console.log(`  • "${j.title}" at ${j.companyName} (${j.location})`));

  console.log(`\n--- 4. ACCEPTANCE TEST B: CANADA + FRESHER + TECH ROLES ---`);
  const testB = rawJobs.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer', 'Backend Developer', 'Associate', 'Intern', 'Data Analyst'],
        locations: ['Canada', 'Toronto', 'Vancouver', 'Remote'],
        experienceLevel: 'FRESHER',
        workplaceTypes: ['REMOTE', 'ONSITE', 'HYBRID'],
      }
    );
    return res.matched;
  });
  console.log(`✔ Canada Fresher Matching Jobs Returned: ${testB.length}`);
  testB.slice(0, 5).forEach((j) => console.log(`  • "${j.title}" at ${j.companyName} (${j.location})`));

  console.log(`\n--- 5. ACCEPTANCE TEST C: UK + FRESHER + TECH ROLES ---`);
  const testC = rawJobs.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer', 'Associate', 'Graduate Engineer Trainee', 'Intern', 'Technical Support Engineer'],
        locations: ['United Kingdom', 'London', 'Remote'],
        experienceLevel: 'FRESHER',
        workplaceTypes: ['REMOTE', 'ONSITE', 'HYBRID'],
      }
    );
    return res.matched;
  });
  console.log(`✔ UK Fresher Matching Jobs Returned: ${testC.length}`);
  testC.slice(0, 5).forEach((j) => console.log(`  • "${j.title}" at ${j.companyName} (${j.location})`));

  console.log(`\n--- 6. ACCEPTANCE TEST D: GERMANY + FRESHER + TECH ROLES ---`);
  const testD = rawJobs.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer', 'Associate', 'Intern', 'Graduate Engineer Trainee', 'Solutions Engineer'],
        locations: ['Germany', 'Berlin', 'Munich', 'Remote'],
        experienceLevel: 'FRESHER',
        workplaceTypes: ['REMOTE', 'ONSITE', 'HYBRID'],
      }
    );
    return res.matched;
  });
  console.log(`✔ Germany Fresher Matching Jobs Returned: ${testD.length}`);
  testD.slice(0, 5).forEach((j) => console.log(`  • "${j.title}" at ${j.companyName} (${j.location})`));

  console.log(`\n--- 7. ACCEPTANCE TEST E: NETHERLANDS + FRESHER ---`);
  const testE = rawJobs.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer', 'Backend Developer', 'Associate', 'Intern', 'Technical Support Engineer'],
        locations: ['Netherlands', 'Amsterdam', 'Remote'],
        experienceLevel: 'FRESHER',
        workplaceTypes: ['REMOTE', 'ONSITE', 'HYBRID'],
      }
    );
    return res.matched;
  });
  console.log(`✔ Netherlands Fresher Matching Jobs Returned: ${testE.length}`);
  testE.slice(0, 5).forEach((j) => console.log(`  • "${j.title}" at ${j.companyName} (${j.location})`));

  console.log(`\n--- 8. ACCEPTANCE TEST F: AUSTRALIA + FRESHER ---`);
  const testF = rawJobs.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer', 'Associate', 'Intern', 'Technical Support Engineer'],
        locations: ['Australia', 'Sydney', 'Melbourne', 'Remote'],
        experienceLevel: 'FRESHER',
        workplaceTypes: ['REMOTE', 'ONSITE', 'HYBRID'],
      }
    );
    return res.matched;
  });
  console.log(`✔ Australia Fresher Matching Jobs Returned: ${testF.length}`);
  testF.slice(0, 5).forEach((j) => console.log(`  • "${j.title}" at ${j.companyName} (${j.location})`));

  console.log(`\n--- 9. ACCEPTANCE TEST G: INDIAN FRESHER REGRESSION (Zero Degradation) ---`);
  const indianCities = [
    { city: 'Bangalore', expectedMin: 5 },
    { city: 'Hyderabad', expectedMin: 1 },
    { city: 'Pune', expectedMin: 1 },
    { city: 'Mumbai', expectedMin: 1 },
    { city: 'Delhi', expectedMin: 1 },
    { city: 'Chennai', expectedMin: 0 },
  ];

  for (const { city, expectedMin } of indianCities) {
    const cityMatches = rawJobs.filter((j) => {
      const res = evaluateJobMatch(
        {
          id: j.id,
          title: j.title,
          location: j.location,
          description: j.description,
          requirements: j.requirements,
          workplaceType: j.workplaceType as any,
          companyId: j.companyId,
        },
        {
          roles: ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Analyst', 'Security Engineer', 'Technical Support Engineer', 'Associate', 'Intern', 'Graduate Engineer Trainee'],
          locations: [city],
          experienceLevel: 'FRESHER',
          workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
        }
      );
      return res.matched;
    });
    console.log(`✔ India Fresher ${city}: ${cityMatches.length} matched jobs (Expected >= ${expectedMin})`);
  }

  console.log(`\n--- 10. ACCEPTANCE TEST H: US EXPERIENCED JOBS ---`);
  const usExpMatches = rawJobs.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'DevOps Engineer', 'Security Engineer'],
        locations: ['United States'],
        experienceLevel: 'EXPERIENCED',
        workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
      }
    );
    return res.matched;
  });
  console.log(`✔ US Experienced Matching Jobs Returned: ${usExpMatches.length}`);

  console.log(`\n--- 11. ACCEPTANCE TEST I: REMOTE COUNTRY MATCHING ---`);
  const usRemoteOnly = rawJobs.filter((j) => {
    const analysis = analyzeLocation(j.location);
    return analysis.isRemote && analysis.detectedCountries.includes('United States') && !analysis.isWorldwideRemote;
  });

  const ukRemoteOnly = rawJobs.filter((j) => {
    const analysis = analyzeLocation(j.location);
    return analysis.isRemote && analysis.detectedCountries.includes('United Kingdom') && !analysis.isWorldwideRemote;
  });

  console.log(`US-specific Remote Jobs in inventory: ${usRemoteOnly.length}`);
  console.log(`UK-specific Remote Jobs in inventory: ${ukRemoteOnly.length}`);

  // Verify US remote does not match UK candidate
  const ukUserLeakCheck = usRemoteOnly.filter((j) => {
    const res = evaluateJobMatch(
      {
        id: j.id,
        title: j.title,
        location: j.location,
        description: j.description,
        requirements: j.requirements,
        workplaceType: j.workplaceType as any,
        companyId: j.companyId,
      },
      {
        roles: ['Software Engineer'],
        locations: ['United Kingdom', 'Remote'],
        experienceLevel: 'ANY',
      }
    );
    return res.matched;
  });
  console.log(`✔ US Remote Leak into UK Candidate Preferences: ${ukUserLeakCheck.length} (Expected: 0)`);

  console.log(`\n--- 12. ACCEPTANCE TEST J: WORLDWIDE REMOTE MATCHING ---`);
  const worldwideJobs = rawJobs.filter((j) => {
    const analysis = analyzeLocation(j.location);
    return analysis.isWorldwideRemote;
  });
  console.log(`Worldwide Remote Jobs in inventory: ${worldwideJobs.length}`);

  console.log(`\n--- 13. ACCEPTANCE TEST M: FOREIGN REMOTE EXCLUSION FOR INDIA ---`);
  const foreignRemoteLeak = internationalJobs
    .filter((j) => {
      const analysis = analyzeLocation(j.location);
      return analysis.isRemote && !analysis.detectedCountries.includes('India') && !analysis.isWorldwideRemote;
    })
    .filter((j) => {
      const res = evaluateJobMatch(
        {
          id: j.id,
          title: j.title,
          location: j.location,
          description: j.description,
          requirements: j.requirements,
          workplaceType: j.workplaceType as any,
          companyId: j.companyId,
        },
        {
          roles: ['Software Engineer'],
          locations: ['India', 'Remote'],
          experienceLevel: 'ANY',
        }
      );
      return res.matched;
    });
  console.log(`✔ Foreign Remote Leaks into India Candidate Preferences: ${foreignRemoteLeak.length} (Expected: 0)`);

  console.log(`\n--- 14. ACCEPTANCE TEST O: DEDUPLICATION INVARIANT ---`);
  const dupCheck = await db.execute(sql`
    SELECT external_job_id, company_id, source_system, count(*) 
    FROM jobs 
    GROUP BY external_job_id, company_id, source_system 
    HAVING count(*) > 1
  `);
  console.log(`✔ Database Duplicate Job Records: ${dupCheck.rows.length} (Expected: 0)`);

  console.log(`\n--- 15. ACCEPTANCE TEST Q: TOP 10 OFFICIAL ATS URLS REACHABILITY ---`);
  const sampleJobs = rawJobs.slice(0, 10);
  let passedReachability = 0;
  for (let i = 0; i < sampleJobs.length; i++) {
    const job = sampleJobs[i]!;
    const check = await verifyHttpUrl(job.officialUrl);
    const okSymbol = check.ok ? 'HTTP ' + check.status : 'FAILED ' + check.status;
    console.log(`  [${i + 1}/10] ${okSymbol} | ${job.companyName} | ${job.title} | ${job.officialUrl}`);
    if (check.ok) passedReachability++;
  }
  console.log(`\n✔ Live Official URLs Reachability: ${passedReachability} / 10 PASSED`);

  console.log(`\n--- 16. ATS COMPATIBILITY MATRIX ---`);
  console.table(
    Object.values(ATS_COMPATIBILITY_MATRIX).map((a) => ({
      ATS: a.atsName,
      Status: a.status,
      Discovery: a.publicDiscovery ? 'PASS' : 'FAIL',
      StableID: a.stableJobId ? 'PASS' : 'FAIL',
      OfficialURL: a.officialUrl ? 'PASS' : 'FAIL',
      Verification: a.individualVerification ? 'PASS' : 'FAIL',
      ClosedDetect: a.closedJobDetection ? 'PASS' : 'FAIL',
      StructuredData: a.structuredData ? 'PASS' : 'FAIL',
      Pagination: a.pagination ? 'PASS' : 'FAIL',
    }))
  );

  console.log('-------------------------------------------------------------------');
  console.log('          ROLE RADAR PHASE 8.2 ACCEPTANCE AUDIT COMPLETE          ');
  console.log('-------------------------------------------------------------------\n');

  await closeConnection();
  process.exit(0);
}

runAudit().catch(async (err) => {
  console.error('Audit failed:', err);
  await closeConnection();
  process.exit(1);
});
