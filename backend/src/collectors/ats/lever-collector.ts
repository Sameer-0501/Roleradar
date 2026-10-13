/**
 * Lever Collector.
 *
 * Discovers job candidates from Lever's public postings API.
 * Uses the official structured JSON API — no HTML scraping.
 *
 * API: https://api.lever.co/v0/postings/{site}?mode=json
 *
 * Network safety:
 * - Request timeout enforced (default 10s, configurable)
 * - Up to 2 retries with exponential backoff for 5xx/429
 * - No aggressive polling
 * - No CAPTCHA bypass, no anti-bot workarounds
 *
 * This collector normalizes postings into JobCandidate objects.
 * It does NOT mark jobs as VERIFIED.
 */

import { BaseCollector } from '../base-collector.js';
import { validateJobUrl } from '../url-validator.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import type { AtsType } from '../../ats/types.js';

// ─── Lever API types ──────────────────────────────────────────────────────────

interface LeverCategories {
  commitment?: string | null;
  location?: string | null;
  team?: string | null;
  department?: string | null;
  allLocations?: string[];
}

interface LeverList {
  text?: string;
  content?: string;
}

interface LeverPosting {
  id: string;
  text: string;
  createdAt?: number | null;
  descriptionPlain?: string | null;
  description?: string | null;
  descriptionBodyPlain?: string | null;
  additionalPlain?: string | null;
  categories?: LeverCategories | null;
  lists?: LeverList[] | null;
  hostedUrl: string;
  applyUrl?: string | null;
  workplaceType?: string | null;
  country?: string | null;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface LeverSourceConfig {
  /**
   * The Lever site slug/token for this company.
   * Example: "palantir" → https://api.lever.co/v0/postings/palantir?mode=json
   */
  siteToken: string;
  /** The canonical company name (for logging) */
  companyName: string;
  /**
   * The authoritative domain that all job URLs must belong to.
   * Default: "jobs.lever.co"
   */
  officialDomain?: string;
  /**
   * HTTP request timeout in milliseconds.
   * Default: 10000 (10 seconds)
   */
  timeoutMs?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVER_API_BASE = 'https://api.lever.co/v0/postings';
const DEFAULT_OFFICIAL_DOMAIN = 'jobs.lever.co';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode common entities to plain text.
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
 * Extract structured requirements from Lever's `lists` field.
 */
function extractRequirements(lists?: LeverList[] | null): string | undefined {
  if (!lists || !Array.isArray(lists) || lists.length === 0) {
    return undefined;
  }

  const parts: string[] = [];
  for (const item of lists) {
    const header = item.text ? item.text.trim() : '';
    const content = item.content ? stripHtml(item.content) : '';
    if (header && content) {
      parts.push(`${header}:\n${content}`);
    } else if (content) {
      parts.push(content);
    } else if (header) {
      parts.push(header);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * Fetch with timeout and exponential backoff retry for transient errors.
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
            Accept: 'application/json',
            'User-Agent': 'KCarrier-JobEngine/2.0 (job-verification-system)',
          },
        });
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

// ─── Lever Collector ──────────────────────────────────────────────────────────

export class LeverCollector extends BaseCollector {
  private readonly config: Required<LeverSourceConfig>;

  constructor(config: LeverSourceConfig) {
    super();
    this.config = {
      siteToken: config.siteToken,
      companyName: config.companyName,
      officialDomain: config.officialDomain ?? DEFAULT_OFFICIAL_DOMAIN,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  getSourceName(): string {
    return `${this.config.companyName} Lever Collector`;
  }

  getSourceType(): AtsType {
    return 'LEVER';
  }

  supports(companyName: string): boolean {
    return companyName.toLowerCase() === this.config.companyName.toLowerCase();
  }

  /**
   * Health check for Lever source.
   * Uses lightweight limit=1 parameter to check connectivity and schema without downloading full dataset.
   */
  override async healthCheck(): Promise<CollectorHealth> {
    const url = `${LEVER_API_BASE}/${this.config.siteToken}?mode=json&limit=1`;
    const checkedAt = new Date();
    const startMs = Date.now();

    try {
      const response = await fetchWithRetry(url, this.config.timeoutMs, 0);
      const responseTimeMs = Date.now() - startMs;

      if (!response.ok) {
        return {
          healthy: false,
          message: `HTTP ${response.status} from Lever API — site "${this.config.siteToken}" may not exist or be accessible`,
          checkedAt,
        };
      }

      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) {
        return {
          healthy: false,
          message: 'Lever API returned unexpected response format (expected array of postings)',
          checkedAt,
        };
      }

      return {
        healthy: true,
        message: `Lever API reachable — postings listed — ${responseTimeMs}ms`,
        checkedAt,
      };
    } catch (err) {
      return {
        healthy: false,
        message: `Lever API unreachable: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt,
      };
    }
  }

  /**
   * Discover available job openings from the Lever postings API.
   * Normalizes raw postings to JobCandidate format.
   */
  async discoverJobs(): Promise<JobCandidate[]> {
    const url = `${LEVER_API_BASE}/${this.config.siteToken}?mode=json`;
    this.log.info({ url, site: this.config.siteToken }, 'LEVER_FETCH fetching postings list');

    let rawData: LeverPosting[];
    try {
      const response = await fetchWithRetry(url, this.config.timeoutMs);
      if (!response.ok) {
        this.log.error(
          { status: response.status, url },
          'LEVER_FETCH HTTP error fetching postings list'
        );
        return [];
      }
      const json = (await response.json()) as unknown;
      if (!Array.isArray(json)) {
        this.log.error({ url }, 'LEVER_FETCH response is not an array — malformed response');
        return [];
      }
      rawData = json as LeverPosting[];
    } catch (err) {
      this.log.error(
        { err: err instanceof Error ? err.message : String(err), url },
        'LEVER_FETCH network error fetching postings list'
      );
      return [];
    }

    this.log.info(
      { count: rawData.length, site: this.config.siteToken },
      'LEVER_FETCH raw job count'
    );

    const candidates: JobCandidate[] = [];
    let rejected = 0;

    for (const posting of rawData) {
      // Must have valid string ID
      if (!posting.id || typeof posting.id !== 'string' || posting.id.trim().length === 0) {
        this.log.warn({ posting }, 'LEVER_NORMALIZE rejected: missing or invalid id');
        rejected++;
        continue;
      }

      // Must have non-empty title (Lever uses .text)
      if (!posting.text || typeof posting.text !== 'string' || posting.text.trim().length === 0) {
        this.log.warn({ jobId: posting.id }, 'LEVER_NORMALIZE rejected: missing or empty title');
        rejected++;
        continue;
      }

      // Must have hostedUrl
      if (!posting.hostedUrl || typeof posting.hostedUrl !== 'string') {
        this.log.warn({ jobId: posting.id }, 'LEVER_NORMALIZE rejected: missing hostedUrl');
        rejected++;
        continue;
      }

      // URL validation
      const urlCheck = validateJobUrl(posting.hostedUrl, this.config.officialDomain);
      if (!urlCheck.valid) {
        this.log.warn(
          { jobId: posting.id, url: posting.hostedUrl, reason: urlCheck.reason },
          'LEVER_NORMALIZE rejected: URL validation failed'
        );
        rejected++;
        continue;
      }

      // Basic candidate creation
      const candidate: JobCandidate = {
        externalJobId: posting.id.trim(),
        title: posting.text.trim(),
        officialUrl: posting.hostedUrl.trim(),
        sourceSystem: 'LEVER',
      };

      // Optional fields
      if (posting.applyUrl && typeof posting.applyUrl === 'string') {
        candidate.applyUrl = posting.applyUrl.trim();
      }

      if (posting.categories?.location && typeof posting.categories.location === 'string') {
        const loc = posting.categories.location.trim();
        if (loc.length > 0) candidate.location = loc;
      }

      if (posting.categories?.commitment && typeof posting.categories.commitment === 'string') {
        const type = posting.categories.commitment.trim();
        if (type.length > 0) candidate.employmentType = type;
      }

      if (posting.createdAt && typeof posting.createdAt === 'number') {
        const parsed = new Date(posting.createdAt);
        if (!isNaN(parsed.getTime())) candidate.officialPostedAt = parsed;
      }

      // Description preference: descriptionPlain -> descriptionBodyPlain -> stripped description
      const descText =
        posting.descriptionPlain?.trim() ||
        posting.descriptionBodyPlain?.trim() ||
        (posting.description ? stripHtml(posting.description) : undefined);

      if (descText && descText.length > 0) {
        candidate.description = descText;
      }

      // Requirements from lists
      const reqs = extractRequirements(posting.lists);
      if (reqs) {
        candidate.requirements = reqs;
      }

      candidates.push(candidate);
    }

    if (rejected > 0) {
      this.log.warn(
        { rejected, accepted: candidates.length },
        'LEVER_NORMALIZE some postings rejected during normalization'
      );
    }

    this.log.info(
      { accepted: candidates.length, rejected },
      'LEVER_NORMALIZE normalization complete'
    );

    return candidates;
  }
}
