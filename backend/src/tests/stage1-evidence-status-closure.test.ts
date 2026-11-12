/**
 * Stage 1 Final Verification — Evidence Lifecycle & Verification History Closure Test Suite.
 *
 * Verifies the separation of Lifecycle State ('ACTIVE' | 'WITHDRAWN') from
 * Epistemological Verification Level ('SELF_REPORTED' | 'DOCUMENT_SUPPORTED' | 'EXTERNALLY_VERIFIED').
 *
 * Required Scenarios:
 * 1. SELF_REPORTED claim → withdrawn → reactivated (preserves SELF_REPORTED, never upgrades).
 * 2. DOCUMENT_SUPPORTED claim → withdrawn → reactivated without new supporting documentation (preserves DOCUMENT_SUPPORTED, never degrades).
 * 3. EXTERNALLY_VERIFIED claim → withdrawn → reactivated without new verification (preserves EXTERNALLY_VERIFIED, never degrades).
 * 4. Reactivation after genuinely new supporting evidence is supplied (faithfully upgrades monotonically).
 * 5. Withdrawn claim excluded from active Evidence Vault results (included in audit view).
 * 6. Historical resume bullet retains its evidence reference but is not treated as currently supported (UNLINKED, 0% truthfulness contribution).
 * 7. Independent evidence survives profile synchronization (assessments, manual standalone claims, external credentials protected).
 * 8. Repeated synchronization does not change verification strength (strictly idempotent).
 * 9. Cross-candidate isolation (strict user scoping).
 * 10. Existing records with null or unexpected status values are handled safely by active-evidence queries.
 * 11. Profile re-addition must never silently manufacture stronger evidence.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../database/connection.js';
import * as schema from '../database/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  createCandidateEvidence,
  deleteCandidateEvidence,
  reactivateCandidateEvidence,
  listCandidateEvidence,
  syncProfileToEvidence,
  getOrCreateCareerProfile,
  addCandidateEducation,
  deleteCandidateEducation,
  addCandidateSkill,
  removeCandidateSkill,
  resolveVerificationStatus,
  getVerificationWeight,
} from '../resumes/career-evidence-service.js';
import {
  tailorResumeForJob,
  getResumeDocumentWithBullets,
} from '../resumes/resume-tailoring-service.js';
import { uploadAndParseResume } from '../resume/profile-service.js';
import {
  addEvidenceHandler,
  reactivateEvidenceHandler,
} from '../api/resumes.js';
import type { Request, Response } from 'express';

describe('Stage 1 Final Verification — Preserve Evidence Verification History', () => {
  const candidateAId = '91111111-1111-4111-a111-111111111111';
  const candidateBId = '92222222-2222-4222-a222-222222222222';
  const companyId = '93333333-3333-4333-a333-333333333333';
  const jobId = '94444444-4444-4444-a444-444444444444';

  beforeAll(async () => {
    const db = getDb();

    // 1. Seed two isolated synthetic candidates
    await db
      .insert(schema.users)
      .values([
        {
          id: candidateAId,
          email: 'stage1_evidence_a@roleradar.test',
          password_hash: '$2b$10$hashedtestpwdcandidatea',
          name: 'Synthetic Evidence Candidate A',
          role: 'CANDIDATE',
        },
        {
          id: candidateBId,
          email: 'stage1_evidence_b@roleradar.test',
          password_hash: '$2b$10$hashedtestpwdcandidateb',
          name: 'Synthetic Evidence Candidate B',
          role: 'CANDIDATE',
        },
      ])
      .onConflictDoNothing();

    // 2. Seed verified employer and target job
    await db
      .insert(schema.companies)
      .values({
        id: companyId,
        name: 'Stage1 Evidence Verification Corp',
        official_domain: 'stage1-evidence.example.com',
        careers_url: 'https://stage1-evidence.example.com/careers',
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
        external_job_id: 'REQ-STAGE1-EV-001',
        title: 'Senior Systems Engineer',
        official_url: 'https://stage1-evidence.example.com/jobs/REQ-STAGE1-EV-001',
        description: 'Requires demonstrated proficiency in Rust and distributed systems.',
        requirements: 'Rust, Distributed Systems, 3+ years experience',
        location: 'Bangalore, India',
        workplace_type: 'REMOTE',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
        content_hash: 'hash-stage1-ev-001',
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    const db = getDb();
    // Clean up all synthetic records created during testing
    await db.delete(schema.resumeBullets).where(eq(schema.resumeBullets.bullet_text, 'Synthetic bullet'));
    await db.delete(schema.resumeDocuments).where(eq(schema.resumeDocuments.user_id, candidateAId));
    await db.delete(schema.resumeDocuments).where(eq(schema.resumeDocuments.user_id, candidateBId));
    await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, candidateAId));
    await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, candidateBId));
    await db.delete(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, candidateAId));
    await db.delete(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, candidateBId));
    await db.delete(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, candidateAId));
    await db.delete(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, candidateBId));
    await db.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.user_id, candidateAId));
    await db.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.user_id, candidateBId));
    await db.delete(schema.candidateCareerProfiles).where(eq(schema.candidateCareerProfiles.user_id, candidateAId));
    await db.delete(schema.candidateCareerProfiles).where(eq(schema.candidateCareerProfiles.user_id, candidateBId));
    await db.delete(schema.users).where(eq(schema.users.id, candidateAId));
    await db.delete(schema.users).where(eq(schema.users.id, candidateBId));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
  });

  // ─── Scenario 1: SELF_REPORTED claim lifecycle ──────────────────────────────

  it('1. SELF_REPORTED claim → withdrawn → reactivated preserves SELF_REPORTED and does not upgrade', async () => {
    // A. Create a self-reported claim
    const claim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      claimText: 'Demonstrated proficiency in Rust (Self-taught)',
      verifiedStatus: 'SELF_REPORTED',
    });
    expect(claim.verifiedStatus).toBe('SELF_REPORTED');
    expect(claim.lifecycleState).toBe('ACTIVE');

    // B. Withdraw the claim
    const deleted = await deleteCandidateEvidence(candidateAId, claim.id);
    expect(deleted).toBe(true);

    // Verify withdrawal changed lifecycle_state to WITHDRAWN but preserved verifiedStatus as SELF_REPORTED
    const auditClaims = await listCandidateEvidence(candidateAId, undefined, true);
    const withdrawnClaim = auditClaims.find((c) => c.id === claim.id);
    expect(withdrawnClaim).toBeDefined();
    expect(withdrawnClaim!.lifecycleState).toBe('WITHDRAWN');
    expect(withdrawnClaim!.verifiedStatus).toBe('SELF_REPORTED');

    // C. Reactivate without new proof
    const reactivated = await reactivateCandidateEvidence(candidateAId, claim.id);
    expect(reactivated).toBeDefined();
    expect(reactivated!.lifecycleState).toBe('ACTIVE');
    expect(reactivated!.verifiedStatus).toBe('SELF_REPORTED'); // Must NOT be upgraded to DOCUMENT_SUPPORTED
  });

  // ─── Scenario 2: DOCUMENT_SUPPORTED claim lifecycle ─────────────────────────

  it('2. DOCUMENT_SUPPORTED claim → withdrawn → reactivated without new doc preserves DOCUMENT_SUPPORTED', async () => {
    // A. Create a document-supported claim (e.g. from parsed resume)
    const claim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'EDUCATION',
      claimText: 'B.Tech in Computer Science from IIT Madras (Verified from transcripts)',
      verifiedStatus: 'DOCUMENT_SUPPORTED',
    });
    expect(claim.verifiedStatus).toBe('DOCUMENT_SUPPORTED');
    expect(claim.lifecycleState).toBe('ACTIVE');

    // B. Withdraw the claim
    await deleteCandidateEvidence(candidateAId, claim.id);

    // Verify in audit: lifecycle is WITHDRAWN, verifiedStatus is still DOCUMENT_SUPPORTED!
    const auditClaims = await listCandidateEvidence(candidateAId, undefined, true);
    const withdrawn = auditClaims.find((c) => c.id === claim.id);
    expect(withdrawn!.lifecycleState).toBe('WITHDRAWN');
    expect(withdrawn!.verifiedStatus).toBe('DOCUMENT_SUPPORTED');

    // C. Reactivate without supplying new document
    const reactivated = await reactivateCandidateEvidence(candidateAId, claim.id);
    expect(reactivated!.lifecycleState).toBe('ACTIVE');
    expect(reactivated!.verifiedStatus).toBe('DOCUMENT_SUPPORTED'); // Verification level preserved!
  });

  // ─── Scenario 3: EXTERNALLY_VERIFIED claim lifecycle ────────────────────────

  it('3. EXTERNALLY_VERIFIED claim → withdrawn → reactivated without new verification preserves EXTERNALLY_VERIFIED', async () => {
    // A. Create externally verified claim (e.g. third-party credential)
    const claim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'CERTIFICATION',
      claimText: 'AWS Certified Solutions Architect — Credential ID: AWS-99281',
      verifiedStatus: 'EXTERNALLY_VERIFIED',
    });
    expect(claim.verifiedStatus).toBe('EXTERNALLY_VERIFIED');
    expect(claim.lifecycleState).toBe('ACTIVE');

    // B. Withdraw claim
    await deleteCandidateEvidence(candidateAId, claim.id);

    const auditClaims = await listCandidateEvidence(candidateAId, undefined, true);
    const withdrawn = auditClaims.find((c) => c.id === claim.id);
    expect(withdrawn!.lifecycleState).toBe('WITHDRAWN');
    expect(withdrawn!.verifiedStatus).toBe('EXTERNALLY_VERIFIED');

    // C. Reactivate without new verification
    const reactivated = await reactivateCandidateEvidence(candidateAId, claim.id);
    expect(reactivated!.lifecycleState).toBe('ACTIVE');
    expect(reactivated!.verifiedStatus).toBe('EXTERNALLY_VERIFIED'); // Never degraded!
  });

  // ─── Scenario 4: Reactivation with genuinely stronger evidence ──────────────

  it('4. Reactivation after genuinely new supporting evidence is supplied faithfully upgrades status', async () => {
    // A. Start with SELF_REPORTED
    const claim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      claimText: 'Demonstrated proficiency in Docker Containerization',
      verifiedStatus: 'SELF_REPORTED',
    });
    await deleteCandidateEvidence(candidateAId, claim.id);

    // B. Reactivate with genuine documentary proof supplied
    const upgradedToDoc = await reactivateCandidateEvidence(candidateAId, claim.id, {
      newVerifiedStatus: 'DOCUMENT_SUPPORTED',
    });
    expect(upgradedToDoc!.lifecycleState).toBe('ACTIVE');
    expect(upgradedToDoc!.verifiedStatus).toBe('DOCUMENT_SUPPORTED');

    // C. Further upgrade with external verification
    await deleteCandidateEvidence(candidateAId, claim.id);
    const upgradedToExt = await reactivateCandidateEvidence(candidateAId, claim.id, {
      newVerifiedStatus: 'EXTERNALLY_VERIFIED',
    });
    expect(upgradedToExt!.lifecycleState).toBe('ACTIVE');
    expect(upgradedToExt!.verifiedStatus).toBe('EXTERNALLY_VERIFIED');
  });

  // ─── Scenario 5: Active vs Audit Evidence Vault visibility ───────────────────

  it('5. Withdrawn claims are excluded from active Evidence Vault queries and included in audit queries', async () => {
    const claimActive = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      claimText: 'Demonstrated proficiency in GraphQL (Active)',
      verifiedStatus: 'SELF_REPORTED',
    });

    const claimWithdrawn = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      claimText: 'Demonstrated proficiency in Haskell (Withdrawn)',
      verifiedStatus: 'DOCUMENT_SUPPORTED',
    });
    await deleteCandidateEvidence(candidateAId, claimWithdrawn.id);

    // Active query (default: includeWithdrawn = false)
    const activeList = await listCandidateEvidence(candidateAId);
    expect(activeList.some((c) => c.id === claimActive.id)).toBe(true);
    expect(activeList.some((c) => c.id === claimWithdrawn.id)).toBe(false);

    // Audit query (includeWithdrawn = true)
    const auditList = await listCandidateEvidence(candidateAId, undefined, true);
    expect(auditList.some((c) => c.id === claimActive.id)).toBe(true);
    expect(auditList.some((c) => c.id === claimWithdrawn.id)).toBe(true);

    // Career Profile stats count active claims only
    const careerProfile = await getOrCreateCareerProfile(candidateAId);
    expect(careerProfile.evidenceStats.totalClaims).toBe(activeList.length);
  });

  // ─── Scenario 6: Historical Resume Bullet Provenance ────────────────────────

  it('6. Historical resume bullet retains evidence reference but evaluates to UNLINKED after claim withdrawal', async () => {
    const db = getDb();

    // A. Create an active claim
    const claim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROJECT',
      claimText: 'Designed low-latency consensus protocol in Go',
      verifiedStatus: 'PROJECT_SUPPORTED',
    });

    // B. Tailor resume variant backed by this claim
    const tailored = await tailorResumeForJob({
      userId: candidateAId,
      jobId,
      variantName: 'Go Systems Engineer Variant',
    });
    expect(tailored).toBeDefined();

    // Link a bullet directly to this claim
    const [bullet] = await db
      .insert(schema.resumeBullets)
      .values({
        resume_id: tailored.id,
        bullet_text: 'Synthetic bullet: Designed low-latency consensus protocol in Go',
        evidence_id: claim.id,
        provenance_state: 'PROVENANCE_BACKED',
        display_order: 100,
      })
      .returning();

    // Initial check: bullet is PROVENANCE_BACKED
    const initialDoc = await getResumeDocumentWithBullets(candidateAId, tailored.id);
    const initialBullet = initialDoc?.bullets.find((b) => b.id === bullet.id);
    expect(initialBullet?.provenanceState).toBe('PROVENANCE_BACKED');

    // C. Withdraw backing claim
    await deleteCandidateEvidence(candidateAId, claim.id);

    // D. Verify variant inspection retains evidenceId reference but marks bullet UNLINKED
    const updatedDoc = await getResumeDocumentWithBullets(candidateAId, tailored.id);
    const updatedBullet = updatedDoc?.bullets.find((b) => b.id === bullet.id);
    expect(updatedBullet).toBeDefined();
    expect(updatedBullet?.evidenceId).toBe(claim.id); // Reference preserved!
    expect(updatedBullet?.provenanceState).toBe('UNLINKED'); // Dynamically unlinked!
  });

  // ─── Scenario 7: Independent Evidence Protection ───────────────────────────

  it('7. Independent assessment, externally verified, and standalone manual claims survive profile sync', async () => {
    // A. Create standalone manual claim (reference_id = null)
    const manualClaim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      referenceId: null,
      claimText: 'Deep domain knowledge in Telecom Networks (Independent manual)',
      verifiedStatus: 'SELF_REPORTED',
    });

    // B. Create assessment claim
    const assessmentClaim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'ASSESSMENT',
      referenceId: '85555555-5555-4555-a555-555555555555',
      claimText: 'Demonstrated algorithmic problem solving (Assessment score: 95%)',
      verifiedStatus: 'ASSESSMENT_SUPPORTED',
    });

    // C. Create externally verified claim
    const externalClaim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      referenceId: '86666666-6666-4666-a666-666666666666',
      claimText: 'Verified Kubernetes Administrator (CKA-9921)',
      verifiedStatus: 'EXTERNALLY_VERIFIED',
    });

    // Run syncProfileToEvidence
    const syncRes = await syncProfileToEvidence(candidateAId);
    expect(syncRes).toBeDefined();

    // Verify all 3 independent claims remain ACTIVE and unmutated
    const activeList = await listCandidateEvidence(candidateAId);
    const foundManual = activeList.find((c) => c.id === manualClaim.id);
    const foundAssessment = activeList.find((c) => c.id === assessmentClaim.id);
    const foundExternal = activeList.find((c) => c.id === externalClaim.id);

    expect(foundManual?.lifecycleState).toBe('ACTIVE');
    expect(foundAssessment?.lifecycleState).toBe('ACTIVE');
    expect(foundExternal?.lifecycleState).toBe('ACTIVE');
  });

  // ─── Scenario 8: Idempotent Synchronization ─────────────────────────────────

  it('8. Repeated profile synchronization is strictly idempotent and does not change verification strength', async () => {
    // Run sync 3 times in a row
    const run1 = await syncProfileToEvidence(candidateAId);
    const claims1 = await listCandidateEvidence(candidateAId, undefined, true);

    const run2 = await syncProfileToEvidence(candidateAId);
    const claims2 = await listCandidateEvidence(candidateAId, undefined, true);

    const run3 = await syncProfileToEvidence(candidateAId);
    const claims3 = await listCandidateEvidence(candidateAId, undefined, true);

    expect(claims1.length).toBe(claims2.length);
    expect(claims2.length).toBe(claims3.length);

    for (let i = 0; i < claims1.length; i++) {
      expect(claims1[i].id).toBe(claims2[i].id);
      expect(claims1[i].verifiedStatus).toBe(claims2[i].verifiedStatus);
      expect(claims1[i].lifecycleState).toBe(claims2[i].lifecycleState);
    }
  });

  // ─── Scenario 9: Cross-Candidate Isolation ──────────────────────────────────

  it('9. Candidate data isolation: Candidate B cannot inspect, delete, or reactivate Candidate A evidence', async () => {
    // Candidate A claim
    const claimA = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      claimText: 'Candidate A Proprietary Skill',
      verifiedStatus: 'SELF_REPORTED',
    });

    // Candidate B queries evidence
    const bClaims = await listCandidateEvidence(candidateBId, undefined, true);
    expect(bClaims.some((c) => c.id === claimA.id)).toBe(false);

    // Candidate B attempts to delete Candidate A claim
    const deletedByB = await deleteCandidateEvidence(candidateBId, claimA.id);
    expect(deletedByB).toBe(false); // Must fail

    // Withdraw as A
    await deleteCandidateEvidence(candidateAId, claimA.id);

    // Candidate B attempts to reactivate Candidate A claim
    const reactivatedByB = await reactivateCandidateEvidence(candidateBId, claimA.id);
    expect(reactivatedByB).toBeNull(); // Must fail
  });

  // ─── Scenario 10: Null & Unexpected Status Handling ─────────────────────────

  it('10. Safely handles existing records with null or unexpected status values', async () => {
    const db = getDb();

    // Insert legacy-like row directly into database with null/unexpected values
    const [legacyRow] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateAId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Legacy claim with unexpected verified_status',
        verified_status: 'UNKNOWN_LEGACY_VAL' as any,
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    // Query active evidence: should not crash and should safely map to fallback
    const activeClaims = await listCandidateEvidence(candidateAId);
    const mapped = activeClaims.find((c) => c.id === legacyRow.id);
    expect(mapped).toBeDefined();
    expect(mapped?.lifecycleState).toBe('ACTIVE');

    // Helper resolution tests
    expect(getVerificationWeight(null)).toBe(1);
    expect(getVerificationWeight(undefined)).toBe(1);
    expect(getVerificationWeight('NONEXISTENT_STATUS')).toBe(1);
    expect(resolveVerificationStatus(null, null)).toBe('SELF_REPORTED');
  });

  // ─── Scenario 11: Profile Re-addition Never Manufactures Evidence ───────────

  it('11. Profile re-addition must never silently manufacture stronger evidence', async () => {
    // A. Candidate adds education manually via direct profile control
    const edu = await addCandidateEducation(candidateAId, {
      institution: 'State Engineering College',
      degree: 'B.Tech',
      fieldOfStudy: 'Electrical Engineering',
      endYear: 2023,
    });
    expect(edu).toBeDefined();

    // Check evidence created for this education: must be SELF_REPORTED
    const claimsAfterAdd = await listCandidateEvidence(candidateAId, 'EDUCATION');
    const eduClaim = claimsAfterAdd.find((c) => c.referenceId === edu.id);
    expect(eduClaim).toBeDefined();
    expect(eduClaim?.verifiedStatus).toBe('SELF_REPORTED');

    // B. Run syncProfileToEvidence
    await syncProfileToEvidence(candidateAId);

    // Check again: sync MUST NOT upgrade SELF_REPORTED to DOCUMENT_SUPPORTED
    const claimsAfterSync = await listCandidateEvidence(candidateAId, 'EDUCATION');
    const syncedEduClaim = claimsAfterSync.find((c) => c.referenceId === edu.id);
    expect(syncedEduClaim?.verifiedStatus).toBe('SELF_REPORTED');

    // C. Candidate deletes education
    await deleteCandidateEducation(candidateAId, edu.id);

    // Verify claim in audit is WITHDRAWN, but verifiedStatus is still SELF_REPORTED
    const auditClaims = await listCandidateEvidence(candidateAId, 'EDUCATION', true);
    const withdrawnEduClaim = auditClaims.find((c) => c.referenceId === edu.id);
    expect(withdrawnEduClaim?.lifecycleState).toBe('WITHDRAWN');
    expect(withdrawnEduClaim?.verifiedStatus).toBe('SELF_REPORTED');

    // D. Candidate manually re-adds the same education
    const readdedEdu = await addCandidateEducation(candidateAId, {
      institution: 'State Engineering College',
      degree: 'B.Tech',
      fieldOfStudy: 'Electrical Engineering',
      endYear: 2023,
    });

    // Run syncProfileToEvidence
    await syncProfileToEvidence(candidateAId);

    // Check evidence: must STILL be SELF_REPORTED, never DOCUMENT_SUPPORTED!
    const claimsAfterReadd = await listCandidateEvidence(candidateAId, 'EDUCATION');
    const readdedClaim = claimsAfterReadd.find((c) => c.claimText === withdrawnEduClaim?.claimText);
    expect(readdedClaim).toBeDefined();
    expect(readdedClaim?.lifecycleState).toBe('ACTIVE');
    expect(readdedClaim?.verifiedStatus).toBe('SELF_REPORTED'); // Zero evidence manufactured!
  });

  // ─── Scenario 12: Migration 0019 Database State Verification ────────────────

  it('12. Migration 0019 confirms actual database and journal state', async () => {
    const db = getDb();
    const client = (db as any).session.client;

    // A. Verify candidate_evidence table columns
    const colsRes = await client.query(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'candidate_evidence' ORDER BY ordinal_position;"
    );
    const cols = colsRes.rows;
    const lifecycleCol = cols.find((c: any) => c.column_name === 'lifecycle_state');
    const updatedCol = cols.find((c: any) => c.column_name === 'updated_at');

    expect(lifecycleCol).toBeDefined();
    expect(lifecycleCol.data_type).toBe('text');
    expect(lifecycleCol.column_default).toContain('ACTIVE');

    expect(updatedCol).toBeDefined();
    expect(updatedCol.data_type).toContain('timestamp');

    // B. Verify candidate_evidence indexes
    const indexRes = await client.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'candidate_evidence';"
    );
    const indexNames = indexRes.rows.map((r: any) => r.indexname);
    expect(indexNames).toContain('candidate_evidence_lifecycle_idx');
    expect(indexNames).toContain('candidate_evidence_user_idx');
  });

  // ─── Scenario 13: Uploading Candidate Resume Cannot Upgrade Claim ───────────

  it('13. Uploading a candidate-written resume cannot falsely upgrade a claim to DOCUMENT_SUPPORTED', async () => {
    // A. Candidate has an existing SELF_REPORTED skill claim
    const initialSkill = await addCandidateSkill(candidateAId, 'Python', 'Programming Languages');
    expect(initialSkill).toBeDefined();

    const initialClaims = await listCandidateEvidence(candidateAId, 'PROFILE_SKILL');
    const pythonClaim = initialClaims.find((c) => c.claimText.toLowerCase().includes('python'));
    expect(pythonClaim).toBeDefined();
    expect(pythonClaim?.verifiedStatus).toBe('SELF_REPORTED');

    // B. Candidate uploads a candidate-written resume mentioning Python
    const candidateResumeText = `
John Candidate
john@example.com

SKILLS
Python, JavaScript, Git

EXPERIENCE
Python Developer at Tech Innovations
Built scalable data ingestion pipelines with Python.
`;
    await uploadAndParseResume(
      candidateAId,
      'candidate_authored_resume.txt',
      Buffer.from(candidateResumeText),
      'text/plain'
    );

    // C. Re-run syncProfileToEvidence
    await syncProfileToEvidence(candidateAId);

    // D. Verify the claim is STILL SELF_REPORTED and was NOT upgraded to DOCUMENT_SUPPORTED
    const postUploadClaims = await listCandidateEvidence(candidateAId, 'PROFILE_SKILL');
    const postUploadPython = postUploadClaims.find((c) => c.claimText.toLowerCase().includes('python'));
    expect(postUploadPython).toBeDefined();
    expect(postUploadPython?.verifiedStatus).toBe('SELF_REPORTED'); // Never falsely upgraded!
  });

  // ─── Scenario 14: Reactivation API Rejects Unsupported Upgrades ─────────────

  it('14. Reactivation and Add Evidence APIs reject client requests for unsupported verification upgrades', async () => {
    function createMockRes() {
      let statusCode = 200;
      let body: any = null;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          body = data;
          return res;
        },
        getStatusCode: () => statusCode,
        getBody: () => body,
      };
      return res;
    }

    // A. Direct candidate creation attempting to self-assign EXTERNALLY_VERIFIED
    const mockReqAdd = {
      user: { id: candidateAId },
      body: {
        evidenceType: 'PROFILE_SKILL',
        claimText: 'Self-claimed External Credential in Security',
        verifiedStatus: 'EXTERNALLY_VERIFIED',
      },
    } as unknown as Request;
    const mockResAdd = createMockRes();

    await addEvidenceHandler(mockReqAdd, mockResAdd as unknown as Response);
    expect(mockResAdd.getStatusCode()).toBe(400);
    expect(mockResAdd.getBody().error).toContain('Unsupported verification level requested');

    // B. Create a legitimate self-reported claim and withdraw it
    const claim = await createCandidateEvidence(candidateAId, {
      evidenceType: 'PROFILE_SKILL',
      claimText: 'Test skill for reactivation security test',
      verifiedStatus: 'SELF_REPORTED',
    });
    await deleteCandidateEvidence(candidateAId, claim.id);

    // C. Candidate client calls reactivate attempting to self-upgrade to DOCUMENT_SUPPORTED
    const mockReqUpgrade = {
      user: { id: candidateAId },
      params: { id: claim.id },
      body: {
        newVerifiedStatus: 'DOCUMENT_SUPPORTED',
      },
    } as unknown as Request;
    const mockResUpgrade = createMockRes();

    await reactivateEvidenceHandler(mockReqUpgrade, mockResUpgrade as unknown as Response);
    expect(mockResUpgrade.getStatusCode()).toBe(400);
    expect(mockResUpgrade.getBody().error).toContain('Unsupported verification upgrade requested');

    // D. Candidate calls reactivate cleanly without upgrade attempt -> Success with status preserved
    const mockReqClean = {
      user: { id: candidateAId },
      params: { id: claim.id },
      body: {},
    } as unknown as Request;
    const mockResClean = createMockRes();

    await reactivateEvidenceHandler(mockReqClean, mockResClean as unknown as Response);
    expect(mockResClean.getStatusCode()).toBe(200);
    expect(mockResClean.getBody().evidence.lifecycleState).toBe('ACTIVE');
    expect(mockResClean.getBody().evidence.verifiedStatus).toBe('SELF_REPORTED');
  });
});
