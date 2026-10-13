import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { sql } from 'drizzle-orm';

async function runAudit() {
  const db = getDb();
  
  console.log('--- PRE-MIGRATION AUDIT ---');

  // 1. Check duplicate non-null keys
  const duplicateKeys = await db.execute(sql`
    SELECT idempotency_key, COUNT(*) as count 
    FROM notifications 
    WHERE idempotency_key IS NOT NULL 
    GROUP BY idempotency_key 
    HAVING COUNT(*) > 1
  `);
  console.log(`Duplicate non-null keys: ${duplicateKeys.rows.length}`);
  
  // 2. Check NULL keys
  const nullKeys = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM notifications 
    WHERE idempotency_key IS NULL
  `);
  console.log(`NULL keys count: ${nullKeys.rows[0].count}`);

  // 3. Check existing indexes for 'notifications_idempotency_key_unique'
  const indexCheck = await db.execute(sql`
    SELECT indexname 
    FROM pg_indexes 
    WHERE tablename = 'notifications' AND indexname = 'notifications_idempotency_key_unique'
  `);
  console.log(`Index 'notifications_idempotency_key_unique' exists: ${indexCheck.rows.length > 0}`);

  // 4. Check for any other existing unique constraint on idempotency_key
  const constraintCheck = await db.execute(sql`
    SELECT
      i.relname as index_name,
      a.attname as column_name
    FROM
      pg_class t,
      pg_class i,
      pg_index ix,
      pg_attribute a
    WHERE
      t.oid = ix.indrelid
      and i.oid = ix.indexrelid
      and a.attrelid = t.oid
      and a.attnum = ANY(ix.indkey)
      and t.relkind = 'r'
      and t.relname = 'notifications'
      and a.attname = 'idempotency_key'
      and ix.indisunique = true
  `);
  console.log(`Other UNIQUE constraints on idempotency_key exists: ${constraintCheck.rows.length > 0}`);
  if (constraintCheck.rows.length > 0) {
    console.log(constraintCheck.rows);
  }

  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
