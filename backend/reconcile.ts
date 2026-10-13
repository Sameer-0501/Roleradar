import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';
import { sql } from 'drizzle-orm';
import { parseExperienceRequirements } from './src/matching/experience-parser.js';

async function runAudit() {
  const db = getDb();
  
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

  const metrics = {
    before: { total: 0, indiaTotal: 0, indiaFresher: 0, indiaIT: 0, indiaNonIT: 0, blr: 0, hyd: 0, pune: 0, chennai: 0, mum: 0, remote: 0 },
    sr: { total: 0, indiaTotal: 0, indiaFresher: 0, indiaIT: 0, indiaNonIT: 0, blr: 0, hyd: 0, pune: 0, chennai: 0, mum: 0, remote: 0 },
    after: { total: 0, indiaTotal: 0, indiaFresher: 0, indiaIT: 0, indiaNonIT: 0, blr: 0, hyd: 0, pune: 0, chennai: 0, mum: 0, remote: 0 },
  };

  allActiveVerified.forEach(job => {
    const isSR = job.source_system === 'SMARTRECRUITERS';
    
    // Add to AFTER
    metrics.after.total++;
    if (isSR) metrics.sr.total++;
    else metrics.before.total++;

    if (job.location && indiaRegex.test(job.location)) {
      metrics.after.indiaTotal++;
      if (isSR) metrics.sr.indiaTotal++;
      else metrics.before.indiaTotal++;

      // City checks
      if (/Bengaluru|Bangalore/i.test(job.location)) { metrics.after.blr++; if (isSR) metrics.sr.blr++; else metrics.before.blr++; }
      if (/Hyderabad/i.test(job.location)) { metrics.after.hyd++; if (isSR) metrics.sr.hyd++; else metrics.before.hyd++; }
      if (/Pune/i.test(job.location)) { metrics.after.pune++; if (isSR) metrics.sr.pune++; else metrics.before.pune++; }
      if (/Chennai/i.test(job.location)) { metrics.after.chennai++; if (isSR) metrics.sr.chennai++; else metrics.before.chennai++; }
      if (/Mumbai/i.test(job.location)) { metrics.after.mum++; if (isSR) metrics.sr.mum++; else metrics.before.mum++; }
      if (/Remote/i.test(job.location)) { metrics.after.remote++; if (isSR) metrics.sr.remote++; else metrics.before.remote++; }

      const exp = parseExperienceRequirements(job.title, job.description, job.requirements);
      if (exp.classification === 'FRESHER_COMPATIBLE' || exp.classification === 'BOTH') {
        metrics.after.indiaFresher++;
        if (isSR) metrics.sr.indiaFresher++;
        else metrics.before.indiaFresher++;

        if (/(engineer|developer|data|qa|test|software|mts)/i.test(job.title)) {
          metrics.after.indiaIT++;
          if (isSR) metrics.sr.indiaIT++;
          else metrics.before.indiaIT++;
        } else {
          metrics.after.indiaNonIT++;
          if (isSR) metrics.sr.indiaNonIT++;
          else metrics.before.indiaNonIT++;
        }
      }
    } else if (job.location && /Remote/i.test(job.location)) {
      // Remote but not explicitly matched as India? Some remote jobs are global.
    }
  });

  console.log("=== COMPARABLE METRICS ===");
  console.table([
    { Metric: "Total ACTIVE + VERIFIED", Before: metrics.before.total, SR: metrics.sr.total, After: metrics.after.total },
    { Metric: "Indian ACTIVE + VERIFIED", Before: metrics.before.indiaTotal, SR: metrics.sr.indiaTotal, After: metrics.after.indiaTotal },
    { Metric: "Indian Fresher-Compatible", Before: metrics.before.indiaFresher, SR: metrics.sr.indiaFresher, After: metrics.after.indiaFresher },
    { Metric: "Indian Fresher IT", Before: metrics.before.indiaIT, SR: metrics.sr.indiaIT, After: metrics.after.indiaIT },
    { Metric: "Indian Fresher Non-IT", Before: metrics.before.indiaNonIT, SR: metrics.sr.indiaNonIT, After: metrics.after.indiaNonIT },
    { Metric: "Bengaluru", Before: metrics.before.blr, SR: metrics.sr.blr, After: metrics.after.blr },
    { Metric: "Hyderabad", Before: metrics.before.hyd, SR: metrics.sr.hyd, After: metrics.after.hyd },
    { Metric: "Pune", Before: metrics.before.pune, SR: metrics.sr.pune, After: metrics.after.pune },
    { Metric: "Chennai", Before: metrics.before.chennai, SR: metrics.sr.chennai, After: metrics.after.chennai },
    { Metric: "Mumbai", Before: metrics.before.mum, SR: metrics.sr.mum, After: metrics.after.mum },
    { Metric: "India Remote", Before: metrics.before.remote, SR: metrics.sr.remote, After: metrics.after.remote },
  ]);

  process.exit(0);
}

runAudit().catch(console.error);
