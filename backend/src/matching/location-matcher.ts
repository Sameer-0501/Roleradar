/**
 * Location and Workplace Type Matcher with Global & Country-Aware Remote Support.
 *
 * Implements deterministic matching for:
 * 1. Exact location matches (canonical city/country).
 * 2. Country-aware Remote matching (respects user geographic boundaries).
 * 3. Worldwide Remote matching (matches all global remote searches).
 * 4. Token & alias matching for global tech hubs.
 * 5. Preserves strict isolation against foreign-only remote jobs for single-country users.
 * 6. Distinguishes ON_SITE, HYBRID, REMOTE, and UNKNOWN.
 */

import { normalizeLocation, LOCATION_ALIASES } from '../preferences/taxonomy.js';
import type { LocationMatchResult, WorkplaceMatchResult, WorkplaceType } from './matching-types.js';
import {
  analyzeLocation,
  isCountryCompatible,
  isExplicitCountry,
  normalizeCountry,
} from './country-normalizer.js';

function extractLocationTokens(locationStr: string): string[] {
  const rawTokens = locationStr
    .toLowerCase()
    .split(/[,/|\-\-\(\)\:\;\[\]\{\}]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const dotFreeTokens = rawTokens
    .map((s) => s.replace(/\./g, '').trim())
    .filter((s) => s.length > 0);

  return Array.from(new Set([...rawTokens, ...dotFreeTokens]));
}

export function matchLocation(
  jobLocation: string | null | undefined,
  userLocations: string[]
): LocationMatchResult {
  if (!userLocations || userLocations.length === 0) {
    return {
      matched: false,
      reason: 'No user preferred locations specified for matching',
    };
  }

  if (!jobLocation || jobLocation.trim().length === 0) {
    return {
      matched: false,
      reason: 'Job posting has no location information',
    };
  }

  const rawJobLoc = jobLocation.trim();
  const analysis = analyzeLocation(rawJobLoc);
  const normalizedJobLoc = normalizeLocation(rawJobLoc);
  const jobTokens = extractLocationTokens(rawJobLoc);

  const isJobRemote = analysis.isRemote;
  const isJobHybrid = jobTokens.some((t) => t.includes('hybrid'));
  const isJobWorldwide = analysis.isWorldwideRemote;

  const countryCheck = isCountryCompatible(analysis, userLocations);

  for (const userLoc of userLocations) {
    const normalizedUserLoc = normalizeLocation(userLoc);
    const isUserRemote = normalizedUserLoc.toLowerCase() === 'remote';

    // 1. Remote matching
    if (isUserRemote && isJobRemote && !isJobHybrid) {
      if (isJobWorldwide) {
        return {
          matched: true,
          matchedLocation: 'Remote',
          isRemote: true,
          reason: 'Worldwide remote job matches your "Remote" preference',
        };
      }

      if (countryCheck.compatible) {
        return {
          matched: true,
          matchedLocation: 'Remote',
          isRemote: true,
          reason: 'Country-compatible remote job matches your "Remote" preference: ' + countryCheck.reason,
        };
      }

      // Incompatible foreign remote
      continue;
    }

    // 2. Canonical exact match
    if (normalizedJobLoc.toLowerCase() === normalizedUserLoc.toLowerCase()) {
      return {
        matched: true,
        matchedLocation: userLoc,
        isRemote: isJobRemote,
        reason: 'Location "' + jobLocation + '" matches your preferred location "' + userLoc + '"',
      };
    }

    // 3. Country-level user preference matching
    if (isExplicitCountry(userLoc)) {
      const userCountry = normalizeCountry(userLoc);
      if (userCountry && analysis.detectedCountries.includes(userCountry)) {
        return {
          matched: true,
          matchedLocation: userLoc,
          isRemote: isJobRemote,
          reason: 'Job in "' + jobLocation + '" matches your preferred country "' + userCountry + '"',
        };
      }
    }

    // 4. Token / Substring canonical match (ONLY for non-remote city/region tokens)
    if (!isUserRemote) {
      const matchedToken = jobTokens.find((token) => {
        const canonicalToken = normalizeLocation(token);
        return (
          canonicalToken.toLowerCase() === normalizedUserLoc.toLowerCase() ||
          token.toLowerCase() === normalizedUserLoc.toLowerCase() ||
          LOCATION_ALIASES[token.toLowerCase()]?.toLowerCase() === normalizedUserLoc.toLowerCase()
        );
      });

      if (matchedToken) {
        return {
          matched: true,
          matchedLocation: userLoc,
          isRemote: isJobRemote,
          reason: 'Location token "' + matchedToken + '" in "' + jobLocation + '" matches "' + userLoc + '"',
        };
      }
    }
  }

  return {
    matched: false,
    isRemote: isJobRemote,
    reason: isJobRemote && !countryCheck.compatible
      ? 'Job location "' + jobLocation + '" is restricted to foreign remote region (' + (analysis.detectedCountries.join(', ') || analysis.detectedRegions.join(', ') || 'foreign') + ') and excluded from your preferred locations: ' + userLocations.join(', ')
      : 'Job location "' + jobLocation + '" does not match any of your preferred locations: ' + userLocations.join(', '),
  };
}

/**
 * Classifies a job posting into ONSITE | HYBRID | REMOTE | UNKNOWN.
 */
export function detectWorkplaceType(
  jobLocation?: string | null,
  explicitWorkplaceType?: string | null
): WorkplaceType {
  if (explicitWorkplaceType) {
    const upper = explicitWorkplaceType.toUpperCase().trim();
    if (upper === 'ONSITE' || upper === 'ON-SITE' || upper === 'ON_SITE' || upper === 'OFFICE') return 'ONSITE';
    if (upper === 'HYBRID') return 'HYBRID';
    if (upper === 'REMOTE' || upper === 'WFH') return 'REMOTE';
  }

  if (!jobLocation || jobLocation.trim().length === 0) {
    return 'UNKNOWN';
  }

  const raw = jobLocation.trim().toLowerCase();
  const tokens = extractLocationTokens(raw);

  if (tokens.some((t) => t.includes('hybrid'))) {
    return 'HYBRID';
  }

  if (
    raw === 'remote' ||
    raw.includes('remote') ||
    raw.includes('worldwide') ||
    raw.includes('anywhere') ||
    raw.includes('wfh') ||
    tokens.some((t) => t.includes('remote') || t.includes('worldwide') || t.includes('anywhere') || t === 'wfh')
  ) {
    return 'REMOTE';
  }

  if (tokens.length > 0) {
    return 'ONSITE';
  }

  return 'UNKNOWN';
}

/**
 * Matches a job's workplace type against user preferred workplace types.
 * Empty user preferences = ANY workplace type matches.
 */
export function matchWorkplace(
  jobWorkplace: WorkplaceType,
  userWorkplaceTypes?: string[]
): WorkplaceMatchResult {
  if (!userWorkplaceTypes || userWorkplaceTypes.length === 0) {
    return {
      matched: true,
      detectedWorkplace: jobWorkplace,
      reason: 'No workplace type restriction (any workplace accepted)',
    };
  }

  const normalizedUserTypes = userWorkplaceTypes.map((t) => t.toUpperCase().trim());

  if (normalizedUserTypes.includes(jobWorkplace)) {
    return {
      matched: true,
      detectedWorkplace: jobWorkplace,
      reason: 'Job workplace "' + jobWorkplace + '" matches your preference (' + userWorkplaceTypes.join(', ') + ')',
    };
  }

  return {
    matched: false,
    detectedWorkplace: jobWorkplace,
    reason: 'Job workplace "' + jobWorkplace + '" does not match preferred workplace types: ' + userWorkplaceTypes.join(', '),
  };
}
