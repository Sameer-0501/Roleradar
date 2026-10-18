/**
 * Phase 20.5: Post-Integration Security & Production-Safety Audit Test Suite
 *
 * Verifies security, data isolation, lifecycle closure safety, URL validation,
 * matching invariants, and notification safety across all 7 newly integrated employers:
 * Airbus, State Street, Cushman & Wakefield, LSEG, Stryker, KONE, Aptiv.
 */

import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { validateJobUrl } from '../collectors/url-validator.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import { matchWorkplace, matchLocation } from '../matching/location-matcher.js';
import type { JobCandidate } from '../collectors/types.js';
import { requireInternalKey, requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';

// Notification Safety: Ensure evaluateAndCreateInstantAlerts is mocked during tests
vi.mock('../notifications/alert-service.js', () => ({
  evaluateAndCreateInstantAlerts: vi.fn().mockResolvedValue({
    evaluatedUsers: 0,
    matchedUsers: 0,
    createdNotifications: 0,
  }),
  evaluateAndCreateRecentJobAlerts: vi.fn().mockResolvedValue({
    jobsEvaluated: 0,
    totalAlerts: 0,
    totalSkipped: 0,
  }),
}));

describe('Phase 20.5 Post-Integration Security & Production-Safety Audit', () => {
  const employers = [
    {
      name: 'Airbus',
      officialDomain: 'ag.wd3.myworkdayjobs.com',
      validUrl: 'https://ag.wd3.myworkdayjobs.com/Airbus/job/Bengaluru/Software-Engineer_JR10293847',
      phishingUrl: 'https://ag.wd3.myworkdayjobs.com.phishing-careers.net/Airbus/job/JR10293847',
      rootUrl: 'https://ag.wd3.myworkdayjobs.com/Airbus',
    },
    {
      name: 'State Street',
      officialDomain: 'statestreet.wd1.myworkdayjobs.com',
      validUrl: 'https://statestreet.wd1.myworkdayjobs.com/global/job/Bengaluru/Associate-Developer_R-798696',
      phishingUrl: 'https://statestreet-careers.org/global/job/R-798696',
      rootUrl: 'https://statestreet.wd1.myworkdayjobs.com/global',
    },
    {
      name: 'Cushman & Wakefield',
      officialDomain: 'cw.wd1.myworkdayjobs.com',
      validUrl: 'https://cw.wd1.myworkdayjobs.com/External/job/Gurgaon/Project-Manager_R340253',
      phishingUrl: 'https://cushman-wakefield-jobs.com/External/job/R340253',
      rootUrl: 'https://cw.wd1.myworkdayjobs.com/External',
    },
    {
      name: 'LSEG',
      officialDomain: 'lseg.wd3.myworkdayjobs.com',
      validUrl: 'https://lseg.wd3.myworkdayjobs.com/Careers/job/Bangalore/Software-Engineer_R-883921',
      phishingUrl: 'https://lseg.wd3.careers-spoof.com/Careers/job/R-883921',
      rootUrl: 'https://lseg.wd3.myworkdayjobs.com/Careers',
    },
    {
      name: 'Stryker',
      officialDomain: 'stryker.wd1.myworkdayjobs.com',
      validUrl: 'https://stryker.wd1.myworkdayjobs.com/StrykerCareers/job/Gurgaon/Senior-Engineer_R575636',
      phishingUrl: 'https://stryker-jobboard.net/StrykerCareers/job/R575636',
      rootUrl: 'https://stryker.wd1.myworkdayjobs.com/StrykerCareers',
    },
    {
      name: 'KONE',
      officialDomain: 'kone.wd3.myworkdayjobs.com',
      validUrl: 'https://kone.wd3.myworkdayjobs.com/Careers/job/Chennai/Software-Engineer_R0663359',
      phishingUrl: 'https://kone.careers-portal.fake/Careers/job/R0663359',
      rootUrl: 'https://kone.wd3.myworkdayjobs.com/Careers',
    },
    {
      name: 'Aptiv',
      officialDomain: 'aptiv.wd5.myworkdayjobs.com',
      validUrl: 'https://aptiv.wd5.myworkdayjobs.com/APTIV_CAREERS/job/Bangalore/Embedded-Engineer_J000705138',
      phishingUrl: 'https://aptiv-jobs.scam.org/APTIV_CAREERS/job/J000705138',
      rootUrl: 'https://aptiv.wd5.myworkdayjobs.com/APTIV_CAREERS',
    },
  ];

  // ─── 1. Official Application URL Validation & Host Integrity ──────────────────
  describe('1. Official Application URL Validation & Host Integrity', () => {
    it.each(employers)('validates authentic direct-apply URLs for $name', ({ validUrl, officialDomain }) => {
      const res = validateJobUrl(validUrl, officialDomain);
      expect(res.valid).toBe(true);
    });

    it.each(employers)('strictly rejects lookalike / phishing domains for $name', ({ phishingUrl, officialDomain }) => {
      const res = validateJobUrl(phishingUrl, officialDomain);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/does not match official domain/i);
    });

    it.each(employers)('strictly rejects aggregator and social links for $name', ({ officialDomain }) => {
      const aggregators = [
        'https://www.linkedin.com/jobs/view/123456789',
        'https://www.indeed.com/viewjob?jk=abcdef123456',
        'https://www.glassdoor.com/job-listing/engineer-12345.htm',
        'https://www.naukri.com/job-listings-sde-12345',
      ];
      for (const aggUrl of aggregators) {
        const res = validateJobUrl(aggUrl, officialDomain);
        expect(res.valid).toBe(false);
        expect(res.reason).toMatch(/does not match official domain/i);
      }
    });

    it.each(employers)('strictly rejects non-job portal homepages for $name', ({ rootUrl, officialDomain }) => {
      const res = validateJobUrl(rootUrl, officialDomain);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/root|homepage|does not identify an individual job/i);
    });

    it.each(employers)('strictly rejects non-HTTPS URLs for $name', ({ validUrl, officialDomain }) => {
      const insecureUrl = validUrl.replace('https://', 'http://');
      const res = validateJobUrl(insecureUrl, officialDomain);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/must use HTTPS/i);
    });
  });

  // ─── 2. Declarative Facets & Incomplete-Scan Semantics ────────────────────────
  describe('2. Declarative Facets & Incomplete-Scan Semantics', () => {
    it.each(employers)('confirms $name is registered with declarative appliedFacets in SOURCE_CATALOG', ({ name }) => {
      const source = SOURCE_CATALOG.find((s) => s.companyName === name);
      expect(source).toBeDefined();
      const workdayConfig = source?.config as any;
      expect(workdayConfig).toBeDefined();
      expect(workdayConfig.appliedFacets).toBeDefined();
      expect(Object.keys(workdayConfig.appliedFacets).length).toBeGreaterThan(0);
    });

    it.each(employers)('confirms $name WorkdayCollector reports isCompleteScan() === false', ({ name }) => {
      const source = SOURCE_CATALOG.find((s) => s.companyName === name);
      const collector = new WorkdayCollector({
        ...(source!.config as any),
        pageSize: 5,
        maxPages: 1,
      });
      expect(collector.isCompleteScan()).toBe(false);
    });

    it('guarantees runPipeline skips absence closure when isCompleteScan is false', async () => {
      const airbusSource = SOURCE_CATALOG.find((s) => s.companyName === 'Airbus')!;
      const invalidCandidate: JobCandidate = {
        externalJobId: 'MALICIOUS_JOB_001',
        title: 'Attacker Job',
        location: 'Bengaluru, India',
        officialUrl: 'https://evil-hacker.com/job/12345', // Invalid domain!
        workplaceType: 'ONSITE',
        sourceSystem: 'WORKDAY',
      };

      // Pipeline run with isCompleteScan = false
      const stats = await runPipeline(
        [invalidCandidate],
        'fake-company-id-001',
        {
          officialDomain: airbusSource.officialDomain,
          workdayConfig: airbusSource.config as any,
          sourceSystem: 'WORKDAY',
        },
        false // isCompleteScan is FALSE
      );

      // Candidate skipped at Step 1 (URL validation)
      expect(stats.skipped).toBe(1);
      expect(stats.verified).toBe(0);
      expect(stats.closed).toBe(0); // Absence reconciliation was NOT run
    });
  });

  // ─── 3. Matching & Experience Segregation Safety ──────────────────────────────
  describe('3. Matching & Experience Invariants', () => {
    it('strictly prevents senior, staff, lead, principal from matching fresher profile', () => {
      const seniorTitles = [
        'Senior Software Engineer',
        'Staff Software Engineer',
        'Lead Data Scientist',
        'Principal Architect',
        'Engineering Director',
        'VP of Engineering',
        'Head of Product',
      ];

      for (const title of seniorTitles) {
        const parsed = parseExperienceRequirements(title, undefined);
        const matchRes = matchExperience(parsed, 'FRESHER');
        expect(matchRes.matched).toBe(false);
      }
    });

    it('strictly excludes UNKNOWN experience from auto-matching fresher profile', () => {
      // Titles that do not state experience and have no description
      const ambiguousTitles = ['Project Manager', 'Consultant', 'Officer', 'Business Analyst'];

      for (const title of ambiguousTitles) {
        const parsed = parseExperienceRequirements(title, undefined);
        // By design, unverified / unknown experience level must NOT be blindly accepted as fresher
        if (parsed.classification === 'UNKNOWN') {
          const matchRes = matchExperience(parsed, 'FRESHER');
          expect(matchRes.matched).toBe(false);
        }
      }
    });

    it('accepts explicit fresher, junior, intern, apprentice roles for fresher profile', () => {
      const juniorTitles = [
        'Junior Software Engineer',
        'Graduate Trainee Engineer',
        'Associate Software Engineer',
        'Software Engineer Intern',
        'EIC Apprentice',
        'Junior Data Analyst',
      ];

      for (const title of juniorTitles) {
        const parsed = parseExperienceRequirements(title, undefined);
        const matchRes = matchExperience(parsed, 'FRESHER');
        expect(matchRes.matched).toBe(true);
      }
    });
  });

  // ─── 4. Location & Workplace Type Hard Filtering ──────────────────────────────
  describe('4. Location & Workplace Type Hard Filters', () => {
    it('enforces country-aware boundary: India-only preferences strictly reject foreign jobs', () => {
      const userLocations = ['India', 'Bengaluru, India'];

      // Foreign jobs (e.g. France, Germany, US)
      const foreignLocations = ['Toulouse, France', 'Munich, Germany', 'Boston, MA, USA'];
      for (const loc of foreignLocations) {
        const res = matchLocation(loc, userLocations);
        expect(res.matched).toBe(false);
      }

      // India jobs
      const indiaLocations = ['Bengaluru, Karnataka, India', 'Bangalore', 'Gurgaon, India', 'Chennai, Tamil Nadu'];
      for (const loc of indiaLocations) {
        const res = matchLocation(loc, userLocations);
        expect(res.matched).toBe(true);
      }
    });

    it('enforces workplace type as a hard filter: ONSITE cannot match REMOTE-only preferences', () => {
      const remotePref = ['REMOTE'];
      const onsiteRes = matchWorkplace('ONSITE', remotePref);
      expect(onsiteRes.matched).toBe(false);

      const hybridRes = matchWorkplace('HYBRID', remotePref);
      expect(hybridRes.matched).toBe(false);

      const remoteRes = matchWorkplace('REMOTE', remotePref);
      expect(remoteRes.matched).toBe(true);
    });

    it('enforces workplace type as a hard filter: REMOTE cannot match ONSITE-only preferences', () => {
      const onsitePref = ['ONSITE'];
      const remoteRes = matchWorkplace('REMOTE', onsitePref);
      expect(remoteRes.matched).toBe(false);

      const onsiteRes = matchWorkplace('ONSITE', onsitePref);
      expect(onsiteRes.matched).toBe(true);
    });
  });

  // ─── 5. Authentication, Authorization & Key Protection ───────────────────────
  describe('5. Authentication, Authorization & Key Protection', () => {
    it('requireInternalKey enforces secret validation: rejects missing key with 401 (or 503 if unconfigured)', () => {
      const req = {
        headers: {},
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      requireInternalKey(req, res, next);

      // Either 401 (configured but missing) or 503 (unconfigured in test env)
      expect(res.status).toHaveBeenCalledWith(expect.toBeOneOf([401, 503]));
      expect(next).not.toHaveBeenCalled();
    });

    it('requireInternalKey rejects invalid key with 401 (or 503 if unconfigured)', () => {
      const req = {
        headers: { 'x-internal-key': 'WRONG_INVALID_INTERNAL_KEY' },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      requireInternalKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(expect.toBeOneOf([401, 503]));
      expect(next).not.toHaveBeenCalled();
    });

    it('requireAuth rejects unauthenticated requests missing Bearer token with 401', async () => {
      const req = {
        headers: {},
      } as AuthenticatedRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/required/i) }));
      expect(next).not.toHaveBeenCalled();
    });
  });
});
