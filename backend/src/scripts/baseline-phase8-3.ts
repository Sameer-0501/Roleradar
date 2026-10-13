import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';

const INDIA_CITIES = [
  'bangalore', 'bengaluru', 'blr',
  'hyderabad', 'hyd',
  'pune',
  'chennai', 'madras',
  'mumbai', 'bombay',
  'delhi', 'ncr', 'noida', 'gurgaon', 'gurugram',
  'kolkata', 'calcutta',
  'ahmedabad', 'jaipur', 'kochi', 'cochin', 'trivandrum', 'thiruvananthapuram',
  'indore', 'chandigarh', 'coimbatore',
  'india', 'in'
];

function isIndianLocation(locStr: string | null | undefined): boolean {
  if (!locStr) return false;
  const lower = locStr.toLowerCase();
  if (lower.includes('indiana') || lower.includes('in, us') || lower.includes('in, usa') || lower.includes(', in ')) {
    if (!lower.includes('india') && !INDIA_CITIES.slice(0, -2).some(c => lower.includes(c))) {
      return false;
    }
  }
  return INDIA_CITIES.some((city) => {
    if (city === 'in') {
      return /\b(in|india)\b/i.test(lower);
    }
    return lower.includes(city);
  });
}

async function runBaseline() {
  const db = getDb();
  
  // 1. Catalog stats
  const totalCatalogCompanies = SOURCE_CATALOG.length;
  const activeCatalogCompanies = SOURCE_CATALOG.filter(s => s.isActive).length;
  
  // 2. Database companies
  const dbCompanies = await db.select().from(schema.companies);
  const activeDbCompanies = dbCompanies.filter(c => c.is_active);

  // 3. Database jobs
  const allJobs = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      atsType: schema.companies.ats_type,
      sourceSystem: schema.jobs.source_system,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      firstSeenAt: schema.jobs.first_seen_at,
      lastVerifiedAt: schema.jobs.last_verified_at,
      createdAt: schema.jobs.created_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id));

  const activeVerified = allJobs.filter(
    (j) => j.status === 'ACTIVE' && j.verificationStatus === 'VERIFIED'
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const discoveredLast7Days = activeVerified.filter(
    (j) => j.firstSeenAt && new Date(j.firstSeenAt) >= sevenDaysAgo
  );

  const indianJobs = activeVerified.filter((j) => isIndianLocation(j.location));

  let indianFresherCompatible = 0;
  let indianStrictFresher = 0;
  let indianExperienced = 0;

  const fresherCityCounts: Record<string, number> = {
    'Bangalore / Bengaluru': 0,
    'Hyderabad': 0,
    'Pune': 0,
    'Chennai': 0,
    'Mumbai': 0,
    'Delhi NCR': 0,
    'India Remote': 0,
    'Other India': 0,
  };

  const fresherWorkplaceCounts: Record<string, number> = {
    'ONSITE': 0,
    'HYBRID': 0,
    'REMOTE': 0,
    'UNSPECIFIED': 0,
  };

  const companiesWithFresherJobs = new Map<string, number>();
  const atsWithFresherJobs = new Map<string, number>();

  for (const j of indianJobs) {
    const parsed = parseExperienceRequirements(j.title, j.description, j.requirements);
    const isFresherCompat = parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH';
    const isStrictFresher = parsed.classification === 'FRESHER_COMPATIBLE';
    const isExp = parsed.classification === 'EXPERIENCED' || parsed.classification === 'BOTH';

    if (isFresherCompat) {
      indianFresherCompatible++;
      if (isStrictFresher) indianStrictFresher++;

      // City classification
      const loc = (j.location || '').toLowerCase();
      if (loc.includes('bangalore') || loc.includes('bengaluru') || loc.includes('blr')) {
        fresherCityCounts['Bangalore / Bengaluru']++;
      } else if (loc.includes('hyderabad') || loc.includes('hyd')) {
        fresherCityCounts['Hyderabad']++;
      } else if (loc.includes('pune')) {
        fresherCityCounts['Pune']++;
      } else if (loc.includes('chennai') || loc.includes('madras')) {
        fresherCityCounts['Chennai']++;
      } else if (loc.includes('mumbai') || loc.includes('bombay')) {
        fresherCityCounts['Mumbai']++;
      } else if (loc.includes('delhi') || loc.includes('ncr') || loc.includes('noida') || loc.includes('gurgaon') || loc.includes('gurugram')) {
        fresherCityCounts['Delhi NCR']++;
      } else if (j.workplaceType === 'REMOTE' || loc.includes('remote')) {
        fresherCityCounts['India Remote']++;
      } else {
        fresherCityCounts['Other India']++;
      }

      // Workplace classification
      const wp = j.workplaceType || 'UNSPECIFIED';
      fresherWorkplaceCounts[wp] = (fresherWorkplaceCounts[wp] || 0) + 1;

      // Company count
      companiesWithFresherJobs.set(j.companyName, (companiesWithFresherJobs.get(j.companyName) || 0) + 1);

      // ATS count
      const ats = j.atsType || j.sourceSystem || 'UNKNOWN';
      atsWithFresherJobs.set(ats, (atsWithFresherJobs.get(ats) || 0) + 1);
    }

    if (isExp) {
      indianExperienced++;
    }
  }

  console.log('=== ROLE RADAR BASELINE (PHASE 8.3) ===');
  console.log(`Total Catalog Companies: ${totalCatalogCompanies} (Active: ${activeCatalogCompanies})`);
  console.log(`Total DB Companies: ${dbCompanies.length} (Active: ${activeDbCompanies.length})`);
  console.log(`Total Database Jobs: ${allJobs.length}`);
  console.log(`Active + VERIFIED Total Jobs: ${activeVerified.length}`);
  console.log(`Indian Active + VERIFIED Jobs: ${indianJobs.length}`);
  console.log(`Indian Fresher-Compatible Jobs: ${indianFresherCompatible}`);
  console.log(`Indian Strictly Matched Fresher Jobs: ${indianStrictFresher}`);
  console.log(`Indian Experienced Jobs: ${indianExperienced}`);
  console.log(`Jobs Discovered During Previous 7 Days: ${discoveredLast7Days.length}`);
  
  console.log('\n--- Fresher Jobs by City ---');
  for (const [city, count] of Object.entries(fresherCityCounts)) {
    console.log(`  ${city.padEnd(25)}: ${count}`);
  }

  console.log('\n--- Fresher Jobs by Workplace Type ---');
  for (const [wp, count] of Object.entries(fresherWorkplaceCounts)) {
    console.log(`  ${wp.padEnd(20)}: ${count}`);
  }

  console.log('\n--- Companies Producing Indian Fresher Jobs ---');
  for (const [company, count] of Array.from(companiesWithFresherJobs.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${company.padEnd(30)}: ${count}`);
  }

  console.log('\n--- ATS Distribution of Indian Fresher Jobs ---');
  for (const [ats, count] of Array.from(atsWithFresherJobs.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ats.padEnd(20)}: ${count}`);
  }

  await closeConnection();
}

runBaseline().catch(async (e) => {
  console.error('Error running baseline:', e);
  await closeConnection();
});
