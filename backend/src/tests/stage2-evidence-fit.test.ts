/**
 * Stage 2: Engine 2 (Proof-Based Job Fit) + Engine 3 (Master Career Evidence Profile)
 * Comprehensive Evidence Integration Test Suite.
 *
 * Implements RR-ENG2-ENG3-STAGE2-INTEGRATION-V1 per Section 8 Requirements:
 *  1. Active SELF_REPORTED skill matching
 *  2. DOCUMENT_SUPPORTED evidence matching
 *  3. EXTERNALLY_VERIFIED evidence matching
 *  4. Partial requirement support (transferable adjacent skills)
 *  5. Missing candidate information producing UNKNOWN (never false rejection)
 *  6. Explicitly unmet mandatory requirement producing HARD_ELIGIBILITY_CONCERN
 *  7. Preferred requirements not treated as mandatory (no false blockers)
 *  8. Withdrawn evidence excluded from fit evaluation
 *  9. Reactivated evidence included correctly
 * 10. Verification-level changes reflected in evaluation explanations
 * 11. Duplicate legacy/evidence claims not double-counted
 * 12. Conflicting legacy and evidence records handled safely (withdrawn evidence takes precedence)
 * 13. Disputes and clarifications never promoted to evidence
 * 14. Candidate isolation and authorization
 * 15. Existing Engine 2 regression behavior preserved (pure legacy fallback)
 * 16. Evidence updates trigger correct reevaluation
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  evaluateProofBasedJobFit,
  getProofBasedJobFit,
  updateProofFitControls,
} from '../matching/proof-based-fit-service.js';

describe('Stage 2: Engine 2 + Engine 3 Evidence Integration Suite', () => {
  const db = getDb();

  // Synthetic Test UUIDs (isolated and safe for teardown)
  const candidateAId = 'a1111111-1111-4111-8111-111111111111';
  const candidateBId = 'b2222222-2222-4222-8222-222222222222';
  const legacyCandidateId = 'c4444444-4444-4444-8444-444444444444';

  const companyId = 'e5555555-5555-4555-8555-555555555555';
  const fullstackJobId = 'f6666666-6666-4666-8666-666666666666';
  const seniorArchJobId = 'f7777777-7777-4777-8777-777777777777';
  const mobileJobId = 'f8888888-8888-4888-8888-888888888888';

  beforeAll(async () => {
    await cleanup();

    // 1. Seed Synthetic Company
    await db.insert(schema.companies).values({
      id: companyId,
      name: 'Stage 2 Integration Enterprise',
      official_domain: 'careers.stage2-enterprise.test',
      careers_url: 'https://careers.stage2-enterprise.test',
      ats_type: 'WORKDAY',
      is_active: true,
    });

    // 2. Seed Synthetic Users
    await db.insert(schema.users).values([
      {
        id: candidateAId,
        email: 'candidateA.stage2@roleradar.test',
        name: 'Synthetic Candidate A',
        is_active: true,
      },
      {
        id: candidateBId,
        email: 'candidateB.stage2@roleradar.test',
        name: 'Synthetic Candidate B',
        is_active: true,
      },
      {
        id: legacyCandidateId,
        email: 'candidateLegacy.stage2@roleradar.test',
        name: 'Synthetic Legacy Candidate',
        is_active: true,
      },
    ]);

    // Candidate A Profile: Fresher job seeker
    await db.insert(schema.candidateProfiles).values([
      {
        user_id: candidateAId,
        headline: 'Aspiring Full Stack Engineer',
        experience_level: 'FRESHER',
        total_experience_months: 0,
      },
      {
        user_id: candidateBId,
        headline: 'Junior Developer',
        experience_level: 'FRESHER',
        total_experience_months: 0,
      },
      {
        user_id: legacyCandidateId,
        headline: 'Legacy Pure Profile Developer',
        experience_level: 'MID',
        total_experience_months: 36,
      },
    ]);

    // 3. Seed Synthetic Jobs
    // Job 1: Fullstack Engineer (Mandatory: TypeScript, Node.js, PostgreSQL; Preferred: AWS, Next.js)
    await db.insert(schema.jobs).values({
      id: fullstackJobId,
      company_id: companyId,
      source_system: 'WORKDAY',
      external_job_id: 'REQ-ST2-FS-01',
      title: 'Full Stack Engineer (TypeScript / Node.js)',
      location: 'Bangalore, India',
      workplace_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.stage2-enterprise.test/job/REQ-ST2-FS-01',
      apply_url: 'https://careers.stage2-enterprise.test/job/REQ-ST2-FS-01/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Build robust cloud applications with TypeScript and Node.js. Knowledge of PostgreSQL required.',
      requirements:
        'Qualifications: Bachelor degree in Computer Science. Required proficiency: TypeScript, Node.js, and PostgreSQL. Preferred: Experience with AWS and Next.js.',
      content_hash: 'hash-stage2-job-fs-01',
    });

    // Job 2: Lead Distributed Systems Architect (5+ years required, Go, Kubernetes)
    await db.insert(schema.jobs).values({
      id: seniorArchJobId,
      company_id: companyId,
      source_system: 'WORKDAY',
      external_job_id: 'REQ-ST2-SR-01',
      title: 'Lead Distributed Systems Architect',
      location: 'Hyderabad, India',
      workplace_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.stage2-enterprise.test/job/REQ-ST2-SR-01',
      apply_url: 'https://careers.stage2-enterprise.test/job/REQ-ST2-SR-01/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Architect high-throughput distributed backends. Requires 5+ years of experience.',
      requirements:
        'Qualifications: 5+ years experience building distributed backends. Expertise in Go, Kubernetes, and Docker.',
      content_hash: 'hash-stage2-job-sr-01',
    });

    // Job 3: Mobile Engineer (Requires React Native)
    await db.insert(schema.jobs).values({
      id: mobileJobId,
      company_id: companyId,
      source_system: 'WORKDAY',
      external_job_id: 'REQ-ST2-MOB-01',
      title: 'Mobile Engineer (React Native)',
      location: 'Bangalore, India',
      workplace_type: 'REMOTE',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.stage2-enterprise.test/job/REQ-ST2-MOB-01',
      apply_url: 'https://careers.stage2-enterprise.test/job/REQ-ST2-MOB-01/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Develop iOS and Android apps using React Native.',
      requirements: 'Qualifications: Strong proficiency in React Native.',
      content_hash: 'hash-stage2-job-mob-01',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  async function cleanup(): Promise<void> {
    const userIds = [candidateAId, candidateBId, legacyCandidateId];
    const jobIds = [fullstackJobId, seniorArchJobId, mobileJobId];

    for (const uid of userIds) {
      await db.delete(schema.userJobInteractions).where(eq(schema.userJobInteractions.user_id, uid));
      await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, uid));
      await db.delete(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, uid));
      await db.delete(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, uid));
      await db.delete(schema.candidateProjects).where(eq(schema.candidateProjects.user_id, uid));
      await db.delete(schema.candidateExperiences).where(eq(schema.candidateExperiences.user_id, uid));
      await db.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.user_id, uid));
      await db.delete(schema.candidateCareerProfiles).where(eq(schema.candidateCareerProfiles.user_id, uid));
      await db.delete(schema.users).where(eq(schema.users.id, uid));
    }

    for (const jid of jobIds) {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, jid));
    }
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
  }

  // ── Scenario 1: Active SELF_REPORTED skill matching ───────────────────────
  it('Scenario 1: Evaluates active SELF_REPORTED skill evidence as SUPPORTED with explicit verification disclosure', async () => {
    // Candidate A adds SELF_REPORTED evidence for TypeScript
    const [inserted] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateAId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Demonstrated proficiency in TypeScript',
        verified_status: 'SELF_REPORTED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const tsEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'typescript');

    expect(tsEval).toBeDefined();
    expect(tsEval?.assessmentState).toBe('SUPPORTED');
    expect(tsEval?.evidenceVerificationLevel).toBe('SELF_REPORTED');
    expect(tsEval?.evidenceSource).toBe('PROFILE_SKILL');
    expect(tsEval?.evidenceId).toBe(inserted!.id);
    expect(tsEval?.evidenceSummary).toContain('[SELF_REPORTED]');
  });

  // ── Scenario 2: DOCUMENT_SUPPORTED evidence matching ──────────────────────
  it('Scenario 2: Evaluates DOCUMENT_SUPPORTED evidence as SUPPORTED with DOCUMENT_SUPPORTED verification level', async () => {
    // Candidate A adds DOCUMENT_SUPPORTED evidence for Node.js
    const [inserted] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateAId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Demonstrated proficiency in Node.js',
        verified_status: 'DOCUMENT_SUPPORTED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const nodeEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'node.js');

    expect(nodeEval).toBeDefined();
    expect(nodeEval?.assessmentState).toBe('SUPPORTED');
    expect(nodeEval?.evidenceVerificationLevel).toBe('DOCUMENT_SUPPORTED');
    expect(nodeEval?.evidenceId).toBe(inserted!.id);
    expect(nodeEval?.evidenceSummary).toContain('[DOCUMENT_SUPPORTED]');
  });

  // ── Scenario 3: EXTERNALLY_VERIFIED evidence matching ─────────────────────
  it('Scenario 3: Evaluates EXTERNALLY_VERIFIED certification evidence as SUPPORTED with EXTERNALLY_VERIFIED disclosure', async () => {
    // Candidate A adds EXTERNALLY_VERIFIED certification for AWS
    const [inserted] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateAId,
        evidence_type: 'CERTIFICATION',
        claim_text: 'AWS Certified Solutions Architect Associate (Issuer: Amazon Web Services)',
        verified_status: 'EXTERNALLY_VERIFIED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const awsEval = analysis.preferredEvaluations.find(
      (e) => e.extractedCriterion.toLowerCase() === 'aws' || e.extractedCriterion.toLowerCase() === 'amazon web services'
    );

    expect(awsEval).toBeDefined();
    expect(awsEval?.assessmentState).toBe('SUPPORTED');
    expect(awsEval?.evidenceVerificationLevel).toBe('EXTERNALLY_VERIFIED');
    expect(awsEval?.evidenceSource).toBe('CERTIFICATION');
    expect(awsEval?.evidenceId).toBe(inserted!.id);
    expect(awsEval?.evidenceSummary).toContain('[EXTERNALLY_VERIFIED]');
  });

  // ── Scenario 4: Partial requirement support via adjacent tech ─────────────
  it('Scenario 4: Evaluates adjacent technology evidence as PARTIALLY_SUPPORTED with verification level', async () => {
    // Candidate A has React evidence; Job requires React Native (adjacent in ADJACENT_TECH_MAP)
    await db.insert(schema.candidateEvidence).values({
      user_id: candidateAId,
      evidence_type: 'PROFILE_SKILL',
      claim_text: 'Demonstrated proficiency in React',
      verified_status: 'DOCUMENT_SUPPORTED',
      lifecycle_state: 'ACTIVE',
    });

    const analysis = await getProofBasedJobFit(candidateAId, mobileJobId);
    const rnEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'react native');

    expect(rnEval).toBeDefined();
    expect(rnEval?.assessmentState).toBe('PARTIALLY_SUPPORTED');
    expect(rnEval?.evidenceVerificationLevel).toBe('DOCUMENT_SUPPORTED');
    expect(rnEval?.evidenceSummary).toContain('Transferable knowledge via adjacent technology evidence: React [DOCUMENT_SUPPORTED]');
  });

  // ── Scenario 5: Missing candidate information producing UNKNOWN ───────────
  it('Scenario 5: Produces UNKNOWN (never false rejection or concern) when candidate lacks education records', async () => {
    // Candidate A currently has no education records or evidence
    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const eduEval = analysis.mandatoryEvaluations.find((e) => e.category === 'EDUCATION');

    expect(eduEval).toBeDefined();
    expect(eduEval?.assessmentState).toBe('UNKNOWN');
    expect(analysis.unknownItems.some((u) => u.requirementId === eduEval?.id)).toBe(true);
    expect(analysis.eligibilityBlockers.some((b) => b.requirementId === eduEval?.id)).toBe(false);
  });

  // ── Scenario 6: Explicitly unmet mandatory requirement producing HARD_ELIGIBILITY_CONCERN
  it('Scenario 6: Produces HARD_ELIGIBILITY_CONCERN when a Fresher applies to a 5+ year requirement', async () => {
    const analysis = await getProofBasedJobFit(candidateAId, seniorArchJobId);
    const expEval = analysis.mandatoryEvaluations.find((e) => e.category === 'EXPERIENCE');

    expect(expEval).toBeDefined();
    expect(expEval?.assessmentState).toBe('HARD_ELIGIBILITY_CONCERN');
    expect(analysis.eligibilityBlockers.length).toBeGreaterThan(0);
    expect(analysis.overallEligibilityStatus).toBe('ELIGIBILITY_CONCERN_DETECTED');
  });

  // ── Scenario 7: Preferred requirements not treated as mandatory ────────────
  it('Scenario 7: Evaluates unmet preferred requirement as NOT_SUPPORTED without creating an eligibility blocker', async () => {
    // Job 1 has preferred skill Next.js; candidate A has no Next.js
    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const nextEval = analysis.preferredEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'next.js');

    expect(nextEval).toBeDefined();
    expect(nextEval?.assessmentState).toBe('NOT_SUPPORTED');
    // Must NOT be in eligibilityBlockers
    expect(analysis.eligibilityBlockers.some((b) => b.requirementId === nextEval?.id)).toBe(false);
    // Must be in learnableSkillGaps with importance PREFERRED
    const gap = analysis.learnableSkillGaps.find((g) => g.requirementId === nextEval?.id);
    expect(gap).toBeDefined();
    expect(gap?.importance).toBe('PREFERRED');
  });

  // ── Scenario 8: Withdrawn evidence excluded from fit evaluation ────────────
  it('Scenario 8: Excludes withdrawn evidence from fit evaluation and drops requirement to NOT_SUPPORTED', async () => {
    // Add active PostgreSQL evidence first
    const [pgEv] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateAId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Demonstrated proficiency in PostgreSQL',
        verified_status: 'SELF_REPORTED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    let analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    let pgEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'postgresql');
    expect(pgEval?.assessmentState).toBe('SUPPORTED');

    // Withdraw Candidate A's PostgreSQL claim
    await db
      .update(schema.candidateEvidence)
      .set({ lifecycle_state: 'WITHDRAWN', updated_at: new Date() })
      .where(eq(schema.candidateEvidence.id, pgEv!.id));

    analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    pgEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'postgresql');

    expect(pgEval).toBeDefined();
    expect(pgEval?.assessmentState).toBe('NOT_SUPPORTED');
    expect(pgEval?.evidenceVerificationLevel).toBeUndefined();
  });

  // ── Scenario 9: Reactivated evidence included correctly ───────────────────
  it('Scenario 9: Includes reactivated evidence in evaluation with preserved verification level', async () => {
    // Reactivate Candidate A's PostgreSQL claim
    await db
      .update(schema.candidateEvidence)
      .set({ lifecycle_state: 'ACTIVE', updated_at: new Date() })
      .where(
        and(
          eq(schema.candidateEvidence.user_id, candidateAId),
          sql`${schema.candidateEvidence.claim_text} ILIKE '%PostgreSQL%'`
        )
      );

    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const pgEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'postgresql');

    expect(pgEval).toBeDefined();
    expect(pgEval?.assessmentState).toBe('SUPPORTED');
    expect(pgEval?.evidenceVerificationLevel).toBe('SELF_REPORTED');
  });

  // ── Scenario 10: Verification-level changes reflected in evaluation ────────
  it('Scenario 10: Reflects verification-level upgrades immediately in requirement evaluation and summary', async () => {
    // Upgrade Candidate A's PostgreSQL claim from SELF_REPORTED to DOCUMENT_SUPPORTED
    await db
      .update(schema.candidateEvidence)
      .set({ verified_status: 'DOCUMENT_SUPPORTED', updated_at: new Date() })
      .where(
        and(
          eq(schema.candidateEvidence.user_id, candidateAId),
          sql`${schema.candidateEvidence.claim_text} ILIKE '%PostgreSQL%'`
        )
      );

    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const pgEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'postgresql');

    expect(pgEval).toBeDefined();
    expect(pgEval?.assessmentState).toBe('SUPPORTED');
    expect(pgEval?.evidenceVerificationLevel).toBe('DOCUMENT_SUPPORTED');
    expect(pgEval?.evidenceSummary).toContain('[DOCUMENT_SUPPORTED]');
  });

  // ── Scenario 11: Duplicate legacy/evidence claims not double-counted ──────
  it('Scenario 11: Emits exactly one evaluation for a skill present in both legacy candidate_skills and candidate_evidence', async () => {
    // Add PostgreSQL to legacy candidate_skills (it already exists in candidate_evidence as DOCUMENT_SUPPORTED)
    await db.insert(schema.candidateSkills).values({
      user_id: candidateAId,
      skill_name: 'PostgreSQL',
      canonical_name: 'PostgreSQL',
    });

    const analysis = await getProofBasedJobFit(candidateAId, fullstackJobId);
    const pgEvals = analysis.mandatoryEvaluations.filter((e) => e.extractedCriterion.toLowerCase() === 'postgresql');

    // Exactly one evaluation row; no double-counting
    expect(pgEvals.length).toBe(1);
    expect(pgEvals[0]?.assessmentState).toBe('SUPPORTED');
    expect(pgEvals[0]?.evidenceVerificationLevel).toBe('DOCUMENT_SUPPORTED');
  });

  // ── Scenario 12: Conflicting legacy and evidence records handled safely ────
  it('Scenario 12: Suppresses stale legacy records when corresponding claim is WITHDRAWN in candidate_evidence', async () => {
    // Candidate A has Docker in legacy candidate_skills
    await db.insert(schema.candidateSkills).values({
      user_id: candidateAId,
      skill_name: 'Docker',
      canonical_name: 'Docker',
    });

    // But in candidate_evidence, Docker is explicitly marked WITHDRAWN
    await db.insert(schema.candidateEvidence).values({
      user_id: candidateAId,
      evidence_type: 'PROFILE_SKILL',
      claim_text: 'Demonstrated proficiency in Docker',
      verified_status: 'SELF_REPORTED',
      lifecycle_state: 'WITHDRAWN',
    });

    const analysis = await getProofBasedJobFit(candidateAId, seniorArchJobId);
    const dockerEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'docker');

    expect(dockerEval).toBeDefined();
    // Withdrawn evidence must suppress legacy row; Docker is NOT supported
    expect(dockerEval?.assessmentState).toBe('NOT_SUPPORTED');
    expect(dockerEval?.evidenceVerificationLevel).toBeUndefined();
  });

  // ── Scenario 13: Disputes and clarifications never manufacture evidence ────
  it('Scenario 13a: Candidate clarifications on withdrawn evidence remain NOT_SUPPORTED without creating evidence rows or upgrading verification', async () => {
    // Dynamically resolve Docker requirement ID on Senior Job
    const analysisBefore = await getProofBasedJobFit(candidateAId, seniorArchJobId);
    const dockerReq = analysisBefore.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'docker');
    expect(dockerReq).toBeDefined();
    const dockerReqId = dockerReq!.id;

    const beforeEvidenceRows = await db
      .select()
      .from(schema.candidateEvidence)
      .where(eq(schema.candidateEvidence.user_id, candidateAId));

    const analysis = await updateProofFitControls(candidateAId, seniorArchJobId, {
      suppliedClarifications: [
        {
          requirementId: dockerReqId,
          clarification: 'Completed intensive containerization production deployment lab',
          value: 'Production Containerization Experience',
        },
      ],
    });

    const afterEvidenceRows = await db
      .select()
      .from(schema.candidateEvidence)
      .where(eq(schema.candidateEvidence.user_id, candidateAId));

    // INVARIANT 1: Zero rows added to candidate_evidence
    expect(afterEvidenceRows.length).toBe(beforeEvidenceRows.length);

    const dockerEval = analysis.mandatoryEvaluations.find((e) => e.id === dockerReqId);
    // INVARIANT 2: Clarification alone MUST NOT establish SUPPORTED or manufacture evidenceSource
    expect(dockerEval?.assessmentState).toBe('NOT_SUPPORTED');
    expect(dockerEval?.evidenceSource).toBeUndefined();
    // INVARIANT 3: No verification level upgrade fabricated
    expect(dockerEval?.evidenceVerificationLevel).toBeUndefined();
    // INVARIANT 4: Candidate agency preserved — clarification text is captured
    expect(dockerEval?.candidateClarification).toBe('Completed intensive containerization production deployment lab');
  });

  it('Scenario 13b: Candidate disputes on withdrawn evidence remain NOT_SUPPORTED without promoting verification', async () => {
    const analysisBefore = await getProofBasedJobFit(candidateAId, seniorArchJobId);
    const dockerReq = analysisBefore.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'docker');
    expect(dockerReq).toBeDefined();
    const dockerReqId = dockerReq!.id;

    const analysis = await updateProofFitControls(candidateAId, seniorArchJobId, {
      disputedRequirements: [
        {
          requirementId: dockerReqId,
          reason: 'Equivalent Practical / Open-Source Experience',
          candidateNote: 'Used containerization extensively in private homelab cluster',
        },
      ],
    });

    const dockerEval = analysis.mandatoryEvaluations.find((e) => e.id === dockerReqId);
    // INVARIANT 1: Dispute alone MUST NOT establish SUPPORTED or PARTIALLY_SUPPORTED
    expect(dockerEval?.assessmentState).toBe('NOT_SUPPORTED');
    expect(dockerEval?.evidenceVerificationLevel).toBeUndefined();
    // INVARIANT 2: Candidate agency preserved — dispute details are captured
    expect(dockerEval?.isDisputed).toBe(true);
    expect(dockerEval?.disputeReason).toBe('Equivalent Practical / Open-Source Experience');
    expect(dockerEval?.candidateNote).toBe('Used containerization extensively in private homelab cluster');
  });

  it('Scenario 13c: Missing profile info remains UNKNOWN with clarification recorded without promotion to SUPPORTED or demotion to NOT_SUPPORTED', async () => {
    // Candidate B has an empty profile (all unknown)
    const analysisBefore = await getProofBasedJobFit(candidateBId, fullstackJobId);
    const tsReq = analysisBefore.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'typescript');
    expect(tsReq).toBeDefined();
    expect(tsReq?.assessmentState).toBe('UNKNOWN');
    const tsReqId = tsReq!.id;

    const analysisAfter = await updateProofFitControls(candidateBId, fullstackJobId, {
      suppliedClarifications: [
        {
          requirementId: tsReqId,
          clarification: 'I have self-studied TypeScript for 6 months',
        },
      ],
    });

    const tsEvalAfter = analysisAfter.mandatoryEvaluations.find((e) => e.id === tsReqId);
    // INVARIANT 1: Missing information remains UNKNOWN (not silently changed to NOT_SUPPORTED, nor promoted to SUPPORTED)
    expect(tsEvalAfter?.assessmentState).toBe('UNKNOWN');
    expect(tsEvalAfter?.evidenceVerificationLevel).toBeUndefined();
    // INVARIANT 2: Clarification recorded
    expect(tsEvalAfter?.candidateClarification).toBe('I have self-studied TypeScript for 6 months');
  });

  it('Scenario 13d: Adding valid active evidence legitimately transitions requirement to SUPPORTED with correct verification level', async () => {
    // Candidate A adds valid active Docker evidence with DOCUMENT_SUPPORTED
    const [inserted] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateAId,
        evidence_type: 'PROJECT',
        claim_text: 'Designed and deployed Docker Compose and Kubernetes configurations for microservices',
        verified_status: 'DOCUMENT_SUPPORTED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    const analysis = await getProofBasedJobFit(candidateAId, seniorArchJobId);
    const dockerEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'docker');

    // INVARIANT: Legitimate active evidence establishes SUPPORTED with actual verification level and evidenceId
    expect(dockerEval?.assessmentState).toBe('SUPPORTED');
    expect(dockerEval?.evidenceVerificationLevel).toBe('DOCUMENT_SUPPORTED');
    expect(dockerEval?.evidenceId).toBe(inserted?.id);
    expect(dockerEval?.evidenceClaimTitle).toBe('Designed and deployed Docker Compose and Kubernetes configurations for microservices');

    // Clean up inserted evidence so downstream scenarios start from their intended baseline
    await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.id, inserted!.id));
  });

  // ── Scenario 14: Candidate isolation and authorization ────────────────────
  it('Scenario 14: Enforces strict candidate isolation — Candidate B receives independent evaluation without Candidate A evidence leakage', async () => {
    // Candidate A has Node.js and TypeScript active evidence
    // Candidate B has no evidence
    const analysisB = await getProofBasedJobFit(candidateBId, fullstackJobId);

    const tsEvalB = analysisB.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'typescript');
    const nodeEvalB = analysisB.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'node.js');

    expect(tsEvalB?.assessmentState).toBe('UNKNOWN');
    expect(nodeEvalB?.assessmentState).toBe('UNKNOWN');
    expect(tsEvalB?.evidenceId).toBeUndefined();
    expect(nodeEvalB?.evidenceId).toBeUndefined();
  });

  // ── Scenario 15: Existing Engine 2 regression behavior preserved ──────────
  it('Scenario 15: Pure legacy profiles evaluate cleanly with 100% backward compatibility and zero regressions', async () => {
    // Legacy candidate has only legacy candidate_skills and candidate_educations (zero candidate_evidence)
    await db.insert(schema.candidateSkills).values([
      {
        user_id: legacyCandidateId,
        skill_name: 'TypeScript',
        canonical_name: 'TypeScript',
      },
      {
        user_id: legacyCandidateId,
        skill_name: 'Node.js',
        canonical_name: 'Node.js',
      },
      {
        user_id: legacyCandidateId,
        skill_name: 'PostgreSQL',
        canonical_name: 'PostgreSQL',
      },
    ]);

    await db.insert(schema.candidateEducations).values({
      user_id: legacyCandidateId,
      degree: 'Bachelor of Technology',
      field_of_study: 'Computer Science and Engineering',
      institution: 'State Engineering College',
    });

    const analysis = await getProofBasedJobFit(legacyCandidateId, fullstackJobId);

    const tsEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'typescript');
    const nodeEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'node.js');
    const pgEval = analysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'postgresql');
    const eduEval = analysis.mandatoryEvaluations.find((e) => e.category === 'EDUCATION');

    expect(tsEval?.assessmentState).toBe('SUPPORTED');
    expect(nodeEval?.assessmentState).toBe('SUPPORTED');
    expect(pgEval?.assessmentState).toBe('SUPPORTED');
    expect(eduEval?.assessmentState).toBe('SUPPORTED');

    // Default legacy verification level is SELF_REPORTED
    expect(tsEval?.evidenceVerificationLevel).toBe('SELF_REPORTED');
    expect(eduEval?.evidenceVerificationLevel).toBe('SELF_REPORTED');
  });

  // ── Scenario 16: Evidence updates trigger correct reevaluation ────────────
  it('Scenario 16: Adding new evidence dynamically re-evaluates requirements to SUPPORTED on subsequent fit query', async () => {
    // Before: Candidate A does not have Go evidence; Go is NOT_SUPPORTED on Senior Job
    const beforeAnalysis = await getProofBasedJobFit(candidateAId, seniorArchJobId);
    const goEvalBefore = beforeAnalysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'go');
    expect(goEvalBefore?.assessmentState).toBe('NOT_SUPPORTED');

    // Add Go evidence
    const [inserted] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateAId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Demonstrated proficiency in Go',
        verified_status: 'DOCUMENT_SUPPORTED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    // After: Re-evaluate Senior Job
    const afterAnalysis = await getProofBasedJobFit(candidateAId, seniorArchJobId);
    const goEvalAfter = afterAnalysis.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'go');

    expect(goEvalAfter?.assessmentState).toBe('SUPPORTED');
    expect(goEvalAfter?.evidenceVerificationLevel).toBe('DOCUMENT_SUPPORTED');
    expect(goEvalAfter?.evidenceId).toBe(inserted!.id);
  });
});
