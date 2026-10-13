import { getDb } from './src/database/connection.js';
import { sql } from 'drizzle-orm';
import { analyzeLocation } from './src/matching/country-normalizer.js';

async function run() {
  const db = getDb();
  
  const resCompany = await db.execute(sql`SELECT id FROM companies WHERE name ILIKE '%phonepe%'`);
  const companyId = resCompany.rows[0].id;
  
  const resJobs = await db.execute(sql`
    SELECT external_job_id, title, location, official_url 
    FROM jobs 
    WHERE company_id = ${companyId}
  `);
  
  const nonIndiaJobs = resJobs.rows.filter(job => {
    const analysis = analyzeLocation(job.location);
    // If India is not in detectedCountries, it's non-India
    return !analysis.detectedCountries.includes('India');
  });
  
  console.log("Total non-India:", nonIndiaJobs.length);
  console.log(JSON.stringify(nonIndiaJobs, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
