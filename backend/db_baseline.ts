import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { eq } from 'drizzle-orm';
import { schema } from './src/database/index.js';
import { analyzeLocation } from './src/matching/country-normalizer.js';
import { parseExperienceRequirements } from './src/matching/experience-parser.js';
import { matchRole } from './src/matching/role-matcher.js';

async function run() {
  const db = getDb();
  
  const companies = await db.select().from(schema.companies).where(eq(schema.companies.is_active, true));
  const jobs = await db.select().from(schema.jobs);
  
  const stats = {
    activeSources: companies.length,
    totalJobs: jobs.length,
    activeVerified: 0,
    indianActiveVerified: 0,
    indianFresher: 0,
    indianNonItFresher: 0,
  };
  
  const companyStats = {};
  
  for (const job of jobs) {
    if (job.status === 'ACTIVE' && job.verification_status === 'VERIFIED') {
      stats.activeVerified++;
      
      const analysis = analyzeLocation(job.location);
      const isIndia = analysis.detectedCountries.includes('India');
      
      if (isIndia) {
        stats.indianActiveVerified++;
        
        // Experience is already stored in job.experience_level usually, but let's check it.
        // Or re-parse if needed
        const exp = parseExperienceRequirements(job.title, job.description || '', job.requirements || '');
        const isFresher = exp.classification === 'FRESHER_COMPATIBLE' || exp.classification === 'BOTH' || job.experience_level === 'FRESHER_COMPATIBLE' || job.experience_level === 'BOTH';
        
        if (isFresher) {
          stats.indianFresher++;
          
          // non-IT?
          const title = job.title.toLowerCase();
          const isIT = title.includes('engineer') || title.includes('developer') || title.includes('software') || title.includes('data') || title.includes('cloud') || title.includes('qa') || title.includes('sdet');
          if (!isIT) {
            stats.indianNonItFresher++;
          }
        }
      }
    }
  }
  
  console.log('BASELINE:', JSON.stringify(stats, null, 2));
  
  console.log('\nCOMPANIES:');
  for (const c of companies) {
    console.log(`${c.name} | ${c.ats_type} | ${c.is_active}`);
  }
  
  process.exit(0);
}

run().catch(console.error);
