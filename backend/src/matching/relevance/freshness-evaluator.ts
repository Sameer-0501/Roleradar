/**
 * Deterministic Freshness Evaluator.
 *
 * Distinguishes:
 * 1. Job discovered date (RoleRadar first_seen_at)
 * 2. Job verification date (RoleRadar last_verified_at)
 * 3. Employer posted date (official_posted_at)
 *
 * Categorizes jobs into FRESH, RECENT, AGING, STALE with calibrated points.
 */

import type { FreshnessScoreResult, FreshnessState } from './relevance-types.js';

export function evaluateJobFreshness(
  firstSeenAt: Date,
  lastVerifiedAt?: Date | null,
  officialPostedAt?: Date | null,
  referenceDate: Date = new Date()
): FreshnessScoreResult {
  const refTime = referenceDate.getTime();
  const firstSeenTime = firstSeenAt ? new Date(firstSeenAt).getTime() : refTime;
  const verifiedTime = lastVerifiedAt ? new Date(lastVerifiedAt).getTime() : firstSeenTime;
  const postedTime = officialPostedAt ? new Date(officialPostedAt).getTime() : null;

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceDiscovered = Math.max(0, Math.floor((refTime - firstSeenTime) / msPerDay));
  const daysSinceVerified = Math.max(0, Math.floor((refTime - verifiedTime) / msPerDay));
  
  // For exact timestamp boundaries
  const msSincePosted = postedTime !== null ? Math.max(0, refTime - postedTime) : null;
  const daysSincePostedStr = postedTime !== null ? Math.floor(msSincePosted! / msPerDay) : null;

  const hours48 = 48 * 60 * 60 * 1000;
  const hours168 = 168 * 60 * 60 * 1000;

  let state: FreshnessState = 'AGING';
  let score = 2;
  let reason = 'Job verified active within recent cycles';

  if (msSincePosted !== null && postedTime! <= refTime) {
    if (msSincePosted <= hours48) {
      state = 'FRESH';
      score = 7;
      reason = `Posted ${daysSincePostedStr === 0 ? 'recently' : `${daysSincePostedStr} day(s) ago`}`;
    } else if (msSincePosted <= hours168) {
      state = 'RECENT';
      score = 5;
      reason = `Posted ${daysSincePostedStr} days ago`;
    } else {
      // Older than 7 days
      state = daysSinceDiscovered <= 21 && daysSinceVerified <= 21 ? 'AGING' : 'STALE';
      score = state === 'AGING' ? 2 : 0;
      reason = `Older listing (posted ${daysSincePostedStr} days ago)`;
    }
  } else {
    // Unknown or future posting date
    state = daysSinceDiscovered <= 21 && daysSinceVerified <= 21 ? 'AGING' : 'STALE';
    score = state === 'AGING' ? 2 : 0;
    reason = `Verified active (detected ${daysSinceDiscovered} days ago)`;
  }

  return {
    state,
    score,
    reason,
    daysSinceDiscovered,
    daysSinceVerified,
  };
}
