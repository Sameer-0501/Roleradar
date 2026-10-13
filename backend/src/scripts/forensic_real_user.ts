import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, gte, and, sql } from 'drizzle-orm';
import { evaluateJobMatch } from '../matching/matching-service.js';

async function run() {
  const db = getDb();
  const realEmail = 'b10854752@gmail.com';
  
  // 1. User State
  const [user] = await db.query.users.findMany({
    where: eq(schema.users.email, realEmail),
    with: { preferences: true }
  });

  if (!user) {
    console.log(`User ${realEmail} not found!`);
    await closeConnection();
    return;
  }

  console.log('--- 1. CURRENT USER STATE ---');
  console.log(`User Exists: Yes`);
  console.log(`Email: ${user.email}`);
  console.log(`Email Verified: ${user.email_verified}`);
  console.log(`Alerts Enabled: ${user.preferences?.email_alerts_enabled}`);
  console.log(`Instant Notifications: ${user.preferences?.instant_notifications}`);
  console.log(`Daily Digest: ${user.preferences?.daily_digest}`);
  console.log(`Experience Level: ${user.preferences?.experience_level}`);
  console.log(`Roles: ${JSON.stringify(user.preferences?.roles)}`);
  console.log(`Locations: ${JSON.stringify(user.preferences?.locations)}`);
  console.log(`Workplace Preferences: ${JSON.stringify(user.preferences?.workplace_types)}`);
  console.log(`Company Scope: ${JSON.stringify(user.preferences?.companies)}`);

  // 2. Notifications
  const sinceTime = new Date('2026-09-16T13:30:00Z'); // 19:00 IST
  const notifs = await db.query.notifications.findMany({
    where: and(
      eq(schema.notifications.user_id, user.id),
      gte(schema.notifications.created_at, sinceTime)
    ),
    with: { job: { with: { company: true } } }
  });

  console.log('\n--- 2. NOTIFICATIONS FOR REAL USER ---');
  const stats = { CREATED: 0, SENT: 0, FAILED: 0, PENDING: 0, PROCESSING: 0, FAILED_PERMANENT: 0 };
  for (const n of notifs) {
    stats.CREATED++;
    if (n.delivery_status === 'SENT') stats.SENT++;
    else if (n.delivery_status === 'FAILED') stats.FAILED++;
    else if (n.delivery_status === 'PENDING') stats.PENDING++;
    else if (n.delivery_status === 'PROCESSING') stats.PROCESSING++;
    else if (n.delivery_status === 'FAILED_PERMANENT') stats.FAILED_PERMANENT++;
    
    console.log(JSON.stringify({
      id: n.id,
      jobId: n.job?.id,
      title: n.job?.title,
      company: n.job?.company?.name,
      type: n.notification_type,
      status: n.delivery_status,
      attempts: n.attempt_count,
      created_at: n.created_at,
      sent_at: n.sent_at,
      provider_msg: n.provider_message_id
    }));
  }
  console.log('Stats:', stats);

  // 3. Discovered Jobs since 19:16 IST (13:46 UTC)
  const jobsSince = new Date('2026-09-16T13:46:00Z');
  const recentJobs = await db.query.jobs.findMany({
    where: gte(schema.jobs.created_at, jobsSince),
    with: { company: true, verifications: true }
  });

  console.log('\n--- 3. DISCOVERED JOBS SINCE 19:16 IST ---');
  let activeVerified = 0, indian = 0, fresher = 0, exp = 0, unknown = 0;
  
  const matches = [];
  for (const j of recentJobs) {
    const isVerified = j.verifications.some(v => v.status === 'VERIFIED');
    const isActive = j.status === 'ACTIVE';
    if (isActive && isVerified) activeVerified++;
    
    if (j.location_country === 'India') indian++;
    if (j.experience_level === 'FRESHER') fresher++;
    else if (j.experience_level === 'EXPERIENCED') exp++;
    else unknown++;

    // 4. Alert Eligibility for EVERY job against this user
    // We only evaluate if it's verified and active to be considered for instant alert normally.
    if (isActive && isVerified) {
       try {
         const matchResult = evaluateJobMatch(j as any, user.preferences as any);
         if (matchResult.isMatch) {
           matches.push({ job: j, eligibility: matchResult });
         } else {
           // Track reasons if we wanted to
         }
       } catch (err) {
         // Ignore
       }
    }
  }

  console.log(`Total jobs discovered: ${recentJobs.length}`);
  console.log(`ACTIVE + VERIFIED: ${activeVerified}`);
  console.log(`Indian jobs: ${indian}`);
  console.log(`Fresher-compatible: ${fresher}`);
  console.log(`Experienced: ${exp}`);
  console.log(`Unknown: ${unknown}`);
  console.log(`Jobs matching this REAL USER: ${matches.length}`);
  
  if (matches.length > 0) {
    console.log('\n--- MATCHING CANDIDATES ---');
    for (const m of matches) {
      console.log(`Job ID: ${m.job.id} | Title: ${m.job.title} | Company: ${m.job.company.name} | Loc: ${m.job.location_city}, ${m.job.location_country} | Workplace: ${m.job.workplace_type} | Exp: ${m.job.experience_level}`);
    }
  }

  // 11. Test Contamination
  const testNotifs = await db.query.notifications.findMany({
    where: gte(schema.notifications.created_at, jobsSince),
    with: { user: true }
  });
  
  let realCount = 0, testCount = 0;
  for (const tn of testNotifs) {
    if (tn.user.email === realEmail) realCount++;
    else if (tn.user.email.endsWith('@beta.local')) testCount++;
  }
  
  console.log('\n--- 11. TEST CONTAMINATION ---');
  console.log(`Real User Notifications: ${realCount}`);
  console.log(`Beta/Test User Notifications: ${testCount}`);
  
  await closeConnection();
}

run().catch(console.error);
