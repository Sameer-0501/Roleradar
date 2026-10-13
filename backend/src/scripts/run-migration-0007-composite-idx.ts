/**
 * One-shot migration runner for 0007_composite_idx.sql
 * Run once: tsx src/scripts/run-migration-0007-composite-idx.ts
 */
import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { sql } from 'drizzle-orm';

const db = getDb();

console.log('Creating composite index jobs_status_verification_idx...');

try {
  await db.execute(
    sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS jobs_status_verification_idx ON jobs(status, verification_status)`
  );
  console.log('SUCCESS: Index jobs_status_verification_idx created (or already existed).');
} catch (err) {
  console.error('FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

process.exit(0);
