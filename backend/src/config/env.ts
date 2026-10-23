/**
 * Environment configuration loader.
 *
 * Reads process.env, validates required variables, and exports
 * a strongly-typed config object. Fails fast on startup if
 * required variables are missing so misconfigured deployments
 * are caught immediately.
 *
 * NEVER import secrets directly from process.env elsewhere in
 * the codebase — always import from this module.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[config] Required environment variable "${name}" is missing. ` +
        `Copy backend/.env.example to backend/.env and fill in the value.`
    );
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `[config] Environment variable "${name}" must be an integer, got: "${raw}"`
    );
  }
  return parsed;
}

export interface AppConfig {
  /** PostgreSQL connection string */
  databaseUrl: string;
  /** JWT signing secret — required in ALL environments; never falls back to a default */
  jwtSecret: string;
  /**
   * Internal API key for admin/engine endpoints (scan trigger, sources health, coverage).
   * Set INTERNAL_API_KEY in .env. If unset, protected endpoints return 503.
   */
  internalApiKey: string | undefined;
  /** Express server port */
  apiPort: number;
  /** Node environment */
  nodeEnv: 'development' | 'production' | 'test';
  /**
   * Allowed CORS origins (comma-separated in env).
   * In development defaults to localhost:5173.
   * In production must be set via CORS_ORIGIN env var.
   */
  corsOrigins: string[];
  /**
   * Express trust proxy configuration.
   * Can be boolean, number of hops (e.g. 1 behind Nginx/ALB), or specific IP/subnet.
   * Defaults to 1 in production, false in development/test.
   */
  trustProxy: boolean | number | string;
  /** Default job scan interval (minutes) */
  jobScanIntervalMinutes: number;
  /** Greenhouse source scan interval (minutes) */
  greenhouseScanIntervalMinutes: number;
  /** Lever source scan interval (minutes) */
  leverScanIntervalMinutes: number;
  /** Workday source scan interval (minutes) */
  workdayScanIntervalMinutes: number;
  /** Custom career source scan interval (minutes) */
  customScanIntervalMinutes: number;
  /** Whether the job engine scheduler is enabled */
  jobEngineEnabled: boolean;
  /** Email delivery mode: production | development | console */
  emailMode: 'production' | 'development' | 'console';
  /** Email transport provider: console | smtp | resend */
  emailProvider: 'console' | 'smtp' | 'resend';
  /** Sender email address */
  emailFrom: string;
  /** Reply-to email address (optional) */
  emailReplyTo?: string;
  /** SMTP server settings */
  smtp: {
    host?: string;
    port: number;
    user?: string;
    pass?: string;
    secure: boolean;
  };
  /** Resend API Key (optional) */
  resendApiKey?: string;
  /** Notification background worker polling interval (ms) */
  notificationWorkerIntervalMs: number;
  /** Concurrency limit for notification worker */
  notificationConcurrency: number;
  /** Daily digest background worker polling interval (minutes) */
  digestWorkerIntervalMinutes: number;
  /**
   * Rolling window for recent-job source discovery (days).
   * Jobs whose official_posted_at >= now - windowDays qualify for the recent sweep.
   * Default: 14. Clamped server-side to [1, 30].
   */
  recentJobWindowDays: number;
  /** Global daily safety budget for email delivery */
  emailDailySafetyBudget: number;
  /** Maximum days a job may remain ACTIVE before being automatically transitioned to CLOSED. Default: 30 */
  jobMaxActiveDays: number;
  /** Maximum days to retain unreferenced CLOSED jobs before hard purging. Default: 60 */
  jobPurgeRetentionDays: number;
  /** Interval in minutes between job lifecycle sweeps. Default: 360 (6 hours) */
  lifecycleWorkerIntervalMinutes: number;
}

function parseTrustProxy(raw: string | undefined, nodeEnv: string): boolean | number | string {
  if (!raw || raw.trim() === '') {
    return nodeEnv === 'production' ? 1 : false;
  }
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) return num;
  return trimmed;
}

function loadConfig(): AppConfig {
  const rawEnv = optionalEnv('NODE_ENV', 'development');
  const nodeEnv = (['development', 'production', 'test'] as const).includes(
    rawEnv as 'development' | 'production' | 'test'
  )
    ? (rawEnv as 'development' | 'production' | 'test')
    : 'development';

  const databaseUrl =
    nodeEnv === 'test'
      ? optionalEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test_db')
      : requireEnv('DATABASE_URL');

  // JWT_SECRET is REQUIRED in all environments. No hardcoded fallback.
  // Tests must set process.env.JWT_SECRET before importing config.
  const jwtSecret = requireEnv('JWT_SECRET');

  // INTERNAL_API_KEY protects engine trigger/admin endpoints.
  // If unset, those endpoints return 503 (safer than open access).
  const internalApiKey = process.env['INTERNAL_API_KEY'] || undefined;

  const apiPort = optionalIntEnv('API_PORT', 4000);

  // CORS_ORIGIN: comma-separated allowed origins.
  // In dev, defaults to Vite dev server. In production, must be configured.
  const rawCorsOrigin = optionalEnv('CORS_ORIGIN', '');
  const corsOrigins =
    rawCorsOrigin.trim() !== ''
      ? rawCorsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
      : nodeEnv === 'production'
      ? [] // In production with no CORS_ORIGIN set, deny all — logs a startup warning
      : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  // TRUST_PROXY: reverse proxy trust configuration (1 for single reverse proxy, or specific string/boolean)
  const trustProxy = parseTrustProxy(process.env['TRUST_PROXY'], nodeEnv);

  const jobScanIntervalMinutes = optionalIntEnv('JOB_SCAN_INTERVAL_MINUTES', 30);
  const greenhouseScanIntervalMinutes = optionalIntEnv(
    'GREENHOUSE_SCAN_INTERVAL_MINUTES',
    jobScanIntervalMinutes
  );
  const leverScanIntervalMinutes = optionalIntEnv(
    'LEVER_SCAN_INTERVAL_MINUTES',
    jobScanIntervalMinutes
  );
  const workdayScanIntervalMinutes = optionalIntEnv(
    'WORKDAY_SCAN_INTERVAL_MINUTES',
    jobScanIntervalMinutes
  );
  const customScanIntervalMinutes = optionalIntEnv(
    'CUSTOM_SCAN_INTERVAL_MINUTES',
    jobScanIntervalMinutes
  );
  const jobEngineEnabled = optionalEnv('JOB_ENGINE_ENABLED', 'true') === 'true';

  // ── Email / Notifications Config ──────────────────────────────────────────
  const rawEmailMode = optionalEnv(
    'EMAIL_MODE',
    nodeEnv === 'production' ? 'production' : 'console'
  );
  const emailMode = (['production', 'development', 'console'] as const).includes(
    rawEmailMode as 'production' | 'development' | 'console'
  )
    ? (rawEmailMode as 'production' | 'development' | 'console')
    : 'console';

  const rawEmailProvider = optionalEnv('EMAIL_PROVIDER', emailMode === 'production' ? 'smtp' : 'console');
  const emailProvider = (['console', 'smtp', 'resend'] as const).includes(
    rawEmailProvider as 'console' | 'smtp' | 'resend'
  )
    ? (rawEmailProvider as 'console' | 'smtp' | 'resend')
    : 'console';

  const emailFrom = optionalEnv('EMAIL_FROM', 'RoleRadar Alerts <alerts@roleradar.dev>');
  const emailReplyTo = process.env['EMAIL_REPLY_TO'];

  const smtp = {
    host: process.env['SMTP_HOST'],
    port: optionalIntEnv('SMTP_PORT', 587),
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
    secure: optionalEnv('SMTP_SECURE', 'false') === 'true',
  };

  const resendApiKey = process.env['RESEND_API_KEY'];
  const notificationWorkerIntervalMs = optionalIntEnv('NOTIFICATION_WORKER_INTERVAL_MS', 5000);
  const notificationConcurrency = optionalIntEnv('NOTIFICATION_CONCURRENCY', 5);
  const digestWorkerIntervalMinutes = optionalIntEnv('DIGEST_WORKER_INTERVAL_MINUTES', 30);

  const rawRecentJobWindowDays = optionalIntEnv('RECENT_JOB_WINDOW_DAYS', 14);
  // Clamp to [1, 30] — prevents accidental unbounded historical sweeps
  const recentJobWindowDays = Math.max(1, Math.min(30, rawRecentJobWindowDays));

  const emailDailySafetyBudget = optionalIntEnv('EMAIL_DAILY_SAFETY_BUDGET', 300);

  const rawJobMaxActiveDays = optionalIntEnv('JOB_MAX_ACTIVE_DAYS', 30);
  const jobMaxActiveDays = Math.max(7, Math.min(90, rawJobMaxActiveDays));

  const rawJobPurgeRetentionDays = optionalIntEnv('JOB_PURGE_RETENTION_DAYS', 60);
  const jobPurgeRetentionDays = Math.max(30, Math.min(365, rawJobPurgeRetentionDays));

  const rawLifecycleInterval = optionalIntEnv('LIFECYCLE_WORKER_INTERVAL_MINUTES', 360);
  const lifecycleWorkerIntervalMinutes = Math.max(15, Math.min(1440, rawLifecycleInterval));

  return {
    databaseUrl,
    jwtSecret,
    internalApiKey,
    apiPort,
    nodeEnv,
    corsOrigins,
    trustProxy,
    jobScanIntervalMinutes,
    greenhouseScanIntervalMinutes,
    leverScanIntervalMinutes,
    workdayScanIntervalMinutes,
    customScanIntervalMinutes,
    jobEngineEnabled,
    emailMode,
    emailProvider,
    emailFrom,
    emailReplyTo,
    smtp,
    resendApiKey,
    notificationWorkerIntervalMs,
    notificationConcurrency,
    digestWorkerIntervalMinutes,
    recentJobWindowDays,
    emailDailySafetyBudget,
    jobMaxActiveDays,
    jobPurgeRetentionDays,
    lifecycleWorkerIntervalMinutes,
  };
}

export const config = loadConfig();
