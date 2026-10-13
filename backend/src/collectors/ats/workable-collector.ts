/**
 * Workable ATS Collector.
 *
 * Discovers and normalizes jobs from Workable-hosted career pages
 * using Workable's public API:
 *   POST https://apply.workable.com/api/v3/accounts/{accountSlug}/jobs
 *
 * Canonical URL structure:
 *   https://apply.workable.com/{accountSlug}/j/{shortcode}
 *
 * Rules:
 *   - Only uses public, authoritative endpoints (no scraping)
 *   - Resolves canonical HTTPS URLs
 *   - Extracts location, workplace type, department, and employment type
 *   - Rejects postings with missing/invalid IDs, titles, or URLs
 */

import { BaseCollector } from '../base-collector.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import { validateJobUrl } from '../url-validator.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('collector:workable');

export interface WorkableCollectorConfig {
  accountSlug: string;
  companyName: string;
  officialDomain?: string;
  timeoutMs?: number;
}

interface WorkableRawJob {
  id?: number | string;
  title?: string;
  shortcode?: string;
  code?: string;
  city?: string;
  country?: string;
  region?: string;
  state?: string;
  department?: string;
  employment_type?: string;
  telecommuting?: boolean;
  workplace?: string;
  published?: string;
  description?: string;
  requirements?: string;
}

interface WorkableApiResponse {
  total?: number;
  results?: WorkableRawJob[];
}

export class WorkableCollector extends BaseCollector {
  private readonly accountSlug: string;
  private readonly companyName: string;
  private readonly officialDomain: string;
  private readonly timeoutMs: number;

  constructor(config: WorkableCollectorConfig) {
    super();
    this.accountSlug = config.accountSlug;
    this.companyName = config.companyName;
    this.officialDomain = config.officialDomain ?? 'apply.workable.com';
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  getSourceName(): string {
    return `${this.companyName} Workable Collector`;
  }

  getSourceType(): 'CUSTOM' {
    return 'CUSTOM';
  }

  supports(companyName: string): boolean {
    return this.companyName.toLowerCase() === companyName.toLowerCase();
  }

  async healthCheck(): Promise<CollectorHealth> {
    const url = `https://apply.workable.com/api/v1/accounts/${encodeURIComponent(this.accountSlug)}`;
    const checkedAt = new Date();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'KCarrier-JobEngine/2.0 (healthcheck)',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);

      if (response.ok) {
        return { healthy: true, message: `HTTP ${response.status} from Workable API`, checkedAt };
      }
      return {
        healthy: false,
        message: `HTTP ${response.status} from Workable API: ${url}`,
        checkedAt,
      };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
    }
  }

  async discoverJobs(): Promise<JobCandidate[]> {
    const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(this.accountSlug)}/jobs`;
    log.info({ url, company: this.companyName }, 'WORKABLE_FETCH fetching job board postings');

    let data: WorkableApiResponse;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'User-Agent': 'KCarrier-JobEngine/2.0 (collector)',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: '',
          location: [],
          department: [],
          worktype: [],
          remote: [],
        }),
      });
      clearTimeout(timeout);

      if (!response.ok) {
        log.warn({ status: response.status, url }, 'WORKABLE_FETCH returned non-200');
        return [];
      }

      data = (await response.json()) as WorkableApiResponse;
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err), url }, 'WORKABLE_FETCH network failure');
      return [];
    }

    const rawJobs = data.results;
    if (!Array.isArray(rawJobs)) {
      log.warn({ url }, 'WORKABLE_FETCH response missing results array');
      return [];
    }

    const candidates: JobCandidate[] = [];
    let rejectedCount = 0;

    for (const raw of rawJobs) {
      const code = raw.shortcode || raw.code || (raw.id ? String(raw.id) : undefined);
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        rejectedCount++;
        continue;
      }

      if (!raw.title || typeof raw.title !== 'string' || raw.title.trim().length === 0) {
        rejectedCount++;
        continue;
      }

      const canonicalUrl = `https://apply.workable.com/${encodeURIComponent(this.accountSlug)}/j/${encodeURIComponent(code.trim())}`;
      const urlCheck = validateJobUrl(canonicalUrl, this.officialDomain);
      if (!urlCheck.valid) {
        log.warn({ jobId: code, url: canonicalUrl, reason: urlCheck.reason }, 'WORKABLE_NORMALIZE rejected invalid URL');
        rejectedCount++;
        continue;
      }

      // Build location string
      const locParts = [raw.city, raw.state || raw.region, raw.country].filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0
      );
      let location = locParts.length > 0 ? locParts.join(', ') : 'Not Specified';
      if (raw.telecommuting && !location.toLowerCase().includes('remote')) {
        location = `${location} (Remote)`;
      }

      let officialPostedAt: Date | undefined;
      if (raw.published) {
        const parsed = new Date(raw.published);
        if (!isNaN(parsed.getTime())) {
          officialPostedAt = parsed;
        }
      }

      candidates.push({
        externalJobId: code.trim(),
        title: raw.title.trim(),
        location,
        employmentType: raw.employment_type ? raw.employment_type.trim() : undefined,
        officialUrl: canonicalUrl,
        applyUrl: `${canonicalUrl}/apply/`,
        description: raw.description || undefined,
        requirements: raw.requirements || undefined,
        sourceSystem: 'CUSTOM',
        officialPostedAt,
      });
    }

    log.info(
      { company: this.companyName, accepted: candidates.length, rejected: rejectedCount },
      'WORKABLE_NORMALIZE discovery complete'
    );

    return candidates;
  }
}
