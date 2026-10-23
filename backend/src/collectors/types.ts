/**
 * Collector configuration types.
 *
 * A Collector is responsible for discovering job candidates from a
 * single source (a specific company's ATS or careers page).
 */

import type { AtsType } from '../ats/types.js';
export type { CustomSourceConfig, CustomFieldMappings, CustomPaginationConfig } from './custom/custom-collector.js';

export interface GreenhouseSourceConfig {
  boardToken: string;
}

export interface LeverSourceConfig {
  siteToken: string;
}

export interface WorkdaySourceConfig {
  host: string;
  tenant: string;
  site?: string;
  clientSite?: string;
  maxPages?: number;
  appliedFacets?: Record<string, string[]>;
  sourceUrl?: string;
}

export interface AshbySourceConfig {
  jobBoardName: string;
}

export interface WorkableSourceConfig {
  accountSlug: string;
}

export interface SmartRecruitersSourceConfig {
  companyIdentifier: string;
  companyName?: string;
  pageSize?: number;
  maxPages?: number;
}

export interface SapSourceConfig {
  apiBaseUrl: string;
}

/**
 * Normalized job candidate returned by any collector.
 */
export interface JobCandidate {
  /** The job's unique identifier in the source system */
  externalJobId: string;
  /** Job title as reported by the source */
  title: string;
  /** Location string as reported by the source */
  location?: string;
  /** Workplace type (Remote, Hybrid, Onsite) if explicitly reported */
  workplaceType?: string;
  /** Employment type (Full-time, Part-time, Contract, etc.) */
  employmentType?: string;
  /** The official URL for this job posting (must be on the official domain) */
  officialUrl: string;
  /** Direct application URL if different from officialUrl */
  applyUrl?: string;
  /** When the job was posted, according to the source */
  officialPostedAt?: Date;
  /** Full job description text */
  description?: string;
  /** Requirements/qualifications text */
  requirements?: string;
  /** Which ATS/system this job was discovered from */
  sourceSystem: AtsType;
}

/**
 * Result of a collector's health check.
 */
export interface CollectorHealth {
  healthy: boolean;
  /** Human-readable message explaining the health status */
  message: string;
  /** Timestamp of the check */
  checkedAt: Date;
}

/**
 * ICollector — the interface every job source collector must implement.
 */
export interface ICollector {
  discoverJobs(): Promise<JobCandidate[]>;
  getSourceName(): string;
  getSourceType(): AtsType;
  supports(companyName: string): boolean;
  healthCheck(): Promise<CollectorHealth>;
}