/**
 * ATS (Applicant Tracking System) type definitions.
 *
 * Each company's official careers source is described by a SourceConfig.
 * In Phase 1, no companies are pre-configured. Configurations are
 * inserted into the `companies` table only when real, verified data
 * is available for a company.
 */

export type AtsType =
  | 'WORKDAY'
  | 'GREENHOUSE'
  | 'LEVER'
  | 'SAP'
  | 'SMARTRECRUITERS'
  | 'CUSTOM'
  | 'UNKNOWN';

/**
 * Configuration for a single company's official careers source.
 *
 * - `officialDomain`: The domain that official job URLs must belong to
 *   (e.g. "careers.example.com" or "example.wd1.myworkdayjobs.com").
 * - `careersUrl`: The canonical careers listing page.
 * - `atsType`: The ATS platform this company uses.
 * - `enabled`: Whether active scanning is enabled for this source.
 * - `atsConfig`: ATS-specific configuration (API paths, selectors, etc.)
 *   stored as opaque JSON. Structure varies per ATS type.
 */
export interface SourceConfig {
  company: string;
  officialDomain: string;
  careersUrl: string;
  atsType: AtsType;
  enabled: boolean;
  atsConfig?: Record<string, unknown>;
}
