import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { evaluateAndCreateInstantAlerts } from '../notifications/alert-service.js';
import { Client } from 'pg';

async function runForensic() {
  console.log('=== FORENSIC INVESTIGATION REPORT ===\n');

  // Use raw PG to avoid any Drizzle schema mismatch issues and to get counts easily
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('--- 1. ACTIVE + VERIFIED Jobs Overall ---');
  const allJobsQuery = await client.query(`
    SELECT status, verification_status, count(*) 
    FROM jobs 
    GROUP BY status, verification_status;
  `);
  console.table(allJobsQuery.rows);

  console.log('\n--- 2. ACTIVE + VERIFIED Jobs dynamically classified ---');
  // Since experience_classification might not be a column, we fetch jobs and parse them
  const activeVerifiedJobs = await client.query(`
    SELECT j.id, j.title, j.description, j.requirements, j.location, j.workplace_type, j.official_url, j.first_seen_at, c.name as company_name 
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'ACTIVE' AND j.verification_status = 'VERIFIED'
    ORDER BY j.first_seen_at DESC;
  `);

  let fresherCount = 0;
  let bothCount = 0;
  let experiencedCount = 0;
  let unknownCount = 0;

  const parsedJobs = activeVerifiedJobs.rows.map(job => {
    const parsed = parseExperienceRequirements(job.title, job.description, job.requirements);
    if (parsed.classification === 'FRESHER_COMPATIBLE') fresherCount++;
    if (parsed.classification === 'BOTH') bothCount++;
    if (parsed.classification === 'EXPERIENCED') experiencedCount++;
    if (parsed.classification === 'UNKNOWN') unknownCount++;
    return { ...job, parsedExperience: parsed };
  });

  console.log(`Total Active & Verified Jobs: ${parsedJobs.length}`);
  console.log(`- FRESHER_COMPATIBLE: ${fresherCount}`);
  console.log(`- BOTH: ${bothCount}`);
  console.log(`- EXPERIENCED: ${experiencedCount}`);
  console.log(`- UNKNOWN: ${unknownCount}`);

  console.log('\n--- 3. UNKNOWN Classification Analysis ---');
  const unknownFresherKeywords = parsedJobs.filter(j => 
    j.parsedExperience.classification === 'UNKNOWN' && 
    (j.description?.toLowerCase().includes('fresher') || j.description?.toLowerCase().includes('entry level') || j.description?.toLowerCase().includes('graduate'))
  );
  console.log(`Number of UNKNOWN jobs containing "fresher", "entry level", or "graduate" in description: ${unknownFresherKeywords.length}`);


  console.log('\n--- 4. Active User Configuration (same60806@gmail.com) ---');
  const userRes = await client.query(`
    SELECT u.id, u.email, u.email_verified, up.experience_level, up.roles, up.locations, up.workplace_types, up.email_alerts_enabled, up.instant_notifications
    FROM users u
    JOIN user_preferences up ON u.id = up.user_id
    WHERE u.email = 'same60806@gmail.com'
    LIMIT 1;
  `);
  
  if (userRes.rows.length === 0) {
    console.log("No user found with email same60806@gmail.com.");
    await client.end();
    return;
  }
  
  const user = userRes.rows[0];
  console.log(JSON.stringify(user, null, 2));

  console.log('\n--- 5. Tracing Real Fresher Jobs Against Active User ---');
  // Find FRESHER_COMPATIBLE or BOTH jobs that might match the user's role/location
  const userRoles = user.roles || [];
  const userLocations = user.locations || [];
  
  const relevantFresherJobs = parsedJobs.filter(j => 
    (j.parsedExperience.classification === 'FRESHER_COMPATIBLE' || j.parsedExperience.classification === 'BOTH') &&
    (userRoles.length === 0 || userRoles.some((r: string) => j.title.toLowerCase().includes(r.toLowerCase().split(' ')[0]))) // rough role match
  ).slice(0, 3);
  
  if (relevantFresherJobs.length === 0) {
    console.log(`No FRESHER_COMPATIBLE or BOTH jobs available that vaguely match user roles (${userRoles.join(', ')}).`);
    console.log("Let's just trace ANY 3 fresher jobs to see why they fail.");
    relevantFresherJobs.push(...parsedJobs.filter(j => j.parsedExperience.classification === 'FRESHER_COMPATIBLE').slice(0, 3));
  }
  
  for (const job of relevantFresherJobs) {
    console.log(`\nEvaluating Job: ${job.title} at ${job.company_name} (Classified as ${job.parsedExperience.classification}, Loc: ${job.location})`);
    const candidateJob = {
      id: job.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      location: job.location,
      workplaceType: job.workplace_type,
      companyId: 'dummy-id',
      companyName: job.company_name
    } as any;

    const userPrefs = {
      userId: user.id,
      roles: user.roles,
      locations: user.locations,
      experienceLevel: user.experience_level,
      companyIds: [],
      keywords: []
    };

    const matchResult = evaluateJobMatch(candidateJob, userPrefs);
    console.log(`Result with user's actual experience_level (${user.experience_level}): ${matchResult.decision}`);
    matchResult.reasons.forEach(r => console.log(`  - ${r}`));
    
    // Check if notification exists for this matched job
    if (matchResult.decision === 'MATCH') {
       const notifCheck = await client.query(`
         SELECT id, notification_type, delivery_status, attempt_count, created_at, sent_at, failure_reason
         FROM notifications
         WHERE user_id = $1 AND job_id = $2
       `, [user.id, job.id]);
       
       if (notifCheck.rows.length > 0) {
           console.log(`  => NOTIFICATION FOR USER EXISTS in DB: Status: ${notifCheck.rows[0].delivery_status}, Created: ${notifCheck.rows[0].created_at}`);
       } else {
           console.log(`  => NO NOTIFICATION FOR USER FOUND in DB for this matched job!`);
           console.log(`  => Let's check when this job was first seen: Seen at ${job.first_seen_at}`);
           
           // Was it sent to anyone else?
           const allNotifsCheck = await client.query(`
             SELECT count(*) as cnt FROM notifications WHERE job_id = $1
           `, [job.id]);
           console.log(`  => Total notifications for this job across ALL users: ${allNotifsCheck.rows[0].cnt}`);
       }
    }
  }

  console.log('\n--- 5b. Freshness Check: Were ANY matching fresher jobs discovered since Sept 1? ---');
  let recentMatches = 0;
  for (const job of relevantFresherJobs) {
      if (new Date(job.first_seen_at) > new Date('2026-09-01T00:00:00Z')) {
          console.log(`Matching fresher job discovered after Sept 1: ${job.title} at ${job.company_name} (Discovered: ${job.first_seen_at})`);
          recentMatches++;
      }
  }
  console.log(`Total matching fresher jobs discovered recently (since Sept 1): ${recentMatches}`);

  console.log('\n--- 6. Tracing Recent Experienced Job (Control Case) ---');
  // Get the most recent job this user was notified about
  const recentNotifJob = await client.query(`
    SELECT j.id, j.title, j.description, j.requirements, j.location, j.workplace_type, j.official_url, c.name as company_name, n.notification_type, n.delivery_status, n.sent_at, n.failure_reason
    FROM notifications n
    JOIN jobs j ON n.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
    LIMIT 3;
  `, [user.id]);
  
  if (recentNotifJob.rows.length > 0) {
    for (const job of recentNotifJob.rows) {
        const parsed = parseExperienceRequirements(job.title, job.description, job.requirements);
        console.log(`\nFound Notification for Job: ${job.title} at ${job.company_name} (Parsed as: ${parsed.classification})`);
        console.log(`Notification Status: ${job.delivery_status} (Sent at: ${job.sent_at}, Reason: ${job.failure_reason})`);
        
        const candidateJob = {
          id: job.id,
          title: job.title,
          description: job.description,
          requirements: job.requirements,
          location: job.location,
          workplaceType: job.workplace_type,
          companyId: 'dummy-id',
          companyName: job.company_name
        } as any;

        const userPrefs = {
          userId: user.id,
          roles: user.roles,
          locations: user.locations,
          experienceLevel: user.experience_level,
          companyIds: [],
          keywords: []
        };

        const matchResult = evaluateJobMatch(candidateJob, userPrefs);
        console.log(`Match Result Simulation: ${matchResult.decision}`);
        matchResult.reasons.forEach(r => console.log(`  - ${r}`));
    }
  } else {
    console.log("No recent notifications found for this user.");
  }

  console.log('\n--- 6. Notification Queue State ---');
  const notifQuery = await client.query(`
    SELECT notification_type, delivery_status, count(*) 
    FROM notifications 
    GROUP BY notification_type, delivery_status;
  `);
  console.table(notifQuery.rows);

  console.log('\n--- 7. Most Recent Notifications System-Wide ---');
  const recentGlobalNotifs = await client.query(`
    SELECT n.id, n.job_id, j.title, n.notification_type, n.delivery_status, n.created_at, n.sent_at
    FROM notifications n
    LEFT JOIN jobs j ON n.job_id = j.id
    ORDER BY n.created_at DESC
    LIMIT 10;
  `);
  console.table(recentGlobalNotifs.rows);

  await client.end();
}

runForensic().catch(console.error);
