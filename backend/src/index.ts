/**
 * RoleRadar Job Engine — Server Entry Point
 *
 * Bootstraps the Express server:
 * 1. Load environment config (fails fast if misconfigured)
 * 2. Set up middleware (CORS, JSON parsing)
 * 3. Mount API routes
 * 4. Verify database connectivity
 * 5. Seed source company records (idempotent)
 * 6. Register collectors with the scheduler
 * 7. Start the scheduler
 * 8. Listen on configured port
 *
 * Graceful shutdown on SIGINT/SIGTERM:
 * - Stops the scheduler
 * - Closes the database connection pool
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { createRouter } from './api/router.js';
import { checkConnection, closeConnection } from './database/connection.js';
import { scheduler } from './scheduler/scheduler.js';
import { windowedDigestWorker } from './notifications/digest-worker.js';
import { reverificationWorker } from './jobs/reverification-worker.js';
import { jobLifecycleWorker } from './jobs/job-lifecycle-worker.js';
import { verificationRetentionWorker } from './jobs/verification-retention-worker.js';
import { seedSources } from './pipeline/source-seeder.js';
import { SOURCE_CATALOG } from './sources/catalog.js';
import { createCollectorForSource } from './sources/source-factory.js';
import helmet from 'helmet';

const log = createLogger('server');

async function bootstrap() {
  const app = express();

  // ─── Reverse Proxy & Security Headers ────────────────────────────────────
  app.set('trust proxy', config.trustProxy);
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
          connectSrc: ["'self'", ...config.corsOrigins],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts:
        config.nodeEnv === 'production'
          ? {
              maxAge: 31536000,
              includeSubDomains: true,
              preload: true,
            }
          : false,
    })
  );

  // ─── Middleware ──────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // ─── Routes ──────────────────────────────────────────────────────────────
  app.use('/api', createRouter());

  // ─── 404 handler ─────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ─── Database connectivity check ─────────────────────────────────────────
  log.info('Checking database connectivity...');
  const dbStatus = await checkConnection();
  if (dbStatus.connected) {
    log.info('Database connected successfully');
  } else {
    log.warn(
      { error: dbStatus.error },
      'Database is not reachable — server will start but /api/health will report degraded. ' +
        'Ensure PostgreSQL is running and DATABASE_URL is correct.'
    );
  }

  // ─── Source seeding & collector registration ────────────────────────────
  if (dbStatus.connected && config.jobEngineEnabled) {
    log.info('Seeding source company records...');
    let companyIds = new Map<string, string>();
    try {
      companyIds = await seedSources();
      log.info({ count: companyIds.size }, 'Source seeding complete');
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Source seeding failed — collectors will not be registered'
      );
    }

    // Register all active collectors from SOURCE_CATALOG
    let registeredCount = 0;
    for (const source of SOURCE_CATALOG) {
      if (!source.isActive) continue;

      const companyId = companyIds.get(source.companyName);
      if (!companyId) {
        log.warn({ company: source.companyName }, 'Company ID not available — collector not registered');
        continue;
      }

      try {
        const collector = createCollectorForSource(source);
        const intervalMs = (source.scanIntervalMinutes || config.jobScanIntervalMinutes) * 60_000;

        let verifyConfig: Record<string, unknown> = {
          officialDomain: source.officialDomain,
          sourceSystem: (source.atsType === 'ASHBY' || source.atsType === 'WORKABLE') ? 'CUSTOM' : source.atsType,
        };

        if (source.atsType === 'GREENHOUSE') {
          verifyConfig = { ...verifyConfig, boardToken: source.config.boardToken };
        } else if (source.atsType === 'LEVER') {
          verifyConfig = { ...verifyConfig, siteToken: source.config.siteToken };
        } else if (source.atsType === 'WORKDAY') {
          verifyConfig = {
            ...verifyConfig,
            workdayConfig: {
              host: source.config.host,
              tenant: source.config.tenant,
              clientSite: source.config.clientSite,
              appliedFacets: source.config.appliedFacets,
            },
          };
        } else if (source.atsType === 'CUSTOM') {
          verifyConfig = {
            ...verifyConfig,
            customConfig: {
              perJobApiEndpointTemplate: source.config.perJobApiEndpointTemplate,
            },
          };
        } else if (source.atsType === 'ASHBY') {
          verifyConfig = {
            ...verifyConfig,
            ashbyConfig: {
              jobBoardName: source.config.jobBoardName,
            },
          };
        } else if (source.atsType === 'WORKABLE') {
          verifyConfig = {
            ...verifyConfig,
            workableConfig: {
              accountSlug: source.config.accountSlug,
            },
          };
        } else if (source.atsType === 'SMARTRECRUITERS') {
          verifyConfig = {
            ...verifyConfig,
            smartrecruitersConfig: {
              companyIdentifier: source.config.companyIdentifier,
            },
          };
        } else if (source.atsType === 'SAP') {
          verifyConfig = {
            ...verifyConfig,
            sapConfig: {
              apiBaseUrl: source.config.apiBaseUrl,
            },
          };
        }

        scheduler.register(
          collector,
          intervalMs,
          companyId,
          verifyConfig as any,
          source.companyName
        );
        registeredCount++;
      } catch (err) {
        log.error(
          { company: source.companyName, err: err instanceof Error ? err.message : String(err) },
          'Failed to instantiate/register collector'
        );
      }
    }

    log.info({ registeredCount, totalCatalog: SOURCE_CATALOG.length }, 'Source collectors dynamically registered');

    scheduler.start();
    reverificationWorker.start();
    windowedDigestWorker.start();
    jobLifecycleWorker.start();
    verificationRetentionWorker.start();
    log.info(
      {
        greenhouseInterval: config.greenhouseScanIntervalMinutes,
        leverInterval: config.leverScanIntervalMinutes,
        workdayInterval: config.workdayScanIntervalMinutes,
        customInterval: config.customScanIntervalMinutes,
        collectors: scheduler.getState().registeredJobs,
      },
      'Job engine scheduler, reverification worker, and notification workers started'
    );
  } else {
    log.info('Job engine scheduler is disabled (JOB_ENGINE_ENABLED=false)');
  }

  // ─── Start server ────────────────────────────────────────────────────────
  const server = app.listen(config.apiPort, () => {
    log.info(
      { port: config.apiPort, env: config.nodeEnv },
      `RoleRadar Job Engine API started on http://localhost:${config.apiPort}`
    );
    log.info('  GET  /api/health');
    log.info('  GET  /api/jobs/engine/status');
    log.info('  GET  /api/jobs/engine/sources/health');
    log.info('  GET  /api/jobs/engine/coverage/fresher');
    log.info('  GET  /api/jobs');
    log.info('  GET  /api/jobs/verified');
    log.info('  GET  /api/jobs/:id');
    log.info('  GET  /api/notifications  [auth]');
    log.info('  POST /api/jobs/engine/scan/trigger  [dev]');
  });

  // ─── Graceful shutdown ───────────────────────────────────────────────────
  async function shutdown(signal: string) {
    log.info({ signal }, 'Received shutdown signal');
    scheduler.stop();
    reverificationWorker.stop();
    windowedDigestWorker.stop();
    jobLifecycleWorker.stop();
    verificationRetentionWorker.stop();
    await closeConnection();
    server.close(() => {
      log.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      log.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
