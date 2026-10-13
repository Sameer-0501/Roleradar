/**
 * Migration runner.
 *
 * Run with: npm run migrate:run
 *
 * This script applies pending migrations from the `drizzle/` folder
 * to the PostgreSQL database. It is separate from the main server
 * so migrations can be run independently in CI/CD.
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

async function runMigrations() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('[migrate] ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('[migrate] Connecting to database...');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool);
    console.log('[migrate] Running core Drizzle migrations from ./drizzle ...');
    await migrate(db, { migrationsFolder: './drizzle' });

    // Standalone / incremental migrations (0005 through 0009+)
    // These contain idempotent DDL (IF NOT EXISTS) and safe indexes
    const drizzleDir = path.resolve(process.cwd(), 'drizzle');
    if (fs.existsSync(drizzleDir)) {
      const sqlFiles = fs.readdirSync(drizzleDir)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      const journalTags = new Set<string>();
      const journalPath = path.join(drizzleDir, 'meta', '_journal.json');
      if (fs.existsSync(journalPath)) {
        try {
          const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
          for (const entry of journal.entries || []) {
            journalTags.add(entry.tag + '.sql');
          }
        } catch {}
      }

      const supplementalFiles = sqlFiles.filter((file) => {
        if (journalTags.has(file)) return false;
        const prefix = file.slice(0, 4);
        const num = parseInt(prefix, 10);
        return !isNaN(num) && num >= 5;
      });

      for (const file of supplementalFiles) {
        console.log(`[migrate] Applying supplemental migration: ${file}...`);
        const filePath = path.join(drizzleDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        await pool.query(sql);
        console.log(`[migrate] Successfully applied: ${file}`);
      }
    }

    console.log('[migrate] All migrations completed successfully.');
  } catch (err) {
    console.error('[migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[migrate] Unexpected error:', err);
  process.exit(1);
});

