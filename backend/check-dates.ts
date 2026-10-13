import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';
import { sql } from 'drizzle-orm';

async function check() {
  const db = getDb();
  const result = await db.select({ min: sql`min(created_at)`, max: sql`max(created_at)` }).from(schema.jobs);
  console.log(result);
  process.exit(0);
}
check();
