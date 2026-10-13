import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

const INDIA_LOCATIONS = [
  'bangalore', 'bengaluru', 'blr',
  'hyderabad', 'hyd',
  'pune',
  'chennai', 'madras',
  'mumbai', 'bombay',
  'delhi', 'ncr', 'noida', 'gurgaon', 'gurugram',
  'india', 'in'
];

async function runBaseline() {
  const db = getDb();
  const allJobs = await db.select({
    id: schema.jobs.id,
    title: schema.jobs.title,
    location: schema.jobs.location,
    workplaceType: schema.jobs.workplace_type,
    status: schema.jobs.status,
    verificationStatus: schema.jobs.verification_status,
    description: schema.jobs.description,
    requirements: schema.jobs.requirements,
  }).from(schema.jobs);

  const activeVerified = allJobs.filter(
    (j) => j.status === 'ACTIVE' && j.verificationStatus === 'VERIFIED'
  );

  function isIndianJob(locStr: string | null): boolean {
    if (!locStr) return false;
    const lower = locStr.toLowerCase();
    return INDIA_LOCATIONS.some((loc) => lower.includes(loc));
  }

  const indianJobs = activeVerified.filter((j) => isIndianJob(j.location));

  let indianFresher = 0;
  let indianExperienced = 0;

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

  for (const j of indianJobs) {
    const parsed = parseExperienceRequirements(j.title, j.description, j.requirements);
    if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
      indianFresher++;
    }
    if (parsed.classification === 'EXPERIENCED' || parsed.classification === 'BOTH') {
      indianExperienced++;
    }

    const loc = (j.location || '').toLowerCase();
    if (loc.includes('bangalore') || loc.includes('bengaluru') || loc.includes('blr')) cityCounts['Bangalore']++;
    else if (loc.includes('hyderabad') || loc.includes('hyd')) cityCounts['Hyderabad']++;
    else if (loc.includes('pune')) cityCounts['Pune']++;
    else if (loc.includes('chennai')) cityCounts['Chennai']++;
    else if (loc.includes('mumbai')) cityCounts['Mumbai']++;
    else if (loc.includes('delhi') || loc.includes('ncr') || loc.includes('noida') || loc.includes('gurgaon') || loc.includes('gurugram')) cityCounts['Delhi NCR']++;
    else if (j.workplaceType === 'REMOTE' || loc.includes('remote')) cityCounts['India Remote']++;
    else cityCounts['Other India']++;
  }

  console.log('=== BASELINE METRICS (BEFORE EXPANSION) ===');
  console.log(`Total verified jobs: ${activeVerified.length}`);
  console.log(`Indian verified jobs: ${indianJobs.length}`);
  console.log(`Indian fresher-compatible jobs: ${indianFresher}`);
  console.log(`Indian experienced jobs: ${indianExperienced}`);
  console.log('City breakdown:');
  for (const [city, count] of Object.entries(cityCounts)) {
    console.log(`  - ${city}: ${count}`);
  }

  await closeConnection();
}

runBaseline().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
