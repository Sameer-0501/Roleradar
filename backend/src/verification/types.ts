/**
 * Verification types.
 *
 * Defines the structure of a verification result.
 *
 * IMPORTANT:
 * A VerificationResult must NEVER have verificationStatus = 'VERIFIED'
 * unless ALL required checks passed with real data from the official source.
 *
 * In Phase 1, when no real source data is available, the result is always:
 *   verificationStatus: 'PENDING'
 *
 * A job is VERIFIED only when:
 * 1. The job URL is on the company's official domain.
 * 2. The job exists in the official source system.
 * 3. The external job ID matches.
 * 4. The job title matches within acceptable tolerance.
 * 5. The job is still listed as open/active.
 */

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

/**
 * Result of a single verification attempt on a job candidate.
 * This maps directly to a row inserted into the `job_verifications` table.
 */
export interface VerificationResult {
  verificationStatus: VerificationStatus;

  /** Individual check results (null = check was not performed) */
  domainCheck: boolean | null;
  jobExistsCheck: boolean | null;
  jobIdCheck: boolean | null;
  titleCheck: boolean | null;
  locationCheck: boolean | null;
  statusCheck: boolean | null;
  applyUrlCheck: boolean | null;

  /**
   * Composite score 0.0–1.0.
   * 0.0 = nothing checked or all failed.
   * 1.0 = all checks passed.
   */
  verificationScore: number;

  /**
   * Human-readable reason if verification failed or is pending.
   * null if verified.
   */
  failureReason: string | null;

  /** When the verification was performed */
  checkedAt: Date;

  /**
   * Whether a new history row was persisted to job_verifications.
   * false if write-path deduplication skipped a redundant identical record.
   */
  historyRecorded?: boolean;
}

/**
 * Input to the verification service.
 * Combines the raw candidate data with the company's source config.
 */
export interface VerificationInput {
  jobId: string;
  externalJobId: string;
  title: string;
  location?: string;
  officialUrl: string;
  applyUrl?: string;
  officialDomain: string;
  sourceSystem: string;
  /**
   * ATS-specific board token required for live verification.
   * For Greenhouse: the board slug (e.g. "gitlab").
   * If absent, live checks are skipped and result is PENDING.
   */
  boardToken?: string;
  /**
   * ATS-specific site token required for live verification.
   * For Lever: the site slug (e.g. "palantir").
   * If absent, live checks are skipped and result is PENDING.
   */
  siteToken?: string;
  /**
   * ATS-specific Workday config required for live verification.
   * If absent for Workday sources, live checks are skipped and result is PENDING.
   */
  workdayConfig?: {
    host: string;
    tenant: string;
    clientSite: string;
  };
  /**
   * Ashby source config required for live verification.
   */
  ashbyConfig?: {
    jobBoardName: string;
  };
  /**
   * Workable source config required for live verification.
   */
  workableConfig?: {
    accountSlug: string;
  };
  /**
   * Custom source config required for live verification.
   * If perJobApiEndpointTemplate is provided, queries the authoritative per-job endpoint.
   */
  customConfig?: {
    perJobApiEndpointTemplate?: string;
  };
  /**
   * SmartRecruiters source config required for live verification.
   */
  smartrecruitersConfig?: {
    companyIdentifier: string;
  };
  /**
   * SAP source config required for live verification.
   */
  sapConfig?: {
    apiBaseUrl: string;
  };
}

