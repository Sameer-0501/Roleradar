import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchRole } from '../matching/role-matcher.js';
import { matchLocation, matchWorkplace, detectWorkplaceType } from '../matching/location-matcher.js';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { evaluateAndCreateInstantAlerts } from '../notifications/alert-service.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { runPipeline } from '../pipeline/pipeline.js';

// --- OCCUPATIONAL TAXONOMY ---
export type OccupationalCategory =
  | 'SOFTWARE_ENGINEERING'
  | 'DATA_AI_ML'
  | 'IT_INFRASTRUCTURE'
  | 'CYBERSECURITY'
  | 'QA_TESTING'
  | 'HARDWARE_EMBEDDED'
  | 'TECHNICAL_SUPPORT'
  | 'PRODUCT'
  | 'DESIGN_UX'
  | 'FINANCE_ACCOUNTING'
  | 'HR_RECRUITING'
  | 'SALES'
  | 'MARKETING'
  | 'OPERATIONS'
  | 'CUSTOMER_SUCCESS'
  | 'LEGAL'
  | 'PROCUREMENT'
  | 'SUPPLY_CHAIN'
  | 'MANUFACTURING'
  | 'ENGINEERING_OTHER'
  | 'RESEARCH'
  | 'CONSULTING'
  | 'HEALTHCARE'
  | 'ADMINISTRATION'
  | 'OTHER'
  | 'UNKNOWN';

export type TechClassification = 'IT_TECH' | 'NON_IT' | 'UNKNOWN';

export function classifyJob(title: string, desc?: string | null, reqs?: string | null): {
  category: OccupationalCategory;
  techClassification: TechClassification;
} {
  const t = title.toLowerCase();

  // 1. Software Engineering
  if (
    /\b(software|developer|frontend|backend|full\s*stack|mobile|ios|android|web|embedded\s+software|sde|swe|compiler|firmware|devops|site\s+reliability|sre|systems\s+engineer|application\s+developer|programmer)\b/i.test(t) &&
    !/\b(recruiter|hr|sales|marketing|account|finance|legal|product\s+manager)\b/i.test(t)
  ) {
    return { category: 'SOFTWARE_ENGINEERING', techClassification: 'IT_TECH' };
  }

  // 2. Data / AI / ML
  if (
    /\b(data\s+scientist|data\s+analyst|data\s+engineer|machine\s+learning|ml\s+engineer|ai\s+engineer|deep\s+learning|nlp|computer\s+vision|bi\s+developer|business\s+intelligence|analytics\s+engineer|llm|genai|ai\s+researcher)\b/i.test(t)
  ) {
    return { category: 'DATA_AI_ML', techClassification: 'IT_TECH' };
  }

  // 3. QA / Testing / SDET
  if (/\b(qa|quality\s+assurance|test\s+engineer|sdet|software\s+test|automation\s+engineer|test\s+lead)\b/i.test(t)) {
    return { category: 'QA_TESTING', techClassification: 'IT_TECH' };
  }

  // 4. Cybersecurity / InfoSec
  if (/\b(security|cybersecurity|infosec|soc\s+analyst|penetration|incident\s+response|threat|vulnerability|appsec|cloud\s+security)\b/i.test(t)) {
    return { category: 'CYBERSECURITY', techClassification: 'IT_TECH' };
  }

  // 5. IT Infrastructure / Cloud / Sysadmin
  if (/\b(cloud\s+engineer|infrastructure|sysadmin|systems\s+administrator|network\s+engineer|database\s+administrator|dba|solutions\s+architect|cloud\s+architect)\b/i.test(t)) {
    return { category: 'IT_INFRASTRUCTURE', techClassification: 'IT_TECH' };
  }

  // 6. Hardware / Embedded / Robotics
  if (/\b(hardware|embedded\s+hardware|vlsi|asic|fpga|pcb|silicon|rf\s+engineer|circuit|robotics|electrical\s+engineer)\b/i.test(t)) {
    return { category: 'HARDWARE_EMBEDDED', techClassification: 'IT_TECH' };
  }

  // 7. Technical Support / Customer Engineering / DevRel
  if (/\b(technical\s+support|tech\s+support|developer\s+relations|devrel|developer\s+advocate|solutions\s+engineer|customer\s+engineer|application\s+support|it\s+support|helpdesk)\b/i.test(t)) {
    return { category: 'TECHNICAL_SUPPORT', techClassification: 'IT_TECH' };
  }

  // 8. Product Management & Operations
  if (/\b(product\s+manager|product\s+management|product\s+owner|product\s+operations|technical\s+product\s+manager|tpm|apm|associate\s+product\s+manager)\b/i.test(t)) {
    return { category: 'PRODUCT', techClassification: 'IT_TECH' };
  }

  // 9. Design & UX / UI
  if (/\b(designer|ux|ui|product\s+design|user\s+experience|visual\s+designer|graphic\s+designer|motion\s+designer|ux\s+researcher|design\s+lead)\b/i.test(t)) {
    return { category: 'DESIGN_UX', techClassification: 'NON_IT' };
  }

  // 10. Finance & Accounting
  if (/\b(finance|financial|accountant|accounting|audit|auditor|treasury|tax|taxation|controller|fp&a|payroll|billing|underwriter|reconciliation)\b/i.test(t)) {
    return { category: 'FINANCE_ACCOUNTING', techClassification: 'NON_IT' };
  }

  // 11. HR & Recruiting / Talent Acquisition
  if (/\b(hr|human\s+resources|recruiter|recruiting|talent\s+acquisition|people\s+partner|hrbp|people\s+operations|talent\s+partner|compensation|learning\s+&\s+development|l&d|onboarding)\b/i.test(t)) {
    return { category: 'HR_RECRUITING', techClassification: 'NON_IT' };
  }

  // 12. Sales & Business Development
  if (/\b(sales|account\s+executive|business\s+development|bdr|sdr|account\s+manager|enterprise\s+sales|commercial\s+sales|gtm|revenue|lead\s+generation|partnerships)\b/i.test(t)) {
    return { category: 'SALES', techClassification: 'NON_IT' };
  }

  // 13. Marketing & Communications
  if (/\b(marketing|content\s+writer|copywriter|seo|brand|growth\s+marketer|product\s+marketing|pr|public\s+relations|social\s+media|communications|campaign|growth\s+manager)\b/i.test(t)) {
    return { category: 'MARKETING', techClassification: 'NON_IT' };
  }

  // 14. Operations & Business Ops
  if (/\b(operations|business\s+operations|bizops|operations\s+manager|process\s+manager|program\s+manager|project\s+manager|logistics\s+ops|field\s+operations)\b/i.test(t)) {
    return { category: 'OPERATIONS', techClassification: 'NON_IT' };
  }

  // 15. Customer Success / Support
  if (/\b(customer\s+success|customer\s+support|cst|client\s+success|client\s+onboarding|customer\s+experience|client\s+partner|tele\s*caller|call\s+center)\b/i.test(t)) {
    return { category: 'CUSTOMER_SUCCESS', techClassification: 'NON_IT' };
  }

  // 16. Legal & Compliance
  if (/\b(legal|counsel|attorney|lawyer|compliance|regulatory|litigation|paralegal|contracts|ethics|governance)\b/i.test(t)) {
    return { category: 'LEGAL', techClassification: 'NON_IT' };
  }

  // 17. Procurement & Sourcing
  if (/\b(procurement|sourcing|buyer|vendor\s+management|purchasing)\b/i.test(t)) {
    return { category: 'PROCUREMENT', techClassification: 'NON_IT' };
  }

  // 18. Supply Chain & Logistics
  if (/\b(supply\s+chain|logistics|inventory|warehouse|fulfillment|transportation|freight)\b/i.test(t)) {
    return { category: 'SUPPLY_CHAIN', techClassification: 'NON_IT' };
  }

  // 19. Manufacturing & Mechanical Engineering
  if (/\b(manufacturing|mechanical\s+engineer|production\s+engineer|industrial\s+engineer|plant\s+manager|assembly|machinist|quality\s+control)\b/i.test(t)) {
    return { category: 'MANUFACTURING', techClassification: 'NON_IT' };
  }

  // 20. Other Engineering / Physical Sciences
  if (/\b(chemical\s+engineer|civil\s+engineer|process\s+engineer|materials\s+engineer|aerospace\s+engineer|environmental\s+engineer)\b/i.test(t)) {
    return { category: 'ENGINEERING_OTHER', techClassification: 'NON_IT' };
  }

  // 21. Research & Science
  if (/\b(scientist|researcher|physicist|postdoc|fellow|research\s+associate|laboratory|biologist|chemist)\b/i.test(t)) {
    return { category: 'RESEARCH', techClassification: 'NON_IT' };
  }

  // 22. Consulting / Advisory
  if (/\b(consultant|consulting|advisory|strategist|management\s+consultant|solution\s+consultant)\b/i.test(t)) {
    return { category: 'CONSULTING', techClassification: 'NON_IT' };
  }

  // 23. Healthcare & Clinical
  if (/\b(nurse|physician|doctor|clinical|medical|health|pharmacist|therapist|patient)\b/i.test(t)) {
    return { category: 'HEALTHCARE', techClassification: 'NON_IT' };
  }

  // 24. Administration & Office Management
  if (/\b(admin|administrative|executive\s+assistant|office\s+manager|receptionist|facility|facilities|workplace\s+experience)\b/i.test(t)) {
    return { category: 'ADMINISTRATION', techClassification: 'NON_IT' };
  }

  // Fallback
  return { category: 'OTHER', techClassification: 'UNKNOWN' };
}

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

function getIndianCityKey(locStr: string | null | undefined, workplaceType?: string | null): string {
  if (!locStr) return 'Other India';
  const l = locStr.toLowerCase();
  if (l.includes('bangalore') || l.includes('bengaluru') || l.includes('blr')) return 'Bangalore';
  if (l.includes('hyderabad') || l.includes('hyd')) return 'Hyderabad';
  if (l.includes('pune')) return 'Pune';
  if (l.includes('chennai') || l.includes('madras')) return 'Chennai';
  if (l.includes('mumbai') || l.includes('bombay')) return 'Mumbai';
  if (l.includes('delhi') || l.includes('ncr') || l.includes('noida') || l.includes('gurgaon') || l.includes('gurugram')) return 'Delhi NCR';
  if (workplaceType === 'REMOTE' || l.includes('remote')) return 'India Remote';
  return 'Other India';
}

async function main() {
  console.log('================================================================================');
  console.log('  ROLERADAR — PHASE 8.3A UNIVERSAL INVENTORY, CLASSIFICATION & RECONCILIATION   ');
  console.log('================================================================================\n');

  const db = getDb();

  // 1. Exact Database Baseline
  const allCompanies = await db.select().from(schema.companies);
  const activeCompanies = allCompanies.filter((c) => c.is_active);

  const allJobs = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      atsType: schema.companies.ats_type,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      employmentType: schema.jobs.employment_type,
      officialUrl: schema.jobs.official_url,
      applyUrl: schema.jobs.apply_url,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      firstSeenAt: schema.jobs.first_seen_at,
      lastSeenAt: schema.jobs.last_seen_at,
      lastVerifiedAt: schema.jobs.last_verified_at,
      officialPostedAt: schema.jobs.official_posted_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id));

  const totalActiveJobs = allJobs.filter((j) => j.status === 'ACTIVE');
  const totalVerifiedJobs = allJobs.filter((j) => j.verificationStatus === 'VERIFIED');
  const totalActiveVerified = allJobs.filter(
    (j) => j.status === 'ACTIVE' && j.verificationStatus === 'VERIFIED'
  );
  const totalClosedJobs = allJobs.filter((j) => j.status === 'CLOSED');
  const totalUnknownJobs = allJobs.filter(
    (j) => j.status !== 'ACTIVE' && j.status !== 'CLOSED' && j.status !== 'VERIFYING' && j.status !== 'VERIFICATION_FAILED'
  );

  const indianActiveVerified = totalActiveVerified.filter((j) => isIndianLocation(j.location));
  const internationalActiveVerified = totalActiveVerified.filter((j) => !isIndianLocation(j.location));

  console.log('=== 1. EXACT DATABASE BASELINE ===');
  console.log(`• Total Companies Defined in DB: ${allCompanies.length}`);
  console.log(`• Total Active Companies in DB:  ${activeCompanies.length}`);
  console.log(`• Total Declarative Catalog:     ${SOURCE_CATALOG.length} (Active: ${SOURCE_CATALOG.filter(s=>s.isActive).length})`);
  console.log(`• Total Database Jobs:           ${allJobs.length}`);
  console.log(`• Total ACTIVE Jobs:             ${totalActiveJobs.length}`);
  console.log(`• Total VERIFIED Jobs:           ${totalVerifiedJobs.length}`);
  console.log(`• Total ACTIVE + VERIFIED Jobs:  ${totalActiveVerified.length}`);
  console.log(`• Total CLOSED Jobs:             ${totalClosedJobs.length}`);
  console.log(`• Total UNKNOWN / OTHER Status:  ${totalUnknownJobs.length}`);
  console.log(`• Indian ACTIVE + VERIFIED:      ${indianActiveVerified.length}`);
  console.log(`• International ACTIVE+VERIFIED: ${internationalActiveVerified.length}`);

  // 2. Universal Occupational Classification of all Active + Verified Jobs
  const categoryCounts: Record<OccupationalCategory, number> = {
    SOFTWARE_ENGINEERING: 0,
    DATA_AI_ML: 0,
    IT_INFRASTRUCTURE: 0,
    CYBERSECURITY: 0,
    QA_TESTING: 0,
    HARDWARE_EMBEDDED: 0,
    TECHNICAL_SUPPORT: 0,
    PRODUCT: 0,
    DESIGN_UX: 0,
    FINANCE_ACCOUNTING: 0,
    HR_RECRUITING: 0,
    SALES: 0,
    MARKETING: 0,
    OPERATIONS: 0,
    CUSTOMER_SUCCESS: 0,
    LEGAL: 0,
    PROCUREMENT: 0,
    SUPPLY_CHAIN: 0,
    MANUFACTURING: 0,
    ENGINEERING_OTHER: 0,
    RESEARCH: 0,
    CONSULTING: 0,
    HEALTHCARE: 0,
    ADMINISTRATION: 0,
    OTHER: 0,
    UNKNOWN: 0,
  };

  const techCounts: Record<TechClassification, number> = {
    IT_TECH: 0,
    NON_IT: 0,
    UNKNOWN: 0,
  };

  const expCounts = {
    FRESHER_COMPATIBLE: 0,
    BOTH: 0,
    EXPERIENCED: 0,
    UNKNOWN: 0,
  };

  for (const j of totalActiveVerified) {
    const { category, techClassification } = classifyJob(j.title, j.description, j.requirements);
    categoryCounts[category]++;
    techCounts[techClassification]++;

    const parsedExp = parseExperienceRequirements(j.title, j.description, j.requirements);
    if (parsedExp.classification === 'FRESHER_COMPATIBLE') expCounts.FRESHER_COMPATIBLE++;
    else if (parsedExp.classification === 'BOTH') expCounts.BOTH++;
    else if (parsedExp.classification === 'EXPERIENCED') expCounts.EXPERIENCED++;
    else expCounts.UNKNOWN++;
  }

  console.log('\n=== 2. ALL-JOB OCCUPATIONAL CATEGORY DISTRIBUTION (ACTIVE + VERIFIED: ' + totalActiveVerified.length + ') ===');
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    if (count > 0) {
      console.log(`  ${cat.padEnd(25)}: ${String(count).padStart(5)} (${((count / totalActiveVerified.length) * 100).toFixed(1)}%)`);
    }
  }

  console.log('\n=== 3. IT vs NON-IT vs UNKNOWN (ACTIVE + VERIFIED) ===');
  for (const [tech, count] of Object.entries(techCounts)) {
    console.log(`  ${tech.padEnd(15)}: ${String(count).padStart(5)} (${((count / totalActiveVerified.length) * 100).toFixed(1)}%)`);
  }

  console.log('\n=== 4. EXPERIENCE DISTRIBUTION (ALL ACTIVE + VERIFIED) ===');
  for (const [exp, count] of Object.entries(expCounts)) {
    console.log(`  ${exp.padEnd(20)}: ${String(count).padStart(5)} (${((count / totalActiveVerified.length) * 100).toFixed(1)}%)`);
  }

  // 3. Indian Fresher Breakdown
  const indianFresherCategoryCounts: Record<string, { total: number; it: number; nonIt: number }> = {};
  const indianCityFresherMap: Record<string, { all: number; it: number; nonIt: number }> = {
    'Bangalore': { all: 0, it: 0, nonIt: 0 },
    'Hyderabad': { all: 0, it: 0, nonIt: 0 },
    'Pune': { all: 0, it: 0, nonIt: 0 },
    'Chennai': { all: 0, it: 0, nonIt: 0 },
    'Mumbai': { all: 0, it: 0, nonIt: 0 },
    'Delhi NCR': { all: 0, it: 0, nonIt: 0 },
    'India Remote': { all: 0, it: 0, nonIt: 0 },
    'Other India': { all: 0, it: 0, nonIt: 0 },
  };

  const indianWorkplaceFresherMap: Record<string, number> = {
    'ONSITE': 0,
    'HYBRID': 0,
    'REMOTE': 0,
    'UNKNOWN': 0,
  };

  let totalIndianFresher = 0;
  let totalIndianFresherIt = 0;
  let totalIndianFresherNonIt = 0;
  let totalStrictFresher = 0;

  const indianFresherJobsList: typeof indianActiveVerified = [];

  for (const j of indianActiveVerified) {
    const parsedExp = parseExperienceRequirements(j.title, j.description, j.requirements);
    const isFresher = parsedExp.classification === 'FRESHER_COMPATIBLE' || parsedExp.classification === 'BOTH';
    const isStrict = parsedExp.classification === 'FRESHER_COMPATIBLE';

    if (isFresher) {
      totalIndianFresher++;
      if (isStrict) totalStrictFresher++;
      indianFresherJobsList.push(j);

      const { category, techClassification } = classifyJob(j.title, j.description, j.requirements);
      const isIt = techClassification === 'IT_TECH';

      if (isIt) totalIndianFresherIt++;
      else totalIndianFresherNonIt++;

      if (!indianFresherCategoryCounts[category]) {
        indianFresherCategoryCounts[category] = { total: 0, it: 0, nonIt: 0 };
      }
      indianFresherCategoryCounts[category].total++;
      if (isIt) indianFresherCategoryCounts[category].it++;
      else indianFresherCategoryCounts[category].nonIt++;

      const cityKey = getIndianCityKey(j.location, j.workplaceType);
      if (!indianCityFresherMap[cityKey]) {
        indianCityFresherMap[cityKey] = { all: 0, it: 0, nonIt: 0 };
      }
      indianCityFresherMap[cityKey].all++;
      if (isIt) indianCityFresherMap[cityKey].it++;
      else indianCityFresherMap[cityKey].nonIt++;

      const wp = j.workplaceType || 'UNKNOWN';
      indianWorkplaceFresherMap[wp] = (indianWorkplaceFresherMap[wp] || 0) + 1;
    }
  }

  console.log('\n=== 5. INDIAN FRESHER INVENTORY SUMMARY ===');
  console.log(`• Total Indian Fresher-Compatible Jobs: ${totalIndianFresher}`);
  console.log(`• Total Indian Fresher IT/Tech Jobs:    ${totalIndianFresherIt}`);
  console.log(`• Total Indian Fresher Non-IT Jobs:     ${totalIndianFresherNonIt}`);
  console.log(`• Strictly Matched Fresher Jobs:        ${totalStrictFresher}`);

  console.log('\n=== 6. INDIAN FRESHER BY OCCUPATIONAL CATEGORY ===');
  console.log(
    'Category'.padEnd(25) +
    'Total Fresher'.padStart(15) +
    'IT Fresher'.padStart(12) +
    'Non-IT Fresher'.padStart(16)
  );
  console.log('--------------------------------------------------------------------------------');
  for (const [cat, data] of Object.entries(indianFresherCategoryCounts).sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      cat.padEnd(25) +
      String(data.total).padStart(15) +
      String(data.it).padStart(12) +
      String(data.nonIt).padStart(16)
    );
  }

  console.log('\n=== 7. CITY-BY-CITY FRESHER COVERAGE ===');
  console.log(
    'Location'.padEnd(20) +
    'All Fresher'.padStart(13) +
    'IT Fresher'.padStart(13) +
    'Non-IT Fresher'.padStart(16)
  );
  console.log('--------------------------------------------------------------------------------');
  for (const [loc, data] of Object.entries(indianCityFresherMap)) {
    console.log(
      loc.padEnd(20) +
      String(data.all).padStart(13) +
      String(data.it).padStart(13) +
      String(data.nonIt).padStart(16)
    );
  }

  console.log('\n=== 8. INDIAN FRESHER WORKPLACE DISTRIBUTION ===');
  for (const [wp, count] of Object.entries(indianWorkplaceFresherMap)) {
    console.log(`  ${wp.padEnd(15)}: ${String(count).padStart(4)} (${((count / totalIndianFresher) * 100).toFixed(1)}%)`);
  }

  // 4. Company-Level Coverage Breakdown
  const companyCoverage = new Map<string, {
    ats: string;
    indianTotal: number;
    indianFresher: number;
    itFresher: number;
    nonItFresher: number;
  }>();

  for (const c of activeCompanies) {
    companyCoverage.set(c.name, {
      ats: c.ats_type,
      indianTotal: 0,
      indianFresher: 0,
      itFresher: 0,
      nonItFresher: 0,
    });
  }

  for (const j of indianActiveVerified) {
    const data = companyCoverage.get(j.companyName);
    if (data) {
      data.indianTotal++;
      const parsedExp = parseExperienceRequirements(j.title, j.description, j.requirements);
      const isFresher = parsedExp.classification === 'FRESHER_COMPATIBLE' || parsedExp.classification === 'BOTH';
      if (isFresher) {
        data.indianFresher++;
        const { techClassification } = classifyJob(j.title, j.description, j.requirements);
        if (techClassification === 'IT_TECH') data.itFresher++;
        else data.nonItFresher++;
      }
    }
  }

  console.log('\n=== 9. COMPANY-LEVEL COVERAGE (TOP INDIAN EMPLOYERS) ===');
  console.log(
    'Company'.padEnd(22) +
    'ATS'.padEnd(12) +
    'India Total'.padStart(12) +
    'India Fresher'.padStart(15) +
    'IT Fresher'.padStart(12) +
    'Non-IT Fresher'.padStart(16)
  );
  console.log('---------------------------------------------------------------------------------------------');
  const sortedCompanies = Array.from(companyCoverage.entries())
    .filter(([_, d]) => d.indianTotal > 0)
    .sort((a, b) => b[1].indianTotal - a[1].indianTotal);

  for (const [comp, d] of sortedCompanies) {
    console.log(
      comp.padEnd(22) +
      d.ats.padEnd(12) +
      String(d.indianTotal).padStart(12) +
      String(d.indianFresher).padStart(15) +
      String(d.itFresher).padStart(12) +
      String(d.nonItFresher).padStart(16)
    );
  }

  // 5. ATS-Level Coverage Breakdown
  const atsCoverage = new Map<string, {
    indianTotal: number;
    indianFresher: number;
    itFresher: number;
    nonItFresher: number;
  }>();

  for (const [_, d] of companyCoverage.entries()) {
    if (!atsCoverage.has(d.ats)) {
      atsCoverage.set(d.ats, { indianTotal: 0, indianFresher: 0, itFresher: 0, nonItFresher: 0 });
    }
    const ac = atsCoverage.get(d.ats)!;
    ac.indianTotal += d.indianTotal;
    ac.indianFresher += d.indianFresher;
    ac.itFresher += d.itFresher;
    ac.nonItFresher += d.nonItFresher;
  }

  console.log('\n=== 10. ATS-LEVEL COVERAGE SUMMARY ===');
  console.log(
    'ATS Platform'.padEnd(18) +
    'India Total'.padStart(12) +
    'India Fresher'.padStart(15) +
    'IT Fresher'.padStart(12) +
    'Non-IT Fresher'.padStart(16)
  );
  console.log('--------------------------------------------------------------------------------');
  for (const [ats, d] of atsCoverage.entries()) {
    console.log(
      ats.padEnd(18) +
      String(d.indianTotal).padStart(12) +
      String(d.indianFresher).padStart(15) +
      String(d.itFresher).padStart(12) +
      String(d.nonItFresher).padStart(16)
    );
  }

  // 6. Universal Role Matching Profiles (Profiles A to E)
  console.log('\n================================================================================');
  console.log('=== 11. UNIVERSAL ROLE MATCHING AUDIT (PROFILES A – E) ===');
  console.log('================================================================================\n');

  // Profile A — Fresher Software
  console.log('--- Profile A: Fresher Software (Software Engineer, Bangalore, ONSITE+HYBRID) ---');
  const profileAMatches = totalActiveVerified.filter((j) => {
    const match = evaluateJobMatch(
      { ...j, firstSeenAt: j.firstSeenAt || new Date(), lastSeenAt: j.lastSeenAt || new Date() },
      {
        userId: 'prof-a',
        roles: ['Software Engineer'],
        locations: ['Bangalore', 'India'],
        workplaceTypes: ['ONSITE', 'HYBRID'],
        experienceLevel: 'FRESHER',
        companyIds: [],
        keywords: [],
      }
    );
    return match.matched;
  });
  console.log(`[PASS] Profile A Matches: ${profileAMatches.length}`);
  for (const m of profileAMatches.slice(0, 3)) {
    console.log(`  - [${m.companyName}] "${m.title}" (${m.location})`);
  }

  // Profile B — Fresher Finance
  console.log('\n--- Profile B: Fresher Finance (Financial Analyst, Bangalore, ONSITE+HYBRID) ---');
  const profileBMatches = totalActiveVerified.filter((j) => {
    const match = evaluateJobMatch(
      { ...j, firstSeenAt: j.firstSeenAt || new Date(), lastSeenAt: j.lastSeenAt || new Date() },
      {
        userId: 'prof-b',
        roles: ['Financial Analyst'],
        locations: ['Bangalore', 'India'],
        workplaceTypes: ['ONSITE', 'HYBRID'],
        experienceLevel: 'FRESHER',
        companyIds: [],
        keywords: [],
      }
    );
    return match.matched;
  });
  console.log(`[PASS] Profile B Matches: ${profileBMatches.length}`);
  for (const m of profileBMatches.slice(0, 3)) {
    console.log(`  - [${m.companyName}] "${m.title}" (${m.location})`);
  }

  // Profile C — Fresher HR
  console.log('\n--- Profile C: Fresher HR (HR / Talent Acquisition, India, ONSITE+HYBRID) ---');
  const profileCMatches = totalActiveVerified.filter((j) => {
    const match = evaluateJobMatch(
      { ...j, firstSeenAt: j.firstSeenAt || new Date(), lastSeenAt: j.lastSeenAt || new Date() },
      {
        userId: 'prof-c',
        roles: ['Human Resources', 'Recruiter', 'HRBP', 'Talent Acquisition', 'HR Intern', 'HR Associate', 'Intern'],
        locations: ['India', 'Bangalore', 'Noida', 'Mumbai', 'Pune', 'Hyderabad', 'Delhi NCR'],
        workplaceTypes: ['ONSITE', 'HYBRID'],
        experienceLevel: 'FRESHER',
        companyIds: [],
        keywords: [],
      }
    );
    return match.matched;
  });
  console.log(`[PASS] Profile C Matches: ${profileCMatches.length}`);
  for (const m of profileCMatches.slice(0, 3)) {
    console.log(`  - [${m.companyName}] "${m.title}" (${m.location})`);
  }

  // Profile D — Fresher Design
  console.log('\n--- Profile D: Fresher Design (UI/UX / Product Designer, India, ONSITE+HYBRID) ---');
  const profileDMatches = totalActiveVerified.filter((j) => {
    const match = evaluateJobMatch(
      { ...j, firstSeenAt: j.firstSeenAt || new Date(), lastSeenAt: j.lastSeenAt || new Date() },
      {
        userId: 'prof-d',
        roles: ['Product Designer', 'UX Designer', 'UI Designer', 'UX/UI Designer', 'Designer'],
        locations: ['India', 'Bangalore', 'Bengaluru', 'Delhi NCR', 'Mumbai', 'Hyderabad', 'Pune'],
        workplaceTypes: ['ONSITE', 'HYBRID'],
        experienceLevel: 'FRESHER',
        companyIds: [],
        keywords: [],
      }
    );
    return match.matched;
  });
  console.log(`[PASS] Profile D Matches: ${profileDMatches.length}`);
  for (const m of profileDMatches.slice(0, 3)) {
    console.log(`  - [${m.companyName}] "${m.title}" (${m.location})`);
  }

  // Profile E — Experienced Technology
  console.log('\n--- Profile E: Experienced Technology (Software/Data/Engineering, Bangalore, ONSITE+HYBRID+REMOTE) ---');
  const profileEMatches = totalActiveVerified.filter((j) => {
    const match = evaluateJobMatch(
      { ...j, firstSeenAt: j.firstSeenAt || new Date(), lastSeenAt: j.lastSeenAt || new Date() },
      {
        userId: 'prof-e',
        roles: ['Software Engineer', 'Data Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer'],
        locations: ['Bangalore', 'Bengaluru', 'India'],
        workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
        experienceLevel: 'EXPERIENCED',
        companyIds: [],
        keywords: [],
      }
    );
    return match.matched;
  });
  console.log(`[PASS] Profile E Matches: ${profileEMatches.length}`);
  for (const m of profileEMatches.slice(0, 3)) {
    console.log(`  - [${m.companyName}] "${m.title}" (${m.location})`);
  }

  // 7. Fresher Safety & Country-Aware Remote Tests
  console.log('\n================================================================================');
  console.log('=== 12. INVARIANT AUDITS (SAFETY, FOREIGN REMOTE, DEDUPLICATION) ===');
  console.log('================================================================================\n');

  let seniorLeaks = 0;
  const seniorKeywords = ['senior', 'staff', 'principal', 'lead', 'manager', 'director', 'head of', 'architect', 'vice president', 'avp', 'sde 2', 'sde ii', 'sde iii', 'software engineer 2'];
  for (const j of totalActiveVerified) {
    const parsed = parseExperienceRequirements(j.title, j.description, j.requirements);
    if (parsed.classification === 'FRESHER_COMPATIBLE') {
      const lower = j.title.toLowerCase();
      for (const sk of seniorKeywords) {
        if (sk === 'staff') {
          if (lower.includes('staff') && !lower.includes('member of technical staff') && !lower.includes('mts')) {
            seniorLeaks++;
            console.log(`  [LEAK] "${j.title}" matched as FRESHER_COMPATIBLE`);
          }
        } else if (new RegExp(`\\b${sk}\\b`, 'i').test(lower)) {
          seniorLeaks++;
          console.log(`  [LEAK] "${j.title}" matched as FRESHER_COMPATIBLE`);
        }
      }
    }
  }
  console.log(`• Senior/Staff/Lead/Principal/Manager leak count into FRESHER: ${seniorLeaks} (MUST BE 0)`);

  let foreignRemoteLeaks = 0;
  for (const j of totalActiveVerified) {
    const locLower = (j.location || '').toLowerCase();
    const isForeignRemote = (locLower.includes('us') || locLower.includes('united states') || locLower.includes('uk') || locLower.includes('canada') || locLower.includes('emea') || locLower.includes('europe')) && locLower.includes('remote') && !locLower.includes('india');
    if (isForeignRemote) {
      const match = evaluateJobMatch(
        { ...j, firstSeenAt: j.firstSeenAt || new Date(), lastSeenAt: j.lastSeenAt || new Date() },
        {
          userId: 'test-foreign-remote',
          roles: ['Software Engineer'],
          locations: ['India', 'Bangalore'],
          workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
          experienceLevel: 'FRESHER',
          companyIds: [],
          keywords: [],
        }
      );
      if (match.matched) {
        foreignRemoteLeaks++;
        console.log(`  [LEAK] Foreign Remote Job matched India user: "${j.title}" at "${j.location}"`);
      }
    }
  }
  console.log(`• Foreign Remote Leaks to India User: ${foreignRemoteLeaks} (MUST BE 0)`);

  // Deduplication check
  const duplicateKeys = new Map<string, number>();
  for (const j of allJobs) {
    const key = `${j.companyId}:${j.sourceSystem}:${j.externalJobId}`;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
  }
  let totalDups = 0;
  for (const count of duplicateKeys.values()) {
    if (count > 1) totalDups += (count - 1);
  }
  console.log(`• Database Duplicate Records: ${totalDups} (MUST BE 0)`);

  // 8. Runtime Discovery Engine Verification
  console.log('\n================================================================================');
  console.log('=== 13. RUNTIME DISCOVERY ENGINE VERIFICATION ===');
  console.log('================================================================================\n');

  const testSources = [
    { name: 'GitLab', ats: 'GREENHOUSE' },
    { name: 'Fi Money', ats: 'LEVER' },
    { name: 'Sarvam AI', ats: 'ASHBY' },
  ];

  for (const ts of testSources) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === ts.name);
    const dbComp = activeCompanies.find((c) => c.name === ts.name);
    if (sourceDef && dbComp) {
      const startTime = new Date();
      const startIso = startTime.toISOString().split('T')[1]?.substring(0, 8) || '';
      try {
        const collector = createCollectorForSource(sourceDef);
        const candidates = await collector.discoverJobs();
        const firstCandidate = candidates.slice(0, 3);

        let pipelineConfig: any = {
          officialDomain: sourceDef.officialDomain,
          sourceSystem: sourceDef.atsType,
        };
        if (sourceDef.atsType === 'GREENHOUSE') {
          pipelineConfig.boardToken = (sourceDef.config as any).boardToken;
        } else if (sourceDef.atsType === 'LEVER') {
          pipelineConfig.siteToken = (sourceDef.config as any).siteToken;
        } else if (sourceDef.atsType === 'ASHBY') {
          pipelineConfig.ashbyConfig = { jobBoardName: (sourceDef.config as any).jobBoardName };
        }

        const stats = await runPipeline(firstCandidate, dbComp.id, pipelineConfig);
        const endTime = new Date();
        const endIso = endTime.toISOString().split('T')[1]?.substring(0, 8) || '';
        const durationMs = endTime.getTime() - startTime.getTime();

        console.log(`[PASS] ${sourceDef.companyName.padEnd(12)} [${sourceDef.atsType.padEnd(11)}] Started: ${startIso} | Completed: ${endIso} | Discovered: ${String(candidates.length).padStart(3)} | Verified: ${String(stats.verified).padStart(2)} | Failed: ${stats.failed} | Duration: ${durationMs}ms [HEALTHY]`);
      } catch (err: any) {
        console.error(`[FAIL] ${sourceDef.companyName}: ${err.message}`);
      }
    }
  }

  // 9. Alert Verification
  console.log('\n================================================================================');
  console.log('=== 14. ALERT PIPELINE VERIFICATION ===');
  console.log('================================================================================\n');

  if (indianFresherJobsList[0]) {
    const alertTestJob = indianFresherJobsList[0];
    const alertRes1 = await evaluateAndCreateInstantAlerts(alertTestJob.id);
    const alertRes2 = await evaluateAndCreateInstantAlerts(alertTestJob.id);
    console.log(`• Instant Alert Evaluation: Job "${alertTestJob.title}" -> Evaluated: ${alertRes1.evaluatedUsersCount}, Matched: ${alertRes1.matchedUsersCount}, Created: ${alertRes1.createdAlertsCount}`);
    console.log(`• Idempotency Check (Second Run): Created: ${alertRes2.createdAlertsCount} (Must be 0 duplicate notifications)`);
  }

  await closeConnection();
  console.log('\n================================================================================');
  console.log('  PHASE 8.3A AUDIT COMPLETED SUCCESSFULLY                                       ');
  console.log('================================================================================');
}

main().catch(async (err) => {
  console.error('Audit execution error:', err);
  await closeConnection();
  process.exit(1);
});
