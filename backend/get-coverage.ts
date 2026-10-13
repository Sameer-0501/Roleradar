import 'dotenv/config';
import { getDb, closeConnection } from './src/database/connection.js';
import { sql } from 'drizzle-orm';

async function run() {
  const db = getDb();
  
  const totalRes = await db.execute(sql`SELECT count(*) as count FROM jobs WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED'`);
  const indiaRes = await db.execute(sql`SELECT count(*) as count FROM jobs WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED' AND country_code = 'IN'`);
  const indiaFresherRes = await db.execute(sql`SELECT count(*) as count FROM jobs WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED' AND country_code = 'IN' AND is_fresher_eligible = true`);
  const indiaFresherItRes = await db.execute(sql`SELECT count(*) as count FROM jobs WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED' AND country_code = 'IN' AND is_fresher_eligible = true AND is_it_category = true`);
  const indiaFresherNonItRes = await db.execute(sql`SELECT count(*) as count FROM jobs WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED' AND country_code = 'IN' AND is_fresher_eligible = true AND is_it_category = false`);
  
  console.log('ACTIVE + VERIFIED:', totalRes.rows[0].count);
  console.log('Indian ACTIVE + VERIFIED:', indiaRes.rows[0].count);
  console.log('Indian fresher-compatible:', indiaFresherRes.rows[0].count);
  console.log('Indian fresher IT:', indiaFresherItRes.rows[0].count);
  console.log('Indian fresher non-IT:', indiaFresherNonItRes.rows[0].count);
  
  await closeConnection();
}
run().catch(console.error);
