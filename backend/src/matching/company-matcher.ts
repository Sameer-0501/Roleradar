/**
 * Company Matcher.
 *
 * Implements the critical company selection product rules:
 * - Case A: user.companyIds = [] → Matches ALL active supported company sources.
 * - Case B: user.companyIds = [A, B] → Matches ONLY selected companies A and B.
 * - Case C: user.companyIds reverted [A, B] → [] → Matches ALL sources again.
 */

import type { CompanyMatchResult } from './matching-types.js';

export function matchCompany(
  jobCompanyId: string,
  companyName: string,
  userCompanyIds: string[]
): CompanyMatchResult {
  const isAllCompanies = !userCompanyIds || userCompanyIds.length === 0;

  if (isAllCompanies) {
    return {
      matched: true,
      scope: 'ALL_SUPPORTED_COMPANIES',
      reason: `Company ${companyName} matches user's all-companies preference`,
    };
  }

  const isSelected = userCompanyIds.includes(jobCompanyId);

  if (isSelected) {
    return {
      matched: true,
      scope: 'SPECIFIC_COMPANIES',
      reason: `Company ${companyName} is in the user's selected companies list`,
    };
  }

  return {
    matched: false,
    scope: 'SPECIFIC_COMPANIES',
    reason: `Company ${companyName} is not in the user's selected companies list`,
  };
}
