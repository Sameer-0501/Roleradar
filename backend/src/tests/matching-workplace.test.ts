import { describe, it, expect } from 'vitest';
import { detectWorkplaceType, matchWorkplace, matchLocation } from '../matching/location-matcher.js';
import { evaluateJobMatch } from '../matching/matching-service.js';
import type { CandidateJobData, UserPreferencesData } from '../matching/matching-types.js';

describe('Workplace Matcher & Country-Aware Semantics (Phase 7.3)', () => {
  describe('detectWorkplaceType', () => {
    it('detects ONSITE for physical city locations without remote keywords', () => {
      expect(detectWorkplaceType('Bangalore, India')).toBe('ONSITE');
      expect(detectWorkplaceType('Pune, Maharashtra')).toBe('ONSITE');
      expect(detectWorkplaceType('New York, NY')).toBe('ONSITE');
    });

    it('detects HYBRID for hybrid locations', () => {
      expect(detectWorkplaceType('Hybrid - Bangalore')).toBe('HYBRID');
      expect(detectWorkplaceType('Pune (Hybrid)')).toBe('HYBRID');
      expect(detectWorkplaceType('Hyderabad, Hybrid / Onsite')).toBe('HYBRID');
    });

    it('detects REMOTE for remote / worldwide / wfh locations', () => {
      expect(detectWorkplaceType('Remote')).toBe('REMOTE');
      expect(detectWorkplaceType('Remote, India')).toBe('REMOTE');
      expect(detectWorkplaceType('India (Remote)')).toBe('REMOTE');
      expect(detectWorkplaceType('Worldwide')).toBe('REMOTE');
      expect(detectWorkplaceType('Anywhere in APAC')).toBe('REMOTE');
    });

    it('respects explicit workplace type override when provided', () => {
      expect(detectWorkplaceType('Bangalore, India', 'REMOTE')).toBe('REMOTE');
      expect(detectWorkplaceType('Bangalore, India', 'HYBRID')).toBe('HYBRID');
      expect(detectWorkplaceType('Remote', 'ONSITE')).toBe('ONSITE');
    });

    it('returns UNKNOWN for empty or null location', () => {
      expect(detectWorkplaceType(null)).toBe('UNKNOWN');
      expect(detectWorkplaceType('')).toBe('UNKNOWN');
      expect(detectWorkplaceType('   ')).toBe('UNKNOWN');
    });
  });

  describe('matchWorkplace', () => {
    it('matches ANY workplace when user has no workplace preference ([] or undefined)', () => {
      expect(matchWorkplace('ONSITE', []).matched).toBe(true);
      expect(matchWorkplace('HYBRID', []).matched).toBe(true);
      expect(matchWorkplace('REMOTE', []).matched).toBe(true);
      expect(matchWorkplace('UNKNOWN', []).matched).toBe(true);
      expect(matchWorkplace('ONSITE', undefined).matched).toBe(true);
    });

    it('matches when job workplace is in preferred workplace list', () => {
      expect(matchWorkplace('ONSITE', ['ONSITE']).matched).toBe(true);
      expect(matchWorkplace('REMOTE', ['REMOTE', 'HYBRID']).matched).toBe(true);
      expect(matchWorkplace('HYBRID', ['REMOTE', 'HYBRID']).matched).toBe(true);
    });

    it('rejects when job workplace is not in preferred workplace list', () => {
      const res = matchWorkplace('ONSITE', ['REMOTE']);
      expect(res.matched).toBe(false);
      expect(res.reason).toContain('does not match preferred workplace types');
    });
  });

  describe('evaluateJobMatch - Workplace Integration', () => {
    const baseJob: CandidateJobData = {
      id: 'job-1',
      companyId: 'comp-1',
      companyName: 'GitLab',
      sourceSystem: 'GREENHOUSE',
      externalJobId: '123',
      title: 'Associate Software Engineer',
      location: 'Bangalore, India',
      officialUrl: 'https://job-boards.greenhouse.io/gitlab/123',
      applyUrl: 'https://job-boards.greenhouse.io/gitlab/123/apply',
      firstSeenAt: new Date(),
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
    };

    const baseUser: UserPreferencesData = {
      userId: 'user-1',
      roles: ['Software Engineer'],
      locations: ['Bangalore'],
      experienceLevel: 'FRESHER',
      companyIds: [],
    };

    it('matches when user has no workplace preference', () => {
      const match = evaluateJobMatch(baseJob, { ...baseUser, workplaceTypes: [] });
      expect(match.matched).toBe(true);
      expect(match.components.workplace.detectedWorkplace).toBe('ONSITE');
    });

    it('matches when user selects ONSITE and job is ONSITE', () => {
      const match = evaluateJobMatch(baseJob, { ...baseUser, workplaceTypes: ['ONSITE'] });
      expect(match.matched).toBe(true);
    });

    it('rejects when user selects only REMOTE and job is ONSITE', () => {
      const match = evaluateJobMatch(baseJob, { ...baseUser, workplaceTypes: ['REMOTE'] });
      expect(match.matched).toBe(false);
      expect(match.components.workplace.matched).toBe(false);
    });

    it('matches when user selects REMOTE and job is Remote, India', () => {
      const remoteJob: CandidateJobData = {
        ...baseJob,
        location: 'Remote, India',
      };
      const match = evaluateJobMatch(remoteJob, {
        ...baseUser,
        locations: ['Bangalore', 'Remote'],
        workplaceTypes: ['REMOTE'],
      });
      expect(match.matched).toBe(true);
      expect(match.components.workplace.detectedWorkplace).toBe('REMOTE');
    });
  });
});
