/**
 * Posting Date Confidence.
 *
 * Classifies how trustworthy a job's official_posted_at value is for use
 * in the rolling recent-job discovery window.
 *
 * CONFIRMED : Source reliably provides the employer's actual publication date.
 *             The field semantics are officially documented by the ATS vendor.
 * INFERRED  : Source provides a date but its exact semantics are not formally
 *             documented. Acceptable for recent-sweep use — treated as a best-
 *             effort estimate of the employer posting date.
 * UNKNOWN   : No trustworthy posting date is available (null). Jobs with this
 *             confidence are ALWAYS excluded from the recent-sweep window to
 *             prevent false positives.
 *
 * Source mapping (based on the ATS capability audit):
 *   GREENHOUSE  first_published  ISO-8601  CONFIRMED
 *   LEVER       createdAt        Unix ms   CONFIRMED
 *   ASHBY       publishedAt      ISO-8601  CONFIRMED  (reported as CUSTOM source type)
 *   WORKABLE    published        ISO-8601  CONFIRMED  (reported as CUSTOM source type)
 *   WORKDAY     postedOn         string    INFERRED   (semantics not officially documented)
 *   CUSTOM      postedAtField    varies    INFERRED   (field configured per company)
 *   Any source  (null)           —         UNKNOWN
 */

export type PostingDateConfidence = 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';

/**
 * Determine how trustworthy official_posted_at is for a given source.
 *
 * @param sourceSystem   - The source system string (e.g. 'GREENHOUSE', 'LEVER', 'WORKDAY', 'CUSTOM')
 * @param officialPostedAt - The posted date value from the source (null/undefined → UNKNOWN)
 * @returns Confidence level for the date
 */
export function getPostingDateConfidence(
  sourceSystem: string,
  officialPostedAt: Date | null | undefined
): PostingDateConfidence {
  // No date → always UNKNOWN regardless of source
  if (!officialPostedAt) {
    return 'UNKNOWN';
  }

  const src = (sourceSystem ?? '').toUpperCase();

  // CONFIRMED: ATS vendors with well-documented, employer-controlled publish dates
  if (src === 'GREENHOUSE' || src === 'LEVER') {
    return 'CONFIRMED';
  }

  // INFERRED: Sources that provide a date but with less formal documentation.
  // Includes WORKDAY (postedOn field, semantics approximately correct),
  // CUSTOM (company-configured postedAtField), and ASHBY/WORKABLE which
  // report via CUSTOM source type but provide reliable publishedAt/published fields.
  return 'INFERRED';
}

/**
 * Returns true when the posting date is trustworthy enough for the recent-sweep window.
 *
 * Both CONFIRMED and INFERRED are eligible.
 * UNKNOWN is always excluded.
 *
 * @param sourceSystem   - The source system identifier
 * @param officialPostedAt - The posted date (null/undefined → excluded)
 */
export function isDateEligibleForRecentSweep(
  sourceSystem: string,
  officialPostedAt: Date | null | undefined
): boolean {
  const confidence = getPostingDateConfidence(sourceSystem, officialPostedAt);
  return confidence === 'CONFIRMED' || confidence === 'INFERRED';
}
