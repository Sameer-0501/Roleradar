import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  console.log('[Migration] Adding workplace_types and workplace_type columns...');
  await db.execute(sql`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS workplace_types jsonb DEFAULT '[]'::jsonb;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workplace_type text DEFAULT 'UNKNOWN';`);
  console.log('[Migration] Columns successfully added / verified.');
  await closeConnection();
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
