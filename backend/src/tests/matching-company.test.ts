/**
 * Company Matcher Unit Tests.
 *
 * Explicitly validates:
 * - Case A: user.companyIds = [] → Matches ALL active supported company sources.
 * - Case B: user.companyIds = [A, B] → Matches ONLY selected companies.
 * - Case C: user.companyIds reverted [A, B] → [] → Matches ALL sources again.
 */

import { describe, it, expect } from 'vitest';
import { matchCompany } from '../matching/company-matcher.js';

describe('Company Matcher (Case A/B/C Semantics)', () => {
  const companyGitLabId = '11111111-1111-1111-1111-111111111111';
  const companyPalantirId = '22222222-2222-2222-2222-222222222222';
  const companyAutodeskId = '33333333-3333-3333-3333-333333333333';
  const companyCernId = '44444444-4444-4444-4444-444444444444';

  it('Case A: Empty company array matches ALL active company sources', () => {
    const userCompanyIds: string[] = [];

    const gitlabRes = matchCompany(companyGitLabId, 'GitLab', userCompanyIds);
    expect(gitlabRes.matched).toBe(true);
    expect(gitlabRes.scope).toBe('ALL_SUPPORTED_COMPANIES');

    const palantirRes = matchCompany(companyPalantirId, 'Palantir', userCompanyIds);
    expect(palantirRes.matched).toBe(true);
    expect(palantirRes.scope).toBe('ALL_SUPPORTED_COMPANIES');

    const cernRes = matchCompany(companyCernId, 'CERN', userCompanyIds);
    expect(cernRes.matched).toBe(true);
  });

  it('Case B: Specific company selection restricts matches ONLY to selected companies', () => {
    const userCompanyIds = [companyGitLabId, companyAutodeskId];

    const gitlabRes = matchCompany(companyGitLabId, 'GitLab', userCompanyIds);
    expect(gitlabRes.matched).toBe(true);
    expect(gitlabRes.scope).toBe('SPECIFIC_COMPANIES');

    const autodeskRes = matchCompany(companyAutodeskId, 'Autodesk', userCompanyIds);
    expect(autodeskRes.matched).toBe(true);

    const palantirRes = matchCompany(companyPalantirId, 'Palantir', userCompanyIds);
    expect(palantirRes.matched).toBe(false);
    expect(palantirRes.reason).toContain('not in the user\'s selected companies list');

    const cernRes = matchCompany(companyCernId, 'CERN', userCompanyIds);
    expect(cernRes.matched).toBe(false);
  });

  it('Case C: Removing all companies restores ALL active company sources scope', () => {
    // Step 1: User initially had specific companies
    let userCompanyIds = [companyPalantirId];
    expect(matchCompany(companyGitLabId, 'GitLab', userCompanyIds).matched).toBe(false);

    // Step 2: User clears company selection back to []
    userCompanyIds = [];
    expect(matchCompany(companyGitLabId, 'GitLab', userCompanyIds).matched).toBe(true);
    expect(matchCompany(companyPalantirId, 'Palantir', userCompanyIds).matched).toBe(true);
    expect(matchCompany(companyAutodeskId, 'Autodesk', userCompanyIds).matched).toBe(true);
    expect(matchCompany(companyCernId, 'CERN', userCompanyIds).matched).toBe(true);
  });
});
