import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import type { CandidateJobData, UserPreferencesData } from '../matching/matching-types.js';

async function main() {
  const db = getDb();
  console.log("=== 1. Identify the fresher account ===");
  
  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      emailVerified: schema.users.email_verified,
      experienceLevel: schema.userPreferences.experience_level,
      emailAlertsEnabled: schema.userPreferences.email_alerts_enabled,
      instantNotifications: schema.userPreferences.instant_notifications,
      roles: schema.userPreferences.roles,
      locations: schema.userPreferences.locations,
      workplaceTypes: schema.userPreferences.workplace_types,
      companyIds: schema.userPreferences.companies,
    })
    .from(schema.users)
    .innerJoin(schema.userPreferences, eq(schema.users.id, schema.userPreferences.user_id))
    .where(eq(schema.userPreferences.experience_level, 'FRESHER'));
    
  if (users.length === 0) {
    console.log("No fresher accounts found.");
    await closeConnection();
    return;
  }
  
  const fresher = users[0];
  console.log(JSON.stringify(fresher, null, 2));

  console.log("\n=== 2. Verify fresher inventory ===");
  
  const recentJobs = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      employmentType: schema.jobs.employment_type,
      officialUrl: schema.jobs.official_url,
      applyUrl: schema.jobs.apply_url,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      officialPostedAt: schema.jobs.official_posted_at,
      firstSeenAt: schema.jobs.first_seen_at,
      lastSeenAt: schema.jobs.last_seen_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .orderBy(desc(schema.jobs.first_seen_at))
    .limit(100);

  const fresherJobs = [];
  
  for (const job of recentJobs) {
    const parsedExp = parseExperienceRequirements(job.title, job.description, job.requirements);
    if (parsedExp.classification === 'FRESHER_COMPATIBLE' || parsedExp.classification === 'BOTH') {
      fresherJobs.push({
        job,
        parsedExp
      });
    }
  }

  console.log(`Found ${fresherJobs.length} fresher-compatible jobs out of the latest 100 jobs.`);
  
  // Output a few recent fresher jobs
  fresherJobs.slice(0, 5).forEach((f, i) => {
    console.log(`Job ${i+1}: ID=${f.job.id}, Title="${f.job.title}", Company="${f.job.companyName}", Classification=${f.parsedExp.classification}, URL=${f.job.officialUrl}`);
  });

  console.log("\n=== 3. Test the actual fresher account ===");
  
  const userPrefData: UserPreferencesData = {
    userId: fresher.id,
    roles: fresher.roles || [],
    locations: fresher.locations || [],
    workplaceTypes: fresher.workplaceTypes || [],
    experienceLevel: fresher.experienceLevel,
    companyIds: fresher.companyIds || [],
    keywords: []
  };

  let matchCount = 0;
  const matchResults = [];

  for (const f of fresherJobs.slice(0, 10)) { // test top 10
    const candidate: CandidateJobData = f.job as CandidateJobData;
    const result = evaluateJobMatch(candidate, userPrefData);
    
    matchResults.push({
      jobId: candidate.id,
      title: candidate.title,
      company: candidate.companyName,
      decision: result.decision,
      reasons: result.reasons.filter(r => r),
      components: {
        role: result.components.role.matched,
        location: result.components.location.matched,
        workplace: result.components.workplace.matched,
        company: result.components.company.matched,
        experience: result.components.experience.matched
      }
    });

    if (result.matched) matchCount++;
  }

  console.log(JSON.stringify(matchResults, null, 2));
  console.log(`\nMatched ${matchCount} out of ${Math.min(fresherJobs.length, 10)} tested jobs.`);

  console.log("\n=== 4. Trace & 5. Check Notifications ===");
  
  const notifications = await db
    .select({
      id: schema.notifications.id,
      jobId: schema.notifications.job_id,
      type: schema.notifications.notification_type,
      status: schema.notifications.delivery_status,
      sentAt: schema.notifications.sent_at,
      failureReason: schema.notifications.failure_reason,
      createdAt: schema.notifications.created_at
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.user_id, fresher.id))
    .orderBy(desc(schema.notifications.created_at));

  console.log(`Found ${notifications.length} notifications in history for fresher account.`);
  
  if (notifications.length > 0) {
    const counts = notifications.reduce((acc: any, n) => {
      acc[n.status] = (acc[n.status] || 0) + 1;
      return acc;
    }, {});
    console.log("Notification Status Counts:", counts);
    console.log("Latest 5 notifications:");
    console.log(JSON.stringify(notifications.slice(0, 5), null, 2));
  } else {
    console.log("NO NOTIFICATIONS FOUND for the fresher account.");
  }

  await closeConnection();
}

main().catch(console.error);
