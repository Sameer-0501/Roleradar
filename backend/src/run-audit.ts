import 'dotenv/config';
import { getDb } from './database/connection.js';
import { sql } from 'drizzle-orm';

async function runAudit() {
  const db = getDb();
  
  // 1. Check duplicate keys
  const duplicateKeys = await db.execute(sql`
    SELECT idempotency_key, COUNT(*) as count 
    FROM notifications 
    WHERE idempotency_key IS NOT NULL 
    GROUP BY idempotency_key 
    HAVING COUNT(*) > 1
  `);
  
  // 2. Check NULL keys
  const nullKeys = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM notifications 
    WHERE idempotency_key IS NULL
  `);

  // 3. Get total count
  const total = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM notifications
  `);

  console.log('--- IDEMPOTENCY KEY AUDIT ---');
  console.log(`Total notifications: ${total.rows[0].count}`);
  console.log(`Duplicate non-null keys: ${duplicateKeys.rows.length}`);
  console.log(`NULL keys count: ${nullKeys.rows[0].count}`);

  if (duplicateKeys.rows.length > 0) {
    console.log('Sample duplicate keys:');
    for (let i = 0; i < Math.min(5, duplicateKeys.rows.length); i++) {
      console.log(`- ${duplicateKeys.rows[i].idempotency_key} (${duplicateKeys.rows[i].count} times)`);
    }
  }

  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
