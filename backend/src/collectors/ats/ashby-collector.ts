/**
 * Ashby ATS Collector.
 *
 * Discovers and normalizes jobs from Ashby-hosted career boards
 * using Ashby's public posting API:
 *   GET https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}
 *
 * Rules:
 *   - Only uses public, authoritative endpoints (no scraping)
 *   - Resolves canonical URLs: https://jobs.ashbyhq.com/{jobBoardName}/{id}
 *   - Rejects postings with missing/invalid IDs, titles, or URLs
 */

import { BaseCollector } from '../base-collector.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import { validateJobUrl } from '../url-validator.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('collector:ashby');

export interface AshbyCollectorConfig {
  jobBoardName: string;
  companyName: string;
  officialDomain?: string;
  timeoutMs?: number;
}

interface AshbyRawJob {
  id?: string;
  title?: string;
  location?: string;
  department?: string;
  employmentType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
}

interface AshbyApiResponse {
  apiVersion?: string;
  jobs?: AshbyRawJob[];
}

export class AshbyCollector extends BaseCollector {
  private readonly jobBoardName: string;
  private readonly companyName: string;
  private readonly officialDomain: string;
  private readonly timeoutMs: number;

  constructor(config: AshbyCollectorConfig) {
    super();
    this.jobBoardName = config.jobBoardName;
    this.companyName = config.companyName;
    this.officialDomain = config.officialDomain ?? 'jobs.ashbyhq.com';
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  getSourceName(): string {
    return `${this.companyName} Ashby Collector`;
  }

  getSourceType(): 'CUSTOM' {
    return 'CUSTOM';
  }

  supports(companyName: string): boolean {
    return this.companyName.toLowerCase() === companyName.toLowerCase();
  }

  async healthCheck(): Promise<CollectorHealth> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${this.jobBoardName}`;
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
        return { healthy: true, message: `HTTP ${response.status} from Ashby API`, checkedAt };
      }
      return {
        healthy: false,
        message: `HTTP ${response.status} from Ashby API: ${url}`,
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
    const url = `https://api.ashbyhq.com/posting-api/job-board/${this.jobBoardName}`;
    log.info({ url, company: this.companyName }, 'ASHBY_FETCH fetching job board postings');

    let data: AshbyApiResponse;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'KCarrier-JobEngine/2.0 (collector)',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        log.warn({ status: response.status, url }, 'ASHBY_FETCH returned non-200');
        return [];
      }

      data = (await response.json()) as AshbyApiResponse;
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err), url }, 'ASHBY_FETCH network failure');
      return [];
    }

    const rawJobs = data.jobs;
    if (!Array.isArray(rawJobs)) {
      log.warn({ url }, 'ASHBY_FETCH response missing jobs array');
      return [];
    }

    const candidates: JobCandidate[] = [];
    let rejectedCount = 0;

    for (const raw of rawJobs) {
      if (!raw.id || typeof raw.id !== 'string') {
        rejectedCount++;
        continue;
      }

      if (!raw.title || typeof raw.title !== 'string' || raw.title.trim().length === 0) {
        rejectedCount++;
        continue;
      }

      const canonicalUrl = raw.jobUrl || `https://jobs.ashbyhq.com/${this.jobBoardName}/${raw.id}`;
      const urlCheck = validateJobUrl(canonicalUrl, this.officialDomain);
      if (!urlCheck.valid) {
        log.warn({ jobId: raw.id, url: canonicalUrl, reason: urlCheck.reason }, 'ASHBY_NORMALIZE rejected invalid URL');
        rejectedCount++;
        continue;
      }

      let officialPostedAt: Date | undefined;
      if (raw.publishedAt) {
        const parsed = new Date(raw.publishedAt);
        if (!isNaN(parsed.getTime())) {
          officialPostedAt = parsed;
        }
      }

      candidates.push({
        externalJobId: raw.id.trim(),
        title: raw.title.trim(),
        location: raw.location ? raw.location.trim() : 'Not Specified',
        employmentType: raw.employmentType ? raw.employmentType.trim() : undefined,
        officialUrl: canonicalUrl,
        applyUrl: raw.applyUrl || undefined,
        description: raw.descriptionPlain || raw.descriptionHtml || undefined,
        requirements: undefined,
        sourceSystem: 'CUSTOM',
        officialPostedAt,
      });
    }

    log.info(
      { company: this.companyName, accepted: candidates.length, rejected: rejectedCount },
      'ASHBY_NORMALIZE discovery complete'
    );

    return candidates;
  }
}
