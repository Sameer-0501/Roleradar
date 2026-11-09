/**
 * Engine 2: Proof-Based Job Fit & Candidate Intelligence Test Suite.
 *
 * Implements Blueprint Section 5 ("Engine 2 — Proof-Based Job Fit") and
 * docs/ENGINEERING_STANDARDS.md.
 *
 * Asserts:
 * 1. Requirement Atomization & Separation (Mandatory vs Preferred vs Responsibilities vs Conditions).
 * 2. Exact 6-State Evaluation Vocabulary (SUPPORTED, PARTIALLY_SUPPORTED, NOT_SUPPORTED, UNKNOWN, HARD_ELIGIBILITY_CONCERN, NOT_APPLICABLE).
 * 3. Representative Candidate Profiles:
 *    - Indian Fresher applying to Fresher-compatible role vs 3+ year role.
 *    - Experienced profile with evidence traceable to projects and work history.
 *    - Location/Boundary mismatch (Onsite foreign job for candidate in India).
 * 4. Missing Profile Data Handling (UNKNOWN state and action prompts — NEVER false rejection).
 * 5. Candidate Agency & Controls (POST /api/jobs/:id/proof-fit/controls persists disputes/clarifications).
 * 6. Strict User Isolation & Idempotency.
 * 7. Non-destructive synthetic teardown.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  extractJobRequirements,
  evaluateProofBasedJobFit,
  getProofBasedJobFit,
  updateProofFitControls,
} from '../matching/proof-based-fit-service.js';
import {
  getJobProofFitHandler,
  updateJobProofFitControlsHandler,
} from '../api/jobs.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';

describe('Engine 2: Proof-Based Job Fit Service & API', () => {
  const db = getDb();

  // Synthetic Test UUIDs
  const companyId = '71111111-1111-4111-8111-111111111111';
  const fresherJobId = '72222222-2222-4222-8222-222222222222';
  const seniorJobId = '73333333-3333-4333-8333-333333333333';
  const foreignJobId = '74444444-4444-4444-8444-444444444444';

  const userFresherId = '75555555-5555-4555-8555-555555555555';
  const userExperiencedId = '76666666-6666-4666-8666-666666666666';
  const userEmptyId = '77777777-8888-4888-8888-888888888888';

  beforeAll(async () => {
    // 1. Initial cleanup of synthetic test records
    await cleanupTestData();

    // 2. Seed Synthetic Company
    await db.insert(schema.companies).values({
      id: companyId,
      name: 'Proof Fit Synthetic Systems',
      official_domain: 'careers.prooffit-test.com',
      careers_url: 'https://careers.prooffit-test.com',
      ats_type: 'WORKDAY',
      is_active: true,
    });

    // 3. Seed Jobs
    // Job A: Fresher-compatible domestic software engineer
    await db.insert(schema.jobs).values({
      id: fresherJobId,
      company_id: companyId,
      source_system: 'WORKDAY',
      external_job_id: 'REQ-FIT-FRESHER-01',
      title: 'Junior Software Engineer (Fresher / Entry-Level)',
      location: 'Bangalore, India',
      workplace_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.prooffit-test.com/job/REQ-FIT-FRESHER-01',
      apply_url: 'https://careers.prooffit-test.com/job/REQ-FIT-FRESHER-01/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Join our backend development team. Base compensation: ₹6,00,000 - ₹9,00,000 per year. Build scalable REST APIs in TypeScript and Node.js.',
      requirements: 'Qualifications: Bachelor degree in Computer Science or related field. Basic knowledge of TypeScript, Node.js, and PostgreSQL. Preferred: Experience with React or Next.js is a plus.',
      content_hash: 'hash-fresher-job-01',
    });

    // Job B: Senior 5+ year role
    await db.insert(schema.jobs).values({
      id: seniorJobId,
      company_id: companyId,
      source_system: 'WORKDAY',
      external_job_id: 'REQ-FIT-SENIOR-01',
      title: 'Lead Distributed Systems Architect',
      location: 'Hyderabad, India',
      workplace_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.prooffit-test.com/job/REQ-FIT-SENIOR-01',
      apply_url: 'https://careers.prooffit-test.com/job/REQ-FIT-SENIOR-01/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Architect mission-critical cloud backends. Requires 5+ years of experience in distributed systems. Lead engineering teams and design Kubernetes infrastructure.',
      requirements: 'Qualifications: 5+ years experience building distributed backends. Expertise in Go, Kubernetes, and Docker. Master degree in Computer Science preferred.',
      content_hash: 'hash-senior-job-01',
    });

    // Job C: Onsite Foreign US Role
    await db.insert(schema.jobs).values({
      id: foreignJobId,
      company_id: companyId,
      source_system: 'WORKDAY',
      external_job_id: 'REQ-FIT-FOREIGN-01',
      title: 'Onsite Systems Engineer',
      location: 'San Francisco, CA, United States',
      workplace_type: 'ONSITE',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.prooffit-test.com/job/REQ-FIT-FOREIGN-01',
      apply_url: 'https://careers.prooffit-test.com/job/REQ-FIT-FOREIGN-01/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Physical lab infrastructure engineer in San Francisco.',
      requirements: 'Must work onsite in San Francisco. 2+ years experience with Linux systems.',
      content_hash: 'hash-foreign-job-01',
    });

    // 4. Seed Synthetic Users
    // User 1: Indian Fresher
    await db.insert(schema.users).values({
      id: userFresherId,
      email: 'fresher.candidate@prooffit.test',
      password_hash: 'hash',
      is_active: true,
      email_verified: true,
    });

    await db.insert(schema.candidateProfiles).values({
      user_id: userFresherId,
      full_name: 'Aarav Sharma',
      headline: 'Aspiring Full Stack Engineer | B.Tech CS 2026',
      experience_level: 'FRESHER',
      total_experience_months: 0,
      completeness_score: 80,
    });

    await db.insert(schema.userPreferences).values({
      user_id: userFresherId,
      locations: ['Bangalore', 'Hyderabad', 'India'],
      workplace_types: ['HYBRID', 'REMOTE'],
      experience_level: 'FRESHER',
      roles: ['Software Engineer', 'Backend Developer'],
    });

    await db.insert(schema.candidateEducations).values({
      user_id: userFresherId,
      institution: 'Indian Institute of Technology',
      degree: 'B.Tech',
      field_of_study: 'Computer Science and Engineering',
      start_year: 2022,
      end_year: 2026,
    });

    await db.insert(schema.candidateSkills).values([
      { user_id: userFresherId, skill_name: 'TypeScript', canonical_name: 'TypeScript' },
      { user_id: userFresherId, skill_name: 'Node.js', canonical_name: 'Node.js' },
      { user_id: userFresherId, skill_name: 'PostgreSQL', canonical_name: 'PostgreSQL' },
    ]);

    await db.insert(schema.candidateProjects).values({
      user_id: userFresherId,
      title: 'E-Commerce Microservices Engine',
      description: 'Engineered high-concurrency order processing service using TypeScript and Node.js.',
      technologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
    });

    // User 2: Experienced Senior Engineer (6 years)
    await db.insert(schema.users).values({
      id: userExperiencedId,
      email: 'senior.engineer@prooffit.test',
      password_hash: 'hash',
      is_active: true,
      email_verified: true,
    });

    await db.insert(schema.candidateProfiles).values({
      user_id: userExperiencedId,
      full_name: 'Priya Patel',
      headline: 'Senior Cloud Backend Architect | 6 YOE',
      experience_level: 'EXPERIENCED',
      total_experience_months: 72,
      completeness_score: 95,
    });

    await db.insert(schema.userPreferences).values({
      user_id: userExperiencedId,
      locations: ['Hyderabad', 'Bangalore', 'India'],
      workplace_types: ['HYBRID', 'REMOTE'],
      experience_level: 'EXPERIENCED',
      roles: ['Lead Architect', 'Staff Engineer'],
    });

    await db.insert(schema.candidateEducations).values({
      user_id: userExperiencedId,
      institution: 'National Institute of Technology',
      degree: 'Master of Technology',
      field_of_study: 'Computer Science',
      start_year: 2018,
      end_year: 2020,
    });

    await db.insert(schema.candidateSkills).values([
      { user_id: userExperiencedId, skill_name: 'Go', canonical_name: 'Go' },
      { user_id: userExperiencedId, skill_name: 'Kubernetes', canonical_name: 'Kubernetes' },
      { user_id: userExperiencedId, skill_name: 'Docker', canonical_name: 'Docker' },
    ]);

    await db.insert(schema.candidateExperiences).values({
      user_id: userExperiencedId,
      company_name: 'Distributed Cloud Labs',
      title: 'Senior Systems Engineer',
      description: 'Architected distributed backend pipelines using Go, Kubernetes, and Docker.',
      startDate: new Date('2020-01-01'),
      isCurrent: true,
    });

    // User 3: Empty Candidate Profile (for testing UNKNOWN and non-rejection)
    await db.insert(schema.users).values({
      id: userEmptyId,
      email: 'empty.candidate@prooffit.test',
      password_hash: 'hash',
      is_active: true,
      email_verified: true,
    });

    await db.insert(schema.candidateProfiles).values({
      user_id: userEmptyId,
      full_name: 'New Candidate',
      experience_level: 'FRESHER',
      total_experience_months: 0,
      completeness_score: 0,
    });
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  async function cleanupTestData() {
    const userIds = [userFresherId, userExperiencedId, userEmptyId];
    const jobIds = [fresherJobId, seniorJobId, foreignJobId];

    for (const jId of jobIds) {
      await db.execute(sql`DELETE FROM user_job_interactions WHERE job_id = ${jId}`);
      await db.execute(sql`DELETE FROM jobs WHERE id = ${jId}`);
    }

    for (const uId of userIds) {
      await db.execute(sql`DELETE FROM candidate_projects WHERE user_id = ${uId}`);
      await db.execute(sql`DELETE FROM candidate_skills WHERE user_id = ${uId}`);
      await db.execute(sql`DELETE FROM candidate_educations WHERE user_id = ${uId}`);
      await db.execute(sql`DELETE FROM candidate_experiences WHERE user_id = ${uId}`);
      await db.execute(sql`DELETE FROM candidate_profiles WHERE user_id = ${uId}`);
      await db.execute(sql`DELETE FROM user_preferences WHERE user_id = ${uId}`);
      await db.execute(sql`DELETE FROM users WHERE id = ${uId}`);
    }

    await db.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
  }

  // ─── 1. Requirement Atomization & Separation ────────────────────────────────

  describe('Requirement Extraction & Structure (Blueprint Section 5.2)', () => {
    it('separates mandatory skills, preferred skills, experience, education, and conditions', () => {
      const extracted = extractJobRequirements({
        title: 'Senior Full Stack Engineer',
        description: 'Build user-facing web platforms.\nResponsibilities:\n- Design scalable React apps\n- Build high throughput Node.js APIs\nQualifications:\n- 4+ years of experience\n- Bachelor in Computer Science\n- Required: React, Node.js, and TypeScript\nPreferred Qualifications:\n- Knowledge of Docker and AWS is a plus',
        location: 'Bangalore, India',
        workplaceType: 'HYBRID',
      });

      expect(extracted.mandatorySkills).toContain('React');
      expect(extracted.mandatorySkills).toContain('Node.js');
      expect(extracted.mandatorySkills).toContain('TypeScript');

      expect(extracted.preferredSkills).toContain('Docker');
      expect(extracted.preferredSkills).toContain('Amazon Web Services');

      expect(extracted.minYearsExperience).toBe(4);
      expect(extracted.requiredEducation?.degreeLevel).toBe('BACHELOR');
      expect(extracted.employmentConditions.workLocation).toBe('Bangalore, India');
      expect(extracted.employmentConditions.workplaceMode).toBe('HYBRID');
      expect(extracted.responsibilities.length).toBeGreaterThan(0);
    });

    it('extracts disclosed compensation vs unstated salary accurately', () => {
      const withSalary = extractJobRequirements({
        title: 'Software Developer',
        description: 'Compensation: $120,000 - $140,000 per year. Must know Python.',
      });
      expect(withSalary.employmentConditions.disclosedSalary.status).toBe('EMPLOYER_DISCLOSED');

      const withoutSalary = extractJobRequirements({
        title: 'Software Developer',
        description: 'Great team with competitive market pay. Must know Python.',
      });
      expect(withoutSalary.employmentConditions.disclosedSalary.status).toBe('UNSTATED_BY_EMPLOYER');
    });
  });

  // ─── 2. Indian Fresher Profile Testing ──────────────────────────────────────

  describe('Indian Fresher Profile Evaluation (Blueprint Section 5.7)', () => {
    it('evaluates Fresher applying to Fresher-compatible role as ELIGIBLE with grounded evidence', async () => {
      const fit = await getProofBasedJobFit(userFresherId, fresherJobId);

      expect(fit.overallEligibilityStatus).toBe('ELIGIBLE');
      expect(fit.eligibilityBlockers).toHaveLength(0);

      // Mandatory evaluations check
      const tsEval = fit.mandatoryEvaluations.find((e) => e.extractedCriterion === 'TypeScript');
      expect(tsEval).toBeDefined();
      expect(tsEval?.assessmentState).toBe('SUPPORTED');
      expect(tsEval?.evidenceSource).toBe('PROFILE_SKILL');

      // Education evaluation check
      const eduEval = fit.mandatoryEvaluations.find((e) => e.category === 'EDUCATION');
      expect(eduEval).toBeDefined();
      expect(eduEval?.assessmentState).toBe('SUPPORTED');
      expect(eduEval?.evidenceSource).toBe('EDUCATION');

      // Location evaluation check
      const locEval = fit.mandatoryEvaluations.find((e) => e.category === 'LOCATION');
      expect(locEval).toBeDefined();
      expect(locEval?.assessmentState).toBe('SUPPORTED');

      // Preferred skill gap check (React is preferred, candidate has transferable TypeScript)
      const reactPref = fit.preferredEvaluations.find((e) => e.extractedCriterion === 'React');
      expect(reactPref).toBeDefined();
      expect(reactPref?.assessmentState).toBe('PARTIALLY_SUPPORTED'); // Adjacent via TypeScript
    });

    it('flags HARD_ELIGIBILITY_CONCERN when Fresher applies to a 5+ year Senior role', async () => {
      const fit = await getProofBasedJobFit(userFresherId, seniorJobId);

      expect(fit.overallEligibilityStatus).toBe('ELIGIBILITY_CONCERN_DETECTED');
      expect(fit.eligibilityBlockers.length).toBeGreaterThan(0);

      const expBlocker = fit.eligibilityBlockers.find((b) => b.criterion.includes('experience'));
      expect(expBlocker).toBeDefined();
      expect(expBlocker?.candidateReality).toContain('Fresher');

      const expEval = fit.mandatoryEvaluations.find((e) => e.category === 'EXPERIENCE');
      expect(expEval?.assessmentState).toBe('HARD_ELIGIBILITY_CONCERN');
    });
  });

  // ─── 3. Experienced Profile Testing ─────────────────────────────────────────

  describe('Experienced Profile Evaluation', () => {
    it('evaluates Experienced candidate applying to 5+ year role as ELIGIBLE with EXPERIENCE source', async () => {
      const fit = await getProofBasedJobFit(userExperiencedId, seniorJobId);

      expect(fit.overallEligibilityStatus).toBe('ELIGIBLE');
      expect(fit.eligibilityBlockers).toHaveLength(0);

      const expEval = fit.mandatoryEvaluations.find((e) => e.category === 'EXPERIENCE');
      expect(expEval?.assessmentState).toBe('SUPPORTED');
      expect(expEval?.evidenceSource).toBe('EXPERIENCE');

      const goEval = fit.mandatoryEvaluations.find((e) => e.extractedCriterion === 'Go');
      expect(goEval?.assessmentState).toBe('SUPPORTED');
      expect(goEval?.evidenceSource).toBe('PROFILE_SKILL');
    });
  });

  // ─── 4. International / Location Mismatch Testing ───────────────────────────

  describe('Location & Boundary Mismatch', () => {
    it('flags HARD_ELIGIBILITY_CONCERN for Onsite foreign role when candidate is in India', async () => {
      const fit = await getProofBasedJobFit(userFresherId, foreignJobId);

      expect(fit.overallEligibilityStatus).toBe('ELIGIBILITY_CONCERN_DETECTED');
      const locBlocker = fit.eligibilityBlockers.find((b) => b.criterion.includes('ONSITE'));
      expect(locBlocker).toBeDefined();
      expect(locBlocker?.reason).toContain('United States');
    });
  });

  // ─── 5. Missing Profile Data (UNKNOWN & Non-Rejection Invariant) ─────────────

  describe('Missing Profile Data & UNKNOWN States (Blueprint Section 5.3 & 5.4)', () => {
    it('marks requirements as UNKNOWN and status as NEEDS_PROFILE_COMPLETION without false rejection', async () => {
      const fit = await getProofBasedJobFit(userEmptyId, fresherJobId);

      expect(fit.overallEligibilityStatus).toBe('NEEDS_PROFILE_COMPLETION');
      expect(fit.eligibilityBlockers).toHaveLength(0);
      expect(fit.unknownItems.length).toBeGreaterThanOrEqual(1);

      // Verify that missing degree returns UNKNOWN rather than proven failure
      const eduEval = fit.mandatoryEvaluations.find((e) => e.category === 'EDUCATION');
      expect(eduEval?.assessmentState).toBe('UNKNOWN');
      expect(eduEval?.assessmentState).not.toBe('HARD_ELIGIBILITY_CONCERN');
    });
  });

  // ─── 6. Candidate Controls & Overrides (Blueprint Section 5.5) ──────────────

  describe('Candidate Controls & Deterministic Re-evaluation', () => {
    it('persists a candidate dispute for a requirement and deterministic re-evaluation reflects it', async () => {
      // 1. Initial fit has a blocker on senior job for fresher
      const initialFit = await getProofBasedJobFit(userFresherId, seniorJobId);
      const targetReq = initialFit.mandatoryEvaluations.find((e) => e.category === 'EXPERIENCE');
      expect(targetReq).toBeDefined();
      expect(targetReq?.assessmentState).toBe('HARD_ELIGIBILITY_CONCERN');

      // 2. Candidate disputes the requirement with proof note
      const updatedFit = await updateProofFitControls(userFresherId, seniorJobId, {
        disputedRequirements: [
          {
            requirementId: targetReq!.id,
            reason: 'Significant open-source distributed systems contributions',
            candidateNote: 'Created high-scale Raft consensus project with 2k GitHub stars',
          },
        ],
      });

      // 3. Re-evaluated fit reflects candidate dispute
      const updatedReq = updatedFit.mandatoryEvaluations.find((e) => e.id === targetReq!.id);
      expect(updatedReq?.isDisputed).toBe(true);
      expect(updatedReq?.disputeReason).toBe('Significant open-source distributed systems contributions');
      expect(updatedFit.candidateControlsApplied.disputesCount).toBe(1);
    });

    it('enforces strict user isolation — User B cannot see or alter User A controls', async () => {
      // User A (Fresher) has disputes on senior job
      const userAFit = await getProofBasedJobFit(userFresherId, seniorJobId);
      expect(userAFit.candidateControlsApplied.disputesCount).toBe(1);

      // User B (Experienced) evaluates same job — has 0 disputes
      const userBFit = await getProofBasedJobFit(userExperiencedId, seniorJobId);
      expect(userBFit.candidateControlsApplied.disputesCount).toBe(0);
      expect(userBFit.mandatoryEvaluations.every((e) => !e.isDisputed)).toBe(true);
    });
  });

  // ─── 7. API Handlers & HTTP Response Verification ───────────────────────────

  describe('API Handlers (GET & POST /api/jobs/:id/proof-fit)', () => {
    it('GET /api/jobs/:id/proof-fit returns HTTP 200 with fitAnalysis for authenticated user', async () => {
      let statusCode = 200;
      let body: any = null;

      const req = {
        user: { id: userFresherId },
        params: { id: fresherJobId },
      } as unknown as Request;

      const res = {
        status: (c: number) => {
          statusCode = c;
          return res;
        },
        json: (b: any) => {
          body = b;
          return res;
        },
      } as unknown as Response;

      await getJobProofFitHandler(req, res);

      expect(statusCode).toBe(200);
      expect(body).toHaveProperty('fitAnalysis');
      expect(body.fitAnalysis.jobId).toBe(fresherJobId);
      expect(body.fitAnalysis.userId).toBe(userFresherId);
      expect(body.fitAnalysis.overallEligibilityStatus).toBe('ELIGIBLE');
    });

    it('GET /api/jobs/:id/proof-fit returns HTTP 401 when unauthenticated', async () => {
      let statusCode = 200;
      let body: any = null;

      const req = {
        params: { id: fresherJobId },
      } as unknown as Request;

      const res = {
        status: (c: number) => {
          statusCode = c;
          return res;
        },
        json: (b: any) => {
          body = b;
          return res;
        },
      } as unknown as Response;

      await getJobProofFitHandler(req, res);

      expect(statusCode).toBe(401);
      expect(body.error).toBe('Authentication required');
    });

    it('GET /api/jobs/:id/proof-fit returns HTTP 400 for invalid UUID format', async () => {
      let statusCode = 200;
      let body: any = null;

      const req = {
        user: { id: userFresherId },
        params: { id: 'invalid-uuid-string' },
      } as unknown as Request;

      const res = {
        status: (c: number) => {
          statusCode = c;
          return res;
        },
        json: (b: any) => {
          body = b;
          return res;
        },
      } as unknown as Response;

      await getJobProofFitHandler(req, res);

      expect(statusCode).toBe(400);
      expect(body.error).toBe('Invalid job ID format');
    });

    it('POST /api/jobs/:id/proof-fit/controls updates controls and returns HTTP 200 with re-evaluated fit', async () => {
      let statusCode = 200;
      let body: any = null;

      const req = {
        user: { id: userFresherId },
        params: { id: fresherJobId },
        body: {
          suppliedClarifications: [
            {
              requirementId: 'req-skill-m-1',
              clarification: 'Verified production experience',
              value: 'TypeScript',
            },
          ],
        },
      } as unknown as Request;

      const res = {
        status: (c: number) => {
          statusCode = c;
          return res;
        },
        json: (b: any) => {
          body = b;
          return res;
        },
      } as unknown as Response;

      await updateJobProofFitControlsHandler(req, res);

      expect(statusCode).toBe(200);
      expect(body.message).toBe('Fit controls updated successfully');
      expect(body.fitAnalysis).toBeDefined();
      expect(body.fitAnalysis.candidateControlsApplied.clarificationsCount).toBe(1);
    });
  });
});
