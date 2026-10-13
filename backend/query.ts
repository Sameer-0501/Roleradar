import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { sql } from 'drizzle-orm';
async function run() {
  const res = await getDb().execute(sql`SELECT count(*) FROM jobs`);
  console.log(res);
  const activeVerifiedRes = await getDb().execute(sql`SELECT count(*) FROM jobs WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED'`);
  console.log(activeVerifiedRes);
  process.exit(0);
}
run();
