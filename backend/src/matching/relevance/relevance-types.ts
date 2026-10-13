/**
 * Relevance and Ranking Engine Types.
 *
 * Defines deterministic scoring models, freshness categories, sorting modes,
 * and explanation structures for Phase 9 job ranking.
 */

import type { ExperienceClassification, WorkplaceType } from '../matching-types.js';

export type FreshnessState = 'FRESH' | 'RECENT' | 'AGING' | 'STALE';

export type SortOption =
  | 'BEST_MATCH'
  | 'NEWEST'
  | 'MOST_RELEVANT'
  | 'RECENTLY_VERIFIED';

export interface FreshnessScoreResult {
  state: FreshnessState;
  score: number; // 0 to 7
  reason: string;
  daysSinceDiscovered: number;
  daysSinceVerified: number;
}

export interface RoleScoreResult {
  score: number; // 0 to 45
  matchTier: 'EXACT' | 'STRONG_SYNONYM' | 'SPECIALIZATION' | 'RELATED_TECH' | 'GENERIC_OVERLAP' | 'NONE';
  matchedRoleName: string;
  reason: string;
}

export interface ExperienceScoreResult {
  score: number; // 0 to 25
  isFresherTargeted: boolean;
  classification: ExperienceClassification;
  minYears?: number;
  maxYears?: number;
  reason: string;
}

export interface LocationScoreResult {
  score: number; // 0 to 15
  matchedLocation: string;
  isRemote: boolean;
  isCityExact: boolean;
  reason: string;
}

export interface WorkplaceScoreResult {
  score: number; // 0 to 8
  workplace: WorkplaceType;
  reason: string;
}

export interface RelevanceBreakdown {
  role: RoleScoreResult;
  experience: ExperienceScoreResult;
  location: LocationScoreResult;
  workplace: WorkplaceScoreResult;
  freshness: FreshnessScoreResult;
  diversityPenalty: number; // 0 to -5 tie-breaker penalty
  totalScore: number; // 0 to 100
}

export interface JobRelevanceResult {
  jobId: string;
  totalScore: number;
  breakdown: RelevanceBreakdown;
  matchExplanations: string[];
}

export interface JobFilterOptions {
  q?: string;
  sort?: SortOption;
  roleFilter?: string;
  workplace?: string;
  freshness?: string;
  experience?: string;
  location?: string;
  companyId?: string;
  country?: string;
  page?: number;
  limit?: number;
  onlyToday?: boolean;
  includeDismissed?: boolean;
}
