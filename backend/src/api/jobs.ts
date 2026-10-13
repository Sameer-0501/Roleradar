/**
 * Jobs API handlers.
 *
 * Read-only endpoints for inspecting collected and verified jobs.
 * No write operations. No secrets exposed.
 *
 * Endpoints:
 *   GET /api/jobs          — paginated job list
 *   GET /api/jobs/verified — only ACTIVE + VERIFIED jobs
 *   GET /api/jobs/:id      — single job by UUID with freshness & verification audit
 */

import type { Request, Response } from 'express';
import { eq, and, desc, gte, or, isNull } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { evaluateJobFreshness } from '../matching/relevance/freshness-evaluator.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

const log = createLogger('api:jobs');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
export const MAX_JOB_VERIFICATIONS_LIMIT = 20;

/**
 * GET /api/jobs
 *
 * Returns a paginated list of all jobs, newest first.
 * Query params:
 *   limit  - max results (default 50, max 100)
 *   offset - for pagination (default 0)
 *   days   - optional filter: jobs posted or detected within the last N days
 *   status - optional filter by job status (e.g. ACTIVE, CLOSED)
 */
export async function listJobsHandler(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(
      parseInt(String(req.query['limit'] ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const offset = parseInt(String(req.query['offset'] ?? 0), 10) || 0;
    const daysParam = parseInt(String(req.query['days'] ?? ''), 10);
    const statusParam = req.query['status'] as any;

    const conditions: any[] = [];
    if (statusParam) {
      conditions.push(eq(schema.jobs.status, statusParam));
    }
    if (!isNaN(daysParam) && daysParam > 0) {
      const windowStart = new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000);
      conditions.push(
        or(
          gte(schema.jobs.official_posted_at, windowStart),
          and(isNull(schema.jobs.official_posted_at), gte(schema.jobs.first_seen_at, windowStart))
        )!
      );
    }

    const db = getDb();
    let query = db
      .select({
        id: schema.jobs.id,
        title: schema.jobs.title,
        location: schema.jobs.location,
        employment_type: schema.jobs.employment_type,
        official_url: schema.jobs.official_url,
        status: schema.jobs.status,
        verification_status: schema.jobs.verification_status,
        source_system: schema.jobs.source_system,
        first_seen_at: schema.jobs.first_seen_at,
        last_seen_at: schema.jobs.last_seen_at,
        last_verified_at: schema.jobs.last_verified_at,
        official_posted_at: schema.jobs.official_posted_at,
        company_id: schema.jobs.company_id,
        company_name: schema.companies.name,
      })
      .from(schema.jobs)
      .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
      .orderBy(desc(schema.jobs.first_seen_at))
      .limit(limit)
      .offset(offset);

    const jobs = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    res.json({
      jobs,
      pagination: { limit, offset, count: jobs.length },
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'listJobsHandler error');
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}

/**
 * GET /api/jobs/verified
 *
 * Returns only jobs that are ACTIVE and VERIFIED.
 * Query params:
 *   limit  - max results (default 50, max 100)
 *   offset - for pagination (default 0)
 *   days   - optional filter: jobs posted or detected within the last N days (e.g. 14)
 */
export async function listVerifiedJobsHandler(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(
      parseInt(String(req.query['limit'] ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const offset = parseInt(String(req.query['offset'] ?? 0), 10) || 0;
    const daysParam = parseInt(String(req.query['days'] ?? ''), 10);

    const conditions: any[] = [
      eq(schema.jobs.status, 'ACTIVE'),
      eq(schema.jobs.verification_status, 'VERIFIED'),
    ];

    if (!isNaN(daysParam) && daysParam > 0) {
      const windowStart = new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000);
      conditions.push(
        or(
          gte(schema.jobs.official_posted_at, windowStart),
          and(isNull(schema.jobs.official_posted_at), gte(schema.jobs.first_seen_at, windowStart))
        )!
      );
    }

    const db = getDb();
    const jobs = await db
      .select({
        id: schema.jobs.id,
        title: schema.jobs.title,
        location: schema.jobs.location,
        employment_type: schema.jobs.employment_type,
        official_url: schema.jobs.official_url,
        status: schema.jobs.status,
        verification_status: schema.jobs.verification_status,
        source_system: schema.jobs.source_system,
        first_seen_at: schema.jobs.first_seen_at,
        last_verified_at: schema.jobs.last_verified_at,
        official_posted_at: schema.jobs.official_posted_at,
        company_id: schema.jobs.company_id,
        company_name: schema.companies.name,
      })
      .from(schema.jobs)
      .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
      .where(and(...conditions))
      .orderBy(desc(schema.jobs.last_verified_at))
      .limit(limit)
      .offset(offset);

    res.json({
      jobs,
      pagination: { limit, offset, count: jobs.length },
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'listVerifiedJobsHandler error'
    );
    res.status(500).json({ error: 'Failed to fetch verified jobs' });
  }
}

/**
 * GET /api/jobs/:id
 *
 * Returns a single job by UUID, including its verification history and freshness.
 */
export async function getJobByIdHandler(req: Request, res: Response): Promise<void> {
  const id = req.params['id'];

  if (!id || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: 'Invalid job ID format' });
    return;
  }

  try {
    const db = getDb();

    const [row] = await db
      .select({
        job: schema.jobs,
        companyName: schema.companies.name,
        companyCareersUrl: schema.companies.careers_url,
      })
      .from(schema.jobs)
      .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
      .where(eq(schema.jobs.id, id))
      .limit(1);

    if (!row || !row.job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = row.job;
    const freshness = evaluateJobFreshness(
      job.first_seen_at,
      job.last_verified_at,
      job.official_posted_at
    );

    const parsedExp = parseExperienceRequirements(
      job.title,
      job.description,
      job.requirements
    );

    // Return verification history (audit log) — bounded to the 20 most recent records
    const verifications = await db
      .select({
        id: schema.jobVerifications.id,
        checked_at: schema.jobVerifications.checked_at,
        domain_check: schema.jobVerifications.domain_check,
        job_exists_check: schema.jobVerifications.job_exists_check,
        job_id_check: schema.jobVerifications.job_id_check,
        title_check: schema.jobVerifications.title_check,
        location_check: schema.jobVerifications.location_check,
        status_check: schema.jobVerifications.status_check,
        apply_url_check: schema.jobVerifications.apply_url_check,
        verification_score: schema.jobVerifications.verification_score,
        failure_reason: schema.jobVerifications.failure_reason,
      })
      .from(schema.jobVerifications)
      .where(eq(schema.jobVerifications.job_id, id))
      .orderBy(desc(schema.jobVerifications.checked_at), desc(schema.jobVerifications.id))
      .limit(MAX_JOB_VERIFICATIONS_LIMIT);

    res.json({
      job: {
        ...job,
        company_name: row.companyName,
        company_careers_url: row.companyCareersUrl,
        freshness_state: freshness.state,
        freshness_reason: freshness.reason,
        days_since_discovered: freshness.daysSinceDiscovered,
        days_since_verified: freshness.daysSinceVerified,
        experience_classification: parsedExp.classification,
        experience_reason: parsedExp.reason,
      },
      verifications,
    });
  } catch (err) {
    log.error(
      { id, err: err instanceof Error ? err.message : String(err) },
      'getJobByIdHandler error'
    );
    res.status(500).json({ error: 'Failed to fetch job' });
  }
}
