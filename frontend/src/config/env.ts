/**
 * RoleRadar Frontend Environment Configuration.
 *
 * Centralizes all client-safe configuration values with runtime validation
 * and safe development defaults.
 *
 * SAFETY INVARIANT:
 * - Only client-safe, public variables are permitted here.
 * - Server secrets, database credentials, JWT secrets, and internal keys
 *   must NEVER be imported or exposed to the client bundle.
 */

export interface FrontendConfig {
  /** The base URL for the RoleRadar backend API (e.g. "http://localhost:4000/api") */
  readonly apiUrl: string;
  /** Whether the application is running in development mode */
  readonly isDev: boolean;
  /** Whether the application is running in production mode */
  readonly isProd: boolean;
  /** The current Vite mode (e.g. "development", "production", "test") */
  readonly mode: string;
}

/**
 * Sanitizes and normalizes an API base URL string.
 * Strips trailing slashes to guarantee consistent endpoint concatenation.
 */
export function sanitizeApiUrl(url?: string | null): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return 'http://localhost:4000/api';
  }
  const trimmed = url.trim();
  // Strip trailing slashes so paths like "/auth/login" concatenate cleanly
  return trimmed.replace(/\/+$/, '');
}

/**
 * Resolves frontend configuration from Vite's import.meta.env or Node test environment.
 */
export function createFrontendConfig(customEnv?: Record<string, string | undefined>): FrontendConfig {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;

  const mode = customEnv?.['MODE'] || metaEnv?.['MODE'] || (typeof process !== 'undefined' ? process.env?.['NODE_ENV'] : undefined) || 'development';
  const isProd = mode === 'production';
  const isDev = !isProd;

  const rawApiUrl = customEnv?.['VITE_API_URL'] || metaEnv?.['VITE_API_URL'] || (typeof process !== 'undefined' ? process.env?.['VITE_API_URL'] : undefined);
  const apiUrl = sanitizeApiUrl(rawApiUrl);

  return Object.freeze({
    apiUrl,
    isDev,
    isProd,
    mode,
  });
}

/**
 * Singleton immutable frontend configuration instance.
 */
export const env: FrontendConfig = createFrontendConfig();
