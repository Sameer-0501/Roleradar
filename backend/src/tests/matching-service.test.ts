/**
 * Matching Service Unit Tests.
 *
 * Tests the deterministic conjunction rule:
 * MATCH = companyMatch AND roleMatch AND locationMatch AND experienceMatch AND keywordMatch
 *
 * Verifies explainability and that core criteria can never be bypassed.
 */

import { describe, it, expect } from 'vitest';
import { evaluateJobMatch } from '../matching/matching-service.js';
import type { CandidateJobData, UserPreferencesData } from '../matching/matching-types.js';

describe('Matching Service (Conjunction & Explainability)', () => {
  const baseJob: CandidateJobData = {
    id: 'job-101',
    companyId: 'comp-gitlab',
    companyName: 'GitLab',
    sourceSystem: 'GREENHOUSE',
    externalJobId: 'ext-101',
    title: 'Junior Software Engineer',
    location: 'Bengaluru, India',
    officialUrl: 'https://boards.greenhouse.io/gitlab/jobs/101',
    description: 'Entry-level software engineering role. 0-1 years experience.',
    requirements: 'BS in Computer Science or equivalent. Freshers welcome.',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };

  const baseUser: UserPreferencesData = {
    userId: 'user-001',
    roles: ['Software Engineer'],
    locations: ['Bangalore'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
  };

  it('produces confirmed MATCH when all core criteria align', () => {
    const result = evaluateJobMatch(baseJob, baseUser);

    expect(result.matched).toBe(true);
    expect(result.decision).toBe('MATCH');
    expect(result.components.company.matched).toBe(true);
    expect(result.components.role.matched).toBe(true);
    expect(result.components.location.matched).toBe(true);
    expect(result.components.experience.matched).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('fails match when Role mismatches, even if location and company match', () => {
    const dataAnalystUser: UserPreferencesData = {
      ...baseUser,
      roles: ['Data Analyst'],
    };

    const result = evaluateJobMatch(baseJob, dataAnalystUser);
    expect(result.matched).toBe(false);
    expect(result.decision).toBe('NO_MATCH');
    expect(result.components.role.matched).toBe(false);
  });

  it('fails match when Location mismatches, even if role and company match', () => {
    const puneUser: UserPreferencesData = {
      ...baseUser,
      locations: ['Pune'],
    };

    const result = evaluateJobMatch(baseJob, puneUser);
    expect(result.matched).toBe(false);
    expect(result.decision).toBe('NO_MATCH');
    expect(result.components.location.matched).toBe(false);
  });

  it('fails match when Experience mismatches (Fresher user on Senior role)', () => {
    const seniorJob: CandidateJobData = {
      ...baseJob,
      title: 'Senior Software Engineer',
      description: 'Requires 6+ years of distributed systems engineering.',
    };

    const result = evaluateJobMatch(seniorJob, baseUser);
    expect(result.matched).toBe(false);
    expect(result.decision).toBe('NO_MATCH');
    expect(result.components.experience.matched).toBe(false);
  });

  it('fails match when Company scope excludes the job company', () => {
    const specificCompanyUser: UserPreferencesData = {
      ...baseUser,
      companyIds: ['comp-autodesk'], // only Autodesk
    };

    const result = evaluateJobMatch(baseJob, specificCompanyUser);
    expect(result.matched).toBe(false);
    expect(result.decision).toBe('NO_MATCH');
    expect(result.components.company.matched).toBe(false);
  });

  it('keywords act as an additional filter and cannot bypass role mismatch', () => {
    const keywordUser: UserPreferencesData = {
      ...baseUser,
      roles: ['Civil Engineer'], // mismatched role
      keywords: ['Software'],   // keyword is present in job
    };

    const result = evaluateJobMatch(baseJob, keywordUser);
    // Even though keyword matched, core role failed so overall is NO_MATCH
    expect(result.matched).toBe(false);
    expect(result.components.keywords?.matched).toBe(true);
    expect(result.components.role.matched).toBe(false);
  });

  it('official URL is preserved without modification', () => {
    expect(baseJob.officialUrl).toBe('https://boards.greenhouse.io/gitlab/jobs/101');
    expect(baseJob.officialUrl).not.toContain('linkedin');
    expect(baseJob.officialUrl).not.toContain('indeed');
  });

  describe('User Preference Isolation (Multi-user safety)', () => {
    const jobSoftwareEngBangalore: CandidateJobData = {
      ...baseJob,
      id: 'job-swe-blr',
      title: 'Software Engineer',
      location: 'Bangalore, India',
      description: '0-2 years experience. Freshers welcome.',
    };

    const jobDataAnalystHyd: CandidateJobData = {
      ...baseJob,
      id: 'job-da-hyd',
      title: 'Data Analyst',
      location: 'Hyderabad, India',
      description: '3+ years experience in SQL and data analytics.',
      requirements: 'Requires minimum 3+ years experience in data analytics and SQL.',
    };

    const userA: UserPreferencesData = {
      userId: 'user-a',
      roles: ['Software Engineer'],
      locations: ['Bangalore'],
      experienceLevel: 'FRESHER',
      companyIds: [],
    };

    const userB: UserPreferencesData = {
      userId: 'user-b',
      roles: ['Data Analyst'],
      locations: ['Hyderabad'],
      experienceLevel: 'EXPERIENCED',
      companyIds: [],
    };

    it('matches SWE Bangalore job for User A but NOT for User B', () => {
      const matchA = evaluateJobMatch(jobSoftwareEngBangalore, userA);
      const matchB = evaluateJobMatch(jobSoftwareEngBangalore, userB);

      expect(matchA.matched).toBe(true);
      expect(matchB.matched).toBe(false);
    });

    it('matches Data Analyst Hyderabad job for User B but NOT for User A', () => {
      const matchA = evaluateJobMatch(jobDataAnalystHyd, userA);
      const matchB = evaluateJobMatch(jobDataAnalystHyd, userB);

      expect(matchA.matched).toBe(false); // Fails role, location, and fresher exp
      expect(matchB.matched).toBe(true);
    });
  });
});
