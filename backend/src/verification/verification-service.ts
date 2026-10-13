/**
 * Verification Service.
 *
 * Responsible for verifying that a discovered job is genuine by checking
 * it against the employer's official source.
 *
 * Phase 2A behavior:
 * - For Greenhouse sources (boardToken provided):
 *   Real HTTP verification against the Greenhouse per-job API.
 * - For other sources (no boardToken):
 *   Domain check performed, live checks skipped → PENDING.
 *   This preserves Phase 1 backward-compatibility.
 *
 * INVARIANT: A job is NEVER marked VERIFIED unless ALL required checks
 * pass with real data. This is strictly enforced — callers must not bypass.
 *
 * Required checks for VERIFIED:
 *   1. domainCheck      — URL on official domain
 *   2. jobExistsCheck   — per-job API returns HTTP 200
 *   3. jobIdCheck       — API response id matches externalJobId
 *   4. titleCheck       — API title matches (normalized)
 *   5. statusCheck      — job is not closed/removed
 *
 * Optional checks (logged but not required for VERIFIED):
 *   6. locationCheck    — location matches (with city aliases)
 *   7. applyUrlCheck    — apply URL is valid HTTPS on correct domain
 *
 * Network safety:
 *   - 10s timeout per request
 *   - No retries during verification (we want the current state)
 *   - HTTP 404 = confirmed closed
 *   - HTTP 5xx/timeout = PENDING (cannot determine state)
 */

import { createHash } from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import type { VerificationInput, VerificationResult, VerificationStatus } from './types.js';

const log = createLogger('verification-service');

const GREENHOUSE_API_BASE = 'https://boards-api.greenhouse.io/v1/boards';
const VERIFICATION_TIMEOUT_MS = 10_000;

// ─── Content hash ─────────────────────────────────────────────────────────────

/**
 * Compute the content hash for a job.
 * Used to detect when a job's content has changed between scans.
 *
 * @param fields - Fields that together represent the job's content
 * @returns SHA-256 hex digest
 */
export function computeContentHash(fields: {
  title: string;
  location?: string;
  description?: string;
  requirements?: string;
  officialUrl?: string;
}): string {
  const normalised = [
    (fields.title ?? '').toLowerCase().trim(),
    (fields.location ?? '').toLowerCase().trim(),
    (fields.description ?? '').toLowerCase().trim(),
    (fields.requirements ?? '').toLowerCase().trim(),
    (fields.officialUrl ?? '').toLowerCase().trim(),
  ].join('|');
  return createHash('sha256').update(normalised).digest('hex');
}

// ─── Domain check ─────────────────────────────────────────────────────────────

/**
 * Check whether a job URL belongs to the company's official domain.
 * Pure URL parse — no HTTP request.
 */
function checkDomain(officialUrl: string, officialDomain: string): boolean {
  try {
    const parsed = new URL(officialUrl);
    const jobHost = parsed.hostname.toLowerCase();
    const domain = officialDomain.toLowerCase();
    return jobHost === domain || jobHost.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

// ─── Location normalization ───────────────────────────────────────────────────

/**
 * City name aliases for harmless location formatting differences.
 * Keys and values are all lowercase.
 */
const CITY_ALIASES: Record<string, string> = {
  bangalore: 'bengaluru',
  bombay: 'mumbai',
  calcutta: 'kolkata',
};

/**
 * Normalize a location string for comparison.
 * Lowercases, trims, applies city aliases.
 */
function normalizeLocation(location: string): string {
  let normalized = location.toLowerCase().trim();
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
  }
  return normalized;
}

/**
 * Check whether two location strings are equivalent.
 * Accounts for harmless formatting differences and city aliases.
 */
function checkLocationsMatch(collected: string, official: string): boolean {
  const normalCollected = normalizeLocation(collected);
  const normalOfficial = normalizeLocation(official);
  // Exact match after normalization
  if (normalCollected === normalOfficial) return true;
  // One contains the other (e.g. "Remote, India" vs "India")
  if (normalCollected.includes(normalOfficial) || normalOfficial.includes(normalCollected)) {
    return true;
  }
  return false;
}

// ─── Title matching ───────────────────────────────────────────────────────────

/**
 * Check whether two job titles are equivalent.
 * Allows case and whitespace differences. Does not accept completely unrelated titles.
 */
function checkTitlesMatch(collected: string, official: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return normalize(collected) === normalize(official);
}

// ─── Greenhouse per-job fetch ─────────────────────────────────────────────────

interface GreenhouseJobDetail {
  id: number;
  title: string;
  location?: { name: string | null };
  absolute_url?: string;
}

/**
 * Fetch a single job from the Greenhouse per-job API.
 *
 * Returns:
 *   - `{ found: true, job }` when the job exists (HTTP 200)
 *   - `{ found: false }` when the job does not exist (HTTP 404 = confirmed closed)
 *   - `{ found: null }` on transient error (5xx, timeout) — cannot determine state
 */
async function fetchGreenhouseJob(
  boardToken: string,
  externalJobId: string
): Promise<{ found: true; job: GreenhouseJobDetail } | { found: false } | { found: null; reason: string }> {
  const url = `${GREENHOUSE_API_BASE}/${boardToken}/jobs/${externalJobId}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from Greenhouse per-job API — transient error`,
      };
    }

    const job = (await response.json()) as GreenhouseJobDetail;
    return { found: true, job };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

const LEVER_API_BASE = 'https://api.lever.co/v0/postings';

interface LeverJobDetail {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  categories?: {
    location?: string | null;
    commitment?: string | null;
  };
}

/**
 * Fetch a single job from the Lever per-job API.
 *
 * Conservative verification rules:
 * - HTTP 404 = authoritative "job does not exist" (found: false)
 * - HTTP 200 = validate payload structure thoroughly (found: true only if valid)
 * - HTTP 429/5xx/timeout/network error = transient error (found: null)
 */
async function fetchLeverJob(
  siteToken: string,
  externalJobId: string
): Promise<{ found: true; job: LeverJobDetail } | { found: false } | { found: null; reason: string }> {
  const url = `${LEVER_API_BASE}/${siteToken}/${externalJobId}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from Lever per-job API — transient error`,
      };
    }

    const data = (await response.json()) as unknown;
    if (typeof data !== 'object' || data === null) {
      return {
        found: null,
        reason: 'Lever per-job API returned non-object response',
      };
    }

    const job = data as LeverJobDetail;

    // Conservative check: HTTP 200 alone is NOT enough; payload must have valid ID and text
    if (!job.id || typeof job.id !== 'string' || !job.text || typeof job.text !== 'string') {
      return {
        found: null,
        reason: 'Lever per-job response missing required id or text fields',
      };
    }

    return { found: true, job };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

// ─── Workday per-job fetch ──────────────────────────────────────────────────

interface WorkdayJobDetail {
  jobReqId?: string;
  title?: string;
  location?: string;
  externalUrl?: string;
  timeType?: string;
  postedOn?: string;
}

/**
 * Fetch a single job from the Workday CXS per-job API.
 *
 * Conservative verification rules:
 * - HTTP 404 = authoritative "job does not exist" (found: false)
 * - HTTP 200 = validate payload structure thoroughly (found: true only if valid jobPostingInfo)
 * - HTTP 429/5xx/timeout/network error = transient error (found: null)
 */
async function fetchWorkdayJob(
  workdayConfig: { host: string; tenant: string; clientSite: string },
  officialUrl: string,
  _externalJobId: string
): Promise<{ found: true; job: WorkdayJobDetail } | { found: false } | { found: null; reason: string }> {
  let jobPath = '';
  try {
    const parsed = new URL(officialUrl);
    const prefix = `/${workdayConfig.clientSite}`;
    if (parsed.pathname.startsWith(prefix)) {
      jobPath = parsed.pathname.slice(prefix.length);
    } else {
      jobPath = parsed.pathname;
    }
  } catch {
    return { found: null, reason: `Invalid official URL format: ${officialUrl}` };
  }

  const url = `https://${workdayConfig.host}/wday/cxs/${workdayConfig.tenant}/${workdayConfig.clientSite}${jobPath}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from Workday CXS API — transient error`,
      };
    }

    const data = (await response.json()) as { jobPostingInfo?: WorkdayJobDetail };
    if (!data || typeof data !== 'object' || !data.jobPostingInfo || typeof data.jobPostingInfo !== 'object') {
      return {
        found: null,
        reason: 'Workday per-job API returned non-object or missing jobPostingInfo',
      };
    }

    const info = data.jobPostingInfo;

    // Conservative check: title must exist and be non-empty string
    if (!info.title || typeof info.title !== 'string' || info.title.trim().length === 0) {
      return {
        found: null,
        reason: 'Workday jobPostingInfo missing required title',
      };
    }

    return { found: true, job: info };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

// ─── Custom per-job fetch ───────────────────────────────────────────────────

interface CustomJobDetail {
  id?: string;
  title?: string;
  location?: string;
  applyUrl?: string;
}

/**
 * Fetch a single job from a custom authoritative endpoint.
 *
 * Conservative verification rules:
 * - HTTP 404 = authoritative "job does not exist" (found: false)
 * - HTTP 200 = validate payload structure thoroughly (found: true only if valid id and title)
 * - HTTP 429/5xx/timeout/network error = transient error (found: null)
 */
async function fetchCustomJob(
  customConfig: { perJobApiEndpointTemplate?: string },
  externalJobId: string
): Promise<{ found: true; job: CustomJobDetail } | { found: false } | { found: null; reason: string }> {
  if (!customConfig.perJobApiEndpointTemplate) {
    return { found: null, reason: 'No perJobApiEndpointTemplate configured for custom source' };
  }

  const url = customConfig.perJobApiEndpointTemplate.replace('{id}', encodeURIComponent(externalJobId));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from custom per-job API — transient error`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (!data || typeof data !== 'object') {
      return {
        found: null,
        reason: 'Custom per-job API returned non-object response',
      };
    }

    // Extract title (supports name or title)
    const titleVal = data['name'] ?? data['title'];
    const title = typeof titleVal === 'string' ? titleVal.trim() : '';

    // Extract ID (supports id or refNumber)
    const idVal = data['id'] ?? data['refNumber'];
    const id = idVal !== undefined && idVal !== null ? String(idVal).trim() : '';

    if (!title) {
      return {
        found: null,
        reason: 'Custom per-job response missing required title/name field',
      };
    }

    // Extract location if present
    let location: string | undefined;
    const locObj = data['location'];
    if (typeof locObj === 'string') {
      location = locObj;
    } else if (locObj && typeof locObj === 'object') {
      const city = (locObj as Record<string, unknown>)['city'];
      const country = (locObj as Record<string, unknown>)['country'];
      const parts = [city, country].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (parts.length > 0) location = parts.join(', ');
    }

    // Extract applyUrl if present
    const applyUrlVal = data['applyUrl'];
    const applyUrl = typeof applyUrlVal === 'string' ? applyUrlVal.trim() : undefined;

    return { found: true, job: { id, title, location, applyUrl } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

// ─── Apply URL check ──────────────────────────────────────────────────────────

/**
 * Validate an apply URL:
 *   - Must be HTTPS
 *   - Must be on the authoritative domain or ATS domain
 */
function checkApplyUrl(applyUrl: string, officialDomain: string): boolean {
  try {
    const parsed = new URL(applyUrl);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    const domain = officialDomain.toLowerCase();
    const isAtsApply =
      hostname === 'app.greenhouse.io' ||
      hostname.endsWith('.greenhouse.io') ||
      hostname === 'jobs.lever.co' ||
      hostname.endsWith('.lever.co') ||
      hostname.endsWith('.myworkdayjobs.com') ||
      hostname === 'myworkdayjobs.com' ||
      hostname.endsWith('.smartrecruiters.com') ||
      hostname === 'smartrecruiters.com' ||
      hostname.endsWith('.ashbyhq.com') ||
      hostname === 'jobs.ashbyhq.com' ||
      hostname.endsWith('.workable.com') ||
      hostname === 'apply.workable.com';
    const isOfficialDomain = hostname === domain || hostname.endsWith(`.${domain}`);
    return isAtsApply || isOfficialDomain;
  } catch {
    return false;
  }
}

// ─── Workable per-job fetch ─────────────────────────────────────────────────

interface WorkableJobDetail {
  id?: string | number;
  shortcode?: string;
  code?: string;
  title?: string;
  city?: string;
  country?: string;
  state?: string;
  application_url?: string;
}

/**
 * Fetch and verify a job from Workable's authoritative job details API.
 */
async function fetchWorkableJob(
  accountSlug: string,
  externalJobId: string
): Promise<{ found: true; job: WorkableJobDetail } | { found: false } | { found: null; reason: string }> {
  const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(accountSlug)}/jobs/${encodeURIComponent(externalJobId)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from Workable API — transient error`,
      };
    }

    const data = (await response.json()) as WorkableJobDetail;
    if (!data || typeof data !== 'object' || !data.title) {
      return {
        found: null,
        reason: 'Workable API returned non-object or missing title response',
      };
    }

    return { found: true, job: data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

// ─── Ashby per-job fetch ───────────────────────────────────────────────────

interface AshbyJobDetail {
  id: string;
  title: string;
  location?: string;
  applyUrl?: string;
}

/**
 * Fetch and verify a job from Ashby's authoritative job board API.
 */
async function fetchAshbyJob(
  jobBoardName: string,
  externalJobId: string
): Promise<{ found: true; job: AshbyJobDetail } | { found: false } | { found: null; reason: string }> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(jobBoardName)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from Ashby API — transient error`,
      };
    }

    const data = (await response.json()) as { jobs?: Array<{ id: string; title: string; location?: string; applyUrl?: string }> };
    if (!data || !Array.isArray(data.jobs)) {
      return {
        found: null,
        reason: 'Ashby API returned non-array jobs response',
      };
    }

    const matching = data.jobs.find((j) => String(j.id).trim() === String(externalJobId).trim());
    if (!matching || !matching.title) {
      return { found: false };
    }

    return {
      found: true,
      job: {
        id: matching.id,
        title: matching.title,
        location: matching.location,
        applyUrl: matching.applyUrl,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

// ─── SmartRecruiters per-job fetch ─────────────────────────────────────────

interface SmartRecruitersDetailResponse {
  id: string;
  name: string;
  releasedDate?: string;
  postingUrl?: string;
  applyUrl?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    remote?: boolean;
    hybrid?: boolean;
    fullLocation?: string;
  };
  typeOfEmployment?: { id: string; label: string };
}

/**
 * Fetch and verify a job from SmartRecruiters' authoritative API.
 */
async function fetchSmartrecruitersJob(
  companyIdentifier: string,
  externalJobId: string
): Promise<{ found: true; job: SmartRecruitersDetailResponse } | { found: false } | { found: null; reason: string }> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyIdentifier)}/postings/${encodeURIComponent(externalJobId)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from SmartRecruiters API — transient error`,
      };
    }

    const data = (await response.json()) as SmartRecruitersDetailResponse;
    if (!data || typeof data !== 'object' || !data.name) {
      return {
        found: null,
        reason: 'SmartRecruiters API returned non-object or missing name response',
      };
    }

    return { found: true, job: data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

// ─── SAP SuccessFactors per-job fetch ─────────────────────────────────────────

interface SapJobDetail {
  id: string | number;
  unifiedStandardTitle?: string;
  jobLocationShort?: string[];
  sfstd_jobLocation_obj?: string[];
}

/**
 * Fetch and verify a job from SAP SuccessFactors authoritative API.
 */
async function fetchSapJob(
  apiBaseUrl: string,
  externalJobId: string
): Promise<{ found: true; job: SapJobDetail } | { found: false } | { found: null; reason: string }> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/services/recruiting/v1/jobs`;
  const payload = {
    locale: "en_US",
    pageNumber: 0,
    sortBy: "",
    keywords: externalJobId,
    location: "",
    facetFilters: {},
    brand: "",
    skills: [],
    categoryId: 0,
    alertId: "",
    rcmCandidateId: ""
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
        },
        body: JSON.stringify(payload)
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return {
        found: null,
        reason: `HTTP ${response.status} from SAP API — transient error`,
      };
    }

    const data = (await response.json()) as { jobSearchResult?: Array<{ response: SapJobDetail }> };
    if (!data || typeof data !== 'object') {
      return {
        found: null,
        reason: 'SAP API returned non-object response',
      };
    }

    if (!data.jobSearchResult || !Array.isArray(data.jobSearchResult)) {
      // Missing jobSearchResult means totalJobs was likely 0 -> Authoritative closed
      return { found: false };
    }

    // Must find exact ID match
    const matching = data.jobSearchResult.find(
      (j) => j.response && String(j.response.id) === String(externalJobId)
    );

    if (!matching) {
      return { found: false }; // Search returned something else, exact ID missing = closed
    }

    return { found: true, job: matching.response };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { found: null, reason: `Request timed out after ${VERIFICATION_TIMEOUT_MS}ms` };
    }
    return { found: null, reason: `Network error: ${msg}` };
  }
}

// ─── Verification Deduplication Helpers (RR-RETENTION-PHASE-B-01) ───────────

/**
 * Null-safe equality comparison for verification boolean check flags.
 * Treats null and undefined as equal.
 */
export function booleanOrNullEqual(
  a: boolean | null | undefined,
  b: boolean | null | undefined
): boolean {
  const normA = a === null || a === undefined ? null : Boolean(a);
  const normB = b === null || b === undefined ? null : Boolean(b);
  return normA === normB;
}

/**
 * Numerical score equality comparison with floating-point epsilon tolerance (0.0001).
 */
export function scoreEqual(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  return Math.abs(a - b) < 0.0001;
}

/**
 * Compares the new verification result against the previous persisted record.
 * Returns true ONLY if the new result is materially identical to the previous record
 * across every material check, score, and diagnostic field.
 *
 * SAFETY INVARIANTS:
 * 1. NEVER suppress failures, timeouts, rate limits (HTTP 429), or 5xx errors.
 *    Repeated failures must remain observable for operational/incident analysis.
 * 2. NEVER suppress a recovery from failure to success (state transition).
 * 3. NEVER suppress if any check flag, score, or failure diagnostic changed.
 * 4. Deduplicate ONLY when both previous record and new result are successful
 *    VERIFIED passes with identical check flags and score.
 */
export function isMateriallyIdenticalVerification(
  prev: {
    domain_check: boolean | null;
    job_exists_check: boolean | null;
    job_id_check: boolean | null;
    title_check: boolean | null;
    location_check: boolean | null;
    status_check: boolean | null;
    apply_url_check: boolean | null;
    verification_score: number | null;
    failure_reason: string | null;
  },
  current: {
    domainCheck: boolean | null;
    jobExistsCheck: boolean | null;
    jobIdCheck: boolean | null;
    titleCheck: boolean | null;
    locationCheck: boolean | null;
    statusCheck: boolean | null;
    applyUrlCheck: boolean | null;
    verificationScore: number | null;
    failureReason: string | null;
    verificationStatus?: VerificationStatus;
  }
): boolean {
  // If either has a failure reason, never suppress (preserve diagnostic evidence)
  if (prev.failure_reason !== null || current.failureReason !== null) {
    return false;
  }

  // If status is provided and not VERIFIED, never suppress
  if (current.verificationStatus && current.verificationStatus !== 'VERIFIED') {
    return false;
  }

  // Explicit null-safe comparisons across all 7 verification check flags
  if (!booleanOrNullEqual(prev.domain_check, current.domainCheck)) return false;
  if (!booleanOrNullEqual(prev.job_exists_check, current.jobExistsCheck)) return false;
  if (!booleanOrNullEqual(prev.job_id_check, current.jobIdCheck)) return false;
  if (!booleanOrNullEqual(prev.title_check, current.titleCheck)) return false;
  if (!booleanOrNullEqual(prev.location_check, current.locationCheck)) return false;
  if (!booleanOrNullEqual(prev.status_check, current.statusCheck)) return false;
  if (!booleanOrNullEqual(prev.apply_url_check, current.applyUrlCheck)) return false;

  // Composite verification score comparison
  if (!scoreEqual(prev.verification_score, current.verificationScore)) return false;

  return true;
}

// ─── Main verification function ───────────────────────────────────────────────

/**
 * Verify a job candidate against the authoritative source.
 *
 * For Greenhouse sources (boardToken provided): performs all 7 checks.
 * For other sources: only domain check is performed (PENDING result).
 *
 * Persists an audit record to `job_verifications`, applying write-path deduplication
 * to avoid duplicate identical rows when a re-verification yields no material change.
 *
 * @param input - The verification input data
 * @returns The verification result
 */
export async function verifyJob(input: VerificationInput): Promise<VerificationResult> {
  log.info(
    { jobId: input.jobId, externalJobId: input.externalJobId, source: input.sourceSystem },
    'VERIFICATION_STARTED'
  );

  const checkedAt = new Date();

  // ── Check 1: Domain (always performed — pure URL parse) ─────────────────
  const domainCheck = checkDomain(input.officialUrl, input.officialDomain);

  // ── Checks 2–7: Live checks (only if boardToken is provided) ────────────
  let jobExistsCheck: boolean | null = null;
  let jobIdCheck: boolean | null = null;
  let titleCheck: boolean | null = null;
  let locationCheck: boolean | null = null;
  let statusCheck: boolean | null = null;
  let applyUrlCheck: boolean | null = null;
  let liveCheckFailureReason: string | null = null;

  if (input.boardToken && input.sourceSystem === 'GREENHOUSE') {
    const fetchResult = await fetchGreenhouseJob(input.boardToken, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 404 = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `Job ${input.externalJobId} returned HTTP 404 — confirmed closed or removed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK job returned 404 — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error — cannot determine state → PENDING for affected checks
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK live check failed transiently — leaving checks null'
      );
    } else {
      // HTTP 200 + job object received
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true; // Greenhouse removes inactive jobs → 200 = active

      // Check 3: Job ID
      jobIdCheck = String(job.id) === String(input.externalJobId);
      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: job.id },
          'VERIFICATION_CHECK job ID mismatch'
        );
      }

      // Check 4: Title
      titleCheck = checkTitlesMatch(input.title, job.title);
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.title },
          'VERIFICATION_CHECK title mismatch'
        );
      }

      // Check 5: Location (optional — not required for VERIFIED)
      if (input.location && job.location?.name) {
        locationCheck = checkLocationsMatch(input.location, job.location.name);
        if (!locationCheck) {
          log.info(
            { jobId: input.jobId, collected: input.location, official: job.location.name },
            'VERIFICATION_CHECK location mismatch (optional check — not blocking)'
          );
        }
      }

      // Check 6: Apply URL (optional — not required for VERIFIED)
      if (input.applyUrl) {
        applyUrlCheck = checkApplyUrl(input.applyUrl, input.officialDomain);
      }
    }
  } else if ((input.siteToken || input.boardToken) && input.sourceSystem === 'LEVER') {
    const siteToken = input.siteToken || input.boardToken!;
    const fetchResult = await fetchLeverJob(siteToken, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 404 = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `Job ${input.externalJobId} returned HTTP 404 — confirmed closed or removed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK Lever job returned 404 — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error (5xx, 429, timeout, network error) -> PENDING
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK Lever live check failed transiently — leaving checks null'
      );
    } else {
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true; // Conservative validation passed in fetchLeverJob

      // Check 3: Job ID (case-insensitive string comparison)
      jobIdCheck = String(job.id).toLowerCase() === String(input.externalJobId).toLowerCase();
      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: job.id },
          'VERIFICATION_CHECK Lever job ID mismatch'
        );
      }

      // Check 4: Title match
      titleCheck = checkTitlesMatch(input.title, job.text ?? '');
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.text },
          'VERIFICATION_CHECK Lever title mismatch'
        );
      }

      // Check 5: Location match (optional)
      if (input.location && job.categories?.location) {
        locationCheck = checkLocationsMatch(input.location, job.categories.location);
        if (!locationCheck) {
          log.info(
            { jobId: input.jobId, collected: input.location, official: job.categories.location },
            'VERIFICATION_CHECK Lever location mismatch (optional check)'
          );
        }
      }

      // Check 6: Apply URL check (optional)
      const effectiveApplyUrl = input.applyUrl || job.applyUrl;
      if (effectiveApplyUrl) {
        applyUrlCheck = checkApplyUrl(effectiveApplyUrl, input.officialDomain);
      }
    }
  } else if (input.workdayConfig && input.sourceSystem === 'WORKDAY') {
    const fetchResult = await fetchWorkdayJob(input.workdayConfig, input.officialUrl, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 404 = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `Workday Job ${input.externalJobId} returned HTTP 404 — confirmed closed or removed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK Workday job returned 404 — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error (5xx, 429, timeout, network error) -> PENDING
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK Workday live check failed transiently — leaving checks null'
      );
    } else {
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true; // Conservative validation passed in fetchWorkdayJob

      // Check 3: Job ID (if jobReqId present, compare with externalJobId, or verify externalJobId is in officialUrl)
      if (job.jobReqId) {
        jobIdCheck = String(job.jobReqId).toLowerCase() === String(input.externalJobId).toLowerCase();
      } else {
        jobIdCheck = input.officialUrl.toLowerCase().includes(input.externalJobId.toLowerCase());
      }

      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: job.jobReqId },
          'VERIFICATION_CHECK Workday job ID mismatch'
        );
      }

      // Check 4: Title match
      titleCheck = checkTitlesMatch(input.title, job.title ?? '');
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.title },
          'VERIFICATION_CHECK Workday title mismatch'
        );
      }

      // Check 5: Location match (optional)
      if (input.location && job.location) {
        locationCheck = checkLocationsMatch(input.location, job.location);
        if (!locationCheck) {
          log.info(
            { jobId: input.jobId, collected: input.location, official: job.location },
            'VERIFICATION_CHECK Workday location mismatch (optional check)'
          );
        }
      }

      // Check 6: Apply URL check (optional)
      const effectiveApplyUrl = input.applyUrl || job.externalUrl;
      if (effectiveApplyUrl) {
        applyUrlCheck = checkApplyUrl(effectiveApplyUrl, input.officialDomain);
      }
    }
  } else if (input.customConfig && input.sourceSystem === 'CUSTOM') {
    const fetchResult = await fetchCustomJob(input.customConfig, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 404 = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `Custom Job ${input.externalJobId} returned HTTP 404 — confirmed closed or removed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK Custom job returned 404 — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error -> PENDING
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK Custom live check failed transiently — leaving checks null'
      );
    } else {
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true;

      // Check 3: Job ID (if job.id present, compare with externalJobId, or check if in officialUrl)
      if (job.id) {
        jobIdCheck = String(job.id).toLowerCase() === String(input.externalJobId).toLowerCase();
      } else {
        jobIdCheck = input.officialUrl.toLowerCase().includes(input.externalJobId.toLowerCase());
      }

      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: job.id },
          'VERIFICATION_CHECK Custom job ID mismatch'
        );
      }

      // Check 4: Title match
      titleCheck = checkTitlesMatch(input.title, job.title ?? '');
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.title },
          'VERIFICATION_CHECK Custom title mismatch'
        );
      }

      // Check 5: Location match (optional)
      if (input.location && job.location) {
        locationCheck = checkLocationsMatch(input.location, job.location);
        if (!locationCheck) {
          log.info(
            { jobId: input.jobId, collected: input.location, official: job.location },
            'VERIFICATION_CHECK Custom location mismatch (optional check)'
          );
        }
      }

      // Check 6: Apply URL check (optional)
      const effectiveApplyUrl = input.applyUrl || job.applyUrl;
      if (effectiveApplyUrl) {
        applyUrlCheck = checkApplyUrl(effectiveApplyUrl, input.officialDomain);
      }
    }
  } else if (input.ashbyConfig) {
    const fetchResult = await fetchAshbyJob(input.ashbyConfig.jobBoardName, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 404 or job removed from active job board = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `Ashby Job ${input.externalJobId} returned HTTP 404 or was removed — confirmed closed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK Ashby job not found on board — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error (5xx, 429, timeout, network error) -> PENDING
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK Ashby live check failed transiently — leaving checks null'
      );
    } else {
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true;

      // Check 3: Job ID
      jobIdCheck = String(job.id).toLowerCase() === String(input.externalJobId).toLowerCase();
      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: job.id },
          'VERIFICATION_CHECK Ashby job ID mismatch'
        );
      }

      // Check 4: Title match
      titleCheck = checkTitlesMatch(input.title, job.title ?? '');
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.title },
          'VERIFICATION_CHECK Ashby title mismatch'
        );
      }

      // Check 5: Location match (optional)
      if (input.location && job.location) {
        locationCheck = checkLocationsMatch(input.location, job.location);
        if (!locationCheck) {
          log.info(
            { jobId: input.jobId, collected: input.location, official: job.location },
            'VERIFICATION_CHECK Ashby location mismatch (optional check)'
          );
        }
      }

      // Check 6: Apply URL check (optional)
      const effectiveApplyUrl = input.applyUrl || job.applyUrl;
      if (effectiveApplyUrl) {
        applyUrlCheck = checkApplyUrl(effectiveApplyUrl, input.officialDomain);
      }
    }
  } else if (input.workableConfig) {
    const fetchResult = await fetchWorkableJob(input.workableConfig.accountSlug, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 404 = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `Workable Job ${input.externalJobId} returned HTTP 404 — confirmed closed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK Workable job returned 404 — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error (5xx, 429, timeout, network error) -> PENDING
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK Workable live check failed transiently — leaving checks null'
      );
    } else {
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true;

      // Check 3: Job ID (shortcode, code, or id)
      const code = job.shortcode || job.code || (job.id ? String(job.id) : undefined);
      if (code) {
        jobIdCheck = String(code).toLowerCase() === String(input.externalJobId).toLowerCase();
      } else {
        jobIdCheck = input.officialUrl.toLowerCase().includes(input.externalJobId.toLowerCase());
      }

      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: code },
          'VERIFICATION_CHECK Workable job ID mismatch'
        );
      }

      // Check 4: Title match
      titleCheck = checkTitlesMatch(input.title, job.title ?? '');
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.title },
          'VERIFICATION_CHECK Workable title mismatch'
        );
      }

      // Check 5: Location match (optional)
      const locParts = [job.city, job.state, job.country].filter(Boolean);
      const officialLoc = locParts.length > 0 ? locParts.join(', ') : undefined;
      if (input.location && officialLoc) {
        locationCheck = checkLocationsMatch(input.location, officialLoc);
        if (!locationCheck) {
          log.info(
            { jobId: input.jobId, collected: input.location, official: officialLoc },
            'VERIFICATION_CHECK Workable location mismatch (optional check)'
          );
        }
      }

      // Check 6: Apply URL check (optional)
      const effectiveApplyUrl = input.applyUrl || job.application_url;
      if (effectiveApplyUrl) {
        applyUrlCheck = checkApplyUrl(effectiveApplyUrl, input.officialDomain);
      }
    }
  } else if (input.smartrecruitersConfig && input.sourceSystem === 'SMARTRECRUITERS') {
    const fetchResult = await fetchSmartrecruitersJob(input.smartrecruitersConfig.companyIdentifier, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 404 = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `SmartRecruiters Job ${input.externalJobId} returned HTTP 404 — confirmed closed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK SmartRecruiters job returned 404 — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error -> PENDING
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK SmartRecruiters live check failed transiently — leaving checks null'
      );
    } else {
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true;

      // Check 3: Job ID
      jobIdCheck = String(job.id).toLowerCase() === String(input.externalJobId).toLowerCase();
      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: job.id },
          'VERIFICATION_CHECK SmartRecruiters job ID mismatch'
        );
      }

      // Check 4: Title match
      titleCheck = checkTitlesMatch(input.title, job.name ?? '');
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.name },
          'VERIFICATION_CHECK SmartRecruiters title mismatch'
        );
      }

      // Check 5: Location match (optional)
      if (input.location && job.location) {
        let locParts = [];
        if (job.location.city) locParts.push(job.location.city);
        if (job.location.region) locParts.push(job.location.region);
        if (job.location.country) locParts.push(job.location.country.toUpperCase());
        const officialLoc = locParts.length > 0 ? locParts.join(', ') : undefined;

        if (officialLoc) {
          locationCheck = checkLocationsMatch(input.location, officialLoc);
          if (!locationCheck) {
            log.info(
              { jobId: input.jobId, collected: input.location, official: officialLoc },
              'VERIFICATION_CHECK SmartRecruiters location mismatch (optional check)'
            );
          }
        }
      }

      // Check 6: Apply URL check (optional)
      const effectiveApplyUrl = input.applyUrl || job.applyUrl;
      if (effectiveApplyUrl) {
        applyUrlCheck = checkApplyUrl(effectiveApplyUrl, input.officialDomain);
      }
    }
  } else if (input.sapConfig && input.sourceSystem === 'SAP') {
    const fetchResult = await fetchSapJob(input.sapConfig.apiBaseUrl, input.externalJobId);

    if (fetchResult.found === false) {
      // HTTP 200 but exact ID not found = authoritative "job does not exist"
      jobExistsCheck = false;
      jobIdCheck = false;
      titleCheck = false;
      statusCheck = false;
      liveCheckFailureReason = `SAP Job ${input.externalJobId} was not found in search results — confirmed closed`;
      log.warn(
        { jobId: input.jobId, externalJobId: input.externalJobId },
        'VERIFICATION_CHECK SAP job not found in search results — confirmed closed'
      );
    } else if (fetchResult.found === null) {
      // Transient error -> PENDING
      liveCheckFailureReason = `Live check could not be completed: ${fetchResult.reason}`;
      log.warn(
        { jobId: input.jobId, reason: fetchResult.reason },
        'VERIFICATION_CHECK SAP live check failed transiently — leaving checks null'
      );
    } else {
      const job = fetchResult.job;

      jobExistsCheck = true;
      statusCheck = true;

      // Check 3: Job ID
      jobIdCheck = String(job.id).toLowerCase() === String(input.externalJobId).toLowerCase();
      if (!jobIdCheck) {
        log.warn(
          { jobId: input.jobId, expected: input.externalJobId, got: job.id },
          'VERIFICATION_CHECK SAP job ID mismatch'
        );
      }

      // Check 4: Title match
      titleCheck = checkTitlesMatch(input.title, job.unifiedStandardTitle ?? '');
      if (!titleCheck) {
        log.warn(
          { jobId: input.jobId, collected: input.title, official: job.unifiedStandardTitle },
          'VERIFICATION_CHECK SAP title mismatch'
        );
      }

      // Check 5: Location match (optional)
      let officialLoc: string | undefined;
      if (job.jobLocationShort && job.jobLocationShort.length > 0) {
        officialLoc = job.jobLocationShort[0].replace(/<[^>]*>?/gm, '').trim();
      } else if (job.sfstd_jobLocation_obj && job.sfstd_jobLocation_obj.length > 0) {
        officialLoc = job.sfstd_jobLocation_obj[0];
      }

      if (input.location && officialLoc) {
        locationCheck = checkLocationsMatch(input.location, officialLoc);
        if (!locationCheck) {
          log.info(
            { jobId: input.jobId, collected: input.location, official: officialLoc },
            'VERIFICATION_CHECK SAP location mismatch (optional check)'
          );
        }
      }

      // Check 6: Apply URL check (optional)
      // SAP RMK does not return an apply URL in the search API, so we skip it.
      // (It's implicitly true if officialUrl is checked and applyUrl is the same or omitted in collected job).
      if (input.applyUrl) {
         applyUrlCheck = checkApplyUrl(input.applyUrl, input.officialDomain);
      }
    }
  }

  // ── Verification Decision ────────────────────────────────────────────────
  //
  // REQUIRED checks for VERIFIED:
  //   domainCheck, jobExistsCheck, jobIdCheck, titleCheck, statusCheck
  //
  // Rules:
  //   All required = true  → VERIFIED
  //   Any required = false → FAILED
  //   Any required = null  → PENDING (cannot determine)
  //
  // A high score is NOT sufficient — each check must explicitly pass.

  let verificationStatus: VerificationStatus;
  let failureReason: string | null = null;

  const requiredChecks = {
    domain: domainCheck,
    jobExists: jobExistsCheck,
    jobId: jobIdCheck,
    title: titleCheck,
    status: statusCheck,
  };

  const failedRequired = Object.entries(requiredChecks)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  const pendingRequired = Object.entries(requiredChecks)
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  if (failedRequired.length > 0) {
    verificationStatus = 'FAILED';
    failureReason =
      liveCheckFailureReason ??
      `Required checks failed: ${failedRequired.join(', ')}`;
    log.warn(
      { jobId: input.jobId, failedChecks: failedRequired },
      'VERIFICATION_FAILED required checks did not pass'
    );
  } else if (pendingRequired.length > 0) {
    verificationStatus = 'PENDING';
    failureReason =
      liveCheckFailureReason ??
      `Required checks could not be performed: ${pendingRequired.join(', ')}`;
    log.info(
      { jobId: input.jobId, pendingChecks: pendingRequired },
      'VERIFICATION_PENDING some required checks could not be performed'
    );
  } else {
    // All required checks = true
    verificationStatus = 'VERIFIED';
    log.info({ jobId: input.jobId }, 'VERIFICATION_PASSED all required checks passed');
  }

  // ── Compute score (informational only — not used for VERIFIED decision) ─
  const allChecks = [
    domainCheck,
    jobExistsCheck,
    jobIdCheck,
    titleCheck,
    statusCheck,
    locationCheck,
    applyUrlCheck,
  ];
  const performed = allChecks.filter((c) => c !== null) as boolean[];
  const verificationScore =
    performed.length > 0 ? performed.filter(Boolean).length / performed.length : 0;

  const result: VerificationResult = {
    verificationStatus,
    domainCheck,
    jobExistsCheck,
    jobIdCheck,
    titleCheck,
    locationCheck,
    statusCheck,
    applyUrlCheck,
    verificationScore,
    failureReason,
    checkedAt,
  };

  // ── Persist audit record (with write-path deduplication) ─────────────────
  let historyRecorded = true;
  try {
    const db = getDb();

    // Check if the previous record for this job is materially identical
    let isDuplicate = false;
    if (typeof db.select === 'function') {
      try {
        const [prevRecord] = await db
          .select({
            id: schema.jobVerifications.id,
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
          .where(eq(schema.jobVerifications.job_id, input.jobId))
          .orderBy(desc(schema.jobVerifications.checked_at), desc(schema.jobVerifications.id))
          .limit(1);

        if (prevRecord) {
          isDuplicate = isMateriallyIdenticalVerification(prevRecord, {
            domainCheck,
            jobExistsCheck,
            jobIdCheck,
            titleCheck,
            locationCheck,
            statusCheck,
            applyUrlCheck,
            verificationScore,
            failureReason,
            verificationStatus,
          });
        }
      } catch (queryErr) {
        log.warn(
          { jobId: input.jobId, err: queryErr instanceof Error ? queryErr.message : String(queryErr) },
          'Failed to query previous verification record — proceeding with insert'
        );
        isDuplicate = false;
      }
    }

    if (isDuplicate) {
      historyRecorded = false;
      log.debug(
        { jobId: input.jobId, score: verificationScore },
        'VERIFICATION_DEDUPLICATED identical successful record skipped'
      );
    } else {
      await db.insert(schema.jobVerifications).values({
        job_id: input.jobId,
        checked_at: checkedAt,
        domain_check: domainCheck,
        job_exists_check: jobExistsCheck,
        job_id_check: jobIdCheck,
        title_check: titleCheck,
        location_check: locationCheck,
        status_check: statusCheck,
        apply_url_check: applyUrlCheck,
        verification_score: verificationScore,
        failure_reason: failureReason,
      });
    }

    // Always update jobs.last_verified_at for verified successes, even when history insert is skipped
    if (verificationStatus === 'VERIFIED' && typeof (db as any).update === 'function') {
      try {
        await db
          .update(schema.jobs)
          .set({ last_verified_at: checkedAt, updated_at: checkedAt })
          .where(eq(schema.jobs.id, input.jobId));
      } catch {
        // Non-fatal if jobs row does not exist or in mock
      }
    }
  } catch (err) {
    log.error(
      { jobId: input.jobId, err: err instanceof Error ? err.message : String(err) },
      'Failed to persist verification record — result still valid'
    );
  }

  result.historyRecorded = historyRecorded;

  log.info(
    { jobId: input.jobId, status: verificationStatus, score: verificationScore },
    'VERIFICATION_COMPLETED'
  );

  return result;
}
