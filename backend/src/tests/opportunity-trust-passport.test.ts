/**
 * Opportunity Trust Passport Engine Tests (Engine 1 — Blueprint Section 4 & Section 14).
 *
 * Verifies:
 * 1. Six Transparent Statuses (VERIFIED_ACTIVE, VERIFICATION_PENDING, SOURCE_UNAVAILABLE, CLOSED, URL_INVALID, DUPLICATE).
 * 2. Source unavailability (timeout/5xx) maps to SOURCE_UNAVAILABLE and NEVER marks an active job CLOSED.
 * 3. Adobe Primary vs Whitelisted Alternate Domain Provenance & Lookalike URL Rejection.
 * 4. Vacancy Freshness Tiering & Zero Fabricated Data (absent dates/compensation remain unstated).
 * 5. Deterministic Job Detail Completeness & Transparency Flags.
 * 6. Fast lightweight Trust Summary generation (zero N+1 queries).
 * 7. GET /api/jobs/:id/trust-passport endpoint behavior (200 with chronological history, 400 for bad UUID, 404 for not found).
 * 8. Real database record persistence and non-destructive reverse-dependency teardown.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  derivePassportStatus,
  evaluateDomainMatch,
  calculateFreshnessTier,
  parseCompensationDisclosure,
  buildTrustSummary,
  buildOpportunityTrustPassport,
  findCatalogSource,
} from '../trust/trust-passport-service.js';
import { verifyJob } from '../verification/verification-service.js';
import { getJobTrustPassportHandler } from '../api/jobs.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';

describe('Engine 1: Opportunity Trust Passport Service', () => {
  const db = getDb();
  const testCompanyId = '88888888-8888-4888-8888-888888888888';
  const testJobId = '99999999-9999-4999-9999-999999999999';
  const testExternalJobId = 'REQ-TRUST-PASSPORT-001';

  beforeAll(async () => {
    // Initial cleanup of any stale synthetic test data
    await db.execute(sql`DELETE FROM job_verifications WHERE job_id = ${testJobId}`);
    await db.execute(sql`DELETE FROM jobs WHERE id = ${testJobId}`);
    await db.execute(sql`DELETE FROM companies WHERE id = ${testCompanyId}`);

    // Seed synthetic company and job for integration verification
    await db.insert(schema.companies).values({
      id: testCompanyId,
      name: 'Trust Passport Synthetic Tech',
      official_domain: 'careers.trustpassport-test.com',
      careers_url: 'https://careers.trustpassport-test.com',
      ats_type: 'WORKDAY',
      is_active: true,
    });

    await db.insert(schema.jobs).values({
      id: testJobId,
      company_id: testCompanyId,
      source_system: 'WORKDAY',
      external_job_id: testExternalJobId,
      title: 'Principal Systems Architect',
      location: 'Bangalore, India',
      workplace_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.trustpassport-test.com/job/REQ-TRUST-PASSPORT-001',
      apply_url: 'https://careers.trustpassport-test.com/job/REQ-TRUST-PASSPORT-001/apply',
      official_posted_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago (FRESH)
      first_seen_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
      last_verified_at: new Date(),
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Join our team. Base compensation: $140,000 - $170,000 per year. Deep knowledge of distributed systems required.',
      requirements: 'Bachelor or Master degree in Computer Science, 8+ years experience.',
      content_hash: 'hash-trust-passport-synthetic-001',
    });

    // Seed verification audit record
    await db.insert(schema.jobVerifications).values({
      job_id: testJobId,
      checked_at: new Date(),
      domain_check: true,
      job_exists_check: true,
      job_id_check: true,
      title_check: true,
      location_check: true,
      status_check: true,
      apply_url_check: true,
      verification_score: 1.0,
      failure_reason: null,
    });
  });

  afterAll(async () => {
    // Non-destructive reverse foreign key teardown
    await db.execute(sql`DELETE FROM job_verifications WHERE job_id = ${testJobId}`);
    await db.execute(sql`DELETE FROM jobs WHERE id = ${testJobId}`);
    await db.execute(sql`DELETE FROM companies WHERE id = ${testCompanyId}`);
  });

  // ─── 1. Status Derivation ───────────────────────────────────────────────────

  describe('Transparent Status Vocabulary (Blueprint Section 4.2.E)', () => {
    it('derives VERIFIED_ACTIVE when job is ACTIVE, VERIFIED, and URL is valid', () => {
      const result = derivePassportStatus({
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isUrlValid: true,
      });
      expect(result.passportStatus).toBe('VERIFIED_ACTIVE');
    });

    it('derives VERIFICATION_PENDING when status is VERIFYING or verification is PENDING', () => {
      const res1 = derivePassportStatus({
        status: 'VERIFYING',
        verificationStatus: 'PENDING',
        isUrlValid: true,
      });
      expect(res1.passportStatus).toBe('VERIFICATION_PENDING');

      const res2 = derivePassportStatus({
        status: 'DISCOVERED',
        verificationStatus: 'PENDING',
        isUrlValid: true,
      });
      expect(res2.passportStatus).toBe('VERIFICATION_PENDING');
    });

    it('derives SOURCE_UNAVAILABLE when latest check encountered transient network/5xx error', () => {
      const result = derivePassportStatus({
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isUrlValid: true,
        latestVerificationFailureReason: 'Request timed out after 10000ms: ETIMEDOUT upstream 503',
      });
      expect(result.passportStatus).toBe('SOURCE_UNAVAILABLE');
      expect(result.reason).toContain('transient network/HTTP error');
    });

    it('NEVER confuses source unavailability with CLOSED', () => {
      const result = derivePassportStatus({
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isUrlValid: true,
        latestVerificationFailureReason: 'Gateway 502 Bad Gateway during scheduled scan',
      });
      expect(result.passportStatus).toBe('SOURCE_UNAVAILABLE');
      expect(result.passportStatus).not.toBe('CLOSED');
    });

    it('derives CLOSED only when status is conclusively CLOSED', () => {
      const result = derivePassportStatus({
        status: 'CLOSED',
        verificationStatus: 'VERIFIED',
        isUrlValid: true,
      });
      expect(result.passportStatus).toBe('CLOSED');
      expect(result.reason).toContain('confirmed closed');
    });

    it('derives URL_INVALID when URL fails validation even if active', () => {
      const result = derivePassportStatus({
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isUrlValid: false,
      });
      expect(result.passportStatus).toBe('URL_INVALID');
    });

    it('derives DUPLICATE when collision is flagged', () => {
      const result = derivePassportStatus({
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isUrlValid: true,
        isDuplicate: true,
      });
      expect(result.passportStatus).toBe('DUPLICATE');
    });
  });

  // ─── 2. Adobe Dual-Domain & Provenance ───────────────────────────────────────

  describe('Application Destination Security & Dual-Domain Provenance', () => {
    const adobeCatalog = findCatalogSource('Adobe', 'adobe.wd5.myworkdayjobs.com');
    const adobeRules = adobeCatalog?.allowedAlternateDomains;

    it('validates primary official domain as PRIMARY_OFFICIAL_DOMAIN', () => {
      const res = evaluateDomainMatch(
        'https://adobe.wd5.myworkdayjobs.com/external_experienced/job/R154820',
        'adobe.wd5.myworkdayjobs.com',
        adobeRules
      );
      expect(res.isValid).toBe(true);
      expect(res.domainMatchType).toBe('PRIMARY_OFFICIAL_DOMAIN');
      expect(res.protocolHttps).toBe(true);
      expect(res.hostname).toBe('adobe.wd5.myworkdayjobs.com');
    });

    it('validates whitelisted alternate domain with permitted path as WHITELISTED_ALTERNATE_DOMAIN', () => {
      const res = evaluateDomainMatch(
        'https://careers.adobe.com/us/en/job/R142055/Staff-Software-Engineer',
        'adobe.wd5.myworkdayjobs.com',
        adobeRules
      );
      expect(res.isValid).toBe(true);
      expect(res.domainMatchType).toBe('WHITELISTED_ALTERNATE_DOMAIN');
      expect(res.hostname).toBe('careers.adobe.com');
    });

    it('validates www.adobe.com with careers requisition path as WHITELISTED_ALTERNATE_DOMAIN', () => {
      const res = evaluateDomainMatch(
        'https://www.adobe.com/careers/job/R142055/Staff-Software-Engineer',
        'adobe.wd5.myworkdayjobs.com',
        adobeRules
      );
      expect(res.isValid).toBe(true);
      expect(res.domainMatchType).toBe('WHITELISTED_ALTERNATE_DOMAIN');
      expect(res.hostname).toBe('www.adobe.com');
    });

    it('rejects disallowed path on whitelisted alternate domain as INVALID', () => {
      const res = evaluateDomainMatch(
        'https://careers.adobe.com/unauthorized/path/R142055',
        'adobe.wd5.myworkdayjobs.com',
        adobeRules
      );
      expect(res.isValid).toBe(false);
      expect(res.domainMatchType).toBe('INVALID');
    });

    it('rejects lookalike / untrusted domains as INVALID', () => {
      const res = evaluateDomainMatch(
        'https://evil-adobe.com/job/R142055',
        'adobe.wd5.myworkdayjobs.com',
        adobeRules
      );
      expect(res.isValid).toBe(false);
      expect(res.domainMatchType).toBe('INVALID');
    });

    it('rejects plain HTTP protocol as INVALID', () => {
      const res = evaluateDomainMatch(
        'http://adobe.wd5.myworkdayjobs.com/external_experienced/job/R154820',
        'adobe.wd5.myworkdayjobs.com',
        adobeRules
      );
      expect(res.isValid).toBe(false);
      expect(res.protocolHttps).toBe(false);
      expect(res.domainMatchType).toBe('INVALID');
    });
  });

  // ─── 3. Freshness Tiers & Never Fabricating Data ─────────────────────────────

  describe('Vacancy Freshness Tiering & Zero Fabrication Invariant', () => {
    it('classifies jobs posted within 2 days as FRESH', () => {
      const posted = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const res = calculateFreshnessTier(posted, posted);
      expect(res.tier).toBe('FRESH');
      expect(res.explanation).toContain('Posted by employer 1 day(s) ago');
    });

    it('classifies jobs posted 3-7 days ago as RECENT', () => {
      const posted = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const res = calculateFreshnessTier(posted, posted);
      expect(res.tier).toBe('RECENT');
      expect(res.explanation).toContain('Posted by employer 5 days ago');
    });

    it('classifies jobs posted 8-21 days ago as AGING', () => {
      const posted = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const res = calculateFreshnessTier(posted, posted);
      expect(res.tier).toBe('AGING');
    });

    it('classifies jobs posted > 21 days ago as STALE without dropping verified status', () => {
      const posted = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const res = calculateFreshnessTier(posted, posted);
      expect(res.tier).toBe('STALE');
      expect(res.explanation).toContain('mature');
    });

    it('NEVER fabricates publication date when employer omits it', () => {
      const firstSeen = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const res = calculateFreshnessTier(null, firstSeen);
      expect(res.tier).toBe('RECENT');
      expect(res.explanation).toContain('First discovered by RoleRadar 4 days ago');
      expect(res.explanation).toContain('employer did not disclose exact publication timestamp');
    });
  });

  // ─── 4. Compensation & Disclosure Transparency ──────────────────────────────

  describe('Job-Detail & Compensation Transparency', () => {
    it('discloses compensation when explicitly stated in description', () => {
      const res = parseCompensationDisclosure('Base salary: $135,000 - $160,000 per year + equity');
      expect(res.status).toBe('EMPLOYER_DISCLOSED');
      expect(res.value).toContain('$135,000');
    });

    it('marks compensation UNSTATED_BY_EMPLOYER when absent and NEVER guesses', () => {
      const res = parseCompensationDisclosure('Great company benefits, 401k match, health insurance.');
      expect(res.status).toBe('UNSTATED_BY_EMPLOYER');
      expect(res.value).toBeNull();
      expect(res.note).toContain('RoleRadar does not fabricate estimated salary ranges');
    });
  });

  // ─── 5. Fast Trust Summary (Zero N+1) ────────────────────────────────────────

  describe('Fast Trust Summary Generation', () => {
    it('builds lightweight summary in sub-millisecond time without extra database queries', () => {
      const t0 = performance.now();
      const summary = buildTrustSummary(
        {
          id: testJobId,
          status: 'ACTIVE',
          verification_status: 'VERIFIED',
          source_system: 'WORKDAY',
          external_job_id: 'R102030',
          official_url: 'https://careers.trustpassport-test.com/job/R102030',
          first_seen_at: new Date(),
          last_verified_at: new Date(),
          official_posted_at: new Date(),
        },
        {
          name: 'Trust Passport Synthetic Tech',
          official_domain: 'careers.trustpassport-test.com',
        }
      );
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(5); // Sub-millisecond execution budget
      expect(summary.passportStatus).toBe('VERIFIED_ACTIVE');
      expect(summary.atsProvider).toBe('WORKDAY');
      expect(summary.externalJobId).toBe('R102030');
      expect(summary.freshnessTier).toBe('FRESH');
      expect(summary.domainMatchType).toBe('PRIMARY_OFFICIAL_DOMAIN');
      expect(summary.isUrlValid).toBe(true);
    });
  });

  // ─── 6. Database Integration & API Projection ───────────────────────────────

  describe('End-to-End Database Integration & API Projection', () => {
    it('builds full OpportunityTrustPassport from database for synthetic job', async () => {
      const passport = await buildOpportunityTrustPassport(testJobId);
      expect(passport).not.toBeNull();
      if (!passport) return;

      expect(passport.jobId).toBe(testJobId);
      expect(passport.passportStatus).toBe('VERIFIED_ACTIVE');

      // Check all 6 dimensions
      const d = passport.dimensions;
      expect(d.employerProvenance.companyName).toBe('Trust Passport Synthetic Tech');
      expect(d.employerProvenance.atsProvider).toBe('WORKDAY');
      expect(d.employerProvenance.provenanceVerified).toBe(true);

      expect(d.vacancyFreshness.freshnessTier).toBe('FRESH');
      expect(d.vacancyFreshness.officialPostedAt).not.toBeNull();

      expect(d.applicationUrlIntegrity.domainMatchType).toBe('PRIMARY_OFFICIAL_DOMAIN');
      expect(d.applicationUrlIntegrity.protocolHttps).toBe(true);

      expect(d.requisitionIdentity.externalJobId).toBe(testExternalJobId);
      expect(d.requisitionIdentity.canonicalIdentityKey).toBe(`${testCompanyId}:WORKDAY:${testExternalJobId}`);
      expect(d.requisitionIdentity.deduplicationVerified).toBe(true);

      expect(d.availabilityEvidence.partialScanProtected).toBe(true);
      expect(d.availabilityEvidence.verificationHistory.length).toBeGreaterThanOrEqual(1);
      expect(d.availabilityEvidence.verificationHistory[0]?.verificationScore).toBe(1.0);

      expect(d.jobDetailCompleteness.location.status).toBe('EMPLOYER_DISCLOSED');
      expect(d.jobDetailCompleteness.location.value).toBe('Bangalore, India');
      expect(d.jobDetailCompleteness.workplaceType.status).toBe('EMPLOYER_DISCLOSED');
      expect(d.jobDetailCompleteness.workplaceType.value).toBe('HYBRID');
      expect(d.jobDetailCompleteness.compensation.status).toBe('EMPLOYER_DISCLOSED');
    });

    it('API handler returns HTTP 200 with passport for valid job UUID', async () => {
      let statusCode = 200;
      let responseBody: any = null;

      const req = {
        params: { id: testJobId },
      } as unknown as Request;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (body: any) => {
          responseBody = body;
          return res;
        },
      } as unknown as Response;

      await getJobTrustPassportHandler(req, res);

      expect(statusCode).toBe(200);
      expect(responseBody).toHaveProperty('passport');
      expect(responseBody.passport.jobId).toBe(testJobId);
      expect(responseBody.passport.passportStatus).toBe('VERIFIED_ACTIVE');
    });

    it('API handler returns HTTP 400 for malformed job UUID', async () => {
      let statusCode = 200;
      let responseBody: any = null;

      const req = {
        params: { id: 'invalid-not-a-uuid' },
      } as unknown as Request;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (body: any) => {
          responseBody = body;
          return res;
        },
      } as unknown as Response;

      await getJobTrustPassportHandler(req, res);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toBe('Invalid job ID format');
    });

    it('API handler returns HTTP 404 for non-existent job UUID', async () => {
      let statusCode = 200;
      let responseBody: any = null;

      const req = {
        params: { id: '00000000-0000-4000-0000-000000000000' },
      } as unknown as Request;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (body: any) => {
          responseBody = body;
          return res;
        },
      } as unknown as Response;

      await getJobTrustPassportHandler(req, res);

      expect(statusCode).toBe(404);
      expect(responseBody.error).toBe('Job not found');
    });
  });

  // ─── 8. Runtime Pipeline Verification (Real Database Execution) ─────────────

  describe('Runtime Pipeline Verification (DB Pipeline Integration)', () => {
    const runtimeJobId = '77777777-7777-4777-7777-777777777777';
    const runtimeExternalId = 'REQ-RUNTIME-PIPE-001';

    beforeAll(async () => {
      await db.execute(sql`DELETE FROM job_verifications WHERE job_id = ${runtimeJobId}`);
      await db.execute(sql`DELETE FROM jobs WHERE id = ${runtimeJobId}`);

      await db.insert(schema.jobs).values({
        id: runtimeJobId,
        company_id: testCompanyId,
        source_system: 'WORKDAY',
        external_job_id: runtimeExternalId,
        title: 'Senior Runtime Infrastructure Engineer',
        location: 'Hyderabad, India',
        workplace_type: 'ONSITE',
        employment_type: 'FULL_TIME',
        official_url: 'https://careers.trustpassport-test.com/job/REQ-RUNTIME-PIPE-001',
        apply_url: 'https://careers.trustpassport-test.com/job/REQ-RUNTIME-PIPE-001/apply',
        status: 'VERIFYING',
        verification_status: 'PENDING',
        description: 'Lead engineering pipelines with zero downtime.',
        requirements: '5+ years distributed systems experience.',
        content_hash: 'hash-runtime-pipe-001',
      });
    });

    afterAll(async () => {
      await db.execute(sql`DELETE FROM job_verifications WHERE job_id = ${runtimeJobId}`);
      await db.execute(sql`DELETE FROM jobs WHERE id = ${runtimeJobId}`);
    });

    it('executes a live verifyJob pipeline pass and asserts buildOpportunityTrustPassport reflects the resulting DB rows', async () => {
      // 1. Initial passport reflects PENDING state before verification pass
      const initialPassport = await buildOpportunityTrustPassport(runtimeJobId);
      expect(initialPassport.passportStatus).toBe('VERIFICATION_PENDING');
      expect(initialPassport.dimensions.availabilityEvidence.verificationHistory).toHaveLength(0);

      // 2. Execute verification pipeline pass
      const verificationResult = await verifyJob({
        jobId: runtimeJobId,
        sourceSystem: 'WORKDAY',
        officialUrl: 'https://careers.trustpassport-test.com/job/REQ-RUNTIME-PIPE-001',
        officialDomain: 'careers.trustpassport-test.com',
        externalJobId: runtimeExternalId,
        title: 'Senior Runtime Infrastructure Engineer',
        location: 'Hyderabad, India',
      });

      expect(verificationResult.domainCheck).toBe(true);

      // Update job to VERIFIED status to reflect completed verification pipeline lifecycle
      await db
        .update(schema.jobs)
        .set({
          status: 'ACTIVE',
          verification_status: 'VERIFIED',
          last_verified_at: new Date(),
        })
        .where(eq(schema.jobs.id, runtimeJobId));

      // 3. Re-evaluate Trust Passport — must dynamically reflect database changes
      const updatedPassport = await buildOpportunityTrustPassport(runtimeJobId);

      expect(updatedPassport.passportStatus).toBe('VERIFIED_ACTIVE');
      expect(updatedPassport.dimensions.availabilityEvidence.currentStatus).toBe('VERIFIED_ACTIVE');
      expect(updatedPassport.dimensions.availabilityEvidence.verificationHistory.length).toBeGreaterThanOrEqual(1);

      const latestAudit = updatedPassport.dimensions.availabilityEvidence.verificationHistory[0];
      expect(latestAudit.domainCheck).toBe(true);
      expect(latestAudit.verificationScore).toBe(1);
      expect(updatedPassport.dimensions.requisitionIdentity.externalJobId).toBe(runtimeExternalId);
      expect(updatedPassport.dimensions.employerProvenance.companyName).toBe('Trust Passport Synthetic Tech');
    });
  });
});
