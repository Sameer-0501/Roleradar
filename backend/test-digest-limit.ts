import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';
import { sql, eq } from 'drizzle-orm';
import { evaluateAndCreateInstantAlerts } from './src/notifications/alert-service.js';
import { windowedDigestWorker } from './src/notifications/digest-worker.js';

async function run() {
  const db = getDb();

  // 1. Get or create a test user
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, 'test.limit@example.com'));
  if (!user) {
    const [inserted] = await db.insert(schema.users).values({
      email: 'test.limit@example.com',
      email_verified: true,
      name: 'Test Limit',
      firebase_uid: 'limit-test',
    }).returning();
    user = inserted;
    await db.insert(schema.userPreferences).values({
      user_id: user.id,
      email_alerts_enabled: true,
      instant_notifications: true,
      daily_digest: false,
      timezone: 'Asia/Kolkata',
      experience_level: 'ANY',
    });
  }

  // Clear existing pending notifications
  await db.delete(schema.notifications).where(eq(schema.notifications.user_id, user.id));

  // 2. Insert a company
  const [company] = await db.select().from(schema.companies).limit(1);
  if (!company) throw new Error('No companies found');

  // 3. Create 26 jobs and mark them ACTIVE + VERIFIED
  const arg = process.argv[2];
  const numJobs = arg ? parseInt(arg, 10) : 26;

  console.log(`Creating ${numJobs} jobs...`);
  const jobIds = [];
  for (let i = 0; i < numJobs; i++) {
    const [job] = await db.insert(schema.jobs).values({
      company_id: company.id,
      source_system: 'GREENHOUSE',
      title: `Software Engineer ${i}`,
      external_job_id: `limit-test-${Date.now()}-${i}`,
      official_url: `https://example.com/jobs/${i}`,
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      content_hash: `hash-${i}-${Date.now()}`,
    }).returning({ id: schema.jobs.id });
    jobIds.push(job.id);
  }

  // 4. Manually insert 26 notifications
  console.log(`Inserting ${numJobs} pending notifications...`);
  for (const jobId of jobIds) {
    await db.insert(schema.notifications).values({
      user_id: user.id,
      job_id: jobId,
      notification_type: 'INSTANT_JOB',
      delivery_status: 'PENDING',
    });
  }

  // 5. Check pending notifications
  const pendingCountResult = await db.execute(sql`
    SELECT count(*) as count FROM notifications 
    WHERE user_id = ${user.id} AND delivery_status = 'PENDING'
  `);
  console.log('Pending notifications created:', pendingCountResult.rows[0].count);

  // Removed testJob logging

  // 6. Force digest worker to run cycle
  console.log('Running digest worker cycle...');
  
  // Temporarily override the active window to always return a valid window
  const originalGetWindow = (windowedDigestWorker as any).getActiveWindowForTimezone;
  (windowedDigestWorker as any).getActiveWindowForTimezone = () => '09:00';
  
  await windowedDigestWorker.processCycle();
  
  (windowedDigestWorker as any).getActiveWindowForTimezone = originalGetWindow;

  console.log('Done.');
  process.exit(0);
}

run().catch(console.error);
