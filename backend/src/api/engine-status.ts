/**
 * Job Engine Operational Status & Source Health Handlers.
 *
 * Endpoints:
 * - GET  /api/jobs/engine/status
 * - GET  /api/jobs/engine/sources/health
 * - GET  /api/jobs/engine/coverage/fresher
 * - POST /api/jobs/engine/sources/:companyName/scan
 *
 * SECURITY: Does not expose sensitive configuration, tokens, or credentials.
 */

import type { Request, Response } from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { scheduler } from '../scheduler/scheduler.js';
import { config } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { sql, eq, and } from 'drizzle-orm';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';

const log = createLogger('api:engine-status');

function isIndiaLocation(loc: string | null): boolean {
  if (!loc) return false;
  const lower = loc.toLowerCase();
  const indianCities = [
    'india',
    'bangalore',
    'bengaluru',
    'hyderabad',
    'pune',
    'chennai',
    'mumbai',
    'delhi',
    'noida',
    'gurgaon',
    'gurugram',
    'kolkata',
    'coimbatore',
    'ahmedabad',
    'kochi',
    'trivandrum',
    'indore',
    'jaipur',
    'chandigarh',
  ];
  return indianCities.some((c) => lower.includes(c));
}

export async function engineStatusHandler(_req: Request, res: Response): Promise<void> {
  try {
    const db = getDb();

    // Count configured (active) companies
    const [companyCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.companies)
      .where(sql`${schema.companies.is_active} = true`);

    // Count active verified jobs
    const [activeJobsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(sql`${schema.jobs.status} = 'ACTIVE' AND ${schema.jobs.verification_status} = 'VERIFIED'`);

    // Count closed jobs
    const [closedJobsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(sql`${schema.jobs.status} = 'CLOSED'`);

    // Count total active (not-closed) jobs
    const [totalActiveResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(sql`${schema.jobs.status} IN ('ACTIVE', 'UPDATED', 'VERIFYING', 'DISCOVERED')`);

    // Get last scan run
    const [lastScan] = await db
      .select({
        started_at: schema.scanRuns.started_at,
        completed_at: schema.scanRuns.completed_at,
        status: schema.scanRuns.status,
        source_name: schema.scanRuns.source_name,
      })
      .from(schema.scanRuns)
      .orderBy(sql`${schema.scanRuns.started_at} DESC`)
      .limit(1);

    // Get last successful scan
    const [lastSuccessfulScan] = await db
      .select({ completed_at: schema.scanRuns.completed_at })
      .from(schema.scanRuns)
      .where(sql`${schema.scanRuns.status} = 'COMPLETED'`)
      .orderBy(sql`${schema.scanRuns.completed_at} DESC`)
      .limit(1);

    const schedulerState = scheduler.getState();

    res.json({
      engine: {
        enabled: config.jobEngineEnabled,
        scanIntervalMinutes: config.jobScanIntervalMinutes,
      },
      scheduler: {
        status: schedulerState.status,
        registeredCollectors: schedulerState.registeredJobs,
        jobs: schedulerState.jobs.map((j) => ({
          name: j.name,
          intervalMinutes: Math.round(j.intervalMs / 60_000),
          lastRunAt: j.lastRunAt?.toISOString() ?? null,
          lastSuccessAt: j.lastSuccessAt?.toISOString() ?? null,
        })),
      },
      companies: {
        configured: companyCountResult?.count ?? 0,
      },
      jobs: {
        activeVerified: activeJobsResult?.count ?? 0,
        totalActive: totalActiveResult?.count ?? 0,
        totalClosed: closedJobsResult?.count ?? 0,
      },
      lastScan: lastScan
        ? {
            startedAt: lastScan.started_at?.toISOString() ?? null,
            completedAt: lastScan.completed_at?.toISOString() ?? null,
            status: lastScan.status,
            sourceName: lastScan.source_name,
          }
        : null,
      lastSuccessfulScan: lastSuccessfulScan?.completed_at?.toISOString() ?? null,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Engine status query failed');
    res.status(500).json({ error: 'Failed to retrieve engine status' });
  }
}

/**
 * GET /api/jobs/engine/sources/health
 *
 * Returns real-time health metrics, response latency, and scan statistics
 * for all configured career sources.
 */
export async function sourcesHealthHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { sourceHealthTracker } = await import('../health/source-health.js');
    const { SOURCE_CATALOG } = await import('../sources/catalog.js');
    const healthRecords = sourceHealthTracker.getAll();

    const result = SOURCE_CATALOG.map((source) => {
      const record = healthRecords.find(
        (h) => h.company.toLowerCase() === source.companyName.toLowerCase()
      );

      return {
        companyName: source.companyName,
        officialDomain: source.officialDomain,
        careersUrl: source.careersUrl,
        atsType: source.atsType,
        isActive: source.isActive,
        scanIntervalMinutes: source.scanIntervalMinutes || 30,
        health: {
          status: record?.status ?? 'HEALTHY',
          lastScanCompletedAt: record?.lastScanCompletedAt ?? null,
          lastSuccessfulScanAt: record?.lastSuccessfulScanAt ?? null,
          lastFailureAt: record?.lastFailureAt ?? null,
          nextAllowedScanAt: record?.nextAllowedScanAt ?? null,
          jobsDiscovered: record?.jobsDiscovered ?? 0,
          jobsVerified: record?.jobsVerified ?? 0,
          responseTimeMs: record?.responseTimeMs ?? null,
          lastScanDurationMs: record?.lastScanDurationMs ?? null,
          consecutiveFailures: record?.consecutiveFailures ?? 0,
          errorMessage: record?.errorMessage ?? null,
        },
      };
    });

    res.json({
      totalSources: SOURCE_CATALOG.length,
      activeSources: SOURCE_CATALOG.filter((s) => s.isActive).length,
      sources: result,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Sources health query failed');
    res.status(500).json({ error: 'Failed to retrieve sources health' });
  }
}

/**
 * GET /api/jobs/engine/coverage/fresher
 *
 * Detailed Indian fresher coverage monitoring across metro clusters.
 */
export async function fresherCoverageHandler(_req: Request, res: Response): Promise<void> {
  try {
    const db = getDb();

    const jobs = await db
      .select({
        id: schema.jobs.id,
        title: schema.jobs.title,
        location: schema.jobs.location,
        workplaceType: schema.jobs.workplace_type,
        description: schema.jobs.description,
        requirements: schema.jobs.requirements,
      })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, 'ACTIVE'), eq(schema.jobs.verification_status, 'VERIFIED')));

    const metrics = {
      totalActiveVerified: jobs.length,
      indianFresherJobs: 0,
      indianExperiencedJobs: 0,
      internationalFresherJobs: 0,
      internationalExperiencedJobs: 0,
      metroCoverage: {
        bangalore: 0,
        hyderabad: 0,
        pune: 0,
        chennai: 0,
        mumbai: 0,
        delhiNcr: 0,
        indiaRemote: 0,
      },
    };

    for (const j of jobs) {
      const parsed = parseExperienceRequirements(j.title, j.description, j.requirements);
      const isFresher = matchExperience(parsed, 'FRESHER').matched;
      const locStr = j.location || '';
      const isIndia = isIndiaLocation(locStr);

      if (isIndia) {
        if (isFresher) {
          metrics.indianFresherJobs++;

          const locLower = locStr.toLowerCase();
          if (locLower.includes('bangalore') || locLower.includes('bengaluru')) {
            metrics.metroCoverage.bangalore++;
          }
          if (locLower.includes('hyderabad')) {
            metrics.metroCoverage.hyderabad++;
          }
          if (locLower.includes('pune')) {
            metrics.metroCoverage.pune++;
          }
          if (locLower.includes('chennai') || locLower.includes('madras')) {
            metrics.metroCoverage.chennai++;
          }
          if (locLower.includes('mumbai') || locLower.includes('bombay') || locLower.includes('navi mumbai')) {
            metrics.metroCoverage.mumbai++;
          }
          if (
            locLower.includes('delhi') ||
            locLower.includes('noida') ||
            locLower.includes('gurgaon') ||
            locLower.includes('gurugram') ||
            locLower.includes('ncr')
          ) {
            metrics.metroCoverage.delhiNcr++;
          }
          if (
            j.workplaceType === 'REMOTE' ||
            locLower.includes('remote') ||
            locLower === 'india'
          ) {
            metrics.metroCoverage.indiaRemote++;
          }
        } else {
          metrics.indianExperiencedJobs++;
        }
      } else {
        if (isFresher) {
          metrics.internationalFresherJobs++;
        } else {
          metrics.internationalExperiencedJobs++;
        }
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      coverage: metrics,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Fresher coverage query failed');
    res.status(500).json({ error: 'Failed to retrieve fresher coverage metrics' });
  }
}

/**
 * POST /api/jobs/engine/sources/:companyName/scan
 *
 * Triggers an isolated on-demand scan for a specific source company.
 */
export async function triggerSourceScanHandler(req: Request, res: Response): Promise<void> {
  const companyName = String(req.params['companyName'] || '').trim();
  if (!companyName) {
    res.status(400).json({ error: 'Company name parameter is required.' });
    return;
  }

  try {
    const schedulerState = scheduler.getState();
    const matchingJob = schedulerState.jobs.find((j) =>
      j.name.toLowerCase().includes(companyName.toLowerCase())
    );

    if (!matchingJob) {
      res.status(404).json({
        error: `No active collector found for company: "${companyName}".`,
      });
      return;
    }

    // Trigger the scan asynchronously so HTTP response is fast
    scheduler.triggerScan(matchingJob.name).catch((err) => {
      log.error({ companyName, err: String(err) }, 'Manual scan trigger failed in background');
    });

    res.json({
      message: `Scan initiated for ${matchingJob.name}`,
      company: companyName,
      status: 'TRIGGERED',
    });
  } catch (err) {
    log.error({ companyName, err: err instanceof Error ? err.message : String(err) }, 'Manual scan trigger failed');
    res.status(500).json({ error: 'Failed to trigger source scan' });
  }
}

/**
 * POST /api/jobs/engine/lifecycle/trigger
 *
 * Manually trigger the job lifecycle sweep (auto-closes stale jobs > maxActiveDays
 * and prunes unreferenced closed jobs > purgeRetentionDays).
 */
export async function triggerLifecycleSweepHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { runJobLifecycleSweep } = await import('../jobs/job-lifecycle-service.js');
    const result = await runJobLifecycleSweep();
    res.json({
      message: 'Job lifecycle sweep executed successfully',
      ...result,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Lifecycle sweep trigger failed');
    res.status(500).json({ error: 'Failed to execute lifecycle sweep' });
  }
}

/**
 * GET /api/jobs/engine/lifecycle/stats
 *
 * Retrieve job age and lifecycle breakdown statistics.
 */
export async function getLifecycleStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { getJobLifecycleStats } = await import('../jobs/job-lifecycle-service.js');
    const stats = await getJobLifecycleStats();
    res.json(stats);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'Lifecycle stats query failed');
    res.status(500).json({ error: 'Failed to retrieve lifecycle stats' });
  }
}

