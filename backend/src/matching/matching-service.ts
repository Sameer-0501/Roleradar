/**
 * Real Job Matching & Deterministic Relevance Ranking Service.
 *
 * Orchestrates:
 * 1. Hard Eligibility Filtering (Active + Verified + Role + Country/Location + Workplace + Fresher Safety).
 * 2. Deterministic Relevance Scoring (Role, Experience, Location, Workplace, Freshness).
 * 3. Search & Interactive Filter Application.
 * 4. Deterministic Multi-Tier Sorting (Best Match, Newest, Most Relevant, Recently Verified).
 * 5. Company/Source Diversity Tie-Breaking.
 * 6. Deterministic Pagination with Stable Secondary Sort Keys.
 *
 * Invariant: Hard filters determine eligibility; ranking determines display order.
 */

import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray, and, or, gte, lt, desc, ilike } from 'drizzle-orm';
import { getUserPreferences } from '../preferences/preference-service.js';
import { matchCompany } from './company-matcher.js';
import { matchRole, getSafeSqlRolePatterns } from './role-matcher.js';
import { resolveCanonicalRoleIds, mergeEffectiveRoles } from './canonical-role-resolver.js';
import { matchLocation, detectWorkplaceType, matchWorkplace } from './location-matcher.js';
import { parseExperienceRequirements } from './experience-parser.js';
import { matchExperience } from './experience-matcher.js';
import { matchKeywords } from './keyword-matcher.js';
import { getStartOfTodayInTimezone } from '../utils/timezone.js';
import { evaluateJobRelevance } from './relevance/relevance-service.js';
import { getDismissedJobIds, getInteractionsBatch } from '../workspace/user-job-service.js';
import { parseSearchQuery } from '../search/search-parser.js';
import type { StructuredSearchIntent } from '../search/search-types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('matching-service');

import type {
  JobMatchResult,
  CandidateJobData,
  UserPreferencesData,
  MatchedJobDto,
  WorkplaceType,
} from './matching-types.js';
import type { JobFilterOptions, SortOption } from './relevance/relevance-types.js';

/**
 * Evaluate a candidate job against a user's preferences deterministically.
 * HARD FILTER LAYER.
 */
export function evaluateJobMatch(
  job: CandidateJobData,
  user: UserPreferencesData
): JobMatchResult {
  const reasons: string[] = [];

  // 1. Company Match
  const companyResult = matchCompany(job.companyId, job.companyName, user.companyIds);
  reasons.push(companyResult.reason);

  // 2. Role Match
  const roleResult = matchRole(job.title, user.roles);
  reasons.push(roleResult.reason);

  // 3. Location Match
  const locationResult = matchLocation(job.location, user.locations);
  reasons.push(locationResult.reason);

  // 4. Workplace Match (On-site, Hybrid, Remote)
  const detectedWorkplace = detectWorkplaceType(job.location, job.workplaceType);
  const workplaceResult = matchWorkplace(detectedWorkplace, user.workplaceTypes as string[]);
  reasons.push(workplaceResult.reason);

  // 5. Experience Match
  const parsedExp = parseExperienceRequirements(job.title, job.description, job.requirements);
  const expResult = matchExperience(parsedExp, user.experienceLevel);
  reasons.push(expResult.reason);

  // 6. Keyword Match (Optional)
  const keywordResult = matchKeywords(
    job.title,
    job.description,
    job.requirements,
    user.keywords || []
  );
  if (user.keywords && user.keywords.length > 0) {
    reasons.push(keywordResult.reason);
  }

  // Core Conjunction Rule: All core criteria must pass
  const matched =
    companyResult.matched &&
    roleResult.matched &&
    locationResult.matched &&
    workplaceResult.matched &&
    expResult.matched &&
    keywordResult.matched;

  return {
    jobId: job.id,
    matched,
    decision: matched ? 'MATCH' : 'NO_MATCH',
    reasons,
    components: {
      company: companyResult,
      role: roleResult,
      location: locationResult,
      workplace: workplaceResult,
      experience: expResult,
      keywords: keywordResult,
    },
  };
}

export interface FindMatchesOptions extends JobFilterOptions {}

export interface FindMatchesResult {
  totalMatches: number;
  page: number;
  limit: number;
  searchIntent?: StructuredSearchIntent;
  jobs: MatchedJobDto[];
}

/**
 * Find verified active job matches for an authenticated user with deterministic ranking.
 */
export async function findMatchesForUser(
  userId: string,
  options: FindMatchesOptions = {}
): Promise<FindMatchesResult> {
  const perfStart = performance.now();
  const page = Math.max(1, options.page || 1);
  const limit = options.onlyToday ? (options.limit || 10000) : Math.min(100, Math.max(1, options.limit || 20));
  const sort: SortOption = options.sort || 'BEST_MATCH';

  // 1. Retrieve User Preferences
  const userPrefs = await getUserPreferences(userId);

  // Phase 6: Resolve canonicalRoles → display names, merge with legacy roles.
  // Precedence: canonical display names first, then unmapped legacy strings.
  // If both are empty, fall back to the default.
  const canonicalDisplayNames = resolveCanonicalRoleIds(userPrefs?.canonicalRoles || []);
  const legacyRoles = userPrefs?.roles || [];
  const mergedRoles = mergeEffectiveRoles(canonicalDisplayNames, legacyRoles);
  const defaultRoles = mergedRoles.length > 0 ? mergedRoles : ['Software Engineer'];

  // Parse natural-language search query if present
  let searchIntent: StructuredSearchIntent | undefined;
  if (options.q && options.q.trim().length > 0) {
    searchIntent = parseSearchQuery(options.q);
  }

  // Determine effective target roles
  let effectiveRoles = (searchIntent && searchIntent.roles.length > 0)
    ? searchIntent.roles
    : defaultRoles;

  if (options.roleFilter === 'ALL') {
    effectiveRoles = ['ALL'];
  } else if (options.roleFilter) {
    effectiveRoles = [options.roleFilter];
  }

  // Determine effective experience
  const effectiveExperience = (options.experience as any)
    || (searchIntent && searchIntent.experienceLevel && searchIntent.experienceLevel !== 'ANY' ? searchIntent.experienceLevel : userPrefs?.experienceLevel || 'FRESHER');

  // Determine effective locations
  let effectiveLocations: string[] = [];
  if (options.location) {
    effectiveLocations = [options.location];
  } else if (options.country) {
    effectiveLocations = [options.country];
  } else if (searchIntent && searchIntent.locations.length > 0) {
    effectiveLocations = searchIntent.locations;
  } else if (searchIntent && searchIntent.country) {
    effectiveLocations = [searchIntent.country];
  } else {
    effectiveLocations = userPrefs?.locations && userPrefs.locations.length > 0 ? userPrefs.locations : ['India'];
  }

  // Determine effective workplaces
  let effectiveWorkplaces: WorkplaceType[] = [];
  if (options.workplace && options.workplace !== 'ANY') {
    effectiveWorkplaces = [options.workplace.toUpperCase() as WorkplaceType];
  } else if (searchIntent && searchIntent.workplaceTypes.length > 0) {
    effectiveWorkplaces = searchIntent.workplaceTypes;
  } else {
    effectiveWorkplaces = (userPrefs?.workplaceTypes as WorkplaceType[]) || ['ONSITE', 'HYBRID', 'REMOTE'];
  }

  // Determine effective company IDs
  let effectiveCompanyIds: string[] = options.companyId ? [options.companyId] : (userPrefs?.companyIds || []);

  const userPrefData: UserPreferencesData = {
    userId,
    roles: effectiveRoles,
    locations: effectiveLocations,
    workplaceTypes: effectiveWorkplaces,
    experienceLevel: effectiveExperience,
    companyIds: effectiveCompanyIds,
    keywords: userPrefs?.keywords || [],
  };

  // 2. Query only ACTIVE + VERIFIED jobs from active companies
  const db = getDb();
  const conditions = [
    eq(schema.jobs.status, 'ACTIVE'),
    eq(schema.jobs.verification_status, 'VERIFIED'),
    eq(schema.companies.is_active, true),
  ];

  // Specific company filter at SQL level if configured
  if (userPrefData.companyIds.length > 0) {
    conditions.push(inArray(schema.jobs.company_id, userPrefData.companyIds));
  }

  // Safe SQL Pre-filter for Roles
  const safeRolePatterns = getSafeSqlRolePatterns(effectiveRoles);
  if (!effectiveRoles.includes('ALL') && safeRolePatterns.length > 0) {
    const roleConditions = safeRolePatterns.map((pattern) => ilike(schema.jobs.title, pattern));
    conditions.push(or(...roleConditions)!);
  }

  // Safe SQL Pre-filter for Workplace
  if (effectiveWorkplaces.length > 0 && effectiveWorkplaces.length < 3) {
    const wpConditions = effectiveWorkplaces.map(wp => eq(schema.jobs.workplace_type, wp));
    wpConditions.push(eq(schema.jobs.workplace_type, 'UNKNOWN'));
    conditions.push(or(...wpConditions)!);
  }

  // Today's matches filter: jobs discovered or posted since local midnight
  if (options.onlyToday) {
    const startOfToday = getStartOfTodayInTimezone('Asia/Kolkata');
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    conditions.push(
      gte(schema.jobs.initial_verified_at, startOfToday),
      lt(schema.jobs.initial_verified_at, startOfTomorrow)
    );
  }

  const perfDbQueryStart = performance.now();
  const pass1Rows = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      employmentType: schema.jobs.employment_type,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      officialPostedAt: schema.jobs.official_posted_at,
      firstSeenAt: schema.jobs.first_seen_at,
      lastSeenAt: schema.jobs.last_seen_at,
      lastVerifiedAt: schema.jobs.last_verified_at,
      initialVerifiedAt: schema.jobs.initial_verified_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(and(...conditions))
    .orderBy(options.onlyToday ? desc(schema.jobs.initial_verified_at) : desc(schema.jobs.first_seen_at));


  const perfDbQueryEnd = performance.now();

  // 3. Retrieve Dismissed Job IDs for the user to filter feed
  const dismissedSet = await getDismissedJobIds(userId);

  // 4. Evaluate Hard Match for each candidate job (Two-Pass Architecture)
  const perfMatchingStart = performance.now();
  
  // Pass 1: Light Filtering
  const pass1Survivors: { candidate: any; components: any; reasons: string[] }[] = [];
  const survivingIds: string[] = [];

  for (const job of pass1Rows) {
    if (!options.includeDismissed && dismissedSet.has(job.id)) {
      continue;
    }

    const reasons: string[] = [];

    const companyResult = matchCompany(job.companyId, job.companyName, userPrefData.companyIds);
    reasons.push(companyResult.reason);

    const roleResult = matchRole(job.title, userPrefData.roles);
    reasons.push(roleResult.reason);

    const locationResult = matchLocation(job.location, userPrefData.locations);
    reasons.push(locationResult.reason);

    const detectedWorkplace = detectWorkplaceType(job.location, job.workplaceType);
    const workplaceResult = matchWorkplace(detectedWorkplace, userPrefData.workplaceTypes as string[]);
    reasons.push(workplaceResult.reason);

    if (companyResult.matched && roleResult.matched && locationResult.matched && workplaceResult.matched) {
      pass1Survivors.push({
        candidate: job,
        components: {
          company: companyResult,
          role: roleResult,
          location: locationResult,
          workplace: workplaceResult,
        },
        reasons
      });
      survivingIds.push(job.id);
    }
  }

  const eligibleCandidates: { candidate: CandidateJobData; matchResult: JobMatchResult }[] = [];
  let pass2Rows: any[] = [];

  // Pass 2: Heavy Fetch & Filtering
  if (survivingIds.length > 0) {
    pass2Rows = await db
      .select({
        id: schema.jobs.id,
        officialUrl: schema.jobs.official_url,
        applyUrl: schema.jobs.apply_url,
        description: schema.jobs.description,
        requirements: schema.jobs.requirements,
      })
      .from(schema.jobs)
      .where(inArray(schema.jobs.id, survivingIds));

    const heavyDataMap = new Map(pass2Rows.map(row => [row.id, row]));

    for (const survivor of pass1Survivors) {
      const heavyData = heavyDataMap.get(survivor.candidate.id);
      if (!heavyData) continue; // Concurrency protection

      const fullCandidate: CandidateJobData = {
        ...survivor.candidate,
        officialUrl: heavyData.officialUrl,
        applyUrl: heavyData.applyUrl,
        description: heavyData.description,
        requirements: heavyData.requirements,
      };

      const reasons = [...survivor.reasons];
      
      const parsedExp = parseExperienceRequirements(fullCandidate.title, fullCandidate.description, fullCandidate.requirements);
      const expResult = matchExperience(parsedExp, userPrefData.experienceLevel);
      reasons.push(expResult.reason);

      const keywordResult = matchKeywords(
        fullCandidate.title,
        fullCandidate.description,
        fullCandidate.requirements,
        userPrefData.keywords || []
      );
      if (userPrefData.keywords && userPrefData.keywords.length > 0) {
        reasons.push(keywordResult.reason);
      }

      if (expResult.matched && keywordResult.matched) {
        eligibleCandidates.push({
          candidate: fullCandidate,
          matchResult: {
            jobId: fullCandidate.id,
            matched: true,
            decision: 'MATCH',
            reasons,
            components: {
              ...survivor.components,
              experience: expResult,
              keywords: keywordResult,
            }
          }
        });
      }
    }
  }

  const perfMatchingEnd = performance.now();

  // 4. Score Relevance & Evaluate Freshness Deterministically
  const perfScoringStart = performance.now();
  const companyCounts: Record<string, number> = {};
  const matchedJobs: MatchedJobDto[] = [];

  for (const { candidate, matchResult } of eligibleCandidates) {
    const seenCount = companyCounts[candidate.companyId] || 0;
    const baseRelevance = evaluateJobRelevance(candidate, userPrefData, seenCount);
    companyCounts[candidate.companyId] = seenCount + 1;

    // Freshness filter (if requested: 'FRESH' | 'RECENT' | 'AGING' | 'STALE')
    if (options.freshness && options.freshness !== 'ALL') {
      if (baseRelevance.breakdown.freshness.state !== options.freshness.toUpperCase()) {
        continue;
      }
    }

    const expComp = matchResult.components.experience;
    const roleComp = matchResult.components.role;
    const locComp = matchResult.components.location;
    const wpComp = matchResult.components.workplace;

    const summaryParts = [
      roleComp.matchedRole || candidate.title,
      locComp.matchedLocation || candidate.location || 'Location',
      wpComp.detectedWorkplace !== 'UNKNOWN' ? wpComp.detectedWorkplace : 'Workplace',
      userPrefData.experienceLevel === 'FRESHER' ? 'Fresher Compatible' : 'Experienced',
    ];

    const matchExplanations = [...baseRelevance.matchExplanations];
    let searchRelevanceBoost = 0;

    // Evaluate Search Skills & Keywords as Relevance Signals (Factual Verification)
    const textCorpus = `${candidate.title} ${candidate.description || ''} ${candidate.requirements || ''}`.toLowerCase();

    if (searchIntent && searchIntent.skills.length > 0) {
      for (const skill of searchIntent.skills) {
        const s = skill.toLowerCase();
        const skillRegex = new RegExp(`\\b${s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (skillRegex.test(textCorpus)) {
          searchRelevanceBoost += 10;
          const exp = `⚡ Matches searched skill: ${skill}`;
          if (!matchExplanations.includes(exp)) {
            matchExplanations.unshift(exp);
          }
        }
      }
    }

    if (searchIntent && searchIntent.remainingKeywords.length > 0) {
      for (const kw of searchIntent.remainingKeywords) {
        if (textCorpus.includes(kw)) {
          searchRelevanceBoost += 5;
        }
      }
    }

    // Add search-specific deterministic explanations for explicit query dimensions
    if (searchIntent && searchIntent.isNaturalLanguage) {
      if (searchIntent.locations.length > 0 && locComp.matchedLocation) {
        const locExp = `📍 Matches location: ${locComp.matchedLocation}`;
        if (!matchExplanations.includes(locExp)) {
          matchExplanations.push(locExp);
        }
      }
      if (searchIntent.roles.length > 0 && roleComp.matchedRole) {
        const roleExp = `🎯 Matches role: ${roleComp.matchedRole}`;
        if (!matchExplanations.includes(roleExp)) {
          matchExplanations.push(roleExp);
        }
      }
    }

    const finalScore = Math.min(100, baseRelevance.totalScore + searchRelevanceBoost);

    matchedJobs.push({
      id: candidate.id,
      companyId: candidate.companyId,
      companyName: candidate.companyName,
      title: candidate.title,
      location: candidate.location || 'Not Specified',
      workplaceType: wpComp.detectedWorkplace,
      officialUrl: candidate.officialUrl,
      applyUrl: candidate.applyUrl,
      sourceSystem: candidate.sourceSystem,
      verifiedStatus: candidate.verificationStatus,
      firstSeenAt: candidate.firstSeenAt.toISOString(),
      lastSeenAt: candidate.lastSeenAt ? candidate.lastSeenAt.toISOString() : undefined,
      lastVerifiedAt: candidate.lastVerifiedAt ? candidate.lastVerifiedAt.toISOString() : null,
      initialVerifiedAt: candidate.initialVerifiedAt ? candidate.initialVerifiedAt.toISOString() : null,
      officialPostedAt: candidate.officialPostedAt ? candidate.officialPostedAt.toISOString() : null,
      experienceClassification: expComp.classification,
      matchSummary: summaryParts.join(' · '),
      relevanceScore: finalScore,
      freshnessState: baseRelevance.breakdown.freshness.state,
      daysSinceDiscovered: baseRelevance.breakdown.freshness.daysSinceDiscovered,
      matchExplanations: Array.from(new Set(matchExplanations)),
      reasons: Array.from(new Set(matchExplanations)),
      breakdown: baseRelevance.breakdown,
      description: candidate.description,
      requirements: candidate.requirements,
    });
  }
  const perfScoringEnd = performance.now();

  // 6. Deterministic Sorting with Stable Secondary Tie-Breakers
  const perfSortStart = performance.now();
  matchedJobs.sort((a, b) => {
    if (options.onlyToday) {
      const aTime = a.initialVerifiedAt ? new Date(a.initialVerifiedAt).getTime() : 0;
      const bTime = b.initialVerifiedAt ? new Date(b.initialVerifiedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.id.localeCompare(b.id);
    }

    if (sort === 'NEWEST') {
      const diffTime = new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
      if (diffTime !== 0) return diffTime;
      const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.id.localeCompare(b.id);
    }

    if (sort === 'MOST_RELEVANT') {
      const aRel = (a.breakdown?.role.score || 0) + (a.breakdown?.experience.score || 0) + (a.breakdown?.location.score || 0);
      const bRel = (b.breakdown?.role.score || 0) + (b.breakdown?.experience.score || 0) + (b.breakdown?.location.score || 0);
      if (bRel !== aRel) return bRel - aRel;
      const diffTime = new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
      if (diffTime !== 0) return diffTime;
      return a.id.localeCompare(b.id);
    }

    if (sort === 'RECENTLY_VERIFIED') {
      const aVer = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).getTime() : new Date(a.firstSeenAt).getTime();
      const bVer = b.lastVerifiedAt ? new Date(b.lastVerifiedAt).getTime() : new Date(b.firstSeenAt).getTime();
      if (bVer !== aVer) return bVer - aVer;
      const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.id.localeCompare(b.id);
    }

    // Default: BEST_MATCH
    const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const diffTime = new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
    if (diffTime !== 0) return diffTime;
    return a.id.localeCompare(b.id);
  });

  // 7. Paginate Results Deterministically & Attach Batch User Interactions
  const totalMatches = matchedJobs.length;
  const offset = (page - 1) * limit;
  const paginated = matchedJobs.slice(offset, offset + limit);
  const perfSortEnd = performance.now();

  log.info({
    userId,
    candidatesFetched: pass1Rows.length,
    pass1Survivors: survivingIds.length,
    pass2Fetched: pass2Rows.length,
    eligibleCount: eligibleCandidates.length,
    dbQueryMs: perfDbQueryEnd - perfDbQueryStart,
    matchingMs: perfMatchingEnd - perfMatchingStart,
    scoringMs: perfScoringEnd - perfScoringStart,
    sortingMs: perfSortEnd - perfSortStart,
    totalMs: performance.now() - perfStart
  }, 'findMatchesForUser performance diagnostics');

  if (paginated.length > 0) {
    const jobIds = paginated.map((j) => j.id);
    const interactionsMap = await getInteractionsBatch(userId, jobIds);
    for (const job of paginated) {
      job.interaction = interactionsMap.get(job.id) || null;
    }
  }

  return {
    totalMatches,
    page,
    limit,
    searchIntent,
    jobs: paginated,
  };
}
