/**
 * Unit Tests for Phase 9 Deterministic Relevance & Ranking Engine.
 *
 * Tests:
 * 1. Role match quality and scoring
 * 2. Fresher prioritization (SDE I / Grad / Intern boost)
 * 3. Experienced match scoring and level compatibility
 * 4. Location scoring, aliases, and remote semantics
 * 5. Workplace preference alignment
 * 6. Freshness lifecycle tiers (FRESH, RECENT, AGING, STALE)
 * 7. Multi-factor composite relevance scoring
 * 8. Company diversity tie-breaker penalty
 */

import { describe, it, expect } from 'vitest';
import {
  scoreRole,
  scoreExperience,
  scoreLocation,
  scoreWorkplace,
  evaluateJobRelevance,
} from '../matching/relevance/relevance-service.js';
import { evaluateJobFreshness } from '../matching/relevance/freshness-evaluator.js';
import type { CandidateJobData, UserPreferencesData } from '../matching/matching-types.js';

describe('Phase 9 Relevance & Ranking Engine', () => {
  describe('Role Relevance Scoring (0–45 pts)', () => {
    it('gives max score (45) for exact title match', () => {
      const result = scoreRole('Software Engineer', ['Software Engineer']);
      expect(result.score).toBe(45);
      expect(result.matchTier).toBe('EXACT');
    });

    it('gives high score (40) for approved synonyms (e.g. SDE, Software Developer)', () => {
      const res1 = scoreRole('Software Developer', ['Software Engineer']);
      expect(res1.score).toBeGreaterThanOrEqual(38);
      expect(res1.matchTier).toBe('STRONG_SYNONYM');

      const res2 = scoreRole('SDE I', ['Software Engineer']);
      expect(res2.score).toBeGreaterThanOrEqual(38);
    });

    it('gives specialization score (35) for sub-disciplines', () => {
      const res = scoreRole('Backend Software Engineer', ['Software Engineer']);
      expect(res.score).toBeGreaterThanOrEqual(34);
      expect(res.matchTier).toBe('SPECIALIZATION');
    });

    it('gives lower score for related technical role', () => {
      const res = scoreRole('Data Engineer', ['Software Engineer']);
      expect(res.score).toBeLessThan(30);
    });

    it('gives 0 score for completely unrelated roles', () => {
      const res = scoreRole('Product Manager', ['Software Engineer']);
      expect(res.score).toBe(0);
      expect(res.matchTier).toBe('NONE');
    });
  });

  describe('Fresher Alignment & Prioritization (0–25 pts)', () => {
    const makeJob = (title: string, description?: string, requirements?: string): CandidateJobData => ({
      id: 'job-1',
      companyId: 'comp-1',
      companyName: 'Acme',
      sourceSystem: 'GREENHOUSE',
      externalJobId: 'ext-1',
      title,
      description: description || '',
      requirements: requirements || '',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      officialUrl: 'https://acme.com/jobs/1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });

    it('prioritizes explicit entry-level / graduate titles (25 pts) for Fresher profile', () => {
      const job1 = makeJob('Graduate Engineer Trainee');
      const job2 = makeJob('Software Engineer I');
      const job3 = makeJob('SDE Intern');
      const job4 = makeJob('Computer Scientist 1 (C++)');

      expect(scoreExperience(job1, 'FRESHER').score).toBe(25);
      expect(scoreExperience(job2, 'FRESHER').score).toBe(25);
      expect(scoreExperience(job3, 'FRESHER').score).toBe(25);
      expect(scoreExperience(job4, 'FRESHER').score).toBe(25);
    });

    it('scores 0–2 years (BOTH) lower than explicit graduate roles for Fresher profile', () => {
      const bothJob = makeJob('Software Developer', '0-2 years experience required');
      const res = scoreExperience(bothJob, 'FRESHER');
      expect(res.score).toBe(20);
      expect(res.classification).toBe('BOTH');
    });

    it('gives max score (25 pts) to experienced roles for Experienced profile', () => {
      const expJob = makeJob('Senior Software Engineer', '5+ years experience required');
      const res = scoreExperience(expJob, 'EXPERIENCED');
      expect(res.score).toBe(25);
      expect(res.classification).toBe('EXPERIENCED');
    });
  });

  describe('Location Scoring (0–15 pts)', () => {
    it('gives max score (15) for exact city and alias matches (Bangalore / Bengaluru)', () => {
      const res1 = scoreLocation('Bangalore', ['Bangalore']);
      expect(res1.score).toBe(15);
      expect(res1.isCityExact).toBe(true);

      const res2 = scoreLocation('Bengaluru, India', ['Bangalore']);
      expect(res2.score).toBeGreaterThanOrEqual(14);
      expect(res2.isCityExact).toBe(true);
    });

    it('gives max score for remote preference matching remote job', () => {
      const res = scoreLocation('Remote - India', ['Remote']);
      expect(res.score).toBe(15);
      expect(res.isRemote).toBe(true);
    });
  });

  describe('Workplace Scoring (0–8 pts)', () => {
    it('awards 8 pts for matching workplace preference', () => {
      expect(scoreWorkplace('REMOTE', ['REMOTE']).score).toBe(8);
      expect(scoreWorkplace('HYBRID', ['HYBRID']).score).toBe(8);
      expect(scoreWorkplace('ONSITE', ['ONSITE']).score).toBe(8);
    });

    it('awards 8 pts when user accepts any workplace', () => {
      expect(scoreWorkplace('REMOTE', []).score).toBe(8);
      expect(scoreWorkplace('HYBRID', []).score).toBe(8);
    });
  });

  describe('Freshness Lifecycle Tiers (0–7 pts)', () => {
    const now = new Date('2026-08-30T12:00:00Z');

    it('classifies jobs <= 2 days as FRESH (7 pts)', () => {
      const discoveredToday = new Date('2026-08-30T08:00:00Z');
      const res = evaluateJobFreshness(discoveredToday, discoveredToday, discoveredToday, now);
      expect(res.state).toBe('FRESH');
      expect(res.score).toBe(7);
    });

    it('classifies jobs 3–7 days as RECENT (5 pts)', () => {
      const discovered5DaysAgo = new Date('2026-08-25T12:00:00Z');
      const res = evaluateJobFreshness(discovered5DaysAgo, discovered5DaysAgo, discovered5DaysAgo, now);
      expect(res.state).toBe('RECENT');
      expect(res.score).toBe(5);
    });

    it('classifies jobs 8–21 days as AGING (2 pts)', () => {
      const discovered15DaysAgo = new Date('2026-08-15T12:00:00Z');
      const res = evaluateJobFreshness(discovered15DaysAgo, discovered15DaysAgo, discovered15DaysAgo, now);
      expect(res.state).toBe('AGING');
      expect(res.score).toBe(2);
    });

    it('classifies jobs > 21 days as STALE (0 pts)', () => {
      const discovered25DaysAgo = new Date('2026-08-05T12:00:00Z');
      const res = evaluateJobFreshness(discovered25DaysAgo, discovered25DaysAgo, discovered25DaysAgo, now);
      expect(res.state).toBe('STALE');
      expect(res.score).toBe(0);
    });
  });

  describe('Composite Relevance Scoring & Ranking Integration', () => {
    const userFresher: UserPreferencesData = {
      userId: 'u1',
      roles: ['Software Engineer'],
      locations: ['Bangalore'],
      workplaceTypes: ['HYBRID'],
      experienceLevel: 'FRESHER',
      companyIds: [],
      keywords: [],
    };

    it('scores an exact fresher match close to 100 with rich explanations', () => {
      const job: CandidateJobData = {
        id: 'j-perfect',
        companyId: 'c1',
        companyName: 'Amazon',
        sourceSystem: 'WORKDAY',
        externalJobId: 'ext-perfect',
        title: 'Software Engineer I',
        location: 'Bangalore, India',
        workplaceType: 'HYBRID',
        officialUrl: 'https://amazon.jobs/1',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
      };

      const result = evaluateJobRelevance(job, userFresher);
      expect(result.totalScore).toBeGreaterThanOrEqual(90);
      expect(result.matchExplanations.length).toBeGreaterThanOrEqual(4);
      expect(result.matchExplanations.some((e) => e.includes('target role'))).toBe(true);
      expect(result.matchExplanations.some((e) => e.includes('Bangalore'))).toBe(true);
      expect(result.matchExplanations.some((e) => e.includes('Fresher-compatible'))).toBe(true);
    });

    it('applies secondary company diversity penalty without crushing relevance', () => {
      const job: CandidateJobData = {
        id: 'j-2',
        companyId: 'c1',
        companyName: 'Amazon',
        sourceSystem: 'WORKDAY',
        externalJobId: 'ext-2',
        title: 'Software Engineer',
        location: 'Bangalore',
        workplaceType: 'HYBRID',
        officialUrl: 'https://amazon.jobs/2',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
      };

      const scoreFirstSeen = evaluateJobRelevance(job, userFresher, 0);
      const scoreRepeatedSeen = evaluateJobRelevance(job, userFresher, 2);

      expect(scoreRepeatedSeen.totalScore).toBe(scoreFirstSeen.totalScore - 2);
    });
  });
});
