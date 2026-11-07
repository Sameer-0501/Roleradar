/**
 * PostgreSQL connection pool.
 *
 * Uses the `pg` pool driver with Drizzle ORM.
 * Call `checkConnection()` to verify the database is reachable.
 * Call `closeConnection()` on graceful shutdown.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/env.js';

const log = createLogger('database');

let pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env['DATABASE_URL'] || config.databaseUrl;
    if (!databaseUrl) {
      throw new Error('[database] DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err) => {
      log.error({ err: err.message }, 'Unexpected error on idle PostgreSQL client');
    });
  }
  return pool;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export interface DbCheckResult {
  connected: boolean;
  latencyMs?: number;
  error?: string;
  poolStats?: {
    total: number;
    idle: number;
    waiting: number;
  };
}

/**
 * Verify the database is reachable and measure round-trip connection latency (Items 19 & 25).
 */
export async function checkConnection(): Promise<DbCheckResult> {
  const start = Date.now();
  try {
    const p = getPool();
    const client = await p.connect();
    await client.query('SELECT 1');
    client.release();
    const latencyMs = Date.now() - start;

    return {
      connected: true,
      latencyMs,
      poolStats: {
        total: p.totalCount,
        idle: p.idleCount,
        waiting: p.waitingCount,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { connected: false, error: message };
  }
}

/** Gracefully close the connection pool. */
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    _db = null;
    log.info('Database connection pool closed');
  }
}
