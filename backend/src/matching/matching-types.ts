/**
 * Job Matching Engine Types.
 *
 * Defines the core types and structures used for matching real, active, verified
 * jobs against user preferences.
 */

import type { ExperienceLevel } from '../preferences/taxonomy.js';
export type { ExperienceLevel };
import type { FreshnessState, RelevanceBreakdown } from './relevance/relevance-types.js';

export type MatchDecision = 'MATCH' | 'NO_MATCH' | 'UNKNOWN';

export type ExperienceClassification =
  | 'FRESHER_COMPATIBLE'
  | 'EXPERIENCED'
  | 'BOTH'
  | 'UNKNOWN';

export type WorkplaceType = 'ONSITE' | 'HYBRID' | 'REMOTE' | 'UNKNOWN';

export interface CompanyMatchResult {
  matched: boolean;
  reason: string;
  scope: 'ALL_SUPPORTED_COMPANIES' | 'SPECIFIC_COMPANIES';
}

export interface RoleMatchResult {
  matched: boolean;
  matchedRole?: string;
  matchType?: 'EXACT' | 'SYNONYM' | 'SPECIALIZATION';
  reason: string;
}

export interface LocationMatchResult {
  matched: boolean;
  matchedLocation?: string;
  isRemote?: boolean;
  detectedCountry?: string;
  reason: string;
}

export interface WorkplaceMatchResult {
  matched: boolean;
  detectedWorkplace: WorkplaceType;
  reason: string;
}

export interface ExperienceMatchResult {
  matched: boolean;
  classification: ExperienceClassification;
  minYears?: number;
  maxYears?: number;
  reason: string;
}

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeywords: string[];
  reason: string;
}

export interface JobMatchResult {
  jobId: string;
  matched: boolean;
  decision: MatchDecision;
  reasons: string[];
  components: {
    company: CompanyMatchResult;
    role: RoleMatchResult;
    location: LocationMatchResult;
    workplace: WorkplaceMatchResult;
    experience: ExperienceMatchResult;
    keywords?: KeywordMatchResult;
  };
}

export interface CandidateJobData {
  id: string;
  companyId: string;
  companyName: string;
  sourceSystem: string;
  externalJobId: string;
  title: string;
  location?: string | null;
  workplaceType?: WorkplaceType | string | null;
  employmentType?: string | null;
  officialUrl: string;
  applyUrl?: string | null;
  description?: string | null;
  requirements?: string | null;
  status: string;
  verificationStatus: string;
  officialPostedAt?: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastVerifiedAt?: Date | null;
  initialVerifiedAt?: Date | null;
}

export interface UserPreferencesData {
  userId: string;
  roles: string[];
  locations: string[];
  workplaceTypes?: WorkplaceType[] | string[];
  experienceLevel: ExperienceLevel;
  companyIds: string[];
  keywords: string[];
}

export interface MatchedJobDto {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  location: string;
  workplaceType: WorkplaceType;
  officialUrl: string;
  applyUrl?: string | null;
  sourceSystem: string;
  verifiedStatus: string;
  firstSeenAt: string;
  lastSeenAt?: string;
  lastVerifiedAt?: string | null;
  initialVerifiedAt?: string | null;
  officialPostedAt?: string | null;
  experienceClassification: ExperienceClassification;
  matchSummary: string;
  reasons: string[];
  relevanceScore?: number;
  freshnessState?: FreshnessState;
  daysSinceDiscovered?: number;
  matchExplanations?: string[];
  breakdown?: RelevanceBreakdown;
  description?: string | null;
  requirements?: string | null;
  interaction?: {
    isSaved: boolean;
    savedAt: string | null;
    isApplied: boolean;
    appliedAt: string | null;
    isDismissed: boolean;
    dismissedAt: string | null;
    isViewed: boolean;
    viewedAt: string | null;
    viewCount: number;
    notes: string | null;
    notesUpdatedAt: string | null;
  } | null;
}
