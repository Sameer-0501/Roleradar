import 'dotenv/config';
import { getDb } from '../database/connection.js';
import * as schema from '../database/schema.js';
import { eq } from 'drizzle-orm';

async function checkJobsAndPrefs() {
  const db = getDb();
  const userId = 'ee9c7230-e25f-4163-9675-b6c29e7b013a';

  const prefs = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.user_id, userId));
  console.log('USER PREFERENCES:', prefs);

  const totalJobs = await db.select().from(schema.jobs).limit(5);
  console.log('TOTAL JOBS SAMPLE (5):');
  for (const j of totalJobs) {
    console.log(`- [${j.id}] "${j.title}" at "${j.company_name}" (${j.location}) [status: ${j.status}]`);
  }
}

checkJobsAndPrefs().catch(console.error).finally(() => process.exit(0));

