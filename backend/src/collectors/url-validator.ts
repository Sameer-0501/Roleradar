/**
 * Job URL Validator.
 *
 * Validates that a job posting URL meets all authenticity requirements
 * before it is accepted into the pipeline.
 *
 * Rules (all must pass):
 *   1. URL is syntactically valid.
 *   2. URL uses HTTPS (not HTTP).
 *   3. URL hostname matches the configured official domain
 *      (exact match or subdomain).
 *   4. URL path identifies an individual job posting, not just
 *      the company's general careers homepage.
 *
 * Do NOT silently repair or guess URLs.
 * If a URL fails validation, reject the candidate.
 */

export interface UrlValidationResult {
  valid: boolean;
  /** Human-readable reason if invalid */
  reason?: string;
}

/**
 * Validate a job posting URL.
 *
 * @param url - The URL to validate (should be `officialUrl` from a JobCandidate)
 * @param officialDomain - The authoritative domain (e.g. "job-boards.greenhouse.io")
 * @returns Validation result with optional failure reason
 */
export function validateJobUrl(url: string, officialDomain: string): UrlValidationResult {
  // Rule 1: URL must be syntactically valid
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: `URL is not syntactically valid: "${url}"` };
  }

  // Rule 2: Must use HTTPS
  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: `URL must use HTTPS, got "${parsed.protocol}": "${url}"`,
    };
  }

  // Rule 3: Hostname must match the official domain (exact or subdomain)
  const hostname = parsed.hostname.toLowerCase();
  const domain = officialDomain.toLowerCase();
  const domainMatches = hostname === domain || hostname.endsWith(`.${domain}`);
  if (!domainMatches) {
    return {
      valid: false,
      reason: `URL hostname "${hostname}" does not match official domain "${domain}"`,
    };
  }

  // Rule 4: Path must identify an individual job posting.
  // A root path ("/", "", or just a slug without an ID-like segment) is rejected.
  // We require at least 2 path segments with at least one non-empty segment
  // after the root, AND the URL must not be a pure homepage.
  const pathSegments = parsed.pathname
    .split('/')
    .filter((s) => s.length > 0);

  if (pathSegments.length === 0) {
    return {
      valid: false,
      reason: `URL appears to be a root/homepage URL, not an individual job posting: "${url}"`,
    };
  }

  // Require at least 2 path segments where the last segment is a job identifier
  // (numeric ID, UUID, or job slug with ID), and not generic roots like /jobs, /careers
  const lastSegment = pathSegments[pathSegments.length - 1] ?? '';
  const genericRoots = new Set(['jobs', 'careers', 'search', 'openings', 'all']);

  const hasQueryJobId =
    parsed.searchParams.has('gh_jid') ||
    parsed.searchParams.has('job_id') ||
    parsed.searchParams.has('jobId') ||
    parsed.searchParams.has('id');

  const isIndividualJob =
    hasQueryJobId ||
    (pathSegments.length >= 2 &&
      !genericRoots.has(lastSegment.toLowerCase()) &&
      (/\d{3,}/.test(lastSegment) ||
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(lastSegment) ||
        pathSegments.length >= 3));

  if (!isIndividualJob) {
    return {
      valid: false,
      reason: `URL path "${parsed.pathname}" does not identify an individual job posting: "${url}"`,
    };
  }

  return { valid: true };
}
