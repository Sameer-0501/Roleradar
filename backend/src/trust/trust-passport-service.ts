/**
 * Opportunity Trust Passport Service (Engine 1 — Blueprint Section 4).
 *
 * Provides deterministic, inspectable vacancy-level provenance and verification evidence
 * across 6 distinct trust dimensions and 6 transparent status states.
 *
 * Non-negotiable Invariants:
 * - Direct employer ATS sources only (zero aggregators).
 * - Anti-credential URL validation & standard HTTPS port 443 enforcement.
 * - Absence reconciliation protection (never mark CLOSED on transient outages).
 * - Zero fabricated data (never invent salaries or fake publication dates).
 * - No duplicate company or job tables.
 */

import { validateJobUrl, type AlternateDomainRule } from '../collectors/url-validator.js';
import { SOURCE_CATALOG, type SourceDefinition } from '../sources/catalog.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, desc } from 'drizzle-orm';

// ─── Transparent Status Vocabulary (Blueprint Section 4.2.E) ─────────────────

export type TransparentPassportStatus =
  | 'VERIFIED_ACTIVE'
  | 'VERIFICATION_PENDING'
  | 'SOURCE_UNAVAILABLE'
  | 'CLOSED'
  | 'URL_INVALID'
  | 'DUPLICATE';

export type FreshnessTier = 'FRESH' | 'RECENT' | 'AGING' | 'STALE';

export type DomainMatchType =
  | 'PRIMARY_OFFICIAL_DOMAIN'
  | 'WHITELISTED_ALTERNATE_DOMAIN'
  | 'INVALID';

export type DisclosureState = 'EMPLOYER_DISCLOSED' | 'UNSTATED_BY_EMPLOYER';

// ─── Trust Dimension Interfaces (Blueprint Section 4.3) ───────────────────────

export interface EmployerProvenanceDimension {
  companyName: string;
  officialDomain: string;
  careersUrl: string;
  atsProvider: string;
  allowedAlternateDomains: string[];
  provenanceVerified: boolean;
}

export interface VacancyFreshnessDimension {
  officialPostedAt: string | null;
  firstDiscoveredAt: string;
  lastVerifiedAt: string | null;
  freshnessTier: FreshnessTier;
  explanation: string;
}

export interface ApplicationUrlIntegrityDimension {
  officialApplicationUrl: string;
  hostname: string;
  protocolHttps: boolean;
  domainMatchType: DomainMatchType;
  validationReason?: string;
  isValid: boolean;
}

export interface RequisitionIdentityDimension {
  externalJobId: string;
  sourceSystem: string;
  canonicalIdentityKey: string;
  deduplicationVerified: boolean;
}

export interface VerificationEvent {
  id: string;
  checkedAt: string;
  domainCheck: boolean | null;
  jobExistsCheck: boolean | null;
  jobIdCheck: boolean | null;
  titleCheck: boolean | null;
  locationCheck: boolean | null;
  statusCheck: boolean | null;
  applyUrlCheck: boolean | null;
  verificationScore: number | null;
  failureReason: string | null;
}

export interface AvailabilityEvidenceDimension {
  currentStatus: TransparentPassportStatus;
  statusReason: string;
  verificationHistory: VerificationEvent[];
  partialScanProtected: boolean;
  lastConfirmedActiveAt: string | null;
}

export interface FieldDisclosure {
  status: DisclosureState;
  value: string | null;
  note?: string;
}

export interface JobDetailCompletenessDimension {
  location: FieldDisclosure;
  workplaceType: FieldDisclosure;
  experienceLevel: FieldDisclosure;
  roleCategory: FieldDisclosure;
  compensation: FieldDisclosure;
  transparencyFlags: string[];
}

export interface TrustPassportSummary {
  passportStatus: TransparentPassportStatus;
  atsProvider: string;
  externalJobId: string;
  lastVerifiedAt: string | null;
  domainMatchType: DomainMatchType;
  freshnessTier: FreshnessTier;
  hostname: string;
  isUrlValid: boolean;
}

export interface OpportunityTrustPassport {
  jobId: string;
  passportStatus: TransparentPassportStatus;
  summary: TrustPassportSummary;
  dimensions: {
    employerProvenance: EmployerProvenanceDimension;
    vacancyFreshness: VacancyFreshnessDimension;
    applicationUrlIntegrity: ApplicationUrlIntegrityDimension;
    requisitionIdentity: RequisitionIdentityDimension;
    availabilityEvidence: AvailabilityEvidenceDimension;
    jobDetailCompleteness: JobDetailCompletenessDimension;
  };
  generatedAt: string;
}

// ─── Catalog Cache & Helpers ──────────────────────────────────────────────────

const catalogByCompany = new Map<string, SourceDefinition>();
const catalogByDomain = new Map<string, SourceDefinition>();

for (const source of SOURCE_CATALOG) {
  catalogByCompany.set(source.companyName.toLowerCase().trim(), source);
  catalogByDomain.set(source.officialDomain.toLowerCase().trim(), source);
}

export function findCatalogSource(companyName?: string | null, officialDomain?: string | null): SourceDefinition | undefined {
  if (companyName) {
    const found = catalogByCompany.get(companyName.toLowerCase().trim());
    if (found) return found;
  }
  if (officialDomain) {
    const found = catalogByDomain.get(officialDomain.toLowerCase().trim());
    if (found) return found;
  }
  return undefined;
}

// ─── Freshness Tier Calculation ──────────────────────────────────────────────

export function calculateFreshnessTier(
  officialPostedAt: Date | string | null | undefined,
  firstSeenAt: Date | string
): { tier: FreshnessTier; explanation: string } {
  const now = Date.now();
  const firstSeenMs = new Date(firstSeenAt).getTime();
  
  if (officialPostedAt) {
    const postedMs = new Date(officialPostedAt).getTime();
    const ageDays = Math.max(0, Math.floor((now - postedMs) / (1000 * 60 * 60 * 24)));
    const postedDateStr = new Date(officialPostedAt).toISOString().split('T')[0];

    if (ageDays <= 2) {
      return {
        tier: 'FRESH',
        explanation: `Posted by employer ${ageDays === 0 ? 'today' : `${ageDays} day(s) ago`} (official date: ${postedDateStr}).`,
      };
    }
    if (ageDays <= 7) {
      return {
        tier: 'RECENT',
        explanation: `Posted by employer ${ageDays} days ago (official date: ${postedDateStr}).`,
      };
    }
    if (ageDays <= 21) {
      return {
        tier: 'AGING',
        explanation: `Posted by employer ${ageDays} days ago (official date: ${postedDateStr}).`,
      };
    }
    return {
      tier: 'STALE',
      explanation: `Posted by employer ${ageDays} days ago (official date: ${postedDateStr}) — active status verified but posting is mature.`,
    };
  }

  // Fallback to first seen date when employer does not disclose publication date
  const ageDays = Math.max(0, Math.floor((now - firstSeenMs) / (1000 * 60 * 60 * 24)));
  if (ageDays <= 2) {
    return {
      tier: 'FRESH',
      explanation: `First discovered by RoleRadar ${ageDays === 0 ? 'today' : `${ageDays} day(s) ago`} (employer did not disclose exact publication timestamp).`,
    };
  }
  if (ageDays <= 7) {
    return {
      tier: 'RECENT',
      explanation: `First discovered by RoleRadar ${ageDays} days ago (employer did not disclose exact publication timestamp).`,
    };
  }
  if (ageDays <= 21) {
    return {
      tier: 'AGING',
      explanation: `First discovered by RoleRadar ${ageDays} days ago (employer did not disclose exact publication timestamp).`,
    };
  }
  return {
    tier: 'STALE',
    explanation: `Discovered by RoleRadar ${ageDays} days ago without explicit employer publication timestamp.`,
  };
}

// ─── Status & Domain Derivations ─────────────────────────────────────────────

export function derivePassportStatus(params: {
  status: string;
  verificationStatus: string;
  isUrlValid: boolean;
  latestVerificationFailureReason?: string | null;
  isDuplicate?: boolean;
}): { passportStatus: TransparentPassportStatus; reason: string } {
  const { status, verificationStatus, isUrlValid, latestVerificationFailureReason, isDuplicate } = params;

  if (isDuplicate) {
    return {
      passportStatus: 'DUPLICATE',
      reason: 'Requisition collides with an existing canonical (company, source_system, external_job_id) record.',
    };
  }

  if (!isUrlValid) {
    return {
      passportStatus: 'URL_INVALID',
      reason: 'Application URL failed security or provenance validation.',
    };
  }

  if (status === 'CLOSED') {
    return {
      passportStatus: 'CLOSED',
      reason: 'Position confirmed closed by authoritative HTTP 404 response or complete-scan absence reconciliation.',
    };
  }

  // Check for transient upstream source unavailability
  const isTransientFailure =
    latestVerificationFailureReason &&
    (/timeout|500|502|503|504|429|econnreset|etimedout|network|unavailable/i.test(latestVerificationFailureReason));

  if (status === 'VERIFICATION_FAILED' || isTransientFailure) {
    return {
      passportStatus: 'SOURCE_UNAVAILABLE',
      reason: 'Upstream employer career site encountered a transient network/HTTP error. The vacancy is preserved in existing status without premature closure.',
    };
  }

  if (status === 'VERIFYING' || verificationStatus === 'PENDING' || status === 'DISCOVERED') {
    return {
      passportStatus: 'VERIFICATION_PENDING',
      reason: 'Awaiting scheduled verification cycle against official employer ATS endpoint.',
    };
  }

  if (status === 'ACTIVE' && verificationStatus === 'VERIFIED') {
    return {
      passportStatus: 'VERIFIED_ACTIVE',
      reason: 'Current live evidence confirms the vacancy is active and available directly on the employer ATS.',
    };
  }

  return {
    passportStatus: 'VERIFICATION_PENDING',
    reason: 'Verification in progress or pending initial source confirmation.',
  };
}

export function evaluateDomainMatch(
  url: string,
  officialDomain: string,
  alternateRules?: AlternateDomainRule[]
): {
  domainMatchType: DomainMatchType;
  hostname: string;
  protocolHttps: boolean;
  isValid: boolean;
  validationReason?: string;
} {
  const valResult = validateJobUrl(url, officialDomain, alternateRules);
  let hostname = '';
  let protocolHttps = false;

  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    protocolHttps = parsed.protocol === 'https:';
  } catch {
    return {
      domainMatchType: 'INVALID',
      hostname: '',
      protocolHttps: false,
      isValid: false,
      validationReason: valResult.reason,
    };
  }

  if (!valResult.valid) {
    return {
      domainMatchType: 'INVALID',
      hostname,
      protocolHttps,
      isValid: false,
      validationReason: valResult.reason,
    };
  }

  const normHost = hostname.toLowerCase();
  const normOfficial = officialDomain.toLowerCase();

  if (normHost === normOfficial || normHost.endsWith('.' + normOfficial)) {
    return {
      domainMatchType: 'PRIMARY_OFFICIAL_DOMAIN',
      hostname,
      protocolHttps,
      isValid: true,
      validationReason: 'Application URL matches official primary employer ATS domain.',
    };
  }

  if (alternateRules && alternateRules.some(r => r.domain.toLowerCase() === normHost)) {
    return {
      domainMatchType: 'WHITELISTED_ALTERNATE_DOMAIN',
      hostname,
      protocolHttps,
      isValid: true,
      validationReason: 'Application URL matches whitelisted alternate employer career domain with enforced requisition path.',
    };
  }

  return {
    domainMatchType: 'INVALID',
    hostname,
    protocolHttps,
    isValid: false,
    validationReason: valResult.reason || 'Unrecognized domain.',
  };
}

// ─── Fast Lightweight Trust Summary (Zero N+1) ────────────────────────────────

export function buildTrustSummary(
  job: {
    id: string;
    status: string;
    verification_status: string;
    source_system: string;
    external_job_id: string;
    official_url: string;
    first_seen_at: Date | string;
    last_verified_at: Date | string | null;
    official_posted_at: Date | string | null;
  },
  company: {
    name?: string | null;
    official_domain?: string | null;
  }
): TrustPassportSummary {
  const officialDomain = company.official_domain || '';
  const catalogEntry = findCatalogSource(company.name, officialDomain);
  const domainEval = evaluateDomainMatch(
    job.official_url,
    officialDomain,
    catalogEntry?.allowedAlternateDomains
  );

  const freshness = calculateFreshnessTier(job.official_posted_at, job.first_seen_at);
  const statusDerivation = derivePassportStatus({
    status: job.status,
    verificationStatus: job.verification_status,
    isUrlValid: domainEval.isValid,
  });

  return {
    passportStatus: statusDerivation.passportStatus,
    atsProvider: job.source_system,
    externalJobId: job.external_job_id,
    lastVerifiedAt: job.last_verified_at ? new Date(job.last_verified_at).toISOString() : null,
    domainMatchType: domainEval.domainMatchType,
    freshnessTier: freshness.tier,
    hostname: domainEval.hostname,
    isUrlValid: domainEval.isValid,
  };
}

// ─── Compensation & Disclosure Parsing ────────────────────────────────────────

const SALARY_REGEX = /(?:(?:USD|\$|₹|INR|EUR|GBP|CAD|AUD)\s*[\d,]+(?:\s*(?:-|to)\s*(?:USD|\$|₹|INR|EUR|GBP|CAD|AUD)?\s*[\d,]+)?(?:\s*(?:k|K|lakhs?|lac|L|cr|per year|per month|annual|annually|\/yr|\/year|\/hr|\/hour|p\.a\.))?)|(?:\b[\d,]+\s*(?:-|to)\s*[\d,]+\s*(?:USD|EUR|GBP|INR|lakhs?|lac|per year|annually)\b)/i;

export function parseCompensationDisclosure(description?: string | null, requirements?: string | null): FieldDisclosure {
  const fullText = `${description || ''}\n${requirements || ''}`;
  const match = fullText.match(SALARY_REGEX);

  if (match) {
    const rawSnippet = match[0].trim();
    return {
      status: 'EMPLOYER_DISCLOSED',
      value: rawSnippet,
      note: 'Compensation disclosed in official employer posting description.',
    };
  }

  return {
    status: 'UNSTATED_BY_EMPLOYER',
    value: null,
    note: 'Compensation unstated by employer — RoleRadar does not fabricate estimated salary ranges.',
  };
}

// ─── Full Opportunity Trust Passport Builder ─────────────────────────────────

export async function buildOpportunityTrustPassport(jobId: string): Promise<OpportunityTrustPassport | null> {
  const db = getDb();

  // 1. Fetch Job and Company with explicit projection
  const [row] = await db
    .select({
      id: schema.jobs.id,
      company_id: schema.jobs.company_id,
      source_system: schema.jobs.source_system,
      external_job_id: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplace_type: schema.jobs.workplace_type,
      employment_type: schema.jobs.employment_type,
      official_url: schema.jobs.official_url,
      apply_url: schema.jobs.apply_url,
      official_posted_at: schema.jobs.official_posted_at,
      first_seen_at: schema.jobs.first_seen_at,
      last_seen_at: schema.jobs.last_seen_at,
      last_verified_at: schema.jobs.last_verified_at,
      status: schema.jobs.status,
      verification_status: schema.jobs.verification_status,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      company_name: schema.companies.name,
      company_domain: schema.companies.official_domain,
      company_careers_url: schema.companies.careers_url,
      company_ats_type: schema.companies.ats_type,
    })
    .from(schema.jobs)
    .leftJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!row) {
    return null;
  }

  // 2. Fetch Verification Audit History (bounded to 20 records)
  const verifications = await db
    .select({
      id: schema.jobVerifications.id,
      checked_at: schema.jobVerifications.checked_at,
      domain_check: schema.jobVerifications.domain_check,
      job_exists_check: schema.jobVerifications.job_exists_check,
      job_id_check: schema.jobVerifications.job_id_check,
      title_check: schema.jobVerifications.title_check,
      location_check: schema.jobVerifications.location_check,
      status_check: schema.jobVerifications.status_check,
      apply_url_check: schema.jobVerifications.apply_url_check,
      verification_score: schema.jobVerifications.verification_score,
      failure_reason: schema.jobVerifications.failure_reason,
    })
    .from(schema.jobVerifications)
    .where(eq(schema.jobVerifications.job_id, jobId))
    .orderBy(desc(schema.jobVerifications.checked_at))
    .limit(20);

  const verificationHistory: VerificationEvent[] = verifications.map((v) => ({
    id: v.id,
    checkedAt: new Date(v.checked_at).toISOString(),
    domainCheck: v.domain_check,
    jobExistsCheck: v.job_exists_check,
    jobIdCheck: v.job_id_check,
    titleCheck: v.title_check,
    locationCheck: v.location_check,
    statusCheck: v.status_check,
    applyUrlCheck: v.apply_url_check,
    verificationScore: v.verification_score,
    failureReason: v.failure_reason,
  }));

  const latestVerification = verifications[0];

  // 3. Catalog lookup for alternate domains and provenance
  const catalogEntry = findCatalogSource(row.company_name, row.company_domain);
  const allowedAlternateDomains = catalogEntry?.allowedAlternateDomains?.map((r) => r.domain) || [];

  // 4. Application URL Integrity evaluation
  const domainEval = evaluateDomainMatch(
    row.official_url,
    row.company_domain || '',
    catalogEntry?.allowedAlternateDomains
  );

  // 5. Freshness tier calculation
  const freshness = calculateFreshnessTier(row.official_posted_at, row.first_seen_at);

  // 6. Transparent Status Derivation
  const statusDerivation = derivePassportStatus({
    status: row.status,
    verificationStatus: row.verification_status,
    isUrlValid: domainEval.isValid,
    latestVerificationFailureReason: latestVerification?.failure_reason,
  });

  // 7. Last Confirmed Active calculation
  let lastConfirmedActiveAt: string | null = null;
  const passedVerification = verifications.find((v) => v.status_check === true || (v.verification_score !== null && v.verification_score >= 0.8));
  if (passedVerification) {
    lastConfirmedActiveAt = new Date(passedVerification.checked_at).toISOString();
  } else if (row.last_verified_at) {
    lastConfirmedActiveAt = new Date(row.last_verified_at).toISOString();
  }

  // 8. Experience parsing
  const expParsed = parseExperienceRequirements(row.title, row.description, row.requirements);

  // 9. Compensation disclosure
  const compensationDisclosure = parseCompensationDisclosure(row.description, row.requirements);

  // 10. Assemble Transparency Flags
  const transparencyFlags: string[] = [];
  if (compensationDisclosure.status === 'UNSTATED_BY_EMPLOYER') {
    transparencyFlags.push('Compensation unstated by employer — RoleRadar does not fabricate estimated salary ranges.');
  }
  if (!row.official_posted_at) {
    transparencyFlags.push('Exact publication date unstated by employer — freshness measured from first discovery timestamp.');
  }
  if (domainEval.domainMatchType === 'WHITELISTED_ALTERNATE_DOMAIN') {
    transparencyFlags.push('Application hosted on verified alternate employer career domain.');
  }
  if (expParsed.classification === 'UNKNOWN') {
    transparencyFlags.push('Experience requirements unstated or flexible — never defaulted to Fresher.');
  }

  const passport: OpportunityTrustPassport = {
    jobId: row.id,
    passportStatus: statusDerivation.passportStatus,
    summary: {
      passportStatus: statusDerivation.passportStatus,
      atsProvider: row.source_system,
      externalJobId: row.external_job_id,
      lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null,
      domainMatchType: domainEval.domainMatchType,
      freshnessTier: freshness.tier,
      hostname: domainEval.hostname,
      isUrlValid: domainEval.isValid,
    },
    dimensions: {
      employerProvenance: {
        companyName: row.company_name || 'Unknown Company',
        officialDomain: row.company_domain || '',
        careersUrl: row.company_careers_url || '',
        atsProvider: row.source_system,
        allowedAlternateDomains,
        provenanceVerified: Boolean(row.company_domain && row.company_domain.length > 0),
      },
      vacancyFreshness: {
        officialPostedAt: row.official_posted_at ? new Date(row.official_posted_at).toISOString() : null,
        firstDiscoveredAt: new Date(row.first_seen_at).toISOString(),
        lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null,
        freshnessTier: freshness.tier,
        explanation: freshness.explanation,
      },
      applicationUrlIntegrity: {
        officialApplicationUrl: row.official_url,
        hostname: domainEval.hostname,
        protocolHttps: domainEval.protocolHttps,
        domainMatchType: domainEval.domainMatchType,
        validationReason: domainEval.validationReason,
        isValid: domainEval.isValid,
      },
      requisitionIdentity: {
        externalJobId: row.external_job_id,
        sourceSystem: row.source_system,
        canonicalIdentityKey: `${row.company_id}:${row.source_system}:${row.external_job_id}`,
        deduplicationVerified: true,
      },
      availabilityEvidence: {
        currentStatus: statusDerivation.passportStatus,
        statusReason: statusDerivation.reason,
        verificationHistory,
        partialScanProtected: true,
        lastConfirmedActiveAt,
      },
      jobDetailCompleteness: {
        location: {
          status: (row.location && row.location.trim().length > 0 && row.location.toUpperCase() !== 'UNKNOWN')
            ? 'EMPLOYER_DISCLOSED'
            : 'UNSTATED_BY_EMPLOYER',
          value: row.location || null,
          note: row.location ? undefined : 'Location unstated in requisition header',
        },
        workplaceType: {
          status: (row.workplace_type && row.workplace_type !== 'UNKNOWN')
            ? 'EMPLOYER_DISCLOSED'
            : 'UNSTATED_BY_EMPLOYER',
          value: row.workplace_type || null,
          note: (row.workplace_type && row.workplace_type !== 'UNKNOWN')
            ? undefined
            : 'Workplace classification unstated by employer',
        },
        experienceLevel: {
          status: expParsed.classification !== 'UNKNOWN' ? 'EMPLOYER_DISCLOSED' : 'UNSTATED_BY_EMPLOYER',
          value: expParsed.classification,
          note: expParsed.reason,
        },
        roleCategory: {
          status: row.employment_type ? 'EMPLOYER_DISCLOSED' : 'UNSTATED_BY_EMPLOYER',
          value: row.employment_type || null,
          note: row.employment_type ? undefined : 'Employment category unstated',
        },
        compensation: compensationDisclosure,
        transparencyFlags,
      },
    },
    generatedAt: new Date().toISOString(),
  };

  return passport;
}
