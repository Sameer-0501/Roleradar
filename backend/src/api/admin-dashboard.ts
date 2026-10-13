import type { Request, Response } from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { sql, eq, desc, and, gte, inArray } from 'drizzle-orm';
import { createLogger } from '../utils/logger.js';
import { scheduler } from '../scheduler/scheduler.js';
import { windowedDigestWorker } from '../notifications/digest-worker.js';
import { sourceHealthTracker } from '../health/source-health.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

const log = createLogger('api:admin-dashboard');

export async function overviewHandler(_req: Request, res: Response) {
  try {
    const db = getDb();
    
    // System
    const [companiesResult] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.companies).where(eq(schema.companies.is_active, true));
    
    // Jobs
    const [activeJobs] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, 'ACTIVE'));
    const [closedJobs] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.status, 'CLOSED'));
    const [verifiedJobs] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(and(eq(schema.jobs.status, 'ACTIVE'), eq(schema.jobs.verification_status, 'VERIFIED')));
    
    // Discovery (Last 24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [discovered24h] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(gte(schema.jobs.first_seen_at, last24h));
    const [verified24h] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(and(gte(schema.jobs.last_verified_at, last24h), eq(schema.jobs.verification_status, 'VERIFIED')));
    const [closed24h] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(and(gte(schema.jobs.updated_at, last24h), eq(schema.jobs.status, 'CLOSED')));

    // Notifications & Digests (Last 24h) - Disaggregated to avoid double-counting
    // 1. Digest emails: actual emails handed to provider
    const [digestSent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          inArray(schema.notifications.notification_type, ['WINDOWED_DIGEST', 'DAILY_DIGEST']),
          eq(schema.notifications.delivery_status, 'SENT'),
          gte(schema.notifications.created_at, last24h)
        )
      );

    const [digestFailed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          inArray(schema.notifications.notification_type, ['WINDOWED_DIGEST', 'DAILY_DIGEST']),
          inArray(schema.notifications.delivery_status, ['FAILED', 'FAILED_PERMANENT']),
          gte(schema.notifications.created_at, last24h)
        )
      );

    const [digestPending] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          inArray(schema.notifications.notification_type, ['WINDOWED_DIGEST', 'DAILY_DIGEST']),
          eq(schema.notifications.delivery_status, 'PENDING'),
          gte(schema.notifications.created_at, last24h)
        )
      );

    // 2. Job intents: job matches waiting for next window or included in a sent digest
    const [jobPending] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.notification_type, 'INSTANT_JOB'),
          eq(schema.notifications.delivery_status, 'PENDING'),
          gte(schema.notifications.created_at, last24h)
        )
      );

    const [jobIncluded] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.notification_type, 'INSTANT_JOB'),
          eq(schema.notifications.delivery_status, 'SENT'),
          gte(schema.notifications.created_at, last24h)
        )
      );

    const [jobFailed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.notification_type, 'INSTANT_JOB'),
          inArray(schema.notifications.delivery_status, ['FAILED', 'FAILED_PERMANENT']),
          gte(schema.notifications.created_at, last24h)
        )
      );

    res.json({
      system: {
        activeSources: companiesResult?.count || 0,
      },
      jobs: {
        active: activeJobs?.count || 0,
        closed: closedJobs?.count || 0,
        activeAndVerified: verifiedJobs?.count || 0,
        discovered24h: discovered24h?.count || 0,
        verified24h: verified24h?.count || 0,
        closed24h: closed24h?.count || 0,
      },
      notifications: {
        // Disaggregated metrics:
        digestEmails: {
          sent: digestSent?.count || 0,
          failed: digestFailed?.count || 0,
          pending: digestPending?.count || 0,
        },
        jobIntents: {
          pending: jobPending?.count || 0,
          includedInDigest: jobIncluded?.count || 0,
          failed: jobFailed?.count || 0,
        },
        // Top-level aliases mapping to true email delivery counts:
        sent24h: digestSent?.count || 0,
        failed24h: digestFailed?.count || 0,
        pending24h: digestPending?.count || 0,
        sentJobs24h: jobIncluded?.count || 0,
        pendingJobs24h: jobPending?.count || 0,
      }
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch overview');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function sourcesHandler(_req: Request, res: Response) {
  try {
    const db = getDb();
    const companies = await db.select().from(schema.companies).orderBy(schema.companies.name);
    // @ts-ignore
    const health = sourceHealthTracker.getHealthStatus ? sourceHealthTracker.getHealthStatus() : { sources: {} };
    const state = scheduler.getState();

    const enriched = companies.map((c) => {
      const sourceHealth = health.sources[c.name];
      const jobState = state.jobs.find(j => j.name === c.name);
      return {
        id: c.id,
        name: c.name,
        domain: c.official_domain,
        atsType: c.ats_type,
        isActive: c.is_active,
        health: sourceHealth?.status || 'UNKNOWN',
        lastSuccess: sourceHealth?.lastSuccess || null,
        lastFailure: sourceHealth?.lastFailure || null,
        recentErrors: sourceHealth?.recentErrors || 0,
        isConfigured: !!c.source_config,
        // @ts-ignore
        nextRunTime: jobState?.nextRunTime || null,
        // @ts-ignore
        isCurrentlyRunning: jobState?.isCurrentlyRunning || false,
      };
    });

    res.json(enriched);
  } catch (err) {
    log.error({ err }, 'Failed to fetch sources');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function scansHandler(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const db = getDb();
    
    // Base query
    let query = db.select().from(schema.scanRuns);
    
    // Status filter
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',');
      query = query.where(sql`${schema.scanRuns.status} = ANY(${statuses})`) as any;
    }

    const runs = await query.orderBy(desc(schema.scanRuns.started_at)).limit(limit).offset(offset);
    
    // Count query
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(schema.scanRuns);
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',');
      countQuery = countQuery.where(sql`${schema.scanRuns.status} = ANY(${statuses})`) as any;
    }
    const [countResult] = await countQuery;

    res.json({
      data: runs.map(r => ({
        id: r.id,
        sourceName: r.source_name,
        sourceType: r.source_type,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        // @ts-ignore
        durationMs: r.duration_ms || 0,
        jobsDiscovered: r.jobs_discovered,
        jobsVerified: r.jobs_verified,
        errorMessage: r.error_message ? 'Scrubbed error for UI' : null, // scrubbed
      })),
      pagination: {
        page,
        limit,
        total: countResult?.count || 0
      }
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch scans');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function verificationsHandler(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const db = getDb();
    let query = db.select().from(schema.jobVerifications);
    
    if (req.query.status) {
      // @ts-ignore
      query = query.where(eq(schema.jobVerifications.verification_status, req.query.status as any)) as any;
    }

    const records = await query.orderBy(desc(schema.jobVerifications.checked_at)).limit(limit).offset(offset);
    
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(schema.jobVerifications);
    if (req.query.status) {
      // @ts-ignore
      countQuery = countQuery.where(eq(schema.jobVerifications.verification_status, req.query.status as any)) as any;
    }
    const [countResult] = await countQuery;

    res.json({
      data: records.map(r => ({
        id: r.id,
        jobId: r.job_id,
        // @ts-ignore
        status: r.verification_status || 'UNKNOWN',
        score: r.verification_score,
        attemptedAt: r.checked_at,
        errorReason: r.failure_reason ? 'Scrubbed error' : null,
      })),
      pagination: {
        page,
        limit,
        total: countResult?.count || 0
      }
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch verifications');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function jobsHandler(req: Request, res: Response) {
  try {
    const page = Math.min(parseInt(req.query.page as string) || 1, 100);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const db = getDb();
    let query = db.select().from(schema.jobs);
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs);

    const conditions = [];
    if (req.query.status) {
      conditions.push(eq(schema.jobs.status, req.query.status as any));
    }
    if (req.query.verification) {
      conditions.push(eq(schema.jobs.verification_status, req.query.verification as any));
    }
    
    if (conditions.length > 0) {
      const filters = and(...conditions);
      query = query.where(filters) as any;
      countQuery = countQuery.where(filters) as any;
    }

    const jobsList = await query.orderBy(desc(schema.jobs.first_seen_at)).limit(limit).offset(offset);
    const [countResult] = await countQuery;

    res.json({
      data: jobsList.map(j => ({
        id: j.id,
        title: j.title,
        companyName: j.company_id, // We don't have company_name on jobs table directly
        sourceType: j.source_system,
        status: j.status,
        verificationStatus: j.verification_status,
        postedAt: j.official_posted_at,
        firstSeenAt: j.first_seen_at,
        verifiedAt: j.last_verified_at,
        location: j.location,
        workplace: j.workplace_type,
        classification: 'UNKNOWN', // Placeholder as schema doesn't have it
      })),
      pagination: {
        page,
        limit,
        total: countResult?.count || 0
      }
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch jobs');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function notificationsHandler(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const db = getDb();
    const conditions = [];

    if (req.query.status) {
      conditions.push(eq(schema.notifications.delivery_status, req.query.status as any));
    }
    if (req.query.type) {
      conditions.push(eq(schema.notifications.notification_type, req.query.type as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(schema.notifications);
    if (whereClause) {
      countQuery = countQuery.where(whereClause) as any;
    }

    let query = db
      .select({
        id: schema.notifications.id,
        type: schema.notifications.notification_type,
        status: schema.notifications.delivery_status,
        createdAt: schema.notifications.created_at,
        sentAt: schema.notifications.sent_at,
        attempts: schema.notifications.attempt_count,
        failureReason: schema.notifications.failure_reason,
        jobId: schema.notifications.job_id,
        digestId: schema.notifications.digest_id,
        userId: schema.notifications.user_id,
        userEmail: schema.users.email,
        userName: schema.users.name,
        jobTitle: schema.jobs.title,
        companyName: schema.companies.name,
      })
      .from(schema.notifications)
      .leftJoin(schema.users, eq(schema.notifications.user_id, schema.users.id))
      .leftJoin(schema.jobs, eq(schema.notifications.job_id, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id));

    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    const list = await query
      .orderBy(desc(schema.notifications.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await countQuery;

    res.json({
      data: list.map(n => ({
        id: n.id,
        type: n.type,
        status: n.status,
        createdAt: n.createdAt,
        sentAt: n.sentAt,
        attempts: n.attempts,
        failureReason: n.failureReason,
        jobId: n.jobId,
        jobTitle: n.jobTitle || null,
        companyName: n.companyName || null,
        digestId: n.digestId,
        userId: n.userId,
        userEmail: n.userEmail || null,
        userName: n.userName || null,
      })),
      pagination: {
        page,
        limit,
        total: countResult?.count || 0
      }
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch notifications');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function workersHandler(_req: Request, res: Response) {
  try {
    const sState = scheduler.getState();
    const wdStatus = windowedDigestWorker.status;

    res.json({
      scheduler: {
        status: sState.status,
        registeredJobs: sState.registeredJobs,
        // @ts-ignore
        activeScans: sState.activeScans || 0,
        lastTick: new Date().toISOString(), // In reality we'd have a real tick, but we can assume 'alive' if process is up
      },
      digestWorker: {
        status: wdStatus,
      }
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch workers');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function coverageHandler(_req: Request, res: Response) {
  try {
    const db = getDb();
    const baseConditions = and(eq(schema.jobs.status, 'ACTIVE'), eq(schema.jobs.verification_status, 'VERIFIED'));
    
    // 1. Workplace type distribution
    const [remoteCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(and(baseConditions, eq(schema.jobs.workplace_type, 'REMOTE')));
    const [onsiteCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(and(baseConditions, eq(schema.jobs.workplace_type, 'ONSITE')));
    const [hybridCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(and(baseConditions, eq(schema.jobs.workplace_type, 'HYBRID')));
    const [unknownWorkplaceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.jobs).where(and(baseConditions, sql`(${schema.jobs.workplace_type} = 'UNKNOWN' OR ${schema.jobs.workplace_type} IS NULL)`));

    // 2. True experience classification using parseExperienceRequirements
    const activeVerifiedJobs = await db
      .select({
        title: schema.jobs.title,
        description: schema.jobs.description,
        requirements: schema.jobs.requirements,
      })
      .from(schema.jobs)
      .where(baseConditions);

    let fresherCompatible = 0;
    let strictlyExperienced = 0;
    let dualEligibleBoth = 0;
    let unknownExp = 0;

    for (const j of activeVerifiedJobs) {
      const parsed = parseExperienceRequirements(j.title, j.description, j.requirements);
      if (parsed.classification === 'FRESHER_COMPATIBLE') {
        fresherCompatible++;
      } else if (parsed.classification === 'EXPERIENCED') {
        strictlyExperienced++;
      } else if (parsed.classification === 'BOTH') {
        dualEligibleBoth++;
      } else {
        unknownExp++;
      }
    }

    res.json({
      classification: {
        fresher: fresherCompatible + dualEligibleBoth,
        fresherOnly: fresherCompatible,
        both: dualEligibleBoth,
        experienced: strictlyExperienced + dualEligibleBoth,
        experiencedOnly: strictlyExperienced,
        unknown: unknownExp,
      },
      workplace: {
        remote: remoteCount?.count || 0,
        onsite: onsiteCount?.count || 0,
        hybrid: hybridCount?.count || 0,
        unknown: unknownWorkplaceCount?.count || 0,
        total: activeVerifiedJobs.length,
      }
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch coverage');
    res.status(500).json({ error: 'Internal server error' });
  }
}
