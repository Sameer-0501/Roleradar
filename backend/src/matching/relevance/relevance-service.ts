/**
 * Deterministic Job Relevance and Ranking Engine.
 *
 * Implements calibrated multi-factor scoring:
 * - Role relevance (0–45 pts)
 * - Experience & Fresher alignment (0–25 pts)
 * - Location relevance (0–15 pts)
 * - Workplace preference alignment (0–8 pts)
 * - Freshness and verification recency (0–7 pts)
 *
 * Total score: 0–100 pts.
 */

import { ROLE_TAXONOMY } from '../role-matcher.js';
import { normalizeLocation, LOCATION_ALIASES } from '../../preferences/taxonomy.js';
import { parseExperienceRequirements } from '../experience-parser.js';
import { evaluateJobFreshness } from './freshness-evaluator.js';
import type {
  CandidateJobData,
  UserPreferencesData,
  WorkplaceType,
} from '../matching-types.js';
import type {
  JobRelevanceResult,
  RelevanceBreakdown,
  RoleScoreResult,
  ExperienceScoreResult,
  LocationScoreResult,
  WorkplaceScoreResult,
} from './relevance-types.js';

function cleanStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

/**
 * Score role alignment (0 to 45 pts).
 */
export function scoreRole(jobTitle: string, userRoles: string[]): RoleScoreResult {
  if (!userRoles || userRoles.length === 0) {
    return {
      score: 0,
      matchTier: 'NONE',
      matchedRoleName: '',
      reason: 'No preferred roles specified',
    };
  }

  const cleanTitle = cleanStr(jobTitle);

  let bestScore = 0;
  let bestTier: RoleScoreResult['matchTier'] = 'NONE';
  let bestRole = userRoles[0] || '';
  let bestReason = 'Job title does not match target roles';

  for (const userRole of userRoles) {
    const cleanUserRole = cleanStr(userRole);

    // 1. Exact match (45 pts)
    if (cleanTitle === cleanUserRole) {
      return {
        score: 45,
        matchTier: 'EXACT',
        matchedRoleName: userRole,
        reason: `Exact match for "${userRole}"`,
      };
    }

    const taxonomyEntry = ROLE_TAXONOMY.find(
      (e) =>
        e.canonical.toLowerCase() === cleanUserRole ||
        e.synonyms.some((s) => cleanStr(s) === cleanUserRole)
    );

    if (taxonomyEntry) {
      const canonicalClean = cleanStr(taxonomyEntry.canonical);

      // 2. Exact match on canonical title (42 pts)
      if (cleanTitle === canonicalClean) {
        if (42 > bestScore) {
          bestScore = 42;
          bestTier = 'STRONG_SYNONYM';
          bestRole = userRole;
          bestReason = `Direct match on canonical role "${taxonomyEntry.canonical}"`;
        }
      }

      // 3. Approved synonym match (40 pts)
      const matchedSynonym = taxonomyEntry.synonyms.find((s) => cleanStr(s) === cleanTitle);
      if (matchedSynonym) {
        if (40 > bestScore) {
          bestScore = 40;
          bestTier = 'STRONG_SYNONYM';
          bestRole = userRole;
          bestReason = `Matches approved synonym "${matchedSynonym}" for "${taxonomyEntry.canonical}"`;
        }
      }

      // 4. Approved specialization match (35 pts)
      const matchedSpec = taxonomyEntry.specializations.find((s) => cleanStr(s) === cleanTitle);
      if (matchedSpec) {
        if (35 > bestScore) {
          bestScore = 35;
          bestTier = 'SPECIALIZATION';
          bestRole = userRole;
          bestReason = `Matches approved specialization "${matchedSpec}" for "${taxonomyEntry.canonical}"`;
        }
      }

      // 5. Contains canonical role or synonym phrase (34 pts)
      if (cleanTitle.includes(canonicalClean)) {
        if (34 > bestScore) {
          bestScore = 34;
          bestTier = 'SPECIALIZATION';
          bestRole = userRole;
          bestReason = `Job title contains target role "${taxonomyEntry.canonical}"`;
        }
      }

      for (const syn of taxonomyEntry.synonyms) {
        const cSyn = cleanStr(syn);
        if (cSyn.length > 3 && cleanTitle.includes(cSyn)) {
          if (32 > bestScore) {
            bestScore = 32;
            bestTier = 'STRONG_SYNONYM';
            bestRole = userRole;
            bestReason = `Job title contains approved synonym "${syn}"`;
          }
        }
      }
    } else {
      // Custom role substring match
      if (cleanTitle.includes(cleanUserRole)) {
        if (35 > bestScore) {
          bestScore = 35;
          bestTier = 'SPECIALIZATION';
          bestRole = userRole;
          bestReason = `Job title contains custom target role "${userRole}"`;
        }
      }
    }
  }

  // Related technical discipline fallback if still 0
  if (bestScore === 0) {
    const isTechEngineer = cleanTitle.includes('engineer') || cleanTitle.includes('developer');
    if (isTechEngineer) {
      bestScore = 15;
      bestTier = 'RELATED_TECH';
      bestReason = `Related technical role`;
    }
  }

  return {
    score: bestScore,
    matchTier: bestTier,
    matchedRoleName: bestRole,
    reason: bestReason,
  };
}

/**
 * Score experience and fresher alignment (0 to 25 pts).
 */
export function scoreExperience(
  job: CandidateJobData,
  userLevel: string
): ExperienceScoreResult {
  const parsed = parseExperienceRequirements(job.title, job.description, job.requirements);
  const titleLower = job.title.toLowerCase();

  if (userLevel === 'FRESHER') {
    // Explicit entry level / graduate / intern keywords get max points
    const isExplicitEntry =
      /\b(intern|internship|graduate|new grad|entry level|entry-level|junior|associate|trainee|sde\s*[---]?\s*(?:1|i)\b|software\s+engineer\s*[---]?\s*(?:1|i)\b|computer\s+scientist\s*[---]?\s*(?:1|i)\b|mts\s*[---]?\s*(?:1|i)\b|get|campus)\b/i.test(
        titleLower
      ) ||
      (parsed.minYears === 0 && (parsed.maxYears === 1 || !parsed.maxYears));

    if (isExplicitEntry) {
      return {
        score: 25,
        isFresherTargeted: true,
        classification: 'FRESHER_COMPATIBLE',
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: 'Targeted entry-level / graduate opening (0–1 yrs)',
      };
    }

    if (parsed.classification === 'BOTH') {
      return {
        score: 20,
        isFresherTargeted: false,
        classification: 'BOTH',
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: 'Early career / fresher compatible opening (0–2 yrs)',
      };
    }

    if (parsed.classification === 'FRESHER_COMPATIBLE') {
      return {
        score: 22,
        isFresherTargeted: true,
        classification: 'FRESHER_COMPATIBLE',
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: 'Entry-level compatible role',
      };
    }

    return {
      score: 5,
      isFresherTargeted: false,
      classification: parsed.classification,
      minYears: parsed.minYears,
      maxYears: parsed.maxYears,
      reason: 'General role matching fresher eligibility',
    };
  }

  if (userLevel === 'EXPERIENCED') {
    if (parsed.classification === 'EXPERIENCED') {
      return {
        score: 25,
        isFresherTargeted: false,
        classification: 'EXPERIENCED',
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: `Targeted experienced opening (${parsed.minYears ? parsed.minYears + '+ yrs' : 'experienced'})`,
      };
    }

    if (parsed.classification === 'BOTH') {
      return {
        score: 18,
        isFresherTargeted: false,
        classification: 'BOTH',
        minYears: parsed.minYears,
        maxYears: parsed.maxYears,
        reason: 'Flexible experience opening (early career to experienced)',
      };
    }

    return {
      score: 10,
      isFresherTargeted: false,
      classification: parsed.classification,
      reason: 'Standard opening compatible with experience',
    };
  }

  // ANY
  return {
    score: 20,
    isFresherTargeted: false,
    classification: parsed.classification,
    minYears: parsed.minYears,
    maxYears: parsed.maxYears,
    reason: 'Open to all experience levels',
  };
}

/**
 * Score location alignment (0 to 15 pts).
 */
export function scoreLocation(
  jobLocation: string | null | undefined,
  userLocations: string[]
): LocationScoreResult {
  if (!userLocations || userLocations.length === 0) {
    return {
      score: 10,
      matchedLocation: 'Any',
      isRemote: false,
      isCityExact: false,
      reason: 'No location restrictions',
    };
  }

  const rawLoc = (jobLocation || '').trim();
  const cleanJobLoc = cleanStr(rawLoc);
  const normalizedJobLoc = normalizeLocation(rawLoc).toLowerCase();
  const jobTokens = extractLocationTokens(rawLoc);

  const isJobRemote =
    cleanJobLoc.includes('remote') ||
    cleanJobLoc.includes('worldwide') ||
    cleanJobLoc.includes('anywhere') ||
    cleanJobLoc === 'wfh';

  for (const userLoc of userLocations) {
    const cleanUserLoc = cleanStr(userLoc);
    const normalizedUserLoc = normalizeLocation(userLoc).toLowerCase();

    // 1. Remote preference
    if (userLoc.toLowerCase() === 'remote' && isJobRemote) {
      return {
        score: 15,
        matchedLocation: 'Remote',
        isRemote: true,
        isCityExact: false,
        reason: 'Matches remote work preference',
      };
    }

    // 2. Exact city / hub match on raw string
    if (
      normalizedJobLoc === normalizedUserLoc ||
      cleanJobLoc === cleanUserLoc ||
      LOCATION_ALIASES[cleanJobLoc] === normalizedUserLoc
    ) {
      return {
        score: 15,
        matchedLocation: userLoc,
        isRemote: isJobRemote,
        isCityExact: true,
        reason: `Exact match for target location "${userLoc}"`,
      };
    }

    // 3. Token match / alias token match (e.g. "Bengaluru" in "Bengaluru, India" matches "Bangalore")
    const matchedExactToken = jobTokens.find((token) => {
      const canonicalToken = normalizeLocation(token);
      return (
        canonicalToken.toLowerCase() === normalizedUserLoc ||
        token.toLowerCase() === normalizedUserLoc ||
        LOCATION_ALIASES[token.toLowerCase()]?.toLowerCase() === normalizedUserLoc
      );
    });

    if (matchedExactToken) {
      return {
        score: 15,
        matchedLocation: userLoc,
        isRemote: isJobRemote,
        isCityExact: true,
        reason: `Target location "${userLoc}" matches city token in job posting`,
      };
    }

    // 4. Substring token match
    if (cleanJobLoc.includes(cleanUserLoc) || cleanJobLoc.includes(normalizedUserLoc)) {
      return {
        score: 14,
        matchedLocation: userLoc,
        isRemote: isJobRemote,
        isCityExact: true,
        reason: `Target location "${userLoc}" present in job posting`,
      };
    }
  }

  // Country level or general match
  return {
    score: 10,
    matchedLocation: rawLoc,
    isRemote: isJobRemote,
    isCityExact: false,
    reason: `Compatible location in active region: ${rawLoc}`,
  };
}

/**
 * Score workplace alignment (0 to 8 pts).
 */
export function scoreWorkplace(
  jobWorkplace: WorkplaceType,
  userWorkplaceTypes?: string[]
): WorkplaceScoreResult {
  if (!userWorkplaceTypes || userWorkplaceTypes.length === 0) {
    return {
      score: 8,
      workplace: jobWorkplace,
      reason: 'Accepts all workplace types',
    };
  }

  const normalizedUser = userWorkplaceTypes.map((w) => w.toUpperCase().trim());

  if (normalizedUser.includes(jobWorkplace)) {
    return {
      score: 8,
      workplace: jobWorkplace,
      reason: `Matches your preferred workplace mode (${jobWorkplace})`,
    };
  }

  return {
    score: 4,
    workplace: jobWorkplace,
    reason: `Workplace mode: ${jobWorkplace}`,
  };
}

/**
 * Evaluate full deterministic relevance score for a job.
 */
export function evaluateJobRelevance(
  job: CandidateJobData,
  user: UserPreferencesData,
  companySeenCount: number = 0,
  referenceDate: Date = new Date()
): JobRelevanceResult {
  const roleScore = scoreRole(job.title, user.roles);
  const expScore = scoreExperience(job, user.experienceLevel);
  const locScore = scoreLocation(job.location, user.locations);
  const detectedWorkplace = (job.workplaceType as WorkplaceType) || 'UNKNOWN';
  const wpScore = scoreWorkplace(detectedWorkplace, user.workplaceTypes as string[]);
  const freshScore = evaluateJobFreshness(
    job.firstSeenAt,
    job.lastSeenAt,
    job.officialPostedAt,
    referenceDate
  );

  // Secondary diversity penalty (only as tie-breaker, max -3 pts)
  const diversityPenalty = companySeenCount > 0 ? Math.min(3, companySeenCount) * -1 : 0;

  const rawTotal =
    roleScore.score +
    expScore.score +
    locScore.score +
    wpScore.score +
    freshScore.score +
    diversityPenalty;

  const totalScore = Math.max(0, Math.min(100, rawTotal));

  // Build human-readable explanations
  const matchExplanations: string[] = [];

  if (roleScore.score >= 30) {
    matchExplanations.push(`✓ ${roleScore.matchedRoleName || job.title} matches your target role`);
  }

  if (locScore.isCityExact) {
    matchExplanations.push(`✓ ${locScore.matchedLocation} matches your preferred location`);
  } else if (locScore.isRemote) {
    matchExplanations.push('🌐 Remote work matches your preference');
  }

  if (expScore.isFresherTargeted) {
    matchExplanations.push(`🎓 Fresher-compatible entry-level role`);
  } else if (user.experienceLevel === 'EXPERIENCED' && expScore.score >= 20) {
    matchExplanations.push(`💼 Matches experienced profile requirements`);
  }

  if (wpScore.score === 8 && user.workplaceTypes && user.workplaceTypes.length > 0) {
    matchExplanations.push(`🏢 ${detectedWorkplace} mode matches your preference`);
  }

  if (freshScore.state === 'FRESH') {
    matchExplanations.push('🟢 Discovered recently & actively verified');
  } else {
    matchExplanations.push('✓ Verified active on official company careers portal');
  }

  const breakdown: RelevanceBreakdown = {
    role: roleScore,
    experience: expScore,
    location: locScore,
    workplace: wpScore,
    freshness: freshScore,
    diversityPenalty,
    totalScore,
  };

  return {
    jobId: job.id,
    totalScore,
    breakdown,
    matchExplanations,
  };
}
