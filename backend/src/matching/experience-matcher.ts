/**
 * Experience Matcher.
 *
 * Compares a job's parsed experience classification against the user's
 * experience preference (FRESHER vs EXPERIENCED vs ANY).
 *
 * Conservative Rules:
 * - FRESHER users require FRESHER_COMPATIBLE or BOTH.
 * - 3+ years / 5+ years / Senior roles strictly reject FRESHER users.
 * - UNKNOWN is NEVER matched as FRESHER (protects freshers from misleading matches).
 */

import type { ParsedExperience } from './experience-parser.js';
import type { ExperienceMatchResult } from './matching-types.js';
import type { ExperienceLevel } from '../preferences/taxonomy.js';

export function matchExperience(
  parsed: ParsedExperience,
  userLevel: ExperienceLevel
): ExperienceMatchResult {
  if (userLevel === 'ANY') {
    return {
      matched: true,
      classification: parsed.classification,
      minYears: parsed.minYears,
      maxYears: parsed.maxYears,
      reason: `Matched any experience level: ${parsed.reason}`,
    };
  }

  if (userLevel === 'FRESHER') {
    if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
      return {
        matched: true,
        classification: parsed.classification,
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: `Role is entry-level / fresher compatible: ${parsed.reason}`,
      };
    }

    if (parsed.classification === 'EXPERIENCED') {
      return {
        matched: false,
        classification: parsed.classification,
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: `Job requires prior professional experience (${parsed.minYears ? parsed.minYears + '+ yrs' : 'experienced'}), incompatible with Fresher preference`,
      };
    }

    // UNKNOWN
    return {
      matched: false,
      classification: 'UNKNOWN',
      reason: 'Job experience requirements are unspecified or unclear (conservative fresher safety)',
    };
  }

  if (userLevel === 'EXPERIENCED') {
    if (parsed.classification === 'EXPERIENCED' || parsed.classification === 'BOTH') {
      return {
        matched: true,
        classification: parsed.classification,
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: `Role matches experienced preference: ${parsed.reason}`,
      };
    }

    if (parsed.classification === 'FRESHER_COMPATIBLE') {
      // Entry-level roles are generally not targeted for experienced searches
      return {
        matched: false,
        classification: parsed.classification,
        reason: 'Role is marked strictly for entry-level/interns, incompatible with Experienced preference',
      };
    }

    // UNKNOWN
    return {
      matched: true,
      classification: 'UNKNOWN',
      reason: 'Job experience requirements are unspecified; defaulting to match for experienced users',
    };
  }

  return {
    matched: false,
    classification: 'UNKNOWN',
    reason: 'Unable to evaluate experience compatibility',
  };
}
