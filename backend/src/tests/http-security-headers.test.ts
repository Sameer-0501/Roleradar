import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

describe('HTTP Security Headers & Reverse-Proxy Awareness (Phase 17)', () => {
  function createApp(isProduction: boolean, trustProxySetting: boolean | number | string) {
    const app = express();

    app.set('trust proxy', trustProxySetting);
    app.disable('x-powered-by');

    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: isProduction ? [] : null,
          },
        },
        crossOriginEmbedderPolicy: false,
        hsts: isProduction
          ? {
              maxAge: 31536000,
              includeSubDomains: true,
              preload: true,
            }
          : false,
      })
    );

    // Rate limiter configured using our robust resolver
    const testLimiter = rateLimit({
      windowMs: 60_000,
      max: 2,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      validate: {
        trustProxy: false,
        xForwardedForHeader: false,
        keyGeneratorIpFallback: false,
      },
      keyGenerator: (req) => req.ip || req.socket?.remoteAddress || '127.0.0.1',
      message: { error: 'Rate limit exceeded' },
    });

    app.get('/api/test-headers', (_req, res) => {
      res.json({ ok: true });
    });

    app.get('/api/test-limit', testLimiter, (req, res) => {
      res.json({ ip: req.ip });
    });

    return app;
  }

  it('1. disables X-Powered-By header to prevent server fingerprinting', async () => {
    const app = createApp(false, false);
    const res = await request(app).get('/api/test-headers');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('2. sets X-Content-Type-Options: nosniff to prevent MIME sniffing', async () => {
    const app = createApp(false, false);
    const res = await request(app).get('/api/test-headers');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('3. sets clickjacking defenses (frame-ancestors and X-Frame-Options)', async () => {
    const app = createApp(false, false);
    const res = await request(app).get('/api/test-headers');

    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('4. sets comprehensive Content-Security-Policy header', async () => {
    const app = createApp(false, false);
    const res = await request(app).get('/api/test-headers');

    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('5. enables HSTS only in production mode', async () => {
    const devApp = createApp(false, false);
    const devRes = await request(devApp).get('/api/test-headers');
    expect(devRes.headers['strict-transport-security']).toBeUndefined();

    const prodApp = createApp(true, 1);
    const prodRes = await request(prodApp).get('/api/test-headers');
    expect(prodRes.headers['strict-transport-security']).toBeDefined();
    expect(prodRes.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(prodRes.headers['strict-transport-security']).toContain('includeSubDomains');
  });

  it('6. prevents spoofed X-Forwarded-For from bypassing rate limits when trustProxy is disabled', async () => {
    const app = createApp(false, false);

    // Attacker sends different spoofed X-Forwarded-For on each request
    const r1 = await request(app)
      .get('/api/test-limit')
      .set('X-Forwarded-For', '203.0.113.1');
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .get('/api/test-limit')
      .set('X-Forwarded-For', '203.0.113.2');
    expect(r2.status).toBe(200);

    // 3rd attempt is rate-limited (429) despite different spoofed header
    // because trustProxy=false uses genuine socket remote address
    const r3 = await request(app)
      .get('/api/test-limit')
      .set('X-Forwarded-For', '203.0.113.3');
    expect(r3.status).toBe(429);
  });

  it('7. correctly isolates rate limits per genuine client IP when reverse proxy is trusted (trustProxy=1)', async () => {
    const app = createApp(false, 1);

    // Client A sends 2 requests through proxy
    const a1 = await request(app)
      .get('/api/test-limit')
      .set('X-Forwarded-For', '198.51.100.10');
    expect(a1.status).toBe(200);

    const a2 = await request(app)
      .get('/api/test-limit')
      .set('X-Forwarded-For', '198.51.100.10');
    expect(a2.status).toBe(200);

    // Client A gets rate-limited on 3rd request
    const a3 = await request(app)
      .get('/api/test-limit')
      .set('X-Forwarded-For', '198.51.100.10');
    expect(a3.status).toBe(429);

    // Client B from a different IP is NOT blocked
    const b1 = await request(app)
      .get('/api/test-limit')
      .set('X-Forwarded-For', '198.51.100.20');
    expect(b1.status).toBe(200);
  });
});
