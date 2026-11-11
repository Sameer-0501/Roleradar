/**
 * Workday Collector.
 *
 * Discovers job candidates from Workday's Candidate Experience Service (CXS) JSON API.
 * Uses the official structured JSON API — no HTML scraping.
 *
 * Endpoint: POST https://{host}/wday/cxs/{tenant}/{clientSite}/jobs
 * Detail Endpoint: GET https://{host}/wday/cxs/{tenant}/{clientSite}{externalPath}
 *
 * Network safety:
 * - Request timeout enforced (default 10s, configurable)
 * - Up to 2 retries with exponential backoff for 5xx/429
 * - Safe pagination with configurable maximum page cap (default 5 pages)
 * - Fast healthCheck using limit=1
 * - No aggressive polling, no CAPTCHA bypass, no stealth plugins
 *
 * This collector normalizes postings into JobCandidate objects.
 * It does NOT mark jobs as VERIFIED.
 */

import { BaseCollector } from '../base-collector.js';
import { validateJobUrl } from '../url-validator.js';
import { tracedFetch } from '../../utils/http-telemetry.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import type { AtsType } from '../../ats/types.js';

// ─── Workday API Types ────────────────────────────────────────────────────────

interface WorkdayPostingSummary {
  title?: string | null;
  externalPath?: string | null;
  locationsText?: string | null;
  postedOn?: string | null;
  bulletFields?: string[] | null;
}

interface WorkdaySearchResponse {
  total?: number;
  jobPostings?: WorkdayPostingSummary[];
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface WorkdaySourceConfig {
  /** The canonical company name (e.g. "Autodesk") */
  companyName: string;
  /** Workday host domain (e.g. "autodesk.wd1.myworkdayjobs.com") */
  host: string;
  /** Workday tenant name (e.g. "autodesk") */
  tenant: string;
  /** Client site slug (e.g. "Ext" or "NVIDIAExternalCareerSite") */
  clientSite: string;
  /** Authoritative domain for URLs (defaults to host) */
  officialDomain?: string;
  /** HTTP request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Number of jobs per page request (default: 20, max 20 supported by Workday) */
  pageSize?: number;
  /** Maximum number of pages to fetch per scan (default: 5, safety cap) */
  maxPages?: number;
  /** Optional declarative facets to filter CXS search query */
  appliedFacets?: Record<string, string[]>;
  /** Optional source URL (portal base link) */
  sourceUrl?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 5;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch with timeout and exponential backoff retry for transient errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await tracedFetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'KCarrier-JobEngine/2.0 (job-verification-system)',
            ...options.headers,
          },
        }, 'ATS_DISCOVERY');
        clearTimeout(timer);

        // Do not retry on 404 or 4xx client errors (except 429)
        if (response.status === 404) return response;
        if (response.status >= 400 && response.status !== 429 && response.status < 500) {
          return response;
        }

        // Retry on 5xx or 429
        if (response.status >= 500 || response.status === 429) {
          if (attempt < maxRetries) {
            lastError = new Error(`HTTP ${response.status} — will retry`);
            continue;
          }
        }

        return response;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt < maxRetries) continue;
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}

/**
 * Extract external job requisition ID from bulletFields or externalPath.
 * e.g. bulletFields: ['26WD100698'] -> '26WD100698'
 * or /job/Tel-Aviv-ISR/Principal-Experience-Designer_26WD100698 -> '26WD100698'
 */
function extractJobReqId(posting: WorkdayPostingSummary): string | undefined {
  if (posting.bulletFields && Array.isArray(posting.bulletFields) && posting.bulletFields.length > 0) {
    // 1. Look for a bullet that matches an alphanumeric requisition ID token with digits (e.g. JREQ199503, SR-42743, 26WD100698)
    const reqCandidate = posting.bulletFields.find((f: string) => {
      const trimmed = f?.trim();
      return Boolean(trimmed && /^[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed));
    });
    if (reqCandidate) {
      return reqCandidate.trim();
    }
  }

  if (posting.externalPath) {
    const match = posting.externalPath.match(/_([A-Za-z0-9-]+)$/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  if (posting.bulletFields && Array.isArray(posting.bulletFields) && posting.bulletFields.length > 0) {
    const firstBullet = posting.bulletFields[0]?.trim();
    if (firstBullet && firstBullet.length > 0) {
      return firstBullet;
    }
  }

  return undefined;
}

// ─── Workday Collector ────────────────────────────────────────────────────────

export class WorkdayCollector extends BaseCollector {
  private readonly config: Required<WorkdaySourceConfig>;
  private lastScanComplete: boolean = false;
  private lastScanCompletenessReason: string = 'NO_SCAN_PERFORMED';

  constructor(config: WorkdaySourceConfig) {
    super();
    this.config = {
      companyName: config.companyName,
      host: config.host,
      tenant: config.tenant,
      clientSite: config.clientSite,
      officialDomain: config.officialDomain ?? config.host,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      pageSize: config.pageSize ?? DEFAULT_PAGE_SIZE,
      maxPages: config.maxPages ?? DEFAULT_MAX_PAGES,
      appliedFacets: config.appliedFacets ?? {},
      sourceUrl: config.sourceUrl ?? '',
    };
    this.lastScanComplete = !this.hasFacets();
    this.lastScanCompletenessReason = this.hasFacets() ? 'CONFIGURED_FACETS' : 'INITIAL_STATE';
  }

  private hasFacets(): boolean {
    return Boolean(this.config.appliedFacets && Object.keys(this.config.appliedFacets).length > 0);
  }

  /**
   * Returns whether this scan represents an authoritative, 100% complete global scan.
   * If specific facets (e.g. locationCountry) are applied, this is a scoped/partial scan,
   * meaning absent jobs must NOT be closed based on absence from this scan.
   *
   * Following a scan (discoverJobs), this returns true ONLY when:
   * 1. No facets were applied (it is a global scan).
   * 2. No network errors or HTTP errors aborted the scan.
   * 3. The scan fully enumerated all postings (either reached end of listings where postings.length < pageSize,
   *    or cumulative raw postings fetched accounted for total reported jobs).
   * 4. It was NOT truncated by reaching maxPages before exhausting all results.
   */
  isCompleteScan(): boolean {
    if (this.hasFacets()) {
      return false;
    }
    return this.lastScanComplete;
  }

  /**
   * Return detailed diagnostic reason for the last scan's completeness decision.
   */
  getScanCompletenessDetails(): { isComplete: boolean; reason: string } {
    return {
      isComplete: this.isCompleteScan(),
      reason: this.lastScanCompletenessReason,
    };
  }

  getSourceName(): string {
    return `${this.config.companyName} Workday Collector`;
  }

  getSourceType(): AtsType {
    return 'WORKDAY';
  }

  supports(companyName: string): boolean {
    return companyName.toLowerCase() === this.config.companyName.toLowerCase();
  }

  private get searchUrl(): string {
    return `https://${this.config.host}/wday/cxs/${this.config.tenant}/${this.config.clientSite}/jobs`;
  }

  /**
   * Health check for Workday CXS API.
   * Sends a lightweight POST query with limit=1.
   */
  override async healthCheck(): Promise<CollectorHealth> {
    const checkedAt = new Date();
    const startMs = Date.now();

    try {
      const response = await fetchWithRetry(
        this.searchUrl,
        {
          method: 'POST',
          body: JSON.stringify({
            appliedFacets: this.config.appliedFacets ?? {},
            limit: 1,
            offset: 0,
            searchText: '',
          }),
        },
        this.config.timeoutMs,
        0
      );
      const responseTimeMs = Date.now() - startMs;

      if (!response.ok) {
        return {
          healthy: false,
          message: `HTTP ${response.status} from Workday CXS API — tenant "${this.config.tenant}" may not be accessible`,
          checkedAt,
        };
      }

      const data = (await response.json()) as WorkdaySearchResponse;
      if (!data || typeof data !== 'object' || !Array.isArray(data.jobPostings)) {
        return {
          healthy: false,
          message: 'Workday API returned unexpected response format (expected jobPostings array)',
          checkedAt,
        };
      }

      return {
        healthy: true,
        message: `Workday CXS API reachable — ${data.total ?? data.jobPostings.length} total jobs reported — ${responseTimeMs}ms`,
        checkedAt,
      };
    } catch (err) {
      return {
        healthy: false,
        message: `Workday API unreachable: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt,
      };
    }
  }

  /**
   * Discover available job openings from Workday CXS API.
   * Normalizes raw postings to JobCandidate format with safe pagination.
   */
  async discoverJobs(): Promise<JobCandidate[]> {
    this.log.info(
      { host: this.config.host, tenant: this.config.tenant, site: this.config.clientSite },
      'WORKDAY_FETCH starting discovery'
    );

    const candidates: JobCandidate[] = [];
    const seenExternalIds = new Set<string>();
    let rejected = 0;
    let totalRawPostingsFetched = 0;
    let latestReportedTotal: number | undefined = undefined;
    let paginationExhausted = false;
    let pageErrorOccurred = false;
    let errorReason = '';

    // Reset scan completeness state at the start of discovery
    if (this.hasFacets()) {
      this.lastScanComplete = false;
      this.lastScanCompletenessReason = 'CONFIGURED_FACETS';
    } else {
      this.lastScanComplete = false;
      this.lastScanCompletenessReason = 'SCAN_IN_PROGRESS';
    }

    for (let page = 0; page < this.config.maxPages; page++) {
      const offset = page * this.config.pageSize;
      this.log.info({ page: page + 1, offset, maxPages: this.config.maxPages }, 'WORKDAY_FETCH fetching page');

      let searchResponse: WorkdaySearchResponse;
      try {
        const response = await fetchWithRetry(
          this.searchUrl,
          {
            method: 'POST',
            body: JSON.stringify({
              appliedFacets: this.config.appliedFacets ?? {},
              limit: this.config.pageSize,
              offset,
              searchText: '',
            }),
          },
          this.config.timeoutMs
        );

        if (!response.ok) {
          this.log.error(
            { status: response.status, offset },
            'WORKDAY_FETCH HTTP error fetching jobs page'
          );
          pageErrorOccurred = true;
          errorReason = `HTTP_ERROR_${response.status}`;
          break;
        }

        const json = (await response.json()) as unknown;
        if (!json || typeof json !== 'object' || !Array.isArray((json as WorkdaySearchResponse).jobPostings)) {
          this.log.error({ offset }, 'WORKDAY_FETCH malformed response (missing jobPostings)');
          pageErrorOccurred = true;
          errorReason = 'MALFORMED_RESPONSE';
          break;
        }
        searchResponse = json as WorkdaySearchResponse;
      } catch (err) {
        this.log.error(
          { err: err instanceof Error ? err.message : String(err), offset },
          'WORKDAY_FETCH network error fetching jobs page'
        );
        pageErrorOccurred = true;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('HTTP 500')) {
          errorReason = 'HTTP_ERROR_500';
        } else if (msg.includes('HTTP 429')) {
          errorReason = 'HTTP_ERROR_429';
        } else if (msg.includes('timed out')) {
          errorReason = 'TIMEOUT_ERROR';
        } else {
          errorReason = 'NETWORK_ERROR';
        }
        break;
      }

      // Track upstream total (adapting if total shifts dynamically during pagination)
      if (typeof searchResponse.total === 'number') {
        latestReportedTotal = searchResponse.total;
      }

      const postings = searchResponse.jobPostings ?? [];
      totalRawPostingsFetched += postings.length;

      if (postings.length === 0) {
        this.log.info({ page: page + 1 }, 'WORKDAY_FETCH reached end of listings (empty page)');
        paginationExhausted = true;
        break;
      }

      for (const posting of postings) {
        const reqId = extractJobReqId(posting);
        if (!reqId) {
          this.log.warn({ posting }, 'WORKDAY_NORMALIZE rejected: missing job ID/requisition ID');
          rejected++;
          continue;
        }

        if (seenExternalIds.has(reqId)) {
          // Skip intra-scan duplicate
          continue;
        }

        if (!posting.title || typeof posting.title !== 'string' || posting.title.trim().length === 0) {
          this.log.warn({ reqId }, 'WORKDAY_NORMALIZE rejected: missing or empty title');
          rejected++;
          continue;
        }

        if (!posting.externalPath || typeof posting.externalPath !== 'string') {
          this.log.warn({ reqId }, 'WORKDAY_NORMALIZE rejected: missing externalPath');
          rejected++;
          continue;
        }

        // Official URL on the public Workday career site
        const officialUrl = `https://${this.config.host}/${this.config.clientSite}${posting.externalPath}`;
        const urlCheck = validateJobUrl(officialUrl, this.config.officialDomain);
        if (!urlCheck.valid) {
          this.log.warn(
            { reqId, url: officialUrl, reason: urlCheck.reason },
            'WORKDAY_NORMALIZE rejected: URL validation failed'
          );
          rejected++;
          continue;
        }

        const candidate: JobCandidate = {
          externalJobId: reqId,
          title: posting.title.trim(),
          officialUrl,
          sourceSystem: 'WORKDAY',
        };

        if (posting.locationsText && typeof posting.locationsText === 'string') {
          const loc = posting.locationsText.trim();
          if (loc.length > 0) candidate.location = loc;
        } else if (posting.bulletFields && Array.isArray(posting.bulletFields) && posting.bulletFields.length > 0) {
          const fallbackLoc = posting.bulletFields.find((f: string) => {
            const trimmed = f?.trim();
            if (!trimmed) return false;
            if (trimmed === reqId) return false;
            if (posting.title && trimmed.toLowerCase() === posting.title.trim().toLowerCase()) return false;
            return true;
          });
          if (fallbackLoc && typeof fallbackLoc === 'string') {
            const loc = fallbackLoc.trim();
            if (loc.length > 0) candidate.location = loc;
          }
        }

        // postedOn: INFERRED confidence — Workday CXS field approximating employer posting date.
        // Not formally documented by Workday but reliably present and approximately correct.
        if (posting.postedOn && typeof posting.postedOn === 'string') {
          const parsed = new Date(posting.postedOn);
          if (!isNaN(parsed.getTime())) candidate.officialPostedAt = parsed;
        }

        seenExternalIds.add(reqId);
        candidates.push(candidate);
      }

      // Check if pagination reached the natural end of results
      if (postings.length < this.config.pageSize) {
        paginationExhausted = true;
        break;
      }

      // Check if total reported by upstream has been reached or exceeded
      if (latestReportedTotal !== undefined && offset + postings.length >= latestReportedTotal) {
        paginationExhausted = true;
        break;
      }
    }

    // Determine final scan completeness
    if (pageErrorOccurred) {
      this.lastScanComplete = false;
      this.lastScanCompletenessReason = errorReason;
      this.log.warn(
        { reason: errorReason, candidates: candidates.length },
        'WORKDAY_SCAN_INCOMPLETE: scan aborted due to error — marked incomplete for absence safety'
      );
    } else if (this.hasFacets()) {
      this.lastScanComplete = false;
      this.lastScanCompletenessReason = 'CONFIGURED_FACETS';
    } else if (paginationExhausted) {
      this.lastScanComplete = true;
      this.lastScanCompletenessReason = 'FULL_ENUMERATION';
      this.log.info(
        { totalFetched: totalRawPostingsFetched, reportedTotal: latestReportedTotal },
        'WORKDAY_SCAN_COMPLETE: all available postings enumerated'
      );
    } else {
      // Loop finished because page reached maxPages without exhausting pagination
      this.lastScanComplete = false;
      this.lastScanCompletenessReason = 'TRUNCATED_BY_MAX_PAGES';
      this.log.warn(
        {
          maxPages: this.config.maxPages,
          pageSize: this.config.pageSize,
          totalFetched: totalRawPostingsFetched,
          reportedTotal: latestReportedTotal,
        },
        'WORKDAY_SCAN_TRUNCATED: maxPages cap reached before exhausting all jobs — marked incomplete for absence safety'
      );
    }

    this.log.info(
      { accepted: candidates.length, rejected, totalDiscovered: candidates.length, isCompleteScan: this.isCompleteScan() },
      'WORKDAY_NORMALIZE discovery complete'
    );

    return candidates;
  }
}
