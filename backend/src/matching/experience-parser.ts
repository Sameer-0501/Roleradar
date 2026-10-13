/**
 * Experience Requirement Parser.
 *
 * Analyzes verified job title, description, and requirements to extract
 * recognizable experience patterns and classify the job into:
 * - FRESHER_COMPATIBLE
 * - EXPERIENCED
 * - BOTH
 * - UNKNOWN
 *
 * Conservative Rule: If experience requirements cannot be determined reliably,
 * the classification MUST be UNKNOWN (never assume UNKNOWN is Fresher).
 */

import type { ExperienceClassification } from './matching-types.js';

export interface ParsedExperience {
  classification: ExperienceClassification;
  minYears?: number;
  maxYears?: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedPhrase?: string;
  reason: string;
}

export function parseExperienceRequirements(
  title: string,
  description?: string | null,
  requirements?: string | null
): ParsedExperience {
  const combinedText = (title + '\n' + (description || '') + '\n' + (requirements || '')).toLowerCase();
  const titleLower = title.toLowerCase();

  // -- 1. Senior / Mid-Level / Leadership keywords in Title (High Confidence EXPERIENCED) -----
  // Exclude "member of technical staff" / "mts" from general "staff" keyword match
  const isMemberOfTechStaff = /\b(member\s+of\s+technical\s+staff|mts)\b/i.test(titleLower);
  const isEntryMts = /\b(member\s+of\s+technical\s+staff|mts)\s*[-]?\s*(?:1|i)\b/i.test(titleLower);

  const seniorTitleRegex =
    /\b(senior|sr\.?|principal|lead|leader|director|vp|vice\s+president|avp|head|architect|manager|general\s+manager|gm|dgm|agm|chief|cto|cio|ciso|cfo|coo|president|partner|executive\s+director|sde\s*[-]?\s*(?:iii|iv|v|3|4|5|ii|2)\b|software\s+engineer\s*[-]?\s*(?:iii|iv|v|3|4|5|ii|2)\b|engineer\s*[-]?\s*(?:iii|iv|v|3|4|5|ii|2)\b|developer\s*[-]?\s*(?:iii|iv|v|3|4|5|ii|2)\b|computer\s+scientist\s*[-]?\s*(?:iii|iv|v|3|4|5|ii|2)\b|mts\s*[-]?\s*(?:iii|iv|v|3|4|5|ii|2)\b|level\s+(?:iii|iv|v|3|4|5|ii|2)\b|l[2-6]\b)\b/i;

  const isSeniorStaff = !isMemberOfTechStaff && /\bstaff\b/i.test(titleLower);

  if (seniorTitleRegex.test(titleLower) || isSeniorStaff) {
    return {
      classification: 'EXPERIENCED',
      minYears: 4,
      confidence: 'HIGH',
      matchedPhrase: title,
      reason: 'Job title indicates experienced, mid, or senior role: "' + title + '"',
    };
  }

  // -- 1.5. High-Priority Experienced Regexes (Must beat Entry Title) ----------
  
  // Pattern: 3+ / 4+ / 5+ / 6+ / 7+ / 8+ / 10+ years -> EXPERIENCED
  const seniorPlusRegex = /\b([3-9]|1[0-5])\s*\+\s*years?(?:\s+of)?(?:\s+experience)?\b/i;
  const seniorPlusMatch = combinedText.match(seniorPlusRegex);
  if (seniorPlusMatch) {
    const years = parseInt(seniorPlusMatch[1]!, 10);
    return {
      classification: 'EXPERIENCED',
      minYears: years,
      confidence: 'HIGH',
      reason: 'Requirements state ' + years + '+ years of experience required',
    };
  }

  // Pattern: 2+ years experience -> EXPERIENCED
  const twoPlusRegex = /\b2\s*\+\s*years?(?:\s+of)?(?:\s+experience)?\b/i;
  if (twoPlusRegex.test(combinedText)) {
    return {
      classification: 'EXPERIENCED',
      minYears: 2,
      confidence: 'HIGH',
      reason: 'Requirements state 2+ years of experience required',
    };
  }

  // Pattern: range e.g. 3 to 5 years, 5-8 years -> EXPERIENCED
  const experiencedRangeRegex = /\b([2-9]|1[0-5])\s*[-to]+\s*([3-9]|1[0-5])\s*years?(?:\s+of)?(?:\s+experience)?\b/i;
  const rangeMatch = combinedText.match(experiencedRangeRegex);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]!, 10);
    const max = parseInt(rangeMatch[2]!, 10);
    return {
      classification: 'EXPERIENCED',
      minYears: min,
      maxYears: max,
      confidence: 'HIGH',
      reason: 'Requirements state ' + min + '-' + max + ' years of experience required',
    };
  }

  // Pattern: general "minimum X years" where X >= 2
  const minYearsRegex = /\bminimum(?:\s+of)?\s+([2-9]|1[0-5])\s*years?\b/i;
  const minYearsMatch = combinedText.match(minYearsRegex);
  if (minYearsMatch) {
    const years = parseInt(minYearsMatch[1]!, 10);
    return {
      classification: 'EXPERIENCED',
      minYears: years,
      confidence: 'HIGH',
      reason: 'Requirements state a minimum of ' + years + ' years experience',
    };
  }

  // -- 2. Explicit Entry-level / Fresher keywords in Title / Text ---------------
  const entryTitleRegex =
    /\b(intern|internship|graduate|new grad|entry level|entry-level|junior|associate|trainee|campus|early career|university graduate|sde\s*[-]?\s*(?:1|i)\b|software\s+engineer\s*[-]?\s*(?:1|i)\b|software\s+developer\s*[-]?\s*(?:1|i)\b|engineer\s*[-]?\s*(?:1|i)\b|developer\s*[-]?\s*(?:1|i)\b|computer\s+scientist\s*[-]?\s*(?:1|i)\b|mts\s*[-]?\s*(?:1|i)\b|member\s+of\s+technical\s+staff\s*[-]?\s*(?:1|i)\b|qa\s+engineer\s*[-]?\s*(?:1|i)\b|test\s+engineer\s*[-]?\s*(?:1|i)\b|data\s+analyst\s*[-]?\s*(?:1|i)\b|data\s+engineer\s*[-]?\s*(?:1|i)\b|graduate\s+engineer\s+trainee|get)\b/i;
  if (entryTitleRegex.test(titleLower) || isEntryMts) {
    return {
      classification: 'FRESHER_COMPATIBLE',
      minYears: 0,
      maxYears: 1,
      confidence: 'HIGH',
      matchedPhrase: title,
      reason: 'Job title indicates entry-level or graduate role: "' + title + '"',
    };
  }

  // -- 3. Explicit No Experience Statements in Text ----------------------------
  if (
    combinedText.includes('no experience required') ||
    combinedText.includes('no experience necessary') ||
    combinedText.includes('no prior experience') ||
    combinedText.includes('freshers welcome') ||
    combinedText.includes('freshers can apply') ||
    combinedText.includes('recent graduate') ||
    combinedText.includes('recent graduates') ||
    combinedText.includes('new graduate') ||
    combinedText.includes('early career') ||
    combinedText.includes('campus hire') ||
    combinedText.includes('university graduate') ||
    combinedText.includes('0 years of experience') ||
    combinedText.includes('0-1 years of experience') ||
    combinedText.includes('0 to 1 years of experience')
  ) {
    return {
      classification: 'FRESHER_COMPATIBLE',
      minYears: 0,
      maxYears: 1,
      confidence: 'HIGH',
      reason: 'Job explicitly welcomes freshers or requires entry-level / early career experience',
    };
  }

  // -- 4. Regex Pattern Matching for Years of Experience ------------------------

  // Pattern: 0 to 1 / 0-1 years -> FRESHER_COMPATIBLE
  const zeroToOneRegex = /\b0\s*(?:-|–|—|to)\s*1\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?\b/i;
  if (zeroToOneRegex.test(combinedText)) {
    return {
      classification: 'FRESHER_COMPATIBLE',
      minYears: 0,
      maxYears: 1,
      confidence: 'HIGH',
      reason: 'Requirements state 0-1 years experience',
    };
  }

  // Pattern: 0 to 2 / 0-2 / 1 to 2 / 1-3 years -> BOTH
  const bothRangeRegex = /\b(?:0\s*(?:-|–|—|to)\s*2|1\s*(?:-|–|—|to)\s*[23])\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?\b/i;
  if (bothRangeRegex.test(combinedText)) {
    return {
      classification: 'BOTH',
      minYears: 0,
      maxYears: 3,
      confidence: 'HIGH',
      reason: 'Requirements state 0-3 years experience (compatible with freshers and early career)',
    };
  }



  // Pattern: mid/intermediate level keywords in title
  const midTitleRegex = /\b(mid|intermediate)\b/i;
  if (midTitleRegex.test(titleLower)) {
    return {
      classification: 'EXPERIENCED',
      minYears: 2,
      confidence: 'MEDIUM',
      reason: 'Job title indicates mid-level role: "' + title + '"',
    };
  }

  // Default: UNKNOWN (Conservative Fresher Safety Rule)
  return {
    classification: 'UNKNOWN',
    confidence: 'LOW',
    reason: 'Experience requirements not clearly specified in title or description',
  };
}
