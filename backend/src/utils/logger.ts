/**
 * Structured logger using Pino.
 *
 * - In development: pretty-prints to stdout
 * - In production/test: outputs structured JSON
 *
 * SECURITY: Never log passwords, tokens, email credentials,
 * API keys, or session secrets. This module enforces no
 * automatic redaction — callers must avoid passing secrets.
 */

import pino from 'pino';

/**
 * Sensitive field paths automatically redacted by Pino.
 * Matches direct properties, nested objects, headers, credentials, and tokens.
 */
export const SENSITIVE_LOG_PATHS = [
  // HTTP Headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-internal-key"]',
  'req.headers["x-api-key"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-internal-key"]',
  'headers["x-api-key"]',
  'authorization',
  'cookie',

  // Credentials & Passwords
  'password',
  'password_hash',
  'passwordHash',
  'newPassword',
  'oldPassword',
  'confirmPassword',
  '*.password',
  '*.password_hash',
  '*.passwordHash',

  // Authentication & Session Tokens
  'token',
  'jwt',
  'accessToken',
  'refreshToken',
  'verificationToken',
  'verification_token',
  'verification_token_hash',
  'rawToken',
  '*.token',
  '*.jwt',
  '*.accessToken',
  '*.refreshToken',

  // Secrets, Keys & Connection Strings
  'secret',
  'jwtSecret',
  'internalApiKey',
  'apiKey',
  'resendApiKey',
  'databaseUrl',
  '*.secret',
  '*.jwtSecret',
  '*.internalApiKey',
  '*.apiKey',
  '*.resendApiKey',
  '*.databaseUrl',

  // Error Config Headers
  'err.config.headers.authorization',
  'error.config.headers.authorization',
];

const isDevelopment = process.env['NODE_ENV'] !== 'production' && process.env['NODE_ENV'] !== 'test';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? (isDevelopment ? 'debug' : 'info'),
  redact: {
    paths: SENSITIVE_LOG_PATHS,
    censor: '[REDACTED]',
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

/** Create a child logger scoped to a specific module/component */
export function createLogger(component: string) {
  return logger.child({ component });
}
