import { BaseCollector } from '../base-collector.js';
import type { JobCandidate } from '../types.js';
import type { AtsType } from '../../ats/types.js';

interface SapCollectorConfig {
  apiBaseUrl: string;
  companyName: string;
  officialDomain: string;
  maxPages?: number;
  pageSize?: number;
}

interface SapResponseJob {
  id: string | number;
  unifiedStandardTitle?: string;
  unifiedUrlTitle?: string;
  jobLocationShort?: string[];
  sfstd_jobLocation_obj?: string[];
  description?: string;
  postedOn?: string;
}

interface SapResponseItem {
  response: SapResponseJob;
}

interface SapSearchResponse {
  totalJobs: number;
  jobSearchResult?: SapResponseItem[];
}

export class SapCollector extends BaseCollector {
  private config: SapCollectorConfig;

  constructor(config: SapCollectorConfig) {
    super();
    this.config = config;
  }

  getSourceName(): string {
    return this.config.companyName;
  }

  getSourceType(): AtsType {
    return 'SAP';
  }

  supports(companyName: string): boolean {
    return this.config.companyName.toLowerCase() === companyName.toLowerCase();
  }

  async healthCheck(): Promise<import('../types.js').CollectorHealth> {
    return {
      healthy: true,
      message: `${this.getSourceName()}: SAP collector is configured`,
      checkedAt: new Date()
    };
  }

  private constructOfficialUrl(job: SapResponseJob): string {
    const safeTitle = job.unifiedUrlTitle || 'job';
    // Remove trailing slash from base URL if present
    const base = this.config.apiBaseUrl.replace(/\/+$/, '');
    return `${base}/job/${safeTitle}/${job.id}/`;
  }

  private extractLocation(job: SapResponseJob): string | undefined {
    if (job.jobLocationShort && job.jobLocationShort.length > 0) {
      // Sometimes locations contain HTML breaks, e.g., "Gurugram, IND-06, IND, 122016<br/>"
      return job.jobLocationShort[0].replace(/<[^>]*>?/gm, '').trim();
    }
    if (job.sfstd_jobLocation_obj && job.sfstd_jobLocation_obj.length > 0) {
      return job.sfstd_jobLocation_obj[0];
    }
    return undefined;
  }

  async discoverJobs(): Promise<JobCandidate[]> {
    const candidates: JobCandidate[] = [];
    const seenIds = new Set<string>();

    let pageNumber = 0;
    let hasMore = true;
    let processedJobs = 0;

    // Use /services/recruiting/v1/jobs endpoint for RMK SAP
    const baseUrl = this.config.apiBaseUrl.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/services/recruiting/v1/jobs`;

    while (hasMore) {
      try {
        const payload = {
          locale: "en_US",
          pageNumber,
          sortBy: "",
          keywords: "",
          location: "",
          facetFilters: {},
          brand: "",
          skills: [],
          categoryId: 0,
          alertId: "",
          rcmCandidateId: ""
        };

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'RoleRadar-JobEngine/2.0'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          this.log.error(
            { status: res.status, url: apiUrl },
            'Failed to fetch SAP RMK page'
          );
          break;
        }

        const data = (await res.json()) as SapSearchResponse;
        
        if (!data.jobSearchResult || data.jobSearchResult.length === 0) {
          hasMore = false;
          break;
        }

        let newlyDiscovered = 0;
        for (const item of data.jobSearchResult) {
          processedJobs++;
          const rawJob = item.response;
          if (!rawJob || !rawJob.id) continue;

          const externalId = String(rawJob.id);
          if (seenIds.has(externalId)) continue;
          seenIds.add(externalId);

          const title = rawJob.unifiedStandardTitle?.trim();
          if (!title) continue;

          const officialUrl = this.constructOfficialUrl(rawJob);
          const location = this.extractLocation(rawJob);

          candidates.push({
            externalJobId: externalId,
            title,
            location,
            officialUrl,
            description: rawJob.description,
            sourceSystem: 'SAP'
          });
          newlyDiscovered++;
        }

        if (newlyDiscovered === 0 || processedJobs >= data.totalJobs || pageNumber > 500) {
          hasMore = false;
        } else if (this.config.maxPages && pageNumber + 1 >= this.config.maxPages) {
          hasMore = false;
        } else {
          pageNumber++;
        }
        
        if (this.config.pageSize && candidates.length >= this.config.pageSize) {
          // Truncate to exact bounds if we over-fetched
          candidates.length = this.config.pageSize;
          hasMore = false;
        }

      } catch (err) {
        this.log.error(
          { err: err instanceof Error ? err.message : String(err), pageNumber },
          'Error during SAP pagination loop'
        );
        break;
      }
    }

    return candidates;
  }
}
