import { BaseCollector } from '../base-collector.js';
import { validateJobUrl } from '../url-validator.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import type { AtsType } from '../../ats/types.js';

// ─── SmartRecruiters API Types ───────────────────────────────────────────────

interface SmartRecruitersLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  fullLocation?: string;
}

interface SmartRecruitersListPosting {
  id: string;
  name: string;
  location?: SmartRecruitersLocation;
  releasedDate?: string;
  ref?: string; // e.g. https://api.smartrecruiters.com/v1/companies/...
}

interface SmartRecruitersListResponse {
  offset: number;
  limit: number;
  totalFound: number;
  content: SmartRecruitersListPosting[];
}

interface SmartRecruitersDetailResponse {
  id: string;
  name: string;
  releasedDate?: string;
  postingUrl?: string;
  applyUrl?: string;
  location?: SmartRecruitersLocation;
  typeOfEmployment?: { id: string; label: string };
  jobAd?: {
    sections?: {
      jobDescription?: { text?: string };
      qualifications?: { text?: string };
      companyDescription?: { text?: string };
      additionalInformation?: { text?: string };
    };
  };
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface SmartRecruitersSourceConfig {
  /** The canonical company name */
  companyName: string;
  /** SmartRecruiters company identifier */
  companyIdentifier: string;
  /** Authoritative domain for URLs (e.g. jobs.smartrecruiters.com) */
  officialDomain?: string;
  /** HTTP request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum number of pages to fetch per scan (default: 10) */
  maxPages?: number;
  /** Number of jobs per page / limit (default: 100) */
  pageSize?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PAGES = 10;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Collector ────────────────────────────────────────────────────────────────

export class SmartrecruitersCollector extends BaseCollector {
  private readonly config: Required<SmartRecruitersSourceConfig>;

  constructor(config: SmartRecruitersSourceConfig) {
    super();
    this.config = {
      companyName: config.companyName,
      companyIdentifier: config.companyIdentifier,
      officialDomain: config.officialDomain ?? 'jobs.smartrecruiters.com',
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxPages: config.maxPages ?? DEFAULT_MAX_PAGES,
      pageSize: config.pageSize ?? 100,
    };
  }

  getSourceName(): string {
    return `${this.config.companyName} SmartRecruiters Collector`;
  }

  getSourceType(): AtsType {
    return 'SMARTRECRUITERS' as AtsType;
  }

  supports(companyName: string): boolean {
    return companyName.toLowerCase() === this.config.companyName.toLowerCase();
  }

  override async healthCheck(): Promise<CollectorHealth> {
    const url = `https://api.smartrecruiters.com/v1/companies/${this.config.companyIdentifier}/postings?limit=1`;
    const checkedAt = new Date();
    const startMs = Date.now();

    try {
      const response = await fetchWithRetry(url, this.config.timeoutMs, 0);
      const responseTimeMs = Date.now() - startMs;

      if (!response.ok) {
        return {
          healthy: false,
          message: `HTTP ${response.status} from SmartRecruiters API — identifier "${this.config.companyIdentifier}" may not exist`,
          checkedAt,
        };
      }

      const data = (await response.json()) as SmartRecruitersListResponse;
      if (typeof data !== 'object' || !Array.isArray(data.content)) {
        return {
          healthy: false,
          message: 'SmartRecruiters API returned unexpected response format',
          checkedAt,
        };
      }

      return {
        healthy: true,
        message: `SmartRecruiters API reachable — ${data.totalFound} jobs reported — ${responseTimeMs}ms`,
        checkedAt,
      };
    } catch (err) {
      return {
        healthy: false,
        message: `SmartRecruiters API unreachable: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt,
      };
    }
  }

  async discoverJobs(): Promise<JobCandidate[]> {
    this.log.info(
      { company: this.config.companyName, identifier: this.config.companyIdentifier },
      'SR_FETCH starting discovery'
    );

    const candidates: JobCandidate[] = [];
    let rejected = 0;
    let offset = 0;
    const limit = this.config.pageSize;

    for (let page = 0; page < this.config.maxPages; page++) {
      const url = `https://api.smartrecruiters.com/v1/companies/${this.config.companyIdentifier}/postings?offset=${offset}&limit=${limit}`;
      this.log.info({ page: page + 1, offset }, 'SR_FETCH fetching page');

      let listResponse: SmartRecruitersListResponse;
      try {
        const response = await fetchWithRetry(url, this.config.timeoutMs);
        if (!response.ok) {
          this.log.error({ status: response.status, url }, 'SR_FETCH HTTP error fetching jobs page');
          break;
        }
        listResponse = (await response.json()) as SmartRecruitersListResponse;
      } catch (err) {
        this.log.error(
          { err: err instanceof Error ? err.message : String(err), url },
          'SR_FETCH network error fetching jobs page'
        );
        break;
      }

      const postings = listResponse.content ?? [];
      if (postings.length === 0) {
        this.log.info({ page: page + 1 }, 'SR_FETCH reached end of listings');
        break;
      }

      for (const posting of postings) {
        if (!posting.id || !posting.name) {
          rejected++;
          continue;
        }

        // Fetch detail to get description and official URL
        const detailUrl = `https://api.smartrecruiters.com/v1/companies/${this.config.companyIdentifier}/postings/${posting.id}`;
        let detail: SmartRecruitersDetailResponse;
        
        try {
          const res = await fetchWithRetry(detailUrl, this.config.timeoutMs);
          if (!res.ok) {
            rejected++;
            continue;
          }
          detail = (await res.json()) as SmartRecruitersDetailResponse;
        } catch (err) {
          this.log.warn({ id: posting.id }, 'SR_FETCH error fetching job details');
          rejected++;
          continue;
        }

        if (!detail.postingUrl) {
          this.log.warn({ id: posting.id }, 'SR_NORMALIZE missing postingUrl');
          rejected++;
          continue;
        }

        const urlCheck = validateJobUrl(detail.postingUrl, this.config.officialDomain);
        if (!urlCheck.valid) {
          this.log.warn(
            { id: posting.id, url: detail.postingUrl, reason: urlCheck.reason },
            'SR_NORMALIZE rejected: URL validation failed'
          );
          rejected++;
          continue;
        }

        const candidate: JobCandidate = {
          externalJobId: detail.id,
          title: detail.name.trim(),
          officialUrl: detail.postingUrl,
          applyUrl: detail.applyUrl,
          sourceSystem: 'SMARTRECRUITERS' as AtsType,
        };

        if (detail.releasedDate) {
          const parsed = new Date(detail.releasedDate);
          if (!isNaN(parsed.getTime())) candidate.officialPostedAt = parsed;
        }

        if (detail.location) {
          let locParts = [];
          if (detail.location.city) locParts.push(detail.location.city);
          if (detail.location.region) locParts.push(detail.location.region);
          if (detail.location.country) locParts.push(detail.location.country.toUpperCase());
          if (locParts.length > 0) {
            candidate.location = locParts.join(', ');
          }
          if (detail.location.remote) {
             candidate.workplaceType = 'REMOTE';
          }
        }

        if (detail.typeOfEmployment?.label) {
          candidate.employmentType = detail.typeOfEmployment.label;
        }

        if (detail.jobAd?.sections) {
          const sections = detail.jobAd.sections;
          const descParts = [];
          if (sections.jobDescription?.text) descParts.push(stripHtml(sections.jobDescription.text));
          if (sections.qualifications?.text) descParts.push(stripHtml(sections.qualifications.text));
          if (descParts.length > 0) candidate.description = descParts.join('\n\n');
        }

        candidates.push(candidate);
      }

      offset += limit;
      if (offset >= (listResponse.totalFound || 0)) {
        break; // All jobs fetched
      }
    }

    this.log.info(
      { accepted: candidates.length, rejected },
      'SR_NORMALIZE discovery complete'
    );

    return candidates;
  }
}
