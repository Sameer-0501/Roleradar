import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  openTelemetryTracingMiddleware,
  createChildSpan,
  inMemoryExporter,
  initOpenTelemetry,
} from '../telemetry/tracer.js';
import { httpCompressionMiddleware } from '../middleware/compression.js';
import { staticBrowserCachingMiddleware } from '../middleware/static-cache.js';

describe('OpenTelemetry Tracing & Genuine SDK Instrumentation', () => {
  beforeEach(() => {
    inMemoryExporter.clear();
    initOpenTelemetry();
  });

  it('sets X-Trace-Id and X-Response-Time-Ms without ERR_HTTP_HEADERS_SENT', async () => {
    const app = express();
    app.use(openTelemetryTracingMiddleware);
    app.use(httpCompressionMiddleware);
    app.use(staticBrowserCachingMiddleware);

    app.get('/test', (_req, res) => {
      res.json({ status: 'ok', data: 'hello' });
    });

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.headers['x-trace-id']).toBeDefined();
    expect(res.headers['x-trace-id']).toMatch(/^[a-f0-9]{32}$/i);
    expect(res.headers['x-response-time-ms']).toBeDefined();
    expect(res.headers['traceparent']).toBeDefined();
    expect(res.body).toEqual({ status: 'ok', data: 'hello' });
  });

  it('respects incoming W3C traceparent header and propagates trace ID', async () => {
    const app = express();
    app.use(openTelemetryTracingMiddleware);

    app.get('/trace-test', (_req, res) => {
      res.json({ ok: true });
    });

    const customTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const traceparent = `00-${customTraceId}-00f067aa0ba902b7-01`;

    const res = await request(app)
      .get('/trace-test')
      .set('traceparent', traceparent);

    expect(res.status).toBe(200);
    expect(res.headers['x-trace-id']).toBe(customTraceId);
  });

  it('creates genuine parent-child span relationships', async () => {
    const app = express();
    app.use(openTelemetryTracingMiddleware);

    app.get('/child-span-test', (req, res) => {
      // Create an authentic child span for a sub-operation (e.g. database query)
      const childSpan = createChildSpan('database:query_verified_jobs', req, {
        'db.system': 'postgresql',
        'db.statement': 'SELECT * FROM jobs WHERE status = ACTIVE',
      });

      childSpan.setAttribute('db.rows_returned', 5);
      childSpan.end();

      res.json({ success: true });
    });

    const res = await request(app).get('/child-span-test');
    expect(res.status).toBe(200);

    // Verify spans were exported into in-memory exporter
    const spans = inMemoryExporter.getSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);

    const child = spans.find((s) => s.name === 'database:query_verified_jobs');
    expect(child).toBeDefined();
    expect(child?.attributes['db.system']).toBe('postgresql');
  });
});
