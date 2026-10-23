import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { SENSITIVE_LOG_PATHS } from '../utils/logger.js';

describe('Central Logger Sensitive-Field Redaction', () => {
  function createTestLogger(onLog: (chunk: string) => void) {
    const stream = {
      write(msg: string) {
        onLog(msg);
      },
    };
    return pino(
      {
        level: 'info',
        redact: {
          paths: SENSITIVE_LOG_PATHS,
          censor: '[REDACTED]',
        },
      },
      stream
    );
  }

  it('redacts password, token, and secrets at top-level', () => {
    let captured = '';
    const log = createTestLogger((msg) => {
      captured = msg;
    });

    log.info(
      {
        userId: 'user-123',
        password: 'plainSecretPassword123',
        token: 'jwt.token.string',
        apiKey: 'secret_api_key_456',
        normalField: 'safeValue',
      },
      'User login attempt'
    );

    const parsed = JSON.parse(captured);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.token).toBe('[REDACTED]');
    expect(parsed.apiKey).toBe('[REDACTED]');
    expect(parsed.normalField).toBe('safeValue');
    expect(parsed.userId).toBe('user-123');
    expect(parsed.msg).toBe('User login attempt');
  });

  it('redacts nested passwords and credentials in objects', () => {
    let captured = '';
    const log = createTestLogger((msg) => {
      captured = msg;
    });

    log.info(
      {
        user: {
          id: 'u-1',
          password_hash: 'scrypt:salt:hash',
          secret: 'top_secret',
        },
        db: {
          databaseUrl: 'postgresql://admin:secret@localhost:5432/db',
        },
        action: 'database_migration',
      },
      'DB action'
    );

    const parsed = JSON.parse(captured);
    expect(parsed.user.password_hash).toBe('[REDACTED]');
    expect(parsed.user.secret).toBe('[REDACTED]');
    expect(parsed.db.databaseUrl).toBe('[REDACTED]');
    expect(parsed.user.id).toBe('u-1');
    expect(parsed.action).toBe('database_migration');
  });

  it('redacts authorization and cookie headers', () => {
    let captured = '';
    const log = createTestLogger((msg) => {
      captured = msg;
    });

    log.info(
      {
        headers: {
          authorization: 'Bearer eyJhbGciOi...',
          cookie: 'sessionId=abc123xyz',
          'content-type': 'application/json',
        },
        ip: '192.168.1.1',
      },
      'Inbound HTTP request'
    );

    const parsed = JSON.parse(captured);
    expect(parsed.headers.authorization).toBe('[REDACTED]');
    expect(parsed.headers.cookie).toBe('[REDACTED]');
    expect(parsed.headers['content-type']).toBe('application/json');
    expect(parsed.ip).toBe('192.168.1.1');
  });
});
