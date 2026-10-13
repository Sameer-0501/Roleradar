/**
 * Greenhouse Collector — GitLab source.
 *
 * Discovers job candidates from Greenhouse's public board API.
 * Uses the official structured JSON API — no HTML scraping.
 *
 * API: https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs?content=true
 *
 * Each call returns the full list of currently active jobs for the board.
 * The Greenhouse API does not paginate the jobs list — it returns all active
 * postings in a single response.
 *
 * Network safety:
 * - Request timeout enforced (default 10s, configurable)
 * - Up to 2 retries with exponential backoff
 * - No aggressive polling
 * - No CAPTCHA bypass, no anti-bot measures
 *
 * This collector does NOT mark any job VERIFIED. That is the job of the
 * verification service, which runs separately.
 */

import { BaseCollector } from '../base-collector.js';
import { validateJobUrl } from '../url-validator.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import type { AtsType } from '../../ats/types.js';

// ─── Greenhouse API types ─────────────────────────────────────────────────────

interface GreenhouseLocation {
  name: string | null;
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: GreenhouseLocation | null;
  first_published: string | null;
  content: string | null;
  updated_at: string | null;
}

interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta?: { total: number };
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface GreenhouseSourceConfig {
  /**
   * The Greenhouse board token (slug) for this company.
   * Example: "gitlab" → https://boards-api.greenhouse.io/v1/boards/gitlab/
   */
  boardToken: string;
  /** The canonical company name (for logging) */
  companyName: string;
  /**
   * The authoritative domain that all job URLs must belong to.
   * For most Greenhouse boards: "job-boards.greenhouse.io"
   */
  officialDomain: string;
  /**
   * HTTP request timeout in milliseconds.
   * Default: 10000 (10 seconds)
   */
  timeoutMs?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GREENHOUSE_API_BASE = 'https://boards-api.greenhouse.io/v1/boards';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode common HTML entities to plain text.
 * Used to convert Greenhouse's HTML `content` field to plain text.
 *
 * This is intentionally a simple implementation — no parser dependency.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Fetch with a timeout and simple exponential backoff retries.
 *
 * Only retries on transient failures (network errors, 5xx, 429).
 * Does NOT retry on 404 — that is an authoritative response.
 */
async function fetchWithRetry(
  url: string,
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
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'KCarrier-JobEngine/2.0 (job-verification-system)',
          },
        });
        clearTimeout(timer);

        // Don't retry on 404 or 4xx client errors (except 429 rate limit)
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

// ─── Greenhouse Collector ─────────────────────────────────────────────────────

export class GreenhouseCollector extends BaseCollector {
  private readonly config: Required<GreenhouseSourceConfig>;

  constructor(config: GreenhouseSourceConfig) {
    super();
    this.config = {
      boardToken: config.boardToken,
      companyName: config.companyName,
      officialDomain: config.officialDomain,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  getSourceName(): string {
    return `${this.config.companyName} Greenhouse Collector`;
  }

  getSourceType(): AtsType {
    return 'GREENHOUSE';
  }

  supports(companyName: string): boolean {
    return companyName.toLowerCase() === this.config.companyName.toLowerCase();
  }

  /**
   * Check whether the Greenhouse board API is reachable and returning data.
   *
   * Makes a real HTTP GET to the board jobs endpoint and verifies:
   * - HTTP 200 response
   * - Response contains a `jobs` array
   */
  override async healthCheck(): Promise<CollectorHealth> {
    const url = `${GREENHOUSE_API_BASE}/${this.config.boardToken}/jobs`;
    const checkedAt = new Date();
    const startMs = Date.now();

    try {
      const response = await fetchWithRetry(url, this.config.timeoutMs, 0); // no retries for health
      const responseTimeMs = Date.now() - startMs;

      if (!response.ok) {
        return {
          healthy: false,
          message: `HTTP ${response.status} from Greenhouse API — board "${this.config.boardToken}" may not exist`,
          checkedAt,
        };
      }

      const data = (await response.json()) as unknown;
      if (
        typeof data !== 'object' ||
        data === null ||
        !Array.isArray((data as GreenhouseJobsResponse).jobs)
      ) {
        return {
          healthy: false,
          message: 'Greenhouse API returned unexpected response format',
          checkedAt,
        };
      }

      const jobCount = (data as GreenhouseJobsResponse).jobs.length;
      return {
        healthy: true,
        message: `Greenhouse API reachable — ${jobCount} jobs listed — ${responseTimeMs}ms`,
        checkedAt,
      };
    } catch (err) {
      return {
        healthy: false,
        message: `Greenhouse API unreachable: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt,
      };
    }
  }

  /**
   * Discover all currently active job postings from the Greenhouse board.
   *
   * Fetches the jobs list, normalizes each posting into a JobCandidate,
   * validates the official URL, and rejects any posting that fails validation.
   *
   * Does NOT mark any job as VERIFIED — that happens in the verification service.
   */
  async discoverJobs(): Promise<JobCandidate[]> {
    const url = `${GREENHOUSE_API_BASE}/${this.config.boardToken}/jobs?content=true`;
    this.log.info({ url, board: this.config.boardToken }, 'GH_FETCH fetching jobs list');

    let rawData: GreenhouseJobsResponse;
    try {
      const response = await fetchWithRetry(url, this.config.timeoutMs);
      if (!response.ok) {
        this.log.error(
          { status: response.status, url },
          'GH_FETCH HTTP error fetching jobs list'
        );
        return [];
      }
      rawData = (await response.json()) as GreenhouseJobsResponse;
    } catch (err) {
      this.log.error(
        { err: err instanceof Error ? err.message : String(err), url },
        'GH_FETCH network error fetching jobs list'
      );
      return [];
    }

    if (!Array.isArray(rawData.jobs)) {
      this.log.error({ url }, 'GH_FETCH response has no jobs array — malformed response');
      return [];
    }

    this.log.info(
      { count: rawData.jobs.length, board: this.config.boardToken },
      'GH_FETCH raw job count'
    );

    const candidates: JobCandidate[] = [];
    let rejected = 0;

    for (const job of rawData.jobs) {
      // Must have numeric ID
      if (!job.id || typeof job.id !== 'number') {
        this.log.warn({ job }, 'GH_NORMALIZE rejected: missing or invalid id');
        rejected++;
        continue;
      }

      // Must have non-empty title
      if (!job.title || typeof job.title !== 'string' || job.title.trim().length === 0) {
        this.log.warn({ jobId: job.id }, 'GH_NORMALIZE rejected: missing or empty title');
        rejected++;
        continue;
      }

      // Must have official URL
      if (!job.absolute_url || typeof job.absolute_url !== 'string') {
        this.log.warn({ jobId: job.id }, 'GH_NORMALIZE rejected: missing absolute_url');
        rejected++;
        continue;
      }

      // URL validation
      const urlCheck = validateJobUrl(job.absolute_url, this.config.officialDomain);
      if (!urlCheck.valid) {
        this.log.warn(
          { jobId: job.id, url: job.absolute_url, reason: urlCheck.reason },
          'GH_NORMALIZE rejected: URL validation failed'
        );
        rejected++;
        continue;
      }

      // Normalize fields that are actually available from the source
      const candidate: JobCandidate = {
        externalJobId: String(job.id),
        title: job.title.trim(),
        officialUrl: job.absolute_url,
        sourceSystem: 'GREENHOUSE',
      };

      // Optional fields — only set if actually supplied by the source
      const locationName = job.location?.name?.trim();
      if (locationName) candidate.location = locationName;

      if (job.first_published) {
        const parsed = new Date(job.first_published);
        if (!isNaN(parsed.getTime())) candidate.officialPostedAt = parsed;
      }

      if (job.content) {
        const stripped = stripHtml(job.content);
        if (stripped.length > 0) candidate.description = stripped;
      }

      candidates.push(candidate);
    }

    if (rejected > 0) {
      this.log.warn(
        { rejected, accepted: candidates.length },
        'GH_NORMALIZE some jobs rejected during normalization'
      );
    }

    this.log.info(
      { accepted: candidates.length, rejected },
      'GH_NORMALIZE normalization complete'
    );
    return candidates;
  }
}
