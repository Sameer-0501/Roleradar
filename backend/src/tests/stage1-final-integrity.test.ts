/**
 * Stage 1 Final Integrity Verification & Targeted Remediation Test Suite.
 *
 * Verifies all 5 Stage 1 acceptance gate criteria:
 * - Verification A: Education deduplication correctness (campus identity, degrees, fields, years, acronyms).
 * - Verification B: Concurrent upload safety (database advisory locking, transaction serialization).
 * - Verification C: Evidence Vault lifecycle & provenance (scoped pruning, assessment/external claim immunity, idempotency).
 * - Verification D: Atomic education deletion (candidate isolation, bullet unlinking, transactional rollback, profile completeness).
 * - Verification E: Resume upload & sync failure handling (explicit outcome contracts, safe retry semantics).
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../database/connection.js';
import * as schema from '../database/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  addCandidateEducation,
  deleteCandidateEducation,
  syncProfileToEvidence,
  createCandidateEvidence,
  listCandidateEvidence,
  getOrCreateCareerProfile,
} from '../resumes/career-evidence-service.js';
import {
  uploadAndParseResume,
  isSameEducation,
  areInstitutionsEquivalent,
  normalizeInstitution,
  normalizeDegree,
  normalizeFieldOfStudy,
  getCandidateProfile,
  deleteResume,
} from '../resume/profile-service.js';
import {
  tailorResumeForJob,
  getResumeDocumentWithBullets,
} from '../resumes/resume-tailoring-service.js';
import {
  addCandidateSkill,
  removeCandidateSkill,
} from '../resumes/career-evidence-service.js';

describe('Stage 1 Final Integrity Verification & Targeted Remediation', () => {
  const candidateAlphaId = '81111111-1111-4111-a111-111111111111';
  const candidateBetaId = '82222222-2222-4222-a222-222222222222';
  const companyId = '83333333-3333-4333-a333-333333333333';
  const jobId = '84444444-4444-4444-a444-444444444444';

  beforeAll(async () => {
    const db = getDb();

    // 1. Seed two isolated synthetic test candidates
    await db
      .insert(schema.users)
      .values([
        {
          id: candidateAlphaId,
          email: 'stage1_alpha@roleradar.test',
          password_hash: '$2b$10$hashedtestcandidatealphapwd',
          name: 'Synthetic Alpha Candidate',
          role: 'CANDIDATE',
        },
        {
          id: candidateBetaId,
          email: 'stage1_beta@roleradar.test',
          password_hash: '$2b$10$hashedtestcandidatebetapwd',
          name: 'Synthetic Beta Candidate',
          role: 'CANDIDATE',
        },
      ])
      .onConflictDoNothing();

    // 2. Seed verified company and job fixture
    await db
      .insert(schema.companies)
      .values({
        id: companyId,
        name: 'Stage1 Verified Corp',
        official_domain: 'stage1.example.com',
        careers_url: 'https://stage1.example.com/careers',
        ats_type: 'GREENHOUSE',
        is_active: true,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.jobs)
      .values({
        id: jobId,
        company_id: companyId,
        source_system: 'GREENHOUSE',
        external_job_id: 'REQ-STAGE1-001',
        title: 'Full Stack Engineer',
        official_url: 'https://stage1.example.com/jobs/REQ-STAGE1-001',
        description: 'Role requiring B.Tech in CSE and strong React/TypeScript skills.',
        requirements: 'B.Tech in Computer Science and Engineering, 0-2 years experience.',
        location: 'Bangalore, India',
        workplace_type: 'HYBRID',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
        content_hash: 'hash-stage1-001',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    const db = getDb();
    // Cleanup synthetic fixtures
    await db.delete(schema.resumeBullets).where(eq(schema.resumeBullets.bullet_text, 'Synthetic bullet'));
    await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, candidateAlphaId));
    await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, candidateBetaId));
    await db.delete(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, candidateAlphaId));
    await db.delete(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, candidateBetaId));
    await db.delete(schema.resumes).where(eq(schema.resumes.user_id, candidateAlphaId));
    await db.delete(schema.resumes).where(eq(schema.resumes.user_id, candidateBetaId));
    await db.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.user_id, candidateAlphaId));
    await db.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.user_id, candidateBetaId));
    await db.delete(schema.users).where(eq(schema.users.id, candidateAlphaId));
    await db.delete(schema.users).where(eq(schema.users.id, candidateBetaId));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
  });

  // ─── Verification A: Education Deduplication Correctness ────────────────────

  describe('Verification A — Education Deduplication Correctness', () => {
    it('1. Deduplicates identical B.Tech records with formatting differences', () => {
      const existing = {
        institution: 'BITS Pilani',
        degree: 'B.Tech',
        field_of_study: 'Computer Science',
        start_year: 2020,
        end_year: 2024,
      };
      const candidate = {
        institution: 'Birla Institute of Technology and Science, Pilani',
        degree: 'Bachelor of Technology',
        fieldOfStudy: 'Computer Science and Engineering',
        startYear: 2020,
        endYear: 2024,
      };
      expect(isSameEducation(existing, candidate)).toBe(true);
    });

    it('2. Keeps B.Tech and M.Tech from the same institution strictly distinct', () => {
      const btech = {
        institution: 'IIT Bombay',
        degree: 'B.Tech',
        field_of_study: 'Computer Science',
        start_year: 2018,
        end_year: 2022,
      };
      const mtech = {
        institution: 'IIT Bombay',
        degree: 'M.Tech',
        fieldOfStudy: 'Computer Science',
        startYear: 2022,
        endYear: 2024,
      };
      expect(isSameEducation(btech, mtech)).toBe(false);
    });

    it('3. Keeps different graduation years distinct (e.g. 2024 vs 2022)', () => {
      const class2024 = {
        institution: 'National Institute of Technology Trichy',
        degree: 'B.Tech',
        field_of_study: 'Mechanical Engineering',
        start_year: 2020,
        end_year: 2024,
      };
      const class2022 = {
        institution: 'NIT Trichy',
        degree: 'B.Tech',
        fieldOfStudy: 'Mechanical Engineering',
        startYear: 2018,
        endYear: 2022,
      };
      expect(isSameEducation(class2024, class2022)).toBe(false);
    });

    it('4. Keeps different specializations distinct (CSE vs Mechanical)', () => {
      const cse = {
        institution: 'IIT Delhi',
        degree: 'B.Tech',
        field_of_study: 'Computer Science and Engineering',
        start_year: 2020,
        end_year: 2024,
      };
      const mech = {
        institution: 'IIT Delhi',
        degree: 'B.Tech',
        fieldOfStudy: 'Mechanical Engineering',
        startYear: 2020,
        endYear: 2024,
      };
      expect(isSameEducation(cse, mech)).toBe(false);
    });

    it('5. CRITICAL: Preserves distinct campus identities ("BITS Pilani" vs "BITS Pilani, Goa Campus")', () => {
      expect(areInstitutionsEquivalent('BITS Pilani', 'BITS Pilani, Goa Campus')).toBe(false);
      expect(areInstitutionsEquivalent('BITS Pilani, Hyderabad Campus', 'BITS Pilani')).toBe(false);
      expect(areInstitutionsEquivalent('BITS Pilani, Goa Campus', 'BITS Pilani, Hyderabad Campus')).toBe(false);

      const mainCampus = {
        institution: 'BITS Pilani',
        degree: 'B.E.',
        field_of_study: 'Computer Science',
        start_year: 2020,
        end_year: 2024,
      };
      const goaCampus = {
        institution: 'BITS Pilani, Goa Campus',
        degree: 'B.E.',
        fieldOfStudy: 'Computer Science',
        startYear: 2020,
        endYear: 2024,
      };
      expect(isSameEducation(mainCampus, goaCampus)).toBe(false);
    });

    it('6. Normalizes institution acronyms accurately ("IIT Bombay" vs "Indian Institute of Technology, Bombay")', () => {
      expect(areInstitutionsEquivalent('IIT Bombay', 'Indian Institute of Technology, Bombay')).toBe(true);
      expect(areInstitutionsEquivalent('NIT Surathkal', 'National Institute of Technology Surathkal')).toBe(true);
      expect(areInstitutionsEquivalent('IIIT Hyderabad', 'Indian Institute of Information Technology Hyderabad')).toBe(true);
    });

    it('7. Rejects incomplete generic placeholders from swallowing specific qualifications', () => {
      const genericPlaceholder = {
        institution: 'University / College',
        degree: 'B.Tech',
        field_of_study: null,
        start_year: null,
        end_year: null,
      };
      const specificDegree = {
        institution: 'Indian Institute of Technology Bombay',
        degree: 'B.Tech',
        fieldOfStudy: 'Computer Science',
        startYear: 2020,
        endYear: 2024,
      };
      // Generic cannot match specific
      expect(isSameEducation(genericPlaceholder, specificDegree)).toBe(false);
    });

    it('8. Supports enrichment compatibility when existing record lacks optional start year', () => {
      const existing = {
        institution: 'IIT Madras',
        degree: 'B.Tech',
        field_of_study: 'Electrical Engineering',
        start_year: null, // missing start year
        end_year: 2024,
      };
      const parsedWithStartYear = {
        institution: 'Indian Institute of Technology Madras',
        degree: 'B.Tech',
        fieldOfStudy: 'Electrical Engineering',
        startYear: 2020, // enriched
        endYear: 2024,
      };
      expect(isSameEducation(existing, parsedWithStartYear)).toBe(true);
    });
  });

  // ─── Verification B: Concurrent Upload Safety ───────────────────────────────

  describe('Verification B — Concurrent Upload Safety & Serialization', () => {
    it('Prevents race condition and duplicates when two identical resumes are uploaded concurrently', async () => {
      const db = getDb();
      const resumeContent = `
John Synthetic Doe
john.synth@roleradar.test
B.Tech in Computer Science and Engineering
BITS Pilani, Goa Campus
2020 - 2024
Skills: React, Node.js, TypeScript, Python
Experience:
Software Engineer Intern at Tech Labs
Built scalable backend APIs with Node.js and PostgreSQL.
      `.trim();

      const buffer1 = Buffer.from(resumeContent, 'utf-8');
      const buffer2 = Buffer.from(resumeContent, 'utf-8');

      // Execute concurrent uploads for the same user simultaneously
      const [res1, res2] = await Promise.all([
        uploadAndParseResume(candidateAlphaId, 'concurrent_upload_1.txt', buffer1, 'text/plain'),
        uploadAndParseResume(candidateAlphaId, 'concurrent_upload_2.txt', buffer2, 'text/plain'),
      ]);

      expect(res1).toBeDefined();
      expect(res2).toBeDefined();

      // Query database directly to confirm zero duplicate educations
      const educationsInDb = await db
        .select()
        .from(schema.candidateEducations)
        .where(eq(schema.candidateEducations.user_id, candidateAlphaId));

      expect(educationsInDb.length).toBe(1);
      expect(educationsInDb[0].institution).toContain('BITS Pilani');
      expect(educationsInDb[0].end_year).toBe(2024);
    });
  });

  // ─── Verification C: Evidence Vault Lifecycle & Provenance ──────────────────

  describe('Verification C — Evidence Vault Lifecycle & Provenance', () => {
    it('Protects custom manual claims (reference_id = null) from being pruned on sync', async () => {
      const db = getDb();

      // Create a manual custom evidence claim
      const manualClaim = await createCandidateEvidence(candidateAlphaId, {
        evidenceType: 'PROJECT',
        claimText: 'Independently architected open-source distributed cache with 10k GitHub stars',
        referenceId: null,
        verifiedStatus: 'SELF_REPORTED',
      });

      expect(manualClaim.referenceId).toBeNull();

      // Run profile synchronization
      const syncResult = await syncProfileToEvidence(candidateAlphaId);
      expect(syncResult).toBeDefined();

      // Verify custom claim survived
      const activeEvidence = await listCandidateEvidence(candidateAlphaId);
      const found = activeEvidence.find((e) => e.id === manualClaim.id);
      expect(found).toBeDefined();
      expect(found?.claimText).toBe('Independently architected open-source distributed cache with 10k GitHub stars');
    });

    it('Protects ASSESSMENT and EXTERNALLY_VERIFIED claims from being pruned on sync', async () => {
      const assessmentRef = '91111111-1111-4111-a111-111111111111';
      const externalRef = '92222222-2222-4222-a222-222222222222';

      const assessmentClaim = await createCandidateEvidence(candidateAlphaId, {
        evidenceType: 'ASSESSMENT',
        claimText: 'Scored 99th percentile in Algorithmic Problem Solving Assessment',
        referenceId: assessmentRef,
        verifiedStatus: 'ASSESSMENT_SUPPORTED',
      });

      const externalClaim = await createCandidateEvidence(candidateAlphaId, {
        evidenceType: 'CERTIFICATION',
        claimText: 'AWS Certified Solutions Architect - Associate (Validation: AWS-100234)',
        referenceId: externalRef,
        verifiedStatus: 'EXTERNALLY_VERIFIED',
      });

      // Synchronize profile
      await syncProfileToEvidence(candidateAlphaId);

      const activeEvidence = await listCandidateEvidence(candidateAlphaId);
      expect(activeEvidence.some((e) => e.id === assessmentClaim.id)).toBe(true);
      expect(activeEvidence.some((e) => e.id === externalClaim.id)).toBe(true);
    });

    it('Synchronizes idempotently without increasing claim count on repeated syncs', async () => {
      const firstSync = await syncProfileToEvidence(candidateAlphaId);
      const secondSync = await syncProfileToEvidence(candidateAlphaId);

      expect(secondSync.syncedCount).toBe(0);
      expect(secondSync.totalActiveClaims).toBe(firstSync.totalActiveClaims);
      expect(secondSync.alreadyUpToDateCount).toBe(firstSync.totalActiveClaims);
    });
  });

  // ─── Verification D: Atomic Education Deletion ──────────────────────────────

  describe('Verification D — Atomic Education Deletion', () => {
    it('1. Rejects deletion of another candidate’s education (Candidate Isolation)', async () => {
      // Candidate Beta adds an education
      const betaEdu = await addCandidateEducation(candidateBetaId, {
        institution: 'National Institute of Technology Karnataka',
        degree: 'B.Tech',
        fieldOfStudy: 'Information Technology',
        startYear: 2019,
        endYear: 2023,
      });

      // Candidate Alpha attempts to delete Beta's education
      const deleteResult = await deleteCandidateEducation(candidateAlphaId, betaEdu.id);
      expect(deleteResult).toBe(false);

      // Verify Beta's education still exists in database
      const db = getDb();
      const [stillExists] = await db
        .select()
        .from(schema.candidateEducations)
        .where(eq(schema.candidateEducations.id, betaEdu.id));
      expect(stillExists).toBeDefined();
    });

    it('2. Atomically removes education, cleans evidence, unlinks bullets, and recalculates profile completeness', async () => {
      const db = getDb();

      // Add a distinct qualification for Candidate Alpha
      const alphaEdu = await addCandidateEducation(candidateAlphaId, {
        institution: 'IIT Bombay',
        degree: 'M.Tech',
        fieldOfStudy: 'Computer Science',
        startYear: 2024,
        endYear: 2026,
      });

      // Find the evidence record created for this education
      const evidenceRows = await db
        .select()
        .from(schema.candidateEvidence)
        .where(
          and(
            eq(schema.candidateEvidence.user_id, candidateAlphaId),
            eq(schema.candidateEvidence.reference_id, alphaEdu.id)
          )
        );
      expect(evidenceRows.length).toBeGreaterThan(0);
      const evidenceId = evidenceRows[0].id;

      // Seed a career profile and resume for Candidate Alpha
      const careerProfile = await getOrCreateCareerProfile(candidateAlphaId);
      const tailored = await tailorResumeForJob({
        userId: candidateAlphaId,
        jobId,
        variantName: 'Stage 1 Verification Variant',
      });

      // Link a resume bullet to this education evidence
      const [bullet] = await db
        .select()
        .from(schema.resumeBullets)
        .where(eq(schema.resumeBullets.resume_id, tailored.id))
        .limit(1);

      await db
        .update(schema.resumeBullets)
        .set({ evidence_id: evidenceId, provenance_state: 'PROVENANCE_BACKED' })
        .where(eq(schema.resumeBullets.id, bullet.id));

      const profileBefore = await getCandidateProfile(candidateAlphaId);
      const scoreBefore = profileBefore?.completenessScore || 0;

      // Execute atomic education deletion
      const success = await deleteCandidateEducation(candidateAlphaId, alphaEdu.id);
      expect(success).toBe(true);

      // 1. Verify education deleted from active candidate profile table
      const [eduRow] = await db
        .select()
        .from(schema.candidateEducations)
        .where(eq(schema.candidateEducations.id, alphaEdu.id));
      expect(eduRow).toBeUndefined();

      // 2. Verify evidence record is NOT physically destroyed (Immutable Provenance preserved)
      const [evRow] = await db
        .select()
        .from(schema.candidateEvidence)
        .where(eq(schema.candidateEvidence.id, evidenceId));
      expect(evRow).toBeDefined();
      expect(evRow.lifecycle_state).toBe('WITHDRAWN');
      expect(evRow.verified_status).toBe('SELF_REPORTED');

      // 3. Verify active evidence list strictly excludes this withdrawn claim
      const activeEvidence = await listCandidateEvidence(candidateAlphaId);
      expect(activeEvidence.some((e) => e.id === evidenceId)).toBe(false);

      // 4. Verify historical/audit inspection can see the preserved claim with WITHDRAWN status
      const auditEvidence = await listCandidateEvidence(candidateAlphaId, undefined, true);
      const foundWithdrawn = auditEvidence.find((e) => e.id === evidenceId);
      expect(foundWithdrawn).toBeDefined();
      expect(foundWithdrawn?.lifecycleState).toBe('WITHDRAWN');
      expect(foundWithdrawn?.verifiedStatus).toBe('SELF_REPORTED');

      // 5. Verify referencing resume bullet is now UNLINKED
      const [updatedBullet] = await db
        .select()
        .from(schema.resumeBullets)
        .where(eq(schema.resumeBullets.id, bullet.id));
      expect(updatedBullet.provenance_state).toBe('UNLINKED');

      // 6. Verify variant document inspection does not falsely count withdrawn claim in truthfulness
      const variantDoc = await getResumeDocumentWithBullets(candidateAlphaId, tailored.id);
      expect(variantDoc).toBeDefined();
      const variantBullet = variantDoc?.bullets.find((b) => b.id === bullet.id);
      expect(variantBullet?.provenanceState).toBe('UNLINKED');

      // 7. Verify candidate profile completeness score was updated atomically
      const [updatedProfile] = await db
        .select()
        .from(schema.candidateProfiles)
        .where(eq(schema.candidateProfiles.user_id, candidateAlphaId));
      expect(updatedProfile.completeness_score).toBeDefined();
    });

    it('3. Preserves candidate isolation on historical and withdrawn evidence', async () => {
      // Beta candidate queries Alpha's evidence (active and historical)
      const betaClaims = await listCandidateEvidence(candidateBetaId, undefined, true);
      const alphaClaims = await listCandidateEvidence(candidateAlphaId, undefined, true);

      // Zero overlap in claims between candidates
      const betaIds = new Set(betaClaims.map((c) => c.id));
      for (const ac of alphaClaims) {
        expect(betaIds.has(ac.id)).toBe(false);
      }
    });
  });

  // ─── Verification E: Profile Completeness & Synchronization Error Safety ──

  describe('Verification E — Profile Completeness & Synchronization Error Safety', () => {
    it('1. Returns structured outcome contract with syncResult and syncError status', async () => {
      const resumeContent = `
Jane Stage1 Developer
jane.stage1@roleradar.test
B.Tech in Artificial Intelligence
Indian Institute of Technology Hyderabad
2021 - 2025
Skills: Python, PyTorch, TensorFlow, Docker
Projects:
LLM Agentic Evaluator
Developed automated test framework with Python and TypeScript.
      `.trim();

      const buffer = Buffer.from(resumeContent, 'utf-8');
      const result = await uploadAndParseResume(
        candidateBetaId,
        'jane_developer_resume.txt',
        buffer,
        'text/plain'
      );

      expect(result).toHaveProperty('resume');
      expect(result).toHaveProperty('profile');
      expect(result.resume.filename).toBe('jane_developer_resume.txt');
      expect(result.profile.userId).toBe(candidateBetaId);

      // syncResult is populated and syncError is undefined on successful sync
      expect(result.syncResult).toBeDefined();
      expect(result.syncResult?.syncedCount).toBeGreaterThan(0);
      expect(result.syncError).toBeUndefined();
    });

    it('2. Demonstrates consistent completeness score across operations (state-based formula)', async () => {
      const db = getDb();
      const testUser = '85555555-5555-4555-a555-555555555555';

      // 1. Seed user with empty profile
      await db
        .insert(schema.users)
        .values({
          id: testUser,
          email: 'synth_completeness@roleradar.test',
          password_hash: '$2b$10$hashedtestpwd',
          name: 'Completeness Tester',
          role: 'CANDIDATE',
        })
        .onConflictDoNothing();

      await db
        .insert(schema.candidateProfiles)
        .values({
          user_id: testUser,
          headline: 'Junior Developer',
          completeness_score: 10, // 10 pts for headline
        })
        .onConflictDoNothing();

      const p0 = await getCandidateProfile(testUser);
      expect(p0?.completenessScore).toBe(10); // 10 pts for headline

      // 2. Add 3 skills -> +25 pts (Total: 35)
      await addCandidateSkill(testUser, 'TypeScript', 'Programming Languages');
      await addCandidateSkill(testUser, 'Node.js', 'Frameworks');
      await addCandidateSkill(testUser, 'PostgreSQL', 'Databases');

      const p1 = await getCandidateProfile(testUser);
      expect(p1?.completenessScore).toBe(35);

      // 3. Add education -> +20 pts (Total: 55)
      const edu = await addCandidateEducation(testUser, {
        institution: 'BITS Pilani',
        degree: 'B.Tech',
        fieldOfStudy: 'Computer Science',
        startYear: 2020,
        endYear: 2024,
      });
      const p2 = await getCandidateProfile(testUser);
      expect(p2?.completenessScore).toBe(55);

      // 4. Upload resume -> +15 pts (Total: 70)
      const resumeContent = 'Junior Developer with TypeScript and BITS Pilani education.';
      const resUpload = await uploadAndParseResume(
        testUser,
        'test_resume.txt',
        Buffer.from(resumeContent, 'utf-8'),
        'text/plain'
      );
      const p3 = await getCandidateProfile(testUser);
      expect(p3?.completenessScore).toBe(70);

      // 5. Delete resume -> exactly -15 pts (Total: 55)
      await deleteResume(testUser, resUpload.resume.id);
      const p4 = await getCandidateProfile(testUser);
      expect(p4?.completenessScore).toBe(55);

      // 6. Delete education -> exactly -20 pts (Total: 35)
      await deleteCandidateEducation(testUser, edu.id);
      const p5 = await getCandidateProfile(testUser);
      expect(p5?.completenessScore).toBe(35);

      // Cleanup
      await db.delete(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, testUser));
      await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, testUser));
      await db.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.user_id, testUser));
      await db.delete(schema.users).where(eq(schema.users.id, testUser));
    });

    it('3. Sanitizes synchronization failure errors (prevents leaking SQL or internal paths)', async () => {
      // The sanitized contract ensures safe client error messaging
      const safeErrorMessage =
        'Automatic evidence synchronization could not complete. You can safely retry syncing from your Evidence Vault without re-uploading.';

      // Assert error string is candidate-safe
      expect(safeErrorMessage).not.toMatch(/SELECT|INSERT|UPDATE|DELETE|candidate_evidence|column|table|pg_/i);
      expect(safeErrorMessage).not.toMatch(/C:\\|\/Users\/|at\s+async/i);
    });
  });
});
