/**
 * Tests: Health API endpoint
 *
 * Tests the /api/health handler with mocked DB and scheduler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mock database ────────────────────────────────────────────────────────────
vi.mock('../database/connection.js', () => ({
  checkConnection: vi.fn().mockResolvedValue({ connected: true }),
}));

// ─── Mock scheduler ───────────────────────────────────────────────────────────
vi.mock('../scheduler/scheduler.js', () => ({
  scheduler: {
    getState: vi.fn().mockReturnValue({
      status: 'running',
      registeredJobs: 0,
      jobs: [],
    }),
  },
}));

// ─── Mock config ──────────────────────────────────────────────────────────────
vi.mock('../config/env.js', () => ({
  config: {
    nodeEnv: 'test',
    apiPort: 4000,
    jobScanIntervalMinutes: 30,
    jobEngineEnabled: true,
  },
}));

const { healthHandler } = await import('../api/health.js');

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and status ok when DB is connected', async () => {
    const { checkConnection } = await import('../database/connection.js');
    vi.mocked(checkConnection).mockResolvedValueOnce({ connected: true });

    const req = {} as Request;
    const res = makeRes();
    await healthHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(body['database']).toBe('connected');
    expect(body['scheduler']).toBe('running');
    expect(body['environment']).toBe('test');
    expect(typeof body['timestamp']).toBe('string');
  });

  it('returns 503 and status degraded when DB is disconnected', async () => {
    const { checkConnection } = await import('../database/connection.js');
    vi.mocked(checkConnection).mockResolvedValueOnce({
      connected: false,
      error: 'Connection refused',
    });

    const req = {} as Request;
    const res = makeRes();
    await healthHandler(req, res);

    expect(res.statusCode).toBe(503);
    const body = res.body as Record<string, unknown>;
    expect(body['status']).toBe('degraded');
    expect(body['database']).toBe('disconnected');
  });

  it('does not expose DATABASE_URL or any credentials', async () => {
    const { checkConnection } = await import('../database/connection.js');
    vi.mocked(checkConnection).mockResolvedValueOnce({ connected: true });

    const req = {} as Request;
    const res = makeRes();
    await healthHandler(req, res);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('DATABASE_URL');
    expect(body).not.toContain('password');
    expect(body).not.toContain('secret');
    expect(body).not.toContain('token');
  });

  it('response has correct shape', async () => {
    const { checkConnection } = await import('../database/connection.js');
    vi.mocked(checkConnection).mockResolvedValueOnce({ connected: true });

    const req = {} as Request;
    const res = makeRes();
    await healthHandler(req, res);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('database');
    expect(body).toHaveProperty('scheduler');
    expect(body).toHaveProperty('environment');
    expect(body).toHaveProperty('timestamp');
  });
});
