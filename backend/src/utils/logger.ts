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

const isDevelopment = process.env['NODE_ENV'] !== 'production' && process.env['NODE_ENV'] !== 'test';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? (isDevelopment ? 'debug' : 'info'),
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
