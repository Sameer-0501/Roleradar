/**
 * Career Evidence Vault Service — Engine 3.
 *
 * Implements the Master Career Evidence Profile repository per Blueprint Section 6.
 * Enforces:
 * 1. Strict User Isolation: Every query and mutation is scoped to user_id.
 * 2. Immutable Evidence Grounding: Claims are categorized and given verified statuses.
 * 3. Separate Lifecycle and Verification Dimensions:
 *    - lifecycle_state: 'ACTIVE' | 'WITHDRAWN' (governs inclusion in active profile/vault views)
 *    - verified_status: 'SELF_REPORTED' | 'DOCUMENT_SUPPORTED' | 'PROJECT_SUPPORTED' | 'ASSESSMENT_SUPPORTED' | 'EXTERNALLY_VERIFIED'
 *    - Withdrawal preserves historical verified_status.
 *    - Reactivation never degrades verification level and never unfaithfully upgrades without stronger proof.
 * 4. Bidirectional Sync: Structured skills, projects, and experiences sync to atomic evidence units.
 */

import { eq, and, desc, ne } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { calculateProfileCompleteness } from '../resume/completeness-calculator.js';

const log = createLogger('resumes:career-evidence');

export type EvidenceType =
  | 'PROJECT'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'CERTIFICATION'
  | 'PROFILE_SKILL'
  | 'ASSESSMENT';

export type VerifiedStatus =
  | 'SELF_REPORTED'
  | 'DOCUMENT_SUPPORTED'
  | 'PROJECT_SUPPORTED'
  | 'ASSESSMENT_SUPPORTED'
  | 'EXTERNALLY_VERIFIED'
  | 'WITHDRAWN'; // Retained for backward compatibility

export type LifecycleState = 'ACTIVE' | 'WITHDRAWN';

export const VERIFICATION_LEVEL_WEIGHT: Record<string, number> = {
  SELF_REPORTED: 1,
  PROJECT_SUPPORTED: 2,
  DOCUMENT_SUPPORTED: 3,
  ASSESSMENT_SUPPORTED: 4,
  EXTERNALLY_VERIFIED: 5,
};

export function getVerificationWeight(status: string | null | undefined): number {
  if (!status || status === 'WITHDRAWN') return 1;
  return VERIFICATION_LEVEL_WEIGHT[status] ?? 1;
}

/**
 * Resolves the highest legitimate verification status between current and incoming evidence.
 * Ensures verification history is never degraded and cannot be falsely upgraded without stronger proof.
 */
export function resolveVerificationStatus(
  currentStatus: string | null | undefined,
  incomingStatus: string | null | undefined
): VerifiedStatus {
  const safeCurrent = currentStatus === 'WITHDRAWN' ? 'SELF_REPORTED' : (currentStatus as VerifiedStatus) || 'SELF_REPORTED';
  const safeIncoming = incomingStatus === 'WITHDRAWN' ? 'SELF_REPORTED' : (incomingStatus as VerifiedStatus) || 'SELF_REPORTED';

  const currentWeight = getVerificationWeight(safeCurrent);
  const incomingWeight = getVerificationWeight(safeIncoming);

  if (incomingWeight > currentWeight) {
    return safeIncoming;
  }
  return safeCurrent;
}

export interface SyncEvidenceResult {
  syncedCount: number;
  updatedCount: number;
  alreadyUpToDateCount: number;
  totalActiveClaims: number;
}

export interface CareerProfileDto {
  id: string;
  userId: string;
  professionalHeadline: string | null;
  careerObjective: string | null;
  createdAt: string;
  updatedAt: string;
  evidenceStats: {
    totalClaims: number;
    skillsCount: number;
    projectsCount: number;
    experiencesCount: number;
    educationsCount: number;
    certificationsCount: number;
  };
}

export interface CandidateEvidenceDto {
  id: string;
  userId: string;
  evidenceType: EvidenceType;
  referenceId: string | null;
  claimText: string;
  verifiedStatus: VerifiedStatus;
  lifecycleState: LifecycleState;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEvidenceInput {
  evidenceType: EvidenceType;
  referenceId?: string | null;
  claimText: string;
  verifiedStatus?: VerifiedStatus;
  lifecycleState?: LifecycleState;
}

export interface UpdateEvidenceInput {
  claimText?: string;
  verifiedStatus?: VerifiedStatus;
  lifecycleState?: LifecycleState;
}

/**
 * Retrieves or lazily initializes the Master Career Evidence Profile for a user.
 */
export async function getOrCreateCareerProfile(userId: string): Promise<CareerProfileDto> {
  const db = getDb();

  let [profile] = await db
    .select()
    .from(schema.candidateCareerProfiles)
    .where(eq(schema.candidateCareerProfiles.user_id, userId))
    .limit(1);

  if (!profile) {
    // Check if legacy candidateProfile has a headline to seed with
    const [legacy] = await db
      .select({ headline: schema.candidateProfiles.headline, summary: schema.candidateProfiles.summary })
      .from(schema.candidateProfiles)
      .where(eq(schema.candidateProfiles.user_id, userId))
      .limit(1);

    const [inserted] = await db
      .insert(schema.candidateCareerProfiles)
      .values({
        user_id: userId,
        professional_headline: legacy?.headline || 'Software Engineer',
        career_objective: legacy?.summary || 'Building robust, production-grade applications.',
      })
      .returning();

    profile = inserted!;
    log.info({ userId, profileId: profile.id }, 'INITIALIZED_CAREER_PROFILE');
  }

  // Ensure initial sync of evidence from structured tables
  await syncProfileToEvidence(userId);

  // Compute statistics for active, currently supported evidence (excluding WITHDRAWN)
  const evidenceRows = await db
    .select()
    .from(schema.candidateEvidence)
    .where(
      and(
        eq(schema.candidateEvidence.user_id, userId),
        ne(schema.candidateEvidence.lifecycle_state, 'WITHDRAWN'),
        ne(schema.candidateEvidence.verified_status, 'WITHDRAWN')
      )
    );

  const stats = {
    totalClaims: evidenceRows.length,
    skillsCount: evidenceRows.filter((e) => e.evidence_type === 'PROFILE_SKILL').length,
    projectsCount: evidenceRows.filter((e) => e.evidence_type === 'PROJECT').length,
    experiencesCount: evidenceRows.filter((e) => e.evidence_type === 'EXPERIENCE').length,
    educationsCount: evidenceRows.filter((e) => e.evidence_type === 'EDUCATION').length,
    certificationsCount: evidenceRows.filter((e) => e.evidence_type === 'CERTIFICATION').length,
  };

  return {
    id: profile.id,
    userId: profile.user_id,
    professionalHeadline: profile.professional_headline,
    careerObjective: profile.career_objective,
    createdAt: profile.created_at.toISOString(),
    updatedAt: profile.updated_at.toISOString(),
    evidenceStats: stats,
  };
}

/**
 * Updates the candidate career profile headline and career objective.
 */
export async function updateCareerProfile(
  userId: string,
  data: { professionalHeadline?: string; careerObjective?: string }
): Promise<CareerProfileDto> {
  const db = getDb();
  await getOrCreateCareerProfile(userId);

  await db
    .update(schema.candidateCareerProfiles)
    .set({
      professional_headline: data.professionalHeadline !== undefined ? data.professionalHeadline : undefined,
      career_objective: data.careerObjective !== undefined ? data.careerObjective : undefined,
      updated_at: new Date(),
    })
    .where(eq(schema.candidateCareerProfiles.user_id, userId));

  return getOrCreateCareerProfile(userId);
}

/**
 * Lists atomic evidence items for a user, optionally filtered by evidenceType.
 * By default, excludes WITHDRAWN claims so invalidated claims are not presented as active.
 * Set `includeWithdrawn = true` for historical audit / forensic provenance inspection.
 * Safely handles null or unexpected status values from existing records.
 */
export async function listCandidateEvidence(
  userId: string,
  evidenceType?: EvidenceType,
  includeWithdrawn: boolean = false
): Promise<CandidateEvidenceDto[]> {
  const db = getDb();

  const conditions = [eq(schema.candidateEvidence.user_id, userId)];
  if (evidenceType) {
    conditions.push(eq(schema.candidateEvidence.evidence_type, evidenceType));
  }
  if (!includeWithdrawn) {
    // Exclude claims where lifecycle_state is 'WITHDRAWN' or legacy verified_status is 'WITHDRAWN'
    conditions.push(ne(schema.candidateEvidence.lifecycle_state, 'WITHDRAWN'));
    conditions.push(ne(schema.candidateEvidence.verified_status, 'WITHDRAWN'));
  }

  const query = db
    .select()
    .from(schema.candidateEvidence)
    .where(and(...conditions))
    .orderBy(desc(schema.candidateEvidence.created_at));

  const rows = await query;
  return rows.map((r) => {
    const isWithdrawn = r.lifecycle_state === 'WITHDRAWN' || r.verified_status === 'WITHDRAWN';
    const cleanVerifiedStatus: VerifiedStatus =
      r.verified_status && r.verified_status !== 'WITHDRAWN'
        ? (r.verified_status as VerifiedStatus)
        : 'SELF_REPORTED';

    return {
      id: r.id,
      userId: r.user_id,
      evidenceType: r.evidence_type as EvidenceType,
      referenceId: r.reference_id,
      claimText: r.claim_text,
      verifiedStatus: cleanVerifiedStatus,
      lifecycleState: (isWithdrawn ? 'WITHDRAWN' : 'ACTIVE') as LifecycleState,
      createdAt: r.created_at.toISOString(),
      updatedAt: (r.updated_at || r.created_at).toISOString(),
    };
  });
}

/**
 * Adds an atomic evidence record for a user.
 */
export async function createCandidateEvidence(
  userId: string,
  input: CreateEvidenceInput
): Promise<CandidateEvidenceDto> {
  const db = getDb();

  const isLegacyWithdrawn = input.verifiedStatus === 'WITHDRAWN';
  const effectiveLifecycle: LifecycleState = input.lifecycleState || (isLegacyWithdrawn ? 'WITHDRAWN' : 'ACTIVE');
  const effectiveStatus: VerifiedStatus = isLegacyWithdrawn ? 'SELF_REPORTED' : (input.verifiedStatus || 'SELF_REPORTED');

  const [inserted] = await db
    .insert(schema.candidateEvidence)
    .values({
      user_id: userId,
      evidence_type: input.evidenceType,
      reference_id: input.referenceId || null,
      claim_text: input.claimText.trim(),
      verified_status: effectiveStatus,
      lifecycle_state: effectiveLifecycle,
      updated_at: new Date(),
    })
    .returning();

  log.info({ userId, evidenceId: inserted!.id, type: input.evidenceType }, 'EVIDENCE_CLAIM_CREATED');

  return {
    id: inserted!.id,
    userId: inserted!.user_id,
    evidenceType: inserted!.evidence_type as EvidenceType,
    referenceId: inserted!.reference_id,
    claimText: inserted!.claim_text,
    verifiedStatus: inserted!.verified_status as VerifiedStatus,
    lifecycleState: inserted!.lifecycle_state as LifecycleState,
    createdAt: inserted!.created_at.toISOString(),
    updatedAt: (inserted!.updated_at || inserted!.created_at).toISOString(),
  };
}

/**
 * Updates an atomic evidence record.
 */
export async function updateCandidateEvidence(
  userId: string,
  evidenceId: string,
  input: UpdateEvidenceInput
): Promise<CandidateEvidenceDto | null> {
  const db = getDb();

  const updateSet: Record<string, any> = {
    updated_at: new Date(),
  };

  if (input.claimText !== undefined) {
    updateSet.claim_text = input.claimText.trim();
  }
  if (input.lifecycleState !== undefined) {
    updateSet.lifecycle_state = input.lifecycleState;
  }
  if (input.verifiedStatus !== undefined) {
    if (input.verifiedStatus === 'WITHDRAWN') {
      updateSet.lifecycle_state = 'WITHDRAWN';
    } else {
      updateSet.verified_status = input.verifiedStatus;
    }
  }

  const [updated] = await db
    .update(schema.candidateEvidence)
    .set(updateSet)
    .where(
      and(
        eq(schema.candidateEvidence.id, evidenceId),
        eq(schema.candidateEvidence.user_id, userId)
      )
    )
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    userId: updated.user_id,
    evidenceType: updated.evidence_type as EvidenceType,
    referenceId: updated.reference_id,
    claimText: updated.claim_text,
    verifiedStatus: (updated.verified_status !== 'WITHDRAWN' ? updated.verified_status : 'SELF_REPORTED') as VerifiedStatus,
    lifecycleState: (updated.lifecycle_state === 'WITHDRAWN' || updated.verified_status === 'WITHDRAWN' ? 'WITHDRAWN' : 'ACTIVE') as LifecycleState,
    createdAt: updated.created_at.toISOString(),
    updatedAt: (updated.updated_at || updated.created_at).toISOString(),
  };
}

/**
 * Withdraws an atomic evidence record (user isolated), preserving historical immutability.
 * Sets lifecycle_state to WITHDRAWN and unlinks referencing resume bullets.
 * Crucially PRESERVES the original verified_status so the historical verification level is never destroyed.
 */
export async function deleteCandidateEvidence(userId: string, evidenceId: string): Promise<boolean> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Unlink any resume bullets linked to this evidence
    await tx
      .update(schema.resumeBullets)
      .set({
        provenance_state: 'UNLINKED',
      })
      .where(eq(schema.resumeBullets.evidence_id, evidenceId));

    // 2. Mark evidence record as WITHDRAWN in lifecycle_state while PRESERVING verified_status!
    const updated = await tx
      .update(schema.candidateEvidence)
      .set({
        lifecycle_state: 'WITHDRAWN',
        updated_at: new Date(),
      })
      .where(
        and(
          eq(schema.candidateEvidence.id, evidenceId),
          eq(schema.candidateEvidence.user_id, userId)
        )
      )
      .returning();

    return updated.length > 0;
  });
}

/**
 * Reactivates a previously withdrawn evidence record (user isolated).
 * - Restores lifecycle_state to ACTIVE.
 * - Does NOT downgrade verification level.
 * - Does NOT unfaithfully upgrade verification level unless genuinely stronger proof (options.newVerifiedStatus) is provided.
 */
export async function reactivateCandidateEvidence(
  userId: string,
  evidenceId: string,
  options?: {
    newVerifiedStatus?: VerifiedStatus;
    referenceId?: string | null;
  }
): Promise<CandidateEvidenceDto | null> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(schema.candidateEvidence)
    .where(
      and(
        eq(schema.candidateEvidence.id, evidenceId),
        eq(schema.candidateEvidence.user_id, userId)
      )
    )
    .limit(1);

  if (!existing) return null;

  // Resolve status: preserves existing verification level unless genuine upgrade is supplied
  const resolvedStatus = resolveVerificationStatus(
    existing.verified_status,
    options?.newVerifiedStatus
  );

  const [updated] = await db
    .update(schema.candidateEvidence)
    .set({
      lifecycle_state: 'ACTIVE',
      verified_status: resolvedStatus,
      reference_id: options?.referenceId !== undefined ? options.referenceId : existing.reference_id,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(schema.candidateEvidence.id, evidenceId),
        eq(schema.candidateEvidence.user_id, userId)
      )
    )
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    userId: updated.user_id,
    evidenceType: updated.evidence_type as EvidenceType,
    referenceId: updated.reference_id,
    claimText: updated.claim_text,
    verifiedStatus: updated.verified_status as VerifiedStatus,
    lifecycleState: updated.lifecycle_state as LifecycleState,
    createdAt: updated.created_at.toISOString(),
    updatedAt: (updated.updated_at || updated.created_at).toISOString(),
  };
}

/**
 * Synchronizes existing structured profile items (projects, experiences, skills, education)
 * into candidate_evidence records if not already represented.
 *
 * Invariants:
 * 1. Withdrawal preserves historical verification level.
 * 2. Reactivation preserves existing verification level and never degrades or unfaithfully upgrades.
 * 3. Re-adding a qualification by itself (without document or external verification) is SELF_REPORTED.
 * 4. Genuinely stronger incoming proof upgrades verification status monotonically.
 * 5. Sync is strictly idempotent.
 */
export async function syncProfileToEvidence(userId: string): Promise<SyncEvidenceResult> {
  const db = getDb();

  const [skills, projects, experiences, educations, certs, existingEvidence] = await Promise.all([
    db.select().from(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userId)),
    db.select().from(schema.candidateProjects).where(eq(schema.candidateProjects.user_id, userId)),
    db.select().from(schema.candidateExperiences).where(eq(schema.candidateExperiences.user_id, userId)),
    db.select().from(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, userId)),
    db.select().from(schema.candidateCertifications).where(eq(schema.candidateCertifications.user_id, userId)),
    db.select().from(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, userId)),
  ]);

  const isClaimWithdrawn = (e: typeof schema.candidateEvidence.$inferSelect) =>
    e.lifecycle_state === 'WITHDRAWN' || e.verified_status === 'WITHDRAWN';

  const activeExistingEvidence = existingEvidence.filter((e) => !isClaimWithdrawn(e));
  const existingClaims = new Set(activeExistingEvidence.map((e) => `${e.evidence_type}:${e.claim_text.toLowerCase()}`));
  let addedCount = 0;

  // 1. Sync Skills
  for (const s of skills) {
    const claim = `Demonstrated proficiency in ${s.canonical_name || s.skill_name}`;
    const key = `PROFILE_SKILL:${claim.toLowerCase()}`;
    const withdrawnClaim = existingEvidence.find(
      (e) => e.evidence_type === 'PROFILE_SKILL' && e.claim_text.toLowerCase() === claim.toLowerCase() && isClaimWithdrawn(e)
    );
    // Skills extracted from candidate-written resumes are candidate self-reported claims.
    // Uploading a candidate-written resume cannot falsely upgrade a claim to DOCUMENT_SUPPORTED.
    const incomingStatus: VerifiedStatus = 'SELF_REPORTED';

    if (withdrawnClaim) {
      // Reactivate without degrading and without unfaithful upgrade
      const finalStatus = resolveVerificationStatus(withdrawnClaim.verified_status, incomingStatus);
      await db
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'ACTIVE',
          verified_status: finalStatus,
          reference_id: s.id,
          updated_at: new Date(),
        })
        .where(eq(schema.candidateEvidence.id, withdrawnClaim.id));
      existingClaims.add(key);
      addedCount++;
    } else if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'PROFILE_SKILL',
        reference_id: s.id,
        claim_text: claim,
        verified_status: incomingStatus,
        lifecycle_state: 'ACTIVE',
      });
      existingClaims.add(key);
      addedCount++;
    }
  }

  // 2. Sync Projects
  for (const p of projects) {
    const techs = Array.isArray(p.technologies) ? p.technologies.join(', ') : '';
    const claim = p.description
      ? `${p.title}: ${p.description}${techs ? ` (Technologies: ${techs})` : ''}`
      : `Built ${p.title}${techs ? ` with ${techs}` : ''}`;
    const key = `PROJECT:${claim.toLowerCase()}`;
    const withdrawnClaim = existingEvidence.find(
      (e) => e.evidence_type === 'PROJECT' && e.claim_text.toLowerCase() === claim.toLowerCase() && isClaimWithdrawn(e)
    );
    const incomingStatus: VerifiedStatus = p.url ? 'PROJECT_SUPPORTED' : 'SELF_REPORTED';

    if (withdrawnClaim) {
      const finalStatus = resolveVerificationStatus(withdrawnClaim.verified_status, incomingStatus);
      await db
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'ACTIVE',
          verified_status: finalStatus,
          reference_id: p.id,
          updated_at: new Date(),
        })
        .where(eq(schema.candidateEvidence.id, withdrawnClaim.id));
      existingClaims.add(key);
      addedCount++;
    } else if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'PROJECT',
        reference_id: p.id,
        claim_text: claim,
        verified_status: incomingStatus,
        lifecycle_state: 'ACTIVE',
      });
      existingClaims.add(key);
      addedCount++;
    }
  }

  // 3. Sync Experiences
  for (const exp of experiences) {
    const roleType = exp.is_internship ? 'Internship' : 'Employment';
    const claim = exp.description
      ? `${exp.title} at ${exp.company_name} (${roleType}): ${exp.description}`
      : `Served as ${exp.title} at ${exp.company_name} (${roleType})`;
    const key = `EXPERIENCE:${claim.toLowerCase()}`;
    const withdrawnClaim = existingEvidence.find(
      (e) => e.evidence_type === 'EXPERIENCE' && e.claim_text.toLowerCase() === claim.toLowerCase() && isClaimWithdrawn(e)
    );
    const incomingStatus: VerifiedStatus = 'SELF_REPORTED';

    if (withdrawnClaim) {
      const finalStatus = resolveVerificationStatus(withdrawnClaim.verified_status, incomingStatus);
      await db
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'ACTIVE',
          verified_status: finalStatus,
          reference_id: exp.id,
          updated_at: new Date(),
        })
        .where(eq(schema.candidateEvidence.id, withdrawnClaim.id));
      existingClaims.add(key);
      addedCount++;
    } else if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'EXPERIENCE',
        reference_id: exp.id,
        claim_text: claim,
        verified_status: incomingStatus,
        lifecycle_state: 'ACTIVE',
      });
      existingClaims.add(key);
      addedCount++;
    }
  }

  // 4. Sync Education
  for (const edu of educations) {
    const claim = `${edu.degree} in ${edu.field_of_study || 'General Studies'} from ${edu.institution}${
      edu.end_year ? ` (Graduated ${edu.end_year})` : ''
    }`;
    const key = `EDUCATION:${claim.toLowerCase()}`;
    const withdrawnClaim = existingEvidence.find(
      (e) => e.evidence_type === 'EDUCATION' && e.claim_text.toLowerCase() === claim.toLowerCase() && isClaimWithdrawn(e)
    );
    const incomingStatus: VerifiedStatus = 'SELF_REPORTED';

    if (withdrawnClaim) {
      const finalStatus = resolveVerificationStatus(withdrawnClaim.verified_status, incomingStatus);
      await db
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'ACTIVE',
          verified_status: finalStatus,
          reference_id: edu.id,
          updated_at: new Date(),
        })
        .where(eq(schema.candidateEvidence.id, withdrawnClaim.id));
      existingClaims.add(key);
      addedCount++;
    } else if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'EDUCATION',
        reference_id: edu.id,
        claim_text: claim,
        verified_status: incomingStatus,
        lifecycle_state: 'ACTIVE',
      });
      existingClaims.add(key);
      addedCount++;
    }
  }

  // 5. Sync Certifications
  for (const cert of certs) {
    const claim = `${cert.name}${cert.issuer ? ` by ${cert.issuer}` : ''}${
      cert.issue_year ? ` (${cert.issue_year})` : ''
    }`;
    const key = `CERTIFICATION:${claim.toLowerCase()}`;
    const withdrawnClaim = existingEvidence.find(
      (e) => e.evidence_type === 'CERTIFICATION' && e.claim_text.toLowerCase() === claim.toLowerCase() && isClaimWithdrawn(e)
    );
    const incomingStatus: VerifiedStatus = cert.url ? 'EXTERNALLY_VERIFIED' : 'DOCUMENT_SUPPORTED';

    if (withdrawnClaim) {
      const finalStatus = resolveVerificationStatus(withdrawnClaim.verified_status, incomingStatus);
      await db
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'ACTIVE',
          verified_status: finalStatus,
          reference_id: cert.id,
          updated_at: new Date(),
        })
        .where(eq(schema.candidateEvidence.id, withdrawnClaim.id));
      existingClaims.add(key);
      addedCount++;
    } else if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'CERTIFICATION',
        reference_id: cert.id,
        claim_text: claim,
        verified_status: incomingStatus,
        lifecycle_state: 'ACTIVE',
      });
      existingClaims.add(key);
      addedCount++;
    }
  }

  // 6. Scoped transition of orphaned profile evidence claims to WITHDRAWN
  // Strictly protect:
  // - ASSESSMENT claims (independent of profile)
  // - EXTERNALLY_VERIFIED claims (verified external credentials)
  // - ASSESSMENT_SUPPORTED claims
  // - Manually created standalone claims without reference_id (reference_id === null)
  const profileEvidenceTypes: EvidenceType[] = [
    'PROFILE_SKILL',
    'PROJECT',
    'EXPERIENCE',
    'EDUCATION',
    'CERTIFICATION',
  ];

  const validSkills = new Set(skills.map((s) => s.id));
  const validProjects = new Set(projects.map((p) => p.id));
  const validExperiences = new Set(experiences.map((e) => e.id));
  const validEducations = new Set(educations.map((e) => e.id));
  const validCerts = new Set(certs.map((c) => c.id));

  for (const ev of existingEvidence) {
    // Never prune manual claims with no reference_id
    if (!ev.reference_id) continue;
    // Strictly protect assessments and externally verified claims
    if (ev.evidence_type === 'ASSESSMENT') continue;
    if (ev.verified_status === 'EXTERNALLY_VERIFIED' || ev.verified_status === 'ASSESSMENT_SUPPORTED') continue;
    if (!profileEvidenceTypes.includes(ev.evidence_type as EvidenceType)) continue;

    let isOrphaned = false;
    switch (ev.evidence_type) {
      case 'PROFILE_SKILL':
        isOrphaned = !validSkills.has(ev.reference_id);
        break;
      case 'PROJECT':
        isOrphaned = !validProjects.has(ev.reference_id);
        break;
      case 'EXPERIENCE':
        isOrphaned = !validExperiences.has(ev.reference_id);
        break;
      case 'EDUCATION':
        isOrphaned = !validEducations.has(ev.reference_id);
        break;
      case 'CERTIFICATION':
        isOrphaned = !validCerts.has(ev.reference_id);
        break;
    }

    if (isOrphaned && !isClaimWithdrawn(ev)) {
      // 1. Unlink referencing resume bullets to prevent displaying withdrawn claim as verified
      await db
        .update(schema.resumeBullets)
        .set({
          provenance_state: 'UNLINKED',
        })
        .where(eq(schema.resumeBullets.evidence_id, ev.id));

      // 2. Mark the claim as WITHDRAWN in lifecycle_state while PRESERVING verified_status!
      await db
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'WITHDRAWN',
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.candidateEvidence.id, ev.id),
            eq(schema.candidateEvidence.user_id, userId)
          )
        );
    }
  }

  // Query updated active evidence list after sync & transition (excluding WITHDRAWN)
  const finalActiveEvidence = await db
    .select()
    .from(schema.candidateEvidence)
    .where(
      and(
        eq(schema.candidateEvidence.user_id, userId),
        ne(schema.candidateEvidence.lifecycle_state, 'WITHDRAWN'),
        ne(schema.candidateEvidence.verified_status, 'WITHDRAWN')
      )
    );

  const totalActiveClaims = finalActiveEvidence.length;
  const alreadyUpToDateCount = Math.max(0, totalActiveClaims - addedCount);

  return {
    syncedCount: addedCount,
    updatedCount: 0,
    alreadyUpToDateCount,
    totalActiveClaims,
  };
}

// ─── Direct Candidate Data Controls ──────────────────────────────────────────

/**
 * Recalculates candidate profile completeness and persists it inside an active transaction.
 */
async function recalculateProfileCompletenessInTx(tx: any, userId: string): Promise<number> {
  const [profileRecord] = await tx
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.user_id, userId))
    .limit(1);

  const [skillsRows, eduRows, projRows, expRows, activeResumeRows] = await Promise.all([
    tx.select().from(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userId)),
    tx.select().from(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, userId)),
    tx.select().from(schema.candidateProjects).where(eq(schema.candidateProjects.user_id, userId)),
    tx.select().from(schema.candidateExperiences).where(eq(schema.candidateExperiences.user_id, userId)),
    tx.select().from(schema.resumes).where(and(eq(schema.resumes.user_id, userId), eq(schema.resumes.is_active, true))).limit(1),
  ]);

  const targetRoles = (profileRecord?.target_roles as string[]) || [];

  const completeness = calculateProfileCompleteness({
    hasResume: activeResumeRows.length > 0,
    skillsCount: skillsRows.length,
    educationsCount: eduRows.length,
    projectsCount: projRows.length,
    experiencesCount: expRows.length,
    hasPreferredRoles: targetRoles.length > 0 || !!profileRecord?.headline,
  });

  if (profileRecord) {
    await tx
      .update(schema.candidateProfiles)
      .set({
        completeness_score: completeness.score,
        updated_at: new Date(),
      })
      .where(eq(schema.candidateProfiles.user_id, userId));
  }

  return completeness.score;
}

export async function addCandidateSkill(
  userId: string,
  skillName: string,
  category: string = 'Technical'
) {
  const db = getDb();
  const trimmed = skillName.trim();

  return await db.transaction(async (tx) => {
    const [newSkill] = await tx
      .insert(schema.candidateSkills)
      .values({
        user_id: userId,
        skill_name: trimmed,
        canonical_name: trimmed,
        category,
        source: 'MANUAL',
      })
      .onConflictDoNothing()
      .returning();

    if (newSkill) {
      await tx.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'PROFILE_SKILL',
        reference_id: newSkill.id,
        claim_text: `Demonstrated proficiency in ${newSkill.canonical_name}`,
        verified_status: 'SELF_REPORTED',
        lifecycle_state: 'ACTIVE',
      });
      await recalculateProfileCompletenessInTx(tx, userId);
    }
    return newSkill;
  });
}

export async function removeCandidateSkill(userId: string, skillId: string): Promise<boolean> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.candidateSkills)
      .where(and(eq(schema.candidateSkills.id, skillId), eq(schema.candidateSkills.user_id, userId)))
      .returning();

    if (deleted.length > 0) {
      const evRows = await tx
        .select()
        .from(schema.candidateEvidence)
        .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, skillId)));

      for (const ev of evRows) {
        await tx
          .update(schema.resumeBullets)
          .set({ provenance_state: 'UNLINKED' })
          .where(eq(schema.resumeBullets.evidence_id, ev.id));
      }

      // Mark WITHDRAWN in lifecycle_state while preserving verified_status
      await tx
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'WITHDRAWN',
          updated_at: new Date(),
        })
        .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, skillId)));

      await recalculateProfileCompletenessInTx(tx, userId);
      return true;
    }
    return false;
  });
}

export async function addCandidateProject(
  userId: string,
  project: { title: string; description?: string; technologies?: string[]; url?: string }
) {
  const db = getDb();

  return await db.transaction(async (tx) => {
    const [newProj] = await tx
      .insert(schema.candidateProjects)
      .values({
        user_id: userId,
        title: project.title.trim(),
        description: project.description ? project.description.trim() : null,
        technologies: project.technologies || [],
        url: project.url ? project.url.trim() : null,
      })
      .returning();

    if (newProj) {
      const techs = Array.isArray(newProj.technologies) ? newProj.technologies.join(', ') : '';
      const claim = newProj.description
        ? `${newProj.title}: ${newProj.description}${techs ? ` (Technologies: ${techs})` : ''}`
        : `Built ${newProj.title}${techs ? ` with ${techs}` : ''}`;

      await tx.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'PROJECT',
        reference_id: newProj.id,
        claim_text: claim,
        verified_status: newProj.url ? 'PROJECT_SUPPORTED' : 'SELF_REPORTED',
        lifecycle_state: 'ACTIVE',
      });

      await recalculateProfileCompletenessInTx(tx, userId);
    }
    return newProj;
  });
}

export async function deleteCandidateProject(userId: string, projectId: string): Promise<boolean> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.candidateProjects)
      .where(and(eq(schema.candidateProjects.id, projectId), eq(schema.candidateProjects.user_id, userId)))
      .returning();

    if (deleted.length > 0) {
      const evRows = await tx
        .select()
        .from(schema.candidateEvidence)
        .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, projectId)));

      for (const ev of evRows) {
        await tx
          .update(schema.resumeBullets)
          .set({ provenance_state: 'UNLINKED' })
          .where(eq(schema.resumeBullets.evidence_id, ev.id));
      }

      await tx
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'WITHDRAWN',
          updated_at: new Date(),
        })
        .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, projectId)));

      await recalculateProfileCompletenessInTx(tx, userId);
      return true;
    }
    return false;
  });
}

export async function addCandidateExperience(
  userId: string,
  exp: { companyName: string; title: string; location?: string; isInternship?: boolean; description?: string }
) {
  const db = getDb();

  return await db.transaction(async (tx) => {
    const [newExp] = await tx
      .insert(schema.candidateExperiences)
      .values({
        user_id: userId,
        company_name: exp.companyName.trim(),
        title: exp.title.trim(),
        location: exp.location ? exp.location.trim() : null,
        is_internship: exp.isInternship ?? false,
        description: exp.description ? exp.description.trim() : null,
      })
      .returning();

    if (newExp) {
      const roleType = newExp.is_internship ? 'Internship' : 'Employment';
      const claim = newExp.description
        ? `${newExp.title} at ${newExp.company_name} (${roleType}): ${newExp.description}`
        : `Served as ${newExp.title} at ${newExp.company_name} (${roleType})`;

      await tx.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'EXPERIENCE',
        reference_id: newExp.id,
        claim_text: claim,
        verified_status: 'SELF_REPORTED',
        lifecycle_state: 'ACTIVE',
      });

      await recalculateProfileCompletenessInTx(tx, userId);
    }
    return newExp;
  });
}

export async function deleteCandidateExperience(userId: string, expId: string): Promise<boolean> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.candidateExperiences)
      .where(and(eq(schema.candidateExperiences.id, expId), eq(schema.candidateExperiences.user_id, userId)))
      .returning();

    if (deleted.length > 0) {
      const evRows = await tx
        .select()
        .from(schema.candidateEvidence)
        .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, expId)));

      for (const ev of evRows) {
        await tx
          .update(schema.resumeBullets)
          .set({ provenance_state: 'UNLINKED' })
          .where(eq(schema.resumeBullets.evidence_id, ev.id));
      }

      await tx
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'WITHDRAWN',
          updated_at: new Date(),
        })
        .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, expId)));

      await recalculateProfileCompletenessInTx(tx, userId);
      return true;
    }
    return false;
  });
}

export async function addCandidateEducation(
  userId: string,
  edu: {
    institution: string;
    degree: string;
    fieldOfStudy?: string | null;
    startYear?: number | null;
    endYear?: number | null;
  }
) {
  const db = getDb();

  return await db.transaction(async (tx) => {
    const [newEdu] = await tx
      .insert(schema.candidateEducations)
      .values({
        user_id: userId,
        institution: edu.institution.trim(),
        degree: edu.degree.trim(),
        field_of_study: edu.fieldOfStudy ? edu.fieldOfStudy.trim() : null,
        start_year: edu.startYear || null,
        end_year: edu.endYear || null,
      })
      .returning();

    if (newEdu) {
      const claim = `${newEdu.degree} in ${newEdu.field_of_study || 'General Studies'} from ${newEdu.institution}${
        newEdu.end_year ? ` (Graduated ${newEdu.end_year})` : ''
      }`;

      await tx.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'EDUCATION',
        reference_id: newEdu.id,
        claim_text: claim,
        verified_status: 'SELF_REPORTED',
        lifecycle_state: 'ACTIVE',
      });

      await recalculateProfileCompletenessInTx(tx, userId);
    }
    return newEdu;
  });
}

export async function deleteCandidateEducation(userId: string, educationId: string): Promise<boolean> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. User-isolated deletion from candidateEducations
    const deleted = await tx
      .delete(schema.candidateEducations)
      .where(
        and(
          eq(schema.candidateEducations.id, educationId),
          eq(schema.candidateEducations.user_id, userId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return false;
    }

    // 2. Find any candidate_evidence referencing this education
    const evRows = await tx
      .select()
      .from(schema.candidateEvidence)
      .where(
        and(
          eq(schema.candidateEvidence.user_id, userId),
          eq(schema.candidateEvidence.reference_id, educationId)
        )
      );

    // 3. For any resume bullets linked to this evidence, update provenance to UNLINKED
    for (const ev of evRows) {
      await tx
        .update(schema.resumeBullets)
        .set({
          provenance_state: 'UNLINKED',
        })
        .where(eq(schema.resumeBullets.evidence_id, ev.id));
    }

    // 4. Mark the evidence record as WITHDRAWN in lifecycle_state while PRESERVING verified_status!
    if (evRows.length > 0) {
      await tx
        .update(schema.candidateEvidence)
        .set({
          lifecycle_state: 'WITHDRAWN',
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.candidateEvidence.user_id, userId),
            eq(schema.candidateEvidence.reference_id, educationId)
          )
        );
    }

    // 5. Atomically recalculate and persist updated profile completeness
    await recalculateProfileCompletenessInTx(tx, userId);

    log.info({ userId, educationId }, 'CANDIDATE_EDUCATION_DELETED');
    return true;
  });
}
