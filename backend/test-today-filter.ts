import 'dotenv/config';
import crypto from 'crypto';
import { eq, and, gte, lt } from 'drizzle-orm';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';

import { getStartOfTodayInTimezone } from './src/utils/timezone.js';

async function run() {
  const db = getDb();
  
  console.log("Testing Today's Verified Jobs filter boundaries...");

  // Create a dummy user
  const [user] = await db.insert(schema.users).values({
    name: 'Boundary Test User',
    email: `boundary_${crypto.randomUUID()}@example.com`,
    auth0_id: 'auth0|' + crypto.randomUUID(),
    timezone: 'Asia/Kolkata',
    role: 'USER',
  }).returning();

  // Insert dummy preference
  await db.insert(schema.userPreferences).values({
    user_id: user.id,
    roles: ['Software Engineer'],
    preferred_locations: ['India'],
    workplace_types: ['REMOTE'],
    experience_levels: ['MID'],
  });

  // Create a dummy company
  const [company] = await db.insert(schema.companies).values({
    name: `Boundary Test Company ${crypto.randomUUID()}`,
    official_domain: 'boundary.com',
    careers_url: 'https://boundary.com/careers',
    is_active: true,
  }).returning();

  const startOfToday = getStartOfTodayInTimezone('Asia/Kolkata');
  
  const testCases = [
    { name: 'yesterday', time: new Date(startOfToday.getTime() - 1), expected: false },
    { name: 'today_00_00', time: startOfToday, expected: true },
    { name: 'today_12_00', time: new Date(startOfToday.getTime() + 12 * 3600 * 1000), expected: true },
    { name: 'today_23_59_59', time: new Date(startOfToday.getTime() + 24 * 3600 * 1000 - 1), expected: true },
    { name: 'tomorrow_00_00', time: new Date(startOfToday.getTime() + 24 * 3600 * 1000), expected: false },
  ];

  const createdJobIds: string[] = [];

  for (const tc of testCases) {
    const [job] = await db.insert(schema.jobs).values({
      company_id: company.id,
      title: 'Software Engineer',
      external_job_id: crypto.randomUUID(),
      official_url: 'https://boundary.com/job',
      source_system: 'boundary-test',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      is_verified: true,
      initial_verified_at: tc.time,
      location: 'India',
      workplace_type: 'REMOTE',
      experience_level: 'MID',
      content_hash: crypto.randomUUID(),
    }).returning();
    createdJobIds.push(job.id);

    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const results = await db.select().from(schema.jobs).where(
      and(
        eq(schema.jobs.id, job.id),
        gte(schema.jobs.initial_verified_at, startOfToday),
        lt(schema.jobs.initial_verified_at, startOfTomorrow)
      )
    );
    
    const found = results.length > 0;
    console.log(`Test Case '${tc.name}' [${tc.time.toISOString()}]:`);
    console.log(`  Expected included: ${tc.expected}`);
    console.log(`  Actual included:   ${found}`);
    if (!found) {
       console.log(`  Job ID: ${job.id}`);
    }
    if (found !== tc.expected) {
      console.error(`  FAIL: ${tc.name} did not match expected result!`);
      process.exit(1);
    } else {
      console.log(`  PASS`);
    }
  }

  // Cleanup
  console.log('Cleaning up...');
  for (const id of createdJobIds) {
    await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
  }
  await db.delete(schema.companies).where(eq(schema.companies.id, company.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));

  console.log('Done.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
