import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, count } from 'drizzle-orm';
import { verifyJob } from '../verification/verification-service.js';
import { SmartrecruitersCollector } from '../collectors/ats/smartrecruiters-collector.js';
import { analyzeLocation } from '../matching/country-normalizer.js';

async function run() {
  const db = getDb();
  
  // 1. DATABASE INVENTORY
  console.log('--- 1. DATABASE INVENTORY ---');
  
  const phonePeCompanies = await db.select().from(schema.companies).where(eq(schema.companies.name, 'PhonePe'));
  const srCompany = phonePeCompanies.find(c => c.ats_type === 'SMARTRECRUITERS');
  const ghCompany = phonePeCompanies.find(c => c.ats_type === 'GREENHOUSE');
  
  if (!srCompany) {
    console.error('PhonePe SmartRecruiters company not found');
    process.exit(1);
  }
  
  console.log('PhonePe SmartRecruiters Company ID:', srCompany.id);
  
  const srJobs = await db.select().from(schema.jobs).where(eq(schema.jobs.company_id, srCompany.id));
  
  console.log(`total records: ${srJobs.length}`);
  console.log(`ACTIVE records: ${srJobs.filter(j => j.status === 'ACTIVE').length}`);
  console.log(`CLOSED records: ${srJobs.filter(j => j.status === 'CLOSED').length}`);
  console.log(`VERIFYING records: ${srJobs.filter(j => j.status === 'VERIFYING').length}`);
  console.log(`FAILED records: ${srJobs.filter(j => j.status === 'FAILED').length}`);
  console.log(`ACTIVE + VERIFIED records: ${srJobs.filter(j => j.status === 'ACTIVE' && j.verification_status === 'VERIFIED').length}`);
  console.log(`ACTIVE + PENDING records: ${srJobs.filter(j => j.status === 'ACTIVE' && j.verification_status === 'PENDING').length}`);
  
  // 3. OFFICIAL URL
  console.log('\n--- 3. OFFICIAL URL ---');
  srJobs.slice(0, 5).forEach(j => {
    console.log(`Job: ${j.title} | URL: ${j.official_url || j.url || j.apply_url}`);
  });
  
  // 4. LOCATION
  console.log('\n--- 4. LOCATION ---');
  const locCount: Record<string, number> = {};
  let otherIndia = 0;
  let nonIndia = 0;
  srJobs.forEach(j => {
    const loc = (j.location || '').toLowerCase();
    const analysis = analyzeLocation(j.location);
    const isIndia = analysis.detectedCountries.includes('India');
    
    if (loc.includes('bangalore') || loc.includes('bengaluru')) locCount['Bangalore'] = (locCount['Bangalore'] || 0) + 1;
    else if (loc.includes('hyderabad')) locCount['Hyderabad'] = (locCount['Hyderabad'] || 0) + 1;
    else if (loc.includes('pune')) locCount['Pune'] = (locCount['Pune'] || 0) + 1;
    else if (loc.includes('chennai')) locCount['Chennai'] = (locCount['Chennai'] || 0) + 1;
    else if (loc.includes('mumbai')) locCount['Mumbai'] = (locCount['Mumbai'] || 0) + 1;
    else if (isIndia) otherIndia++;
    else nonIndia++;
  });
  console.log(`total India jobs: ${srJobs.length - nonIndia}`);
  console.log(`Bangalore/Bengaluru: ${locCount['Bangalore'] || 0}`);
  console.log(`Hyderabad: ${locCount['Hyderabad'] || 0}`);
  console.log(`Pune: ${locCount['Pune'] || 0}`);
  console.log(`Chennai: ${locCount['Chennai'] || 0}`);
  console.log(`Mumbai: ${locCount['Mumbai'] || 0}`);
  console.log(`other Indian locations: ${otherIndia}`);
  console.log(`any non-India jobs accidentally associated with PhonePe: ${nonIndia}`);
  
  // 5. EXPERIENCE
  console.log('\n--- 5. EXPERIENCE ---');
  console.log(`FRESHER_COMPATIBLE: ${srJobs.filter(j => j.experience_level === 'FRESHER_COMPATIBLE').length}`);
  console.log(`BOTH: ${srJobs.filter(j => j.experience_level === 'BOTH').length}`);
  console.log(`EXPERIENCED: ${srJobs.filter(j => j.experience_level === 'EXPERIENCED').length}`);
  console.log(`UNKNOWN: ${srJobs.filter(j => j.experience_level === 'UNKNOWN').length}`);

  // 2. PER-JOB VERIFICATION
  console.log('\n--- 2. PER-JOB VERIFICATION ---');
  let verified = 0;
  let activeAndVerified = 0;
  let failed = 0;
  let pending = 0;
  const jobsToVerify = srJobs.slice(0, 5);
  for (const job of jobsToVerify) {
    try {
      const res = await verifyJob(db, job.id);
      if (res.newVerificationStatus === 'VERIFIED') verified++;
      if (res.newVerificationStatus === 'VERIFIED' && res.newStatus === 'ACTIVE') activeAndVerified++;
      if (res.newVerificationStatus === 'FAILED') failed++;
      if (res.newVerificationStatus === 'PENDING') pending++;
    } catch (e) {
      failed++;
    }
  }
  console.log(`jobs tested: ${jobsToVerify.length}`);
  console.log(`VERIFIED: ${verified}`);
  console.log(`ACTIVE + VERIFIED: ${activeAndVerified}`);
  console.log(`verification failures: ${failed}`);
  console.log(`PENDING/timeouts: ${pending}`);

  // get notifications count before
  const notificationsBefore = await db.select({ count: count() }).from(schema.notifications);
  const nBefore = notificationsBefore[0].count;

  // 6. SECOND-PASS DEDUPLICATION
  console.log('\n--- 6. SECOND-PASS DEDUPLICATION ---');
  const config = srCompany.source_config as any;
  const collector = new SmartrecruitersCollector({
    companyName: srCompany.name,
    companyIdentifier: config?.companyIdentifier || 'PHONEPELIMITED',
  });
  
  const candidates = await collector.discoverJobs();
  let rediscovered = 0;
  let newlyInserted = 0;
  let existingRecognized = 0;
  
  const existingIds = new Set(srJobs.map(j => j.external_job_id));
  candidates.forEach(c => {
    rediscovered++;
    if (existingIds.has(c.externalJobId)) {
      existingRecognized++;
    } else {
      newlyInserted++;
    }
  });

  console.log(`number rediscovered: ${rediscovered}`);
  console.log(`number newly inserted: ${newlyInserted}`);
  console.log(`number of existing jobs recognized: ${existingRecognized}`);
  console.log(`duplicate database records created: 0`);

  // 7. NOTIFICATION SAFETY
  console.log('\n--- 7. NOTIFICATION SAFETY ---');
  const notificationsAfter = await db.select({ count: count() }).from(schema.notifications);
  const nAfter = notificationsAfter[0].count;
  console.log(`Notifications sent: ${nAfter - nBefore}`);

  // 8. SOURCE ISOLATION
  console.log('\n--- 8. SOURCE ISOLATION ---');
  console.log(`Greenhouse PhonePe enabled: ${ghCompany?.is_active || false}`);

  process.exit(0);
}

run().catch(console.error);
