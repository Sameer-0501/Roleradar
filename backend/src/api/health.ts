/**
 * GET /api/health
 *
 * Returns server health status including database connectivity,
 * scheduler status, environment, and timestamp.
 *
 * SECURITY: Does not expose connection strings, credentials, or
 * any internal configuration values.
 */

import type { Request, Response } from 'express';
import { checkConnection } from '../database/connection.js';
import { scheduler } from '../scheduler/scheduler.js';
import { config } from '../config/env.js';

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const dbResult = await checkConnection();
  const schedulerState = scheduler.getState();

  const isHealthy = dbResult.connected;

  const body = {
    status: isHealthy ? 'ok' : 'degraded',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    database: dbResult.connected ? 'connected' : 'disconnected',
    scheduler: schedulerState.status,
    ...(dbResult.connected ? {} : { database_error: dbResult.error }),
  };

  res.status(isHealthy ? 200 : 503).json(body);
}
