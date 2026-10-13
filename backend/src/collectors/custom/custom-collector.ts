/**
 * Custom Career Site Collector.
 *
 * A reusable, configuration-driven collector designed for companies that do not use
 * Greenhouse, Lever, or Workday.
 *
 * Supports:
 *   - Configurable REST / JSON API endpoints
 *   - Configurable field extraction (dot-notation paths)
 *   - Configurable pagination (offset_limit, page_limit, or single-page)
 *   - URL template rendering
 *   - Health checks with lightweight probing
 *   - Timeout handling and exponential backoff retry for transient errors
 *
 * This collector normalizes postings into JobCandidate objects.
 * It does NOT mark jobs as VERIFIED.
 */

import { BaseCollector } from '../base-collector.js';
import { validateJobUrl } from '../url-validator.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import type { AtsType } from '../../ats/types.js';

// ─── Configuration Types ──────────────────────────────────────────────────────

export interface CustomFieldMappings {
  /** Property path to the jobs array in the response (e.g. "content" or "" for root array) */
  jobsPath?: string;
  /** Property path to the job ID (e.g. "id" or "refNumber") */
  idField?: string;
  /** Property path to the job title (e.g. "name" or "title") */
  titleField?: string;
  /** Property path to city (e.g. "location.city") */
  cityField?: string;
  /** Property path to country (e.g. "location.country") */
  countryField?: string;
  /** Property path to full location string (e.g. "location.name" or "location") */
  locationField?: string;
  /** Direct URL property path (e.g. "jobUrl" or "refUrl") */
  urlField?: string;
  /** URL template to render if urlField is not present (e.g. "https://jobs.smartrecruiters.com/cern/{id}") */
  urlTemplate?: string;
  /** Property path to apply URL */
  applyUrlField?: string;
  /** Property path to posted/released date */
  postedAtField?: string;
}

export interface CustomPaginationConfig {
  /** Strategy for pagination */
  strategy: 'offset_limit' | 'page_limit' | 'none';
  /** Number of items per request */
  pageSize: number;
  /** Maximum number of pages to fetch (safety cap) */
  maxPages: number;
  /** Query parameter name for offset (default: "offset") */
  offsetParam?: string;
  /** Query parameter name for limit / page size (default: "limit") */
  limitParam?: string;
  /** Query parameter name for page number (default: "page") */
  pageParam?: string;
}

export interface CustomSourceConfig {
  /** Canonical company name */
  companyName: string;
  /** Authoritative domain for official URLs (e.g. "jobs.smartrecruiters.com") */
  officialDomain: string;
  /** Careers homepage URL */
  careersUrl: string;
  /** REST/JSON API endpoint for listing postings */
  apiEndpoint: string;
  /** Per-job API endpoint template for verification (e.g. ".../postings/{id}") */
  perJobApiEndpointTemplate?: string;
  /** Pagination configuration */
  paginationConfig?: CustomPaginationConfig;
  /** Field mapping configuration */
  fieldMappings?: CustomFieldMappings;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a nested property using dot-notation (e.g. "location.city").
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

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
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'KCarrier-JobEngine/2.0 (job-verification-system)',
            ...options.headers,
          },
        });
        clearTimeout(timer);

        if (response.status === 404) return response;
        if (response.status >= 400 && response.status !== 429 && response.status < 500) {
          return response;
        }

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

// ─── Custom Collector ────────────────────────────────────────────────────────

export class CustomCollector extends BaseCollector {
  private readonly config: CustomSourceConfig;
  private readonly pagination: CustomPaginationConfig;
  private readonly mappings: CustomFieldMappings;
  private readonly timeoutMs: number;

  constructor(config: CustomSourceConfig) {
    super();
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pagination = config.paginationConfig ?? {
      strategy: 'none',
      pageSize: 20,
      maxPages: 1,
    };
    this.mappings = {
      jobsPath: config.fieldMappings?.jobsPath ?? 'content',
      idField: config.fieldMappings?.idField ?? 'id',
      titleField: config.fieldMappings?.titleField ?? 'name',
      cityField: config.fieldMappings?.cityField ?? 'location.city',
      countryField: config.fieldMappings?.countryField ?? 'location.country',
      locationField: config.fieldMappings?.locationField,
      urlField: config.fieldMappings?.urlField,
      urlTemplate: config.fieldMappings?.urlTemplate,
      applyUrlField: config.fieldMappings?.applyUrlField ?? 'applyUrl',
      postedAtField: config.fieldMappings?.postedAtField ?? 'releasedDate',
    };
  }

  getSourceName(): string {
    return `${this.config.companyName} Custom Career Collector`;
  }

  getSourceType(): AtsType {
    return 'CUSTOM';
  }

  supports(companyName: string): boolean {
    return companyName.toLowerCase() === this.config.companyName.toLowerCase();
  }

  /**
   * Health check for the custom career API.
   * Probes the listing endpoint with limit=1 to verify accessibility and schema.
   */
  override async healthCheck(): Promise<CollectorHealth> {
    const checkedAt = new Date();
    const startMs = Date.now();

    const probeUrl = new URL(this.config.apiEndpoint);
    probeUrl.searchParams.set(this.pagination.limitParam ?? 'limit', '1');

    try {
      const response = await fetchWithRetry(probeUrl.toString(), {}, this.timeoutMs, 0);
      const responseTimeMs = Date.now() - startMs;

      if (!response.ok) {
        return {
          healthy: false,
          message: `HTTP ${response.status} from custom API (${this.config.companyName})`,
          checkedAt,
        };
      }

      const json = (await response.json()) as unknown;
      if (!json || typeof json !== 'object') {
        return {
          healthy: false,
          message: 'Custom API returned unexpected non-JSON response',
          checkedAt,
        };
      }

      return {
        healthy: true,
        message: `Custom API reachable — ${responseTimeMs}ms`,
        checkedAt,
      };
    } catch (err) {
      return {
        healthy: false,
        message: `Custom API unreachable: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt,
      };
    }
  }

  /**
   * Discover available job openings from the custom career source.
   */
  async discoverJobs(): Promise<JobCandidate[]> {
    this.log.info(
      { company: this.config.companyName, endpoint: this.config.apiEndpoint },
      'CUSTOM_FETCH starting discovery'
    );

    const candidates: JobCandidate[] = [];
    const seenExternalIds = new Set<string>();
    let rejected = 0;

    const maxPages = this.pagination.strategy === 'none' ? 1 : this.pagination.maxPages;

    for (let page = 0; page < maxPages; page++) {
      const url = new URL(this.config.apiEndpoint);

      if (this.pagination.strategy === 'offset_limit') {
        const offset = page * this.pagination.pageSize;
        url.searchParams.set(this.pagination.offsetParam ?? 'offset', String(offset));
        url.searchParams.set(this.pagination.limitParam ?? 'limit', String(this.pagination.pageSize));
      } else if (this.pagination.strategy === 'page_limit') {
        url.searchParams.set(this.pagination.pageParam ?? 'page', String(page + 1));
        url.searchParams.set(this.pagination.limitParam ?? 'limit', String(this.pagination.pageSize));
      }

      let responseData: unknown;
      try {
        const response = await fetchWithRetry(url.toString(), {}, this.timeoutMs);
        if (!response.ok) {
          this.log.error({ status: response.status, page: page + 1 }, 'CUSTOM_FETCH HTTP error');
          break;
        }
        responseData = await response.json();
      } catch (err) {
        this.log.error(
          { err: err instanceof Error ? err.message : String(err), page: page + 1 },
          'CUSTOM_FETCH network error'
        );
        break;
      }

      let rawList: unknown[] = [];
      if (this.mappings.jobsPath) {
        const extracted = getNestedValue(responseData, this.mappings.jobsPath);
        if (Array.isArray(extracted)) {
          rawList = extracted;
        }
      } else if (Array.isArray(responseData)) {
        rawList = responseData;
      }

      if (rawList.length === 0) {
        this.log.info({ page: page + 1 }, 'CUSTOM_FETCH reached end of listings (empty page)');
        break;
      }

      for (const item of rawList) {
        if (!item || typeof item !== 'object') continue;

        // 1. Extract ID
        const idVal = this.mappings.idField ? getNestedValue(item, this.mappings.idField) : undefined;
        const externalJobId = idVal !== undefined && idVal !== null ? String(idVal).trim() : '';

        if (!externalJobId) {
          this.log.warn({ item }, 'CUSTOM_NORMALIZE rejected: missing job ID');
          rejected++;
          continue;
        }

        if (seenExternalIds.has(externalJobId)) {
          // Intra-scan duplicate
          continue;
        }

        // 2. Extract Title
        const titleVal = this.mappings.titleField ? getNestedValue(item, this.mappings.titleField) : undefined;
        const title = typeof titleVal === 'string' ? titleVal.trim() : '';

        if (!title) {
          this.log.warn({ externalJobId }, 'CUSTOM_NORMALIZE rejected: missing or empty title');
          rejected++;
          continue;
        }

        // 3. Compute Official URL
        let officialUrl = '';
        if (this.mappings.urlField) {
          const directUrl = getNestedValue(item, this.mappings.urlField);
          if (typeof directUrl === 'string') officialUrl = directUrl.trim();
        }

        if (!officialUrl && this.mappings.urlTemplate) {
          officialUrl = this.mappings.urlTemplate.replace('{id}', encodeURIComponent(externalJobId));
        }

        if (!officialUrl) {
          this.log.warn({ externalJobId }, 'CUSTOM_NORMALIZE rejected: unable to determine official URL');
          rejected++;
          continue;
        }

        const urlCheck = validateJobUrl(officialUrl, this.config.officialDomain);
        if (!urlCheck.valid) {
          this.log.warn(
            { externalJobId, url: officialUrl, reason: urlCheck.reason },
            'CUSTOM_NORMALIZE rejected: URL validation failed'
          );
          rejected++;
          continue;
        }

        // 4. Extract Location
        let location = '';
        if (this.mappings.locationField) {
          const loc = getNestedValue(item, this.mappings.locationField);
          if (typeof loc === 'string') location = loc.trim();
        }

        if (!location && (this.mappings.cityField || this.mappings.countryField)) {
          const city = this.mappings.cityField ? getNestedValue(item, this.mappings.cityField) : undefined;
          const country = this.mappings.countryField ? getNestedValue(item, this.mappings.countryField) : undefined;
          const locParts = [city, country].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
          if (locParts.length > 0) {
            location = locParts.join(', ');
          }
        }

        // 5. Extract Apply URL
        let applyUrl: string | undefined;
        if (this.mappings.applyUrlField) {
          const apply = getNestedValue(item, this.mappings.applyUrlField);
          if (typeof apply === 'string' && apply.trim().length > 0) {
            applyUrl = apply.trim();
          }
        }

        const candidate: JobCandidate = {
          externalJobId,
          title,
          officialUrl,
          sourceSystem: 'CUSTOM',
        };

        if (location) candidate.location = location;
        if (applyUrl) candidate.applyUrl = applyUrl;

        seenExternalIds.add(externalJobId);
        candidates.push(candidate);
      }

      if (this.pagination.strategy === 'none' || rawList.length < this.pagination.pageSize) {
        break;
      }
    }

    this.log.info(
      { accepted: candidates.length, rejected, totalDiscovered: candidates.length },
      'CUSTOM_NORMALIZE discovery complete'
    );

    return candidates;
  }
}
