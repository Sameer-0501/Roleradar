import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';
import { sql } from 'drizzle-orm';

async function check() {
  const db = getDb();
  
  console.log('--- DB TOTAL JOBS ---');
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.jobs);
  console.log('Total jobs:', count);

  console.log('\n--- BY STATUS ---');
  const byStatus = await db.select({ status: schema.jobs.status, count: sql<number>`count(*)` }).from(schema.jobs).groupBy(schema.jobs.status);
  console.table(byStatus);

  console.log('\n--- BY VERIFICATION STATUS ---');
  const byVerif = await db.select({ vstatus: schema.jobs.verification_status, count: sql<number>`count(*)` }).from(schema.jobs).groupBy(schema.jobs.verification_status);
  console.table(byVerif);

  console.log('\n--- COMBINED (STATUS + VERIFICATION) ---');
  const combined = await db.select({ status: schema.jobs.status, vstatus: schema.jobs.verification_status, count: sql<number>`count(*)` }).from(schema.jobs).groupBy(schema.jobs.status, schema.jobs.verification_status);
  console.table(combined);

  process.exit(0);
}
check();
