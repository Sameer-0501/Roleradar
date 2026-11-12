/**
 * Stage 2: Runtime Engine 2 + Engine 3 Acceptance Verification Script.
 *
 * Implements RR-ENG2-ENG3-STAGE2-INTEGRATION-V1 Section 9:
 * Validates real runtime execution against PostgreSQL:
 * 1. Runtime engine consumes candidate_evidence.
 * 2. Requirement results match underlying evidence.
 * 3. Verification levels remain visible and accurate.
 * 4. Withdrawn claims do not support the evaluation.
 * 5. Clarifications do not become evidence.
 * 6. Reevaluation reflects evidence changes.
 * 7. Existing Engine 2 behavior remains functional.
 */

import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  getProofBasedJobFit,
  updateProofFitControls,
} from '../matching/proof-based-fit-service.js';

interface AcceptanceResult {
  step: string;
  status: 'PASSED' | 'FAILED';
  details: string;
}

async function runRuntimeAcceptance(): Promise<void> {
  const db = getDb();
  const results: AcceptanceResult[] = [];

  const candidateId = 'd1111111-2222-4333-8444-555555555555';
  const companyId = 'd2222222-3333-4444-8555-666666666666';
  const jobId = 'd3333333-4444-4555-8666-777777777777';

  console.log('\n================================================================');
  console.log(' ROLE-RADAR STAGE 2: RUNTIME ENGINE 2 + ENGINE 3 ACCEPTANCE');
  console.log('================================================================\n');

  try {
    // ── Teardown any leftover test data
    await cleanup(db, candidateId, companyId, jobId);

    // ── 1. Seed Company & Candidate
    await db.insert(schema.companies).values({
      id: companyId,
      name: 'Runtime Acceptance Systems Corp',
      official_domain: 'careers.runtime-acceptance.test',
      careers_url: 'https://careers.runtime-acceptance.test',
      ats_type: 'WORKDAY',
      is_active: true,
    });

    await db.insert(schema.users).values({
      id: candidateId,
      email: 'runtime.candidate@stage2.test',
      name: 'Runtime Synthetic Candidate',
      is_active: true,
    });

    await db.insert(schema.candidateProfiles).values({
      user_id: candidateId,
      headline: 'Full Stack Cloud Engineer',
      experience_level: 'MID',
      total_experience_months: 24,
    });

    // ── 2. Seed Verified Job
    await db.insert(schema.jobs).values({
      id: jobId,
      company_id: companyId,
      source_system: 'WORKDAY',
      external_job_id: 'REQ-RUNTIME-ST2-01',
      title: 'Full Stack Cloud Engineer',
      location: 'Bangalore, India',
      workplace_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.runtime-acceptance.test/job/REQ-RUNTIME-ST2-01',
      apply_url: 'https://careers.runtime-acceptance.test/job/REQ-RUNTIME-ST2-01/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'Build production services using TypeScript and React Native. Containerized with Docker. Cloud hosted on AWS.',
      requirements:
        'Qualifications: Bachelor degree in Computer Science or related field. Required proficiency: TypeScript, React Native, and Docker. Preferred: AWS certification.',
      content_hash: 'hash-runtime-st2-job-01',
    });

    // ── 3. Seed Candidate Evidence (Engine 3)
    // 3a. Active DOCUMENT_SUPPORTED skill: TypeScript
    const [evTs] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Demonstrated proficiency in TypeScript',
        verified_status: 'DOCUMENT_SUPPORTED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    // 3b. Active SELF_REPORTED skill: React (Adjacent to React Native)
    const [evReact] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Demonstrated proficiency in React',
        verified_status: 'SELF_REPORTED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    // 3c. Active EXTERNALLY_VERIFIED certification: AWS
    const [evAws] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateId,
        evidence_type: 'CERTIFICATION',
        claim_text: 'AWS Certified Solutions Architect Associate (Issuer: Amazon Web Services)',
        verified_status: 'EXTERNALLY_VERIFIED',
        lifecycle_state: 'ACTIVE',
      })
      .returning();

    // 3d. Withdrawn skill: Docker
    const [evDocker] = await db
      .insert(schema.candidateEvidence)
      .values({
        user_id: candidateId,
        evidence_type: 'PROFILE_SKILL',
        claim_text: 'Demonstrated proficiency in Docker',
        verified_status: 'SELF_REPORTED',
        lifecycle_state: 'WITHDRAWN',
      })
      .returning();

    console.log('[Setup Complete]');
    console.log(`- Candidate UUID: ${candidateId}`);
    console.log(`- Job UUID:       ${jobId}`);
    console.log(`- Evidence Seeded: 4 records (1 DOCUMENT_SUPPORTED, 1 SELF_REPORTED, 1 EXTERNALLY_VERIFIED, 1 WITHDRAWN)\n`);

    // ── Step 1: Execute Runtime Engine 2 Proof-Based Fit Evaluation
    console.log('[Step 1: Evaluating Initial Proof-Based Fit]');
    const analysis1 = await getProofBasedJobFit(candidateId, jobId);

    // Verify 1a: TypeScript is SUPPORTED via DOCUMENT_SUPPORTED
    const evalTs = analysis1.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'typescript');
    const step1a =
      evalTs?.assessmentState === 'SUPPORTED' &&
      evalTs?.evidenceVerificationLevel === 'DOCUMENT_SUPPORTED' &&
      evalTs?.evidenceId === evTs!.id;
    results.push({
      step: '1a. Active DOCUMENT_SUPPORTED Evidence Matching',
      status: step1a ? 'PASSED' : 'FAILED',
      details: `TypeScript state: ${evalTs?.assessmentState}, Level: ${evalTs?.evidenceVerificationLevel}, ID: ${evalTs?.evidenceId}`,
    });

    // Verify 1b: React Native is PARTIALLY_SUPPORTED via adjacent React
    const evalRn = analysis1.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'react native');
    const step1b =
      evalRn?.assessmentState === 'PARTIALLY_SUPPORTED' &&
      evalRn?.evidenceVerificationLevel === 'SELF_REPORTED' &&
      evalRn?.evidenceId === evReact!.id;
    results.push({
      step: '1b. Transferable Adjacent Technology Matching',
      status: step1b ? 'PASSED' : 'FAILED',
      details: `React Native state: ${evalRn?.assessmentState}, Adjacent evidence: ${evalRn?.evidenceSummary}`,
    });

    // Verify 1c: Docker is NOT_SUPPORTED (Withdrawn claim must NOT support)
    const evalDocker = analysis1.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'docker');
    const step1c =
      evalDocker?.assessmentState === 'NOT_SUPPORTED' && evalDocker?.evidenceVerificationLevel === undefined;
    results.push({
      step: '1c. Withdrawn Evidence Exclusion',
      status: step1c ? 'PASSED' : 'FAILED',
      details: `Docker state: ${evalDocker?.assessmentState}, Level: ${evalDocker?.evidenceVerificationLevel ?? 'none'}`,
    });

    // Verify 1d: Education is UNKNOWN (Missing profile data, not false rejection)
    const evalEdu = analysis1.mandatoryEvaluations.find((e) => e.category === 'EDUCATION');
    const step1d =
      evalEdu?.assessmentState === 'UNKNOWN' &&
      analysis1.unknownItems.some((u) => u.requirementId === evalEdu?.id) &&
      analysis1.eligibilityBlockers.length === 0;
    results.push({
      step: '1d. Missing Profile Information Produces UNKNOWN',
      status: step1d ? 'PASSED' : 'FAILED',
      details: `Education state: ${evalEdu?.assessmentState}, Action prompt: ${analysis1.unknownItems[0]?.actionPrompt}`,
    });

    // Verify 1e: AWS is SUPPORTED via EXTERNALLY_VERIFIED in Preferred Qualifications
    const evalAws = analysis1.preferredEvaluations.find(
      (e) => e.extractedCriterion.toLowerCase() === 'aws' || e.extractedCriterion.toLowerCase() === 'amazon web services'
    );
    const step1e =
      evalAws?.assessmentState === 'SUPPORTED' &&
      evalAws?.evidenceVerificationLevel === 'EXTERNALLY_VERIFIED' &&
      evalAws?.evidenceId === evAws!.id;
    results.push({
      step: '1e. Preferred EXTERNALLY_VERIFIED Evidence Matching',
      status: step1e ? 'PASSED' : 'FAILED',
      details: `AWS state: ${evalAws?.assessmentState}, Level: ${evalAws?.evidenceVerificationLevel}`,
    });

    // ── Step 2: Test Dispute & Candidate Clarification Isolation
    console.log('[Step 2: Submitting Candidate Clarification on Docker]');
    const beforeEvidenceCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.candidateEvidence)
      .where(eq(schema.candidateEvidence.user_id, candidateId));

    const analysis2 = await updateProofFitControls(candidateId, jobId, {
      suppliedClarifications: [
        {
          requirementId: evalDocker!.id,
          clarification: 'Completed production Docker orchestration course and production migration',
          value: 'Docker Containerization Hands-On Experience',
        },
      ],
    });

    const afterEvidenceCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.candidateEvidence)
      .where(eq(schema.candidateEvidence.user_id, candidateId));

    const evalDockerAfterClarification = analysis2.mandatoryEvaluations.find((e) => e.id === evalDocker!.id);
    const step2Passed =
      evalDockerAfterClarification?.assessmentState === 'NOT_SUPPORTED' &&
      evalDockerAfterClarification?.evidenceSource === undefined &&
      evalDockerAfterClarification?.evidenceVerificationLevel === undefined &&
      evalDockerAfterClarification?.candidateClarification === 'Completed production Docker orchestration course and production migration' &&
      Number(afterEvidenceCount[0]?.count) === Number(beforeEvidenceCount[0]?.count);

    results.push({
      step: '2. Candidate Clarification Isolation & Non-Promotion to Evidence',
      status: step2Passed ? 'PASSED' : 'FAILED',
      details: `Docker state: ${evalDockerAfterClarification?.assessmentState} (expected NOT_SUPPORTED), Source: ${evalDockerAfterClarification?.evidenceSource ?? 'none'}, Verification level: ${evalDockerAfterClarification?.evidenceVerificationLevel ?? 'none (not upgraded)'}, Clarification recorded: "${evalDockerAfterClarification?.candidateClarification}", Evidence count delta: 0`,
    });

    // ── Step 3: Test Dynamic Re-evaluation on Evidence Update
    console.log('[Step 3: Reactivating Docker with DOCUMENT_SUPPORTED in Evidence Vault]');
    await db
      .update(schema.candidateEvidence)
      .set({
        lifecycle_state: 'ACTIVE',
        verified_status: 'DOCUMENT_SUPPORTED',
        updated_at: new Date(),
      })
      .where(eq(schema.candidateEvidence.id, evDocker!.id));

    // Also clear user clarification so active evidence is evaluated
    await db
      .delete(schema.userJobInteractions)
      .where(and(eq(schema.userJobInteractions.user_id, candidateId), eq(schema.userJobInteractions.job_id, jobId)));

    const analysis3 = await getProofBasedJobFit(candidateId, jobId);
    const evalDockerFinal = analysis3.mandatoryEvaluations.find((e) => e.extractedCriterion.toLowerCase() === 'docker');

    const step3Passed =
      evalDockerFinal?.assessmentState === 'SUPPORTED' &&
      evalDockerFinal?.evidenceVerificationLevel === 'DOCUMENT_SUPPORTED' &&
      evalDockerFinal?.evidenceId === evDocker!.id;

    results.push({
      step: '3. Evidence Vault Reactivation & Dynamic Re-evaluation',
      status: step3Passed ? 'PASSED' : 'FAILED',
      details: `Docker state: ${evalDockerFinal?.assessmentState}, Level: ${evalDockerFinal?.evidenceVerificationLevel}, ID: ${evalDockerFinal?.evidenceId}`,
    });

    // ── Step 4: Verification of Database State & Invariants
    console.log('[Step 4: Inspecting Final Database State]');
    const finalEvidence = await db
      .select({
        id: schema.candidateEvidence.id,
        evidenceType: schema.candidateEvidence.evidence_type,
        claimText: schema.candidateEvidence.claim_text,
        verifiedStatus: schema.candidateEvidence.verified_status,
        lifecycleState: schema.candidateEvidence.lifecycle_state,
      })
      .from(schema.candidateEvidence)
      .where(eq(schema.candidateEvidence.user_id, candidateId));

    console.log('\nFinal Candidate Evidence in Database:');
    console.table(finalEvidence);

    console.log('\nRuntime Acceptance Summary:');
    console.table(results);

    const allPassed = results.every((r) => r.status === 'PASSED');
    if (allPassed) {
      console.log('\n>>> ALL 7 RUNTIME ACCEPTANCE GATES PASSED (100%) <<<\n');
    } else {
      console.error('\n>>> SOME RUNTIME ACCEPTANCE GATES FAILED <<<\n');
      process.exit(1);
    }
  } finally {
    await cleanup(db, candidateId, companyId, jobId);
  }
}

async function cleanup(db: any, candidateId: string, companyId: string, jobId: string): Promise<void> {
  await db.delete(schema.userJobInteractions).where(eq(schema.userJobInteractions.user_id, candidateId));
  await db.delete(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, candidateId));
  await db.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.user_id, candidateId));
  await db.delete(schema.users).where(eq(schema.users.id, candidateId));
  await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
}

runRuntimeAcceptance()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Runtime acceptance failed with error:', err);
    process.exit(1);
  });

