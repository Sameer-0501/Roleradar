/**
 * Engine 3 Critical Stabilization & Candidate Evidence Integrity Test Suite.
 *
 * Validates:
 * 1. User-isolated education removal & foreign record protection.
 * 2. Unlinking resume bullets when backing education is deleted.
 * 3. Deterministic duplicate education detection & normalization in resume parser.
 * 4. Legitimate distinct qualifications from the same institution preserved.
 * 5. Idempotent repeated resume parsing without duplicate rows.
 * 6. Evidence Vault synchronization with accurate claim counts (new vs already up-to-date).
 * 7. Pruning of orphaned claims and unlinking bullets on synchronization.
 * 8. Automatic Evidence Vault sync on resume upload.
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
  getOrCreateCareerProfile,
  listCandidateEvidence,
} from '../resumes/career-evidence-service.js';
import {
  uploadAndParseResume,
  isSameEducation,
  normalizeInstitution,
  normalizeDegree,
  normalizeFieldOfStudy,
  getCandidateProfile,
} from '../resume/profile-service.js';
import { tailorResumeForJob } from '../resumes/resume-tailoring-service.js';

describe('Engine 3 Critical Stabilization & Candidate Evidence Integrity', () => {
  const userCandidate1 = '71111111-1111-4111-a111-111111111111';
  const userCandidate2 = '72222222-2222-4222-a222-222222222222';
  const testJobId = '73333333-3333-4333-a333-333333333333';
  const testCompanyId = '74444444-4444-4444-a444-444444444444';

  beforeAll(async () => {
    const db = getDb();

    // 1. Seed two test candidates
    await db
      .insert(schema.users)
      .values([
        {
          id: userCandidate1,
          email: 'synth_candidate1@roleradar.test',
          password_hash: '$2b$10$hashedtestcandidate1pwd',
          name: 'Synthetic Candidate 1',
          role: 'CANDIDATE',
        },
        {
          id: userCandidate2,
          email: 'synth_candidate2@roleradar.test',
          password_hash: '$2b$10$hashedtestcandidate2pwd',
          name: 'Synthetic Candidate 2',
          role: 'CANDIDATE',
        },
      ])
      .onConflictDoNothing();

    // 2. Seed test company & verified job
    await db
      .insert(schema.companies)
      .values({
        id: testCompanyId,
        name: 'Stabilization Tech Corp',
        official_domain: 'stabilization.example.com',
        careers_url: 'https://stabilization.example.com/careers',
        ats_type: 'GREENHOUSE',
        is_active: true,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.jobs)
      .values({
        id: testJobId,
        company_id: testCompanyId,
        source_system: 'GREENHOUSE',
        external_job_id: 'REQ-STAB-001',
        title: 'Senior Software Engineer',
        official_url: 'https://stabilization.example.com/jobs/REQ-STAB-001',
        description: 'Engineering role requiring B.Tech in Computer Science and React/Node skills.',
        requirements: 'Requires Bachelor of Technology in Computer Science or equivalent. Minimum 2 years experience.',
        location: 'Bangalore, India',
        workplace_type: 'HYBRID',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
        content_hash: 'hash-stab-001',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.resumeBullets).where(eq(schema.resumeBullets.resume_id, testJobId)).catch(() => {});
    await db.delete(schema.resumeDocuments).where(eq(schema.resumeDocuments.user_id, userCandidate1));
    await db.delete(schema.resumeDocuments).where(eq(schema.resumeDocuments.user_id, userCandidate2));
    await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, userCandidate1));
    await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, userCandidate2));
    await db.delete(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, userCandidate1));
    await db.delete(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, userCandidate2));
    await db.delete(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userCandidate1));
    await db.delete(schema.candidateCareerProfiles).where(eq(schema.candidateCareerProfiles.user_id, userCandidate1));
    await db.delete(schema.candidateCareerProfiles).where(eq(schema.candidateCareerProfiles.user_id, userCandidate2));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, testJobId));
    await db.delete(schema.companies).where(eq(schema.companies.id, testCompanyId));
    await db.delete(schema.users).where(eq(schema.users.id, userCandidate1));
    await db.delete(schema.users).where(eq(schema.users.id, userCandidate2));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Candidate Education Removal & Data Isolation
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Candidate Education Removal & User Isolation', () => {
    let candidate1EduId: string;

    it('adds an education entry and automatically reflects in Evidence Vault', async () => {
      const edu = await addCandidateEducation(userCandidate1, {
        institution: 'Indian Institute of Technology Madras',
        degree: 'B.Tech / B.E.',
        fieldOfStudy: 'Computer Science & Engineering',
        startYear: 2019,
        endYear: 2023,
      });

      expect(edu).toBeDefined();
      expect(edu.id).toBeDefined();
      expect(edu.institution).toBe('Indian Institute of Technology Madras');
      candidate1EduId = edu.id;

      // Verify presence in Evidence Vault
      const evidence = await listCandidateEvidence(userCandidate1, 'EDUCATION');
      const matchingClaim = evidence.find((e) => e.referenceId === candidate1EduId);
      expect(matchingClaim).toBeDefined();
      expect(matchingClaim!.claimText).toContain('Indian Institute of Technology Madras');
      expect(matchingClaim!.verifiedStatus).toBe('SELF_REPORTED');
    });

    it('prevents userCandidate2 from deleting userCandidate1 education record (Isolation Guarantee)', async () => {
      // Attempt deletion using candidate 2's session
      const result = await deleteCandidateEducation(userCandidate2, candidate1EduId);
      expect(result).toBe(false);

      // Verify record still exists in candidate 1's profile
      const db = getDb();
      const [record] = await db
        .select()
        .from(schema.candidateEducations)
        .where(
          and(
            eq(schema.candidateEducations.id, candidate1EduId),
            eq(schema.candidateEducations.user_id, userCandidate1)
          )
        );
      expect(record).toBeDefined();
    });

    it('returns false when attempting to delete a nonexistent education ID', async () => {
      const result = await deleteCandidateEducation(userCandidate1, '00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });

    it('deletes candidate education, cleans vault evidence, and unlinks resume bullets', async () => {
      // 1. Generate a tailored resume variant referencing this evidence
      await getOrCreateCareerProfile(userCandidate1);
      const tailored = await tailorResumeForJob({
        userId: userCandidate1,
        jobId: testJobId,
        variantName: 'Software Engineering Variant',
      });

      // Find bullets linked to this evidence
      const db = getDb();
      const evidenceRows = await db
        .select()
        .from(schema.candidateEvidence)
        .where(eq(schema.candidateEvidence.reference_id, candidate1EduId));
      expect(evidenceRows.length).toBeGreaterThan(0);
      const evId = evidenceRows[0]!.id;

      // Add a test bullet explicitly backed by this evidence claim
      const [bullet] = await db
        .insert(schema.resumeBullets)
        .values({
          resume_id: tailored.id,
          evidence_id: evId,
          bullet_text: 'Graduated with B.Tech in CSE from IIT Madras with comprehensive software systems knowledge.',
          provenance_state: 'PROVENANCE_BACKED',
          display_order: 1,
        })
        .returning();

      expect(bullet!.provenance_state).toBe('PROVENANCE_BACKED');
      expect(bullet!.evidence_id).toBe(evId);

      // 2. Perform authenticated deletion of candidate education
      const deleted = await deleteCandidateEducation(userCandidate1, candidate1EduId);
      expect(deleted).toBe(true);

      // 3. Verify education record is removed from candidate_educations
      const [checkEdu] = await db
        .select()
        .from(schema.candidateEducations)
        .where(eq(schema.candidateEducations.id, candidate1EduId));
      expect(checkEdu).toBeUndefined();

      // 4. Verify candidate_evidence claim is pruned so vault does not falsely claim support
      const checkEv = await db
        .select()
        .from(schema.candidateEvidence)
        .where(eq(schema.candidateEvidence.id, evId));
      expect(checkEv.length).toBe(0);

      // 5. Verify the linked resume bullet was safely unlinked rather than corrupted
      const [checkBullet] = await db
        .select()
        .from(schema.resumeBullets)
        .where(eq(schema.resumeBullets.id, bullet!.id));
      expect(checkBullet!.provenance_state).toBe('UNLINKED');
      expect(checkBullet!.evidence_id).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Deterministic Duplicate Education Detection & Normalization
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. Education Normalization & Deduplication Logic', () => {
    it('normalizes institution variations accurately', () => {
      expect(normalizeInstitution('from IIT Bombay')).toBe('iit bombay');
      expect(normalizeInstitution('at Indian Institute of Technology, Delhi')).toBe('indian institute of technology delhi');
      expect(normalizeInstitution('BITS Pilani, Goa Campus')).toBe('bits pilani goa campus');
    });

    it('normalizes degree titles canonically', () => {
      expect(normalizeDegree('B.Tech')).toBe('b.tech / b.e.');
      expect(normalizeDegree('BTech in CSE')).toBe('b.tech / b.e.');
      expect(normalizeDegree('Bachelor of Engineering')).toBe('b.tech / b.e.');
      expect(normalizeDegree('M.Tech')).toBe('m.tech / m.e.');
      expect(normalizeDegree('Master of Science')).toBe('m.sc');
      expect(normalizeDegree('BCA')).toBe('bca');
    });

    it('detects identical qualifications across text formatting differences', () => {
      const existing = {
        institution: 'IIT Bombay',
        degree: 'B.Tech / B.E.',
        field_of_study: 'Computer Science & Engineering',
        start_year: 2018,
        end_year: 2022,
      };

      const candidateResumeParsed = {
        institution: 'Indian Institute of Technology, Bombay',
        degree: 'Bachelor of Technology',
        fieldOfStudy: 'Computer Science and Engineering',
        startYear: 2018,
        endYear: 2022,
      };

      expect(isSameEducation(existing, candidateResumeParsed)).toBe(true);
    });

    it('preserves distinct legitimate qualifications from the same institution', () => {
      const btech = {
        institution: 'BITS Pilani',
        degree: 'B.Tech / B.E.',
        field_of_study: 'Electrical Engineering',
        start_year: 2016,
        end_year: 2020,
      };

      const mtech = {
        institution: 'BITS Pilani',
        degree: 'M.Tech / M.E.',
        field_of_study: 'Computer Science',
        start_year: 2020,
        end_year: 2022,
      };

      // Must NOT treat B.Tech and M.Tech as duplicates
      expect(isSameEducation(btech, mtech)).toBe(false);
    });

    it('detects duplicate even when optional start year is missing in one record', () => {
      const existing = {
        institution: 'Delhi University',
        degree: 'BCA',
        field_of_study: 'Computer Applications',
        start_year: null,
        end_year: 2023,
      };

      const parsed = {
        institution: 'Delhi University',
        degree: 'BCA',
        fieldOfStudy: 'Computer Applications',
        startYear: 2020,
        endYear: 2023,
      };

      expect(isSameEducation(existing, parsed)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Repeated Resume Upload Idempotency
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. Idempotent Repeated Resume Parsing', () => {
    it('does not duplicate education rows when the same resume is uploaded repeatedly', async () => {
      const sampleResumeText = `
John Doe
johndoe.test@example.com
+91 98765 43210

EDUCATION
B.Tech in Computer Science & Engineering
National Institute of Technology Trichy
2019 - 2023

SKILLS
React, Node.js, TypeScript, PostgreSQL, Docker
`;
      const resumeBuffer = Buffer.from(sampleResumeText, 'utf-8');

      // Upload 1
      const upload1 = await uploadAndParseResume(
        userCandidate2,
        'john_doe_resume.txt',
        resumeBuffer,
        'text/plain'
      );
      expect(upload1).toBeDefined();

      const db = getDb();
      const educationsAfterUpload1 = await db
        .select()
        .from(schema.candidateEducations)
        .where(eq(schema.candidateEducations.user_id, userCandidate2));
      expect(educationsAfterUpload1.length).toBe(1);
      expect(educationsAfterUpload1[0]!.institution).toContain('National Institute of Technology');

      // Upload 2 (identical file re-uploaded)
      const upload2 = await uploadAndParseResume(
        userCandidate2,
        'john_doe_resume_copy.txt',
        resumeBuffer,
        'text/plain'
      );
      expect(upload2).toBeDefined();

      // Verify STILL exactly 1 education row in database (Zero Duplication)
      const educationsAfterUpload2 = await db
        .select()
        .from(schema.candidateEducations)
        .where(eq(schema.candidateEducations.user_id, userCandidate2));
      expect(educationsAfterUpload2.length).toBe(1);

      // Upload 3 (re-upload again)
      await uploadAndParseResume(
        userCandidate2,
        'john_doe_resume_v3.txt',
        resumeBuffer,
        'text/plain'
      );

      const educationsAfterUpload3 = await db
        .select()
        .from(schema.candidateEducations)
        .where(eq(schema.candidateEducations.user_id, userCandidate2));
      expect(educationsAfterUpload3.length).toBe(1);
    });

    it('automatically synchronizes Master Evidence Vault upon resume upload', async () => {
      const evidence = await listCandidateEvidence(userCandidate2);
      expect(evidence.length).toBeGreaterThan(0);

      // Verify both Skills and Education were synchronized to the Vault
      const hasSkill = evidence.some((e) => e.evidenceType === 'PROFILE_SKILL' && e.claimText.includes('TypeScript'));
      const hasEdu = evidence.some((e) => e.evidenceType === 'EDUCATION' && e.claimText.includes('National Institute of Technology'));
      expect(hasSkill).toBe(true);
      expect(hasEdu).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Evidence Vault Synchronization Accuracy & Breakdown
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Evidence Vault Synchronization Breakdown', () => {
    it('returns accurate newly added vs already up-to-date claim counts', async () => {
      // First sync: all claims are already synced from resume upload, so newly added = 0
      const syncResult1 = await syncProfileToEvidence(userCandidate2);
      expect(syncResult1.syncedCount).toBe(0);
      expect(syncResult1.alreadyUpToDateCount).toBeGreaterThan(0);
      expect(syncResult1.totalActiveClaims).toBe(syncResult1.alreadyUpToDateCount);

      // Add a new skill directly to candidate profile
      const db = getDb();
      await db.insert(schema.candidateSkills).values({
        user_id: userCandidate2,
        skill_name: 'Kubernetes',
        canonical_name: 'Kubernetes',
        category: 'Cloud & DevOps',
        source: 'MANUAL',
      });

      // Second sync: exactly 1 new claim added
      const syncResult2 = await syncProfileToEvidence(userCandidate2);
      expect(syncResult2.syncedCount).toBe(1);
      expect(syncResult2.totalActiveClaims).toBe(syncResult1.totalActiveClaims + 1);

      // Third sync: immediately repeated -> exactly 0 new claims added, all up to date
      const syncResult3 = await syncProfileToEvidence(userCandidate2);
      expect(syncResult3.syncedCount).toBe(0);
      expect(syncResult3.alreadyUpToDateCount).toBe(syncResult2.totalActiveClaims);
      expect(syncResult3.totalActiveClaims).toBe(syncResult2.totalActiveClaims);
    });
  });
});
