/**
 * Job URL Validator.
 *
 * Validates that a job posting URL meets all authenticity requirements
 * before it is accepted into the pipeline.
 *
 * Rules (all must pass):
 *   1. URL is syntactically valid.
 *   2. URL uses HTTPS (not HTTP).
 *   2a. URL must not contain embedded userinfo credentials (username/password).
 *   2b. URL must use standard HTTPS port (443 only).
 *   3. URL hostname matches the configured official domain (exact match or subdomain),
 *      OR matches an authorized alternate domain rule with an allowed path pattern.
 *   4. URL path identifies an individual job posting, not just
 *      the company's general careers homepage.
 *
 * Do NOT silently repair or guess URLs.
 * If a URL fails validation, reject the candidate.
 */

export interface AlternateDomainRule {
  domain: string;
  allowedPathPatterns: RegExp[];
}

export interface UrlValidationOptions {
  allowedAlternateDomains?: AlternateDomainRule[];
}

export interface UrlValidationResult {
  valid: boolean;
  isValid: boolean;
  /** Human-readable reason if invalid */
  reason?: string;
  /** Normalized canonical URL when valid */
  canonicalUrl?: string;
}

/**
 * Validate a job posting URL.
 *
 * @param url - The URL to validate (should be `officialUrl` from a JobCandidate)
 * @param officialDomain - The authoritative domain (e.g. "job-boards.greenhouse.io" or "adobe.wd5.myworkdayjobs.com")
 * @param optionsOrAlternateDomains - Optional configuration or list of allowed alternate domain rules
 * @returns Validation result with boolean flags (valid & isValid) and failure reason if invalid
 */
export function validateJobUrl(
  url: string,
  officialDomain: string,
  optionsOrAlternateDomains?: UrlValidationOptions | AlternateDomainRule[]
): UrlValidationResult {
  // Extract alternate domain rules if provided
  const allowedAlternateDomains = Array.isArray(optionsOrAlternateDomains)
    ? optionsOrAlternateDomains
    : optionsOrAlternateDomains?.allowedAlternateDomains;

  // Rule 1: URL must be syntactically valid
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      valid: false,
      isValid: false,
      reason: `SYNTAX_ERROR: URL is not syntactically valid: "${url}"`,
    };
  }

  // Rule 2: Must use HTTPS
  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      isValid: false,
      reason: `INVALID_PROTOCOL: URL must use HTTPS, got "${parsed.protocol}": "${url}"`,
    };
  }

  // Rule 2a: Disallow embedded credentials (user-info URL tricks like https://admin:secret@host.com)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      isValid: false,
      reason: `INVALID_CREDENTIALS_OR_PORT: URL must not contain embedded userinfo credentials: "${url}"`,
    };
  }

  // Rule 2b: Disallow non-standard ports (must use standard HTTPS port 443)
  if (parsed.port && parsed.port !== '443') {
    return {
      valid: false,
      isValid: false,
      reason: `INVALID_CREDENTIALS_OR_PORT: URL specifies unexpected non-standard port "${parsed.port}": "${url}"`,
    };
  }

  // Rule 3: Hostname matching (Primary vs Alternate Domains)
  const hostname = parsed.hostname.toLowerCase();
  const domain = officialDomain.toLowerCase();
  const domainMatches = hostname === domain || hostname.endsWith(`.${domain}`);

  if (domainMatches) {
    // Primary Domain Path Checks
    const pathSegments = parsed.pathname
      .split('/')
      .filter((s) => s.length > 0);

    if (pathSegments.length === 0) {
      return {
        valid: false,
        isValid: false,
        reason: `PATH_INVALID: URL appears to be a root/homepage URL, not an individual job posting: "${url}"`,
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
        isValid: false,
        reason: `PATH_INVALID: URL path "${parsed.pathname}" does not identify an individual job posting: "${url}"`,
      };
    }

    return {
      valid: true,
      isValid: true,
      canonicalUrl: parsed.toString(),
    };
  }

  // Alternate Host Check: If primary host does not match, inspect allowedAlternateDomains
  if (allowedAlternateDomains && allowedAlternateDomains.length > 0) {
    const matchingRule = allowedAlternateDomains.find(
      (rule) => rule.domain.toLowerCase() === hostname
    );

    if (matchingRule) {
      const pathMatches = matchingRule.allowedPathPatterns.some((pattern) =>
        pattern.test(parsed.pathname)
      );

      if (pathMatches) {
        return {
          valid: true,
          isValid: true,
          canonicalUrl: parsed.toString(),
        };
      }

      return {
        valid: false,
        isValid: false,
        reason: `ALTERNATE_DOMAIN_PATH_DISALLOWED: Path "${parsed.pathname}" is not allowed for alternate domain "${hostname}"`,
      };
    }
  }

  // Default: Return DOMAIN_MISMATCH for all unrecognized hosts
  return {
    valid: false,
    isValid: false,
    reason: `DOMAIN_MISMATCH: URL hostname "${hostname}" does not match official domain "${domain}"`,
  };
}
