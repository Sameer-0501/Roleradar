/**
 * Search Intelligence Types & Data Contracts.
 *
 * Defines structured representations for parsed search intent,
 * suggestions, and search-extended job match results.
 */

import type { ExperienceLevel, WorkplaceType } from '../matching/matching-types.js';

export type OccupationalCategory =
  | 'SOFTWARE_ENGINEERING'
  | 'DATA_AI_ML'
  | 'IT_INFRASTRUCTURE'
  | 'CYBERSECURITY'
  | 'QA_TESTING'
  | 'HARDWARE_EMBEDDED'
  | 'TECHNICAL_SUPPORT'
  | 'PRODUCT'
  | 'DESIGN_UX'
  | 'FINANCE_ACCOUNTING'
  | 'HR_RECRUITING'
  | 'SALES'
  | 'MARKETING'
  | 'OPERATIONS'
  | 'CUSTOMER_SUCCESS'
  | 'LEGAL'
  | 'PROCUREMENT'
  | 'SUPPLY_CHAIN'
  | 'MANUFACTURING'
  | 'ENGINEERING_OTHER'
  | 'RESEARCH'
  | 'CONSULTING'
  | 'HEALTHCARE'
  | 'ADMINISTRATION'
  | 'OTHER';

export interface StructuredSearchIntent {
  /** Original query string entered by user */
  originalQuery: string;
  /** Normalized lowercased string used for token extraction */
  normalizedQuery: string;
  /** Interpreted experience level (FRESHER, EXPERIENCED, ANY, or null if unspecified) */
  experienceLevel: ExperienceLevel | 'ANY' | null;
  /** Identified target roles */
  roles: string[];
  /** High-level occupational category */
  occupationalCategory: OccupationalCategory | null;
  /** Extracted skills with canonical names (e.g. JS -> JavaScript) */
  skills: string[];
  /** Extracted canonical locations (e.g. Bangalore, Mumbai, London) */
  locations: string[];
  /** Extracted canonical country (e.g. India, United States, Germany, United Kingdom) */
  country: string | null;
  /** Extracted workplace preferences (ONSITE, HYBRID, REMOTE) */
  workplaceTypes: WorkplaceType[];
  /** Extracted employer / company names */
  companies: string[];
  /** Tokens recognized and consumed by parser */
  recognizedTokens: string[];
  /** Remaining keywords not matched to specific semantic slots */
  remainingKeywords: string[];
  /** Whether the query contained natural language phrasing */
  isNaturalLanguage: boolean;
}

export type SuggestionType =
  | 'ROLE'
  | 'CATEGORY'
  | 'SKILL'
  | 'LOCATION'
  | 'EXPERIENCE'
  | 'WORKPLACE';

export interface SearchSuggestion {
  text: string;
  type: SuggestionType;
  categoryLabel?: string;
  badge?: string;
}

export interface SearchExplanation {
  summary: string;
  matchedCriteria: {
    role?: string;
    skills?: string[];
    experience?: string;
    location?: string;
    country?: string;
    workplace?: string;
    freshness?: string;
  };
  reasons: string[];
}
