import 'dotenv/config';
import { getDb } from './database/connection.js';
import { schema } from './database/index.js';
import { sql, eq } from 'drizzle-orm';

async function run() {
  const db = getDb();
  try {
    const results = await db
      .select({
        status: schema.jobs.status,
        verification_status: schema.jobs.verification_status,
        count: sql<number>`count(*)`,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.source_system, 'SMARTRECRUITERS'))
      .groupBy(schema.jobs.status, schema.jobs.verification_status);

    console.log('--- SmartRecruiters Job Counts ---');
    results.forEach(row => {
      console.log(`${row.status} / ${row.verification_status}: ${row.count}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error querying DB:', error);
    process.exit(1);
  }
}

run();
