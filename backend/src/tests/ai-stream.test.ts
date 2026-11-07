/**
 * RoleRadar AI Stream Verification Tests (Check 2 & Item 13).
 *
 * Verifies:
 * - Proper Server-Sent Events (SSE) content-type and cache headers.
 * - Incremental token delivery framing (data: {...}\n\n).
 * - Stream termination sentinel (data: [DONE]\n\n).
 * - Proxy buffer prevention (X-Accel-Buffering: no).
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { streamAIResponseHandler } from '../api/stream.js';

describe('AI Streaming Handler (Check 2)', () => {
  it('delivers tokens over SSE with proper event framing and headers', async () => {
    const app = express();
    app.get('/api/assistant/stream', (req, res) => {
      void streamAIResponseHandler(req, res);
    });

    const res = await request(app)
      .get('/api/assistant/stream?prompt=TypeScript')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toContain('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');

    const bodyText = res.text;
    expect(bodyText).toContain('data: {"token":');
    expect(bodyText).toContain('TypeScript');
    expect(bodyText).toContain('data: [DONE]\n\n');
  });

  it('handles POST requests with query or body prompt', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/prep/stream', (req, res) => {
      void streamAIResponseHandler(req, res);
    });

    const res = await request(app)
      .post('/api/prep/stream?prompt=Distributed+Systems')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('Distributed Systems');
    expect(res.text).toContain('data: [DONE]\n\n');
  });
});
