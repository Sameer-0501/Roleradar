import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, gte, and, sql } from 'drizzle-orm';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import { matchRole } from '../matching/role-matcher.js';
import { matchLocation, matchWorkplace, detectWorkplaceType } from '../matching/location-matcher.js';

async function calculateFunnel() {
  const db = getDb();
  
  const allCompanies = await db.select().from(schema.companies);
  console.log(`Found ${allCompanies.length} companies in DB.\n`);

  let totalDiscovered = 0;
  let totalWithin10Days = 0;
  let totalActive = 0;
  let totalVerified = 0;
  let totalFresherCompatible = 0;
  let totalRoleCompatible = 0;
  let totalLocationCompatible = 0;
  let totalWorkplaceCompatible = 0;

  const now = new Date();

  for (const company of allCompanies) {
    const allJobs = await db.select().from(schema.jobs).where(eq(schema.jobs.company_id, company.id));
    
    let discovered = allJobs.length;
    let within10Days = 0;
    let active = 0;
    let verified = 0;
    let fresherCompatible = 0;
    let roleCompatible = 0;
    let locationCompatible = 0;
    let workplaceCompatible = 0;
    
    for (const job of allJobs) {
      const isWithin10 = job.official_posted_at 
        ? (now.getTime() - new Date(job.official_posted_at).getTime()) <= 10 * 24 * 60 * 60 * 1000
        : false;
        
      if (isWithin10) {
        within10Days++;
        
        if (job.status === 'ACTIVE') active++;
        if (job.verification_status === 'VERIFIED') verified++;
        
        const exp = parseExperienceRequirements(job.title, job.description || '', job.requirements || '');
        const expMatch = matchExperience(exp, 'FRESHER');
        if (expMatch.matched) fresherCompatible++;
        
        const rMatch = matchRole(job.title, ['Software Engineer']);
        if (rMatch.matched) roleCompatible++;
        
        const locMatch = matchLocation(job.location || '', ['Remote']);
        if (locMatch.matched) locationCompatible++;
        
        const wType = detectWorkplaceType(job.location || '', job.workplace_type || '');
        const wMatch = matchWorkplace(wType, ['REMOTE', 'ANY']);
        if (wMatch.matched) workplaceCompatible++;
      }
    }

    console.log(`--- ${company.name} ---`);
    console.log(`Discovered: ${discovered} | Within 10 Days: ${within10Days} | ACTIVE: ${active} | VERIFIED: ${verified}`);
    console.log(`Role Match: ${roleCompatible} | Workplace Match: ${workplaceCompatible} | Fresher Match: ${fresherCompatible}`);
    console.log('');

    totalDiscovered += discovered;
    totalWithin10Days += within10Days;
    totalActive += active;
    totalVerified += verified;
    totalFresherCompatible += fresherCompatible;
    totalRoleCompatible += roleCompatible;
    totalLocationCompatible += locationCompatible;
    totalWorkplaceCompatible += workplaceCompatible;
  }

  console.log('=====================================================');
  console.log('TOTAL FUNNEL AGGREGATES ACROSS ALL COMPANIES');
  console.log('=====================================================');
  console.log(`Total Discovered: ${totalDiscovered}`);
  console.log(`→ within 10 days: ${totalWithin10Days}`);
  console.log(`→ ACTIVE: ${totalActive}`);
  console.log(`→ VERIFIED: ${totalVerified}`);
  console.log(`→ FRESHER-compatible: ${totalFresherCompatible}`);
  console.log(`→ role-compatible: ${totalRoleCompatible}`);
  console.log(`→ location-compatible: ${totalLocationCompatible}`);
  console.log(`→ workplace-compatible: ${totalWorkplaceCompatible}`);
  
  process.exit(0);
}
calculateFunnel().catch(console.error);
