import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { sql, and, eq, ilike, ne } from 'drizzle-orm';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

async function runAudit() {
  const db = getDb();
  
  // 1. Current Source Inventory
  const activeCompaniesCount = await db.select({ count: sql<number>`count(*)` }).from(schema.companies).where(sql`${schema.companies.is_active} = true`);
  const atsGroup = await db.select({ ats_type: schema.companies.ats_type, count: sql<number>`count(*)` }).from(schema.companies).where(sql`${schema.companies.is_active} = true`).groupBy(schema.companies.ats_type);
  
  // 2. Job counts
  const totalJobs = await db.select({ count: sql<number>`count(*)` }).from(schema.jobs);
  const activeJobs = await db.select({ count: sql<number>`count(*)` }).from(schema.jobs).where(sql`${schema.jobs.status} = 'ACTIVE'`);
  const activeVerifiedJobs = await db.select({ count: sql<number>`count(*)` }).from(schema.jobs).where(sql`${schema.jobs.status} = 'ACTIVE' AND ${schema.jobs.verification_status} = 'VERIFIED'`);
  
  // India jobs: assume location contains India, Bengaluru, Bangalore, Hyderabad, Pune, Chennai, Mumbai, Delhi, NCR, Noida, Gurgaon
  const indiaRegex = /India|Bengaluru|Bangalore|Hyderabad|Pune|Chennai|Mumbai|Delhi|NCR|Noida|Gurgaon|Gurugram/i;
  
  const allActiveVerified = await db.select({ 
    title: schema.jobs.title, 
    location: schema.jobs.location, 
    description: schema.jobs.description, 
    requirements: schema.jobs.requirements,
    company_id: schema.jobs.company_id,
    source_system: schema.jobs.source_system
  }).from(schema.jobs).where(sql`${schema.jobs.status} = 'ACTIVE' AND ${schema.jobs.verification_status} = 'VERIFIED'`);

  let indianActiveVerified = 0;
  let indianFresherCompatible = 0;
  let indianFresherIT = 0;
  let indianFresherNonIT = 0;
  
  const companyMap = new Map<string, any>();
  const companies = await db.select().from(schema.companies);
  companies.forEach(c => companyMap.set(c.id, { name: c.name, ats_type: c.ats_type, country: 'India', jobs: 0, activeJobs: 0, activeVerifiedJobs: 0, fresherJobs: 0 }));

  const allJobs = await db.select({
    company_id: schema.jobs.company_id,
    status: schema.jobs.status,
    verification_status: schema.jobs.verification_status,
    title: schema.jobs.title,
    description: schema.jobs.description,
    requirements: schema.jobs.requirements
  }).from(schema.jobs);

  allJobs.forEach(job => {
    const comp = companyMap.get(job.company_id);
    if (!comp) return;
    comp.jobs++;
    if (job.status === 'ACTIVE') {
      comp.activeJobs++;
      if (job.verification_status === 'VERIFIED') {
        comp.activeVerifiedJobs++;
        const exp = parseExperienceRequirements(job.title, job.description, job.requirements);
        if (exp.classification === 'FRESHER_COMPATIBLE' || exp.classification === 'BOTH') {
          comp.fresherJobs++;
        }
      }
    }
  });

  allActiveVerified.forEach(job => {
    if (job.location && indiaRegex.test(job.location)) {
      indianActiveVerified++;
      const exp = parseExperienceRequirements(job.title, job.description, job.requirements);
      if (exp.classification === 'FRESHER_COMPATIBLE' || exp.classification === 'BOTH') {
        indianFresherCompatible++;
        // Very basic IT check
        if (/(engineer|developer|data|qa|test|software|mts)/i.test(job.title)) {
          indianFresherIT++;
        } else {
          indianFresherNonIT++;
        }
      }
    }
  });

  let blr = 0, hyd = 0, pune = 0, chennai = 0, mum = 0, indRemote = 0;

  allActiveVerified.forEach(job => {
    if (job.location && indiaRegex.test(job.location)) {
      indianActiveVerified++;
      
      if (/Bengaluru|Bangalore/i.test(job.location)) blr++;
      if (/Hyderabad/i.test(job.location)) hyd++;
      if (/Pune/i.test(job.location)) pune++;
      if (/Chennai/i.test(job.location)) chennai++;
      if (/Mumbai/i.test(job.location)) mum++;
      if (job.workplace_type === 'REMOTE') indRemote++;

      const exp = parseExperienceRequirements(job.title, job.description, job.requirements);
      if (exp.classification === 'FRESHER_COMPATIBLE' || exp.classification === 'BOTH') {
        indianFresherCompatible++;
        // Very basic IT check
        if (/(engineer|developer|data|qa|test|software|mts)/i.test(job.title)) {
          indianFresherIT++;
        } else {
          indianFresherNonIT++;
        }
      }
    }
  });

  console.log("=== PHASE 20 AUDIT RESULTS ===");
  console.log(`Active Companies: ${activeCompaniesCount[0]?.count || 0}`);
  console.log("Companies by ATS:");
  console.table(atsGroup);
  
  console.log(`Total Jobs: ${totalJobs[0]?.count || 0}`);
  console.log(`ACTIVE Jobs: ${activeJobs[0]?.count || 0}`);
  console.log(`\n=== COVERAGE METRICS ===`);
  console.log(`ACTIVE + VERIFIED Jobs: ${activeVerifiedJobs[0]?.count || 0}`);
  console.log(`Indian ACTIVE + VERIFIED: ${indianActiveVerified}`);
  console.log(`Indian Fresher-Compatible: ${indianFresherCompatible} (IT: ${indianFresherIT}, Non-IT: ${indianFresherNonIT})`);
  console.log(`Bengaluru: ${blr}`);
  console.log(`Hyderabad: ${hyd}`);
  console.log(`Pune: ${pune}`);
  console.log(`Chennai: ${chennai}`);
  console.log(`Mumbai: ${mum}`);
  console.log(`India Remote: ${indRemote}`);

  console.log("\n=== COMPANY x SOURCE INVENTORY ===");
  const companyArray = Array.from(companyMap.values()).map(c => ({
    name: c.name,
    source: c.ats_type,
    totalJobs: c.jobs,
    activeJobs: c.activeJobs,
    activeVerifiedJobs: c.activeVerifiedJobs,
    fresherJobs: c.fresherJobs
  }));
  console.table(companyArray);
  
  // Scan Runs (Health)
  const healthInfo = await db.select({
    source_type: schema.scanRuns.source_type,
    status: schema.scanRuns.status,
    count: sql<number>`count(*)`,
    avgDiscovered: sql<number>`avg(jobs_discovered)`,
    lastRun: sql<string>`max(started_at)`
  }).from(schema.scanRuns).groupBy(schema.scanRuns.source_type, schema.scanRuns.status);
  
  console.log("\n=== SOURCE HEALTH ===");
  console.table(healthInfo);

  process.exit(0);
}

runAudit().catch(console.error);
