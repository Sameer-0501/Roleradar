/**
 * Job Pipeline Orchestrator.
 *
 * Connects discovery → URL validation → persistence → verification → status update → absence reconciliation.
 *
 * Called by the scheduler after a collector returns its candidates.
 * Each step is explicitly ordered and logged for observability.
 *
 * Pipeline for each candidate:
 *   1. Validate official URL (reject if invalid — no silent repair)
 *   2. Upsert the job (insert new or update existing)
 *   3. Mark as VERIFYING
 *   4. Run real verification checks
 *   5. Update job status based on verification result:
 *        VERIFIED  → ACTIVE
 *        FAILED    → VERIFICATION_FAILED or CLOSED (if 404)
 *        PENDING   → leave as VERIFYING (retry next scan)
 *   6. Absence reconciliation:
 *        Only runs if isCompleteScan === true (authoritative 100% complete scan).
 *        Safely marks jobs closed that were removed from the ATS.
 *
 * Closed-job safety:
 *   - Temporary HTTP 5xx, timeouts, or network failures do NOT close jobs.
 *   - Only an authoritative HTTP 404 or a confirmed complete scan absence triggers CLOSED.
 *   - This conservative policy prevents accidental mass-closures during outages.
 */

import { createLogger } from '../utils/logger.js';
import { validateJobUrl } from '../collectors/url-validator.js';
import {
  upsertDiscoveredJob,
  markJobVerifying,
  markJobActive,
  markJobVerificationFailed,
  markJobClosed,
  reconcileAbsentJobs,
} from '../jobs/job-service.js';
import { verifyJob } from '../verification/verification-service.js';
import { evaluateAndCreateInstantAlerts } from '../notifications/alert-service.js';
import type { JobCandidate } from '../collectors/types.js';

const log = createLogger('pipeline');

export interface PipelineSourceConfig {
  officialDomain: string;
  boardToken?: string;
  siteToken?: string;
  workdayConfig?: {
    host: string;
    tenant: string;
    clientSite: string;
  };
  ashbyConfig?: {
    jobBoardName: string;
  };
  workableConfig?: {
    accountSlug: string;
  };
  customConfig?: {
    perJobApiEndpointTemplate?: string;
  };
  smartrecruitersConfig?: {
    companyIdentifier: string;
  };
  sapConfig?: {
    apiBaseUrl: string;
  };
  sourceSystem: string;
}

export interface PipelineStats {
  total: number;
  verified: number;
  failed: number;
  pending: number;
  skipped: number;
  closed: number;
}

export interface PipelineOptions {
  /**
   * Which discovery path triggered this pipeline run.
   * Stored on notification records for observability and email wording.
   * Defaults to 'NEW_JOB' when not provided.
   */
  discoveryReason?: 'NEW_JOB' | 'RECENT_JOB';
}

/**
 * Run the full job collection pipeline for a set of discovered candidates.
 *
 * @param candidates     - Normalized job candidates from a collector
 * @param companyId      - UUID of the company record in the `companies` table
 * @param config         - Source configuration for this company
 * @param isCompleteScan - Whether this scan was authoritatively 100% complete
 * @param options        - Additional pipeline options (e.g. discoveryReason)
 * @returns Pipeline statistics (counts per outcome)
 */
export async function runPipeline(
  candidates: JobCandidate[],
  companyId: string,
  config: PipelineSourceConfig,
  isCompleteScan: boolean = false,
  options: PipelineOptions = {}
): Promise<PipelineStats> {
  const stats: PipelineStats = {
    total: candidates.length,
    verified: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    closed: 0,
  };

  log.info(
    { companyId, count: candidates.length, source: config.sourceSystem, isCompleteScan },
    'PIPELINE_STARTED'
  );

  const presentJobIds = new Set<string>();

  for (const candidate of candidates) {
    presentJobIds.add(candidate.externalJobId);

    // Step 1: URL validation — reject before touching the database
    const urlCheck = validateJobUrl(candidate.officialUrl, config.officialDomain);
    if (!urlCheck.valid) {
      log.warn(
        {
          externalJobId: candidate.externalJobId,
          url: candidate.officialUrl,
          reason: urlCheck.reason,
        },
        'PIPELINE_SKIP URL validation failed — candidate rejected'
      );
      stats.skipped++;
      continue;
    }

    // Step 2: Upsert into the database
    let jobId: string;
    try {
      const result = await upsertDiscoveredJob(candidate, companyId);
      jobId = result.jobId;
    } catch (err) {
      log.error(
        {
          externalJobId: candidate.externalJobId,
          err: err instanceof Error ? err.message : String(err),
        },
        'PIPELINE_ERROR failed to upsert job — skipping'
      );
      stats.skipped++;
      continue;
    }

    // Step 3: Mark as VERIFYING
    try {
      await markJobVerifying(jobId);
    } catch (err) {
      log.error(
        { jobId, err: err instanceof Error ? err.message : String(err) },
        'PIPELINE_ERROR failed to mark job VERIFYING — skipping verification'
      );
      stats.skipped++;
      continue;
    }

    // Step 4: Verify
    let verificationResult;
    try {
      verificationResult = await verifyJob({
        jobId,
        externalJobId: candidate.externalJobId,
        title: candidate.title,
        location: candidate.location,
        officialUrl: candidate.officialUrl,
        applyUrl: candidate.applyUrl,
        officialDomain: config.officialDomain,
        sourceSystem: config.sourceSystem,
        boardToken: config.boardToken,
        siteToken: config.siteToken,
        workdayConfig: config.workdayConfig,
        ashbyConfig: config.ashbyConfig,
        workableConfig: config.workableConfig,
        customConfig: config.customConfig,
        smartrecruitersConfig: config.smartrecruitersConfig,
        sapConfig: config.sapConfig,
      });
    } catch (err) {
      log.error(
        { jobId, err: err instanceof Error ? err.message : String(err) },
        'PIPELINE_ERROR verification threw unexpectedly — treating as PENDING'
      );
      stats.pending++;
      continue;
    }

    // Step 5: Update job status based on result
    try {
      if (verificationResult.verificationStatus === 'VERIFIED') {
        await markJobActive(jobId);
        stats.verified++;
        log.info(
          { jobId, title: candidate.title },
          'PIPELINE_VERIFIED job is now ACTIVE'
        );

        // Asynchronously evaluate and trigger instant job alerts for matching users.
        // Passes discoveryReason so the notification record stores which path triggered it.
        void evaluateAndCreateInstantAlerts(jobId, { discoveryReason: options.discoveryReason ?? 'NEW_JOB' }).catch((err: unknown) => {
          log.error(
            { jobId, err: err instanceof Error ? err.message : String(err) },
            'ALERT_TRIGGER_ERROR failed to evaluate instant alerts'
          );
        });
      } else if (verificationResult.verificationStatus === 'FAILED') {
        const isConfirmedClosed =
          verificationResult.jobExistsCheck === false &&
          verificationResult.failureReason?.includes('404');

        if (isConfirmedClosed) {
          await markJobClosed(jobId);
          stats.closed++;
          log.info(
            { jobId, title: candidate.title },
            'PIPELINE_CLOSED job confirmed removed by authoritative source (404)'
          );
        } else {
          await markJobVerificationFailed(
            jobId,
            verificationResult.failureReason ?? 'Verification checks failed'
          );
        }
        stats.failed++;
      } else {
        // PENDING — leave as VERIFYING; will be retried on next scan
        stats.pending++;
        log.info(
          { jobId, title: candidate.title, reason: verificationResult.failureReason },
          'PIPELINE_PENDING verification incomplete — will retry next scan'
        );
      }
    } catch (err) {
      log.error(
        { jobId, err: err instanceof Error ? err.message : String(err) },
        'PIPELINE_ERROR failed to update job status after verification'
      );
    }
  }

  // Step 6: Absence Reconciliation (Safety-Gated)
  if (isCompleteScan) {
    try {
      const reconciliation = await reconcileAbsentJobs(
        companyId,
        config.sourceSystem,
        presentJobIds,
        true
      );
      stats.closed += reconciliation.closed;
    } catch (err) {
      log.error(
        { companyId, source: config.sourceSystem, err: err instanceof Error ? err.message : String(err) },
        'PIPELINE_ABSENCE_ERROR reconciliation failed'
      );
    }
  }

  log.info(
    {
      total: stats.total,
      verified: stats.verified,
      failed: stats.failed,
      pending: stats.pending,
      skipped: stats.skipped,
      closed: stats.closed,
    },
    'PIPELINE_COMPLETED'
  );

  return stats;
}
