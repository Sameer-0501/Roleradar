/**
 * Career Evidence Vault Service — Engine 3.
 *
 * Implements the Master Career Evidence Profile repository per Blueprint Section 6.
 * Enforces:
 * 1. Strict User Isolation: Every query and mutation is scoped to user_id.
 * 2. Immutable Evidence Grounding: Claims are categorized and given verified statuses.
 * 3. Bidirectional Sync: Structured skills, projects, and experiences sync to atomic evidence units.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';

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
  | 'EXTERNALLY_VERIFIED';

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
  createdAt: string;
}

export interface CreateEvidenceInput {
  evidenceType: EvidenceType;
  referenceId?: string | null;
  claimText: string;
  verifiedStatus?: VerifiedStatus;
}

export interface UpdateEvidenceInput {
  claimText?: string;
  verifiedStatus?: VerifiedStatus;
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

  // Compute statistics
  const evidenceRows = await db
    .select()
    .from(schema.candidateEvidence)
    .where(eq(schema.candidateEvidence.user_id, userId));

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
 * Lists all atomic evidence items for a user, optionally filtered by evidenceType.
 */
export async function listCandidateEvidence(
  userId: string,
  evidenceType?: EvidenceType
): Promise<CandidateEvidenceDto[]> {
  const db = getDb();

  const query = db
    .select()
    .from(schema.candidateEvidence)
    .where(
      evidenceType
        ? and(
            eq(schema.candidateEvidence.user_id, userId),
            eq(schema.candidateEvidence.evidence_type, evidenceType)
          )
        : eq(schema.candidateEvidence.user_id, userId)
    )
    .orderBy(desc(schema.candidateEvidence.created_at));

  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    evidenceType: r.evidence_type as EvidenceType,
    referenceId: r.reference_id,
    claimText: r.claim_text,
    verifiedStatus: r.verified_status as VerifiedStatus,
    createdAt: r.created_at.toISOString(),
  }));
}

/**
 * Adds an atomic evidence record for a user.
 */
export async function createCandidateEvidence(
  userId: string,
  input: CreateEvidenceInput
): Promise<CandidateEvidenceDto> {
  const db = getDb();

  const [inserted] = await db
    .insert(schema.candidateEvidence)
    .values({
      user_id: userId,
      evidence_type: input.evidenceType,
      reference_id: input.referenceId || null,
      claim_text: input.claimText.trim(),
      verified_status: input.verifiedStatus || 'SELF_REPORTED',
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
    createdAt: inserted!.created_at.toISOString(),
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

  const [updated] = await db
    .update(schema.candidateEvidence)
    .set({
      claim_text: input.claimText !== undefined ? input.claimText.trim() : undefined,
      verified_status: input.verifiedStatus !== undefined ? input.verifiedStatus : undefined,
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
    createdAt: updated.created_at.toISOString(),
  };
}

/**
 * Deletes an atomic evidence record (user isolated).
 */
export async function deleteCandidateEvidence(userId: string, evidenceId: string): Promise<boolean> {
  const db = getDb();

  const deleted = await db
    .delete(schema.candidateEvidence)
    .where(
      and(
        eq(schema.candidateEvidence.id, evidenceId),
        eq(schema.candidateEvidence.user_id, userId)
      )
    )
    .returning();

  return deleted.length > 0;
}

/**
 * Synchronizes existing structured profile items (projects, experiences, skills, education)
 * into candidate_evidence records if not already represented.
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

  const existingClaims = new Set(existingEvidence.map((e) => `${e.evidence_type}:${e.claim_text.toLowerCase()}`));
  let addedCount = 0;

  // 1. Sync Skills
  for (const s of skills) {
    const claim = `Demonstrated proficiency in ${s.canonical_name || s.skill_name}`;
    const key = `PROFILE_SKILL:${claim.toLowerCase()}`;
    if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'PROFILE_SKILL',
        reference_id: s.id,
        claim_text: claim,
        verified_status: s.source === 'PARSED' ? 'DOCUMENT_SUPPORTED' : 'SELF_REPORTED',
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
    if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'PROJECT',
        reference_id: p.id,
        claim_text: claim,
        verified_status: p.url ? 'PROJECT_SUPPORTED' : 'SELF_REPORTED',
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
    if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'EXPERIENCE',
        reference_id: exp.id,
        claim_text: claim,
        verified_status: 'DOCUMENT_SUPPORTED',
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
    if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'EDUCATION',
        reference_id: edu.id,
        claim_text: claim,
        verified_status: 'DOCUMENT_SUPPORTED',
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
    if (!existingClaims.has(key)) {
      await db.insert(schema.candidateEvidence).values({
        user_id: userId,
        evidence_type: 'CERTIFICATION',
        reference_id: cert.id,
        claim_text: claim,
        verified_status: cert.url ? 'EXTERNALLY_VERIFIED' : 'DOCUMENT_SUPPORTED',
      });
      existingClaims.add(key);
      addedCount++;
    }
  }

  // 6. Prune orphaned evidence claims whose source profile reference no longer exists
  const validReferenceIds = new Set<string>([
    ...skills.map((s) => s.id),
    ...projects.map((p) => p.id),
    ...experiences.map((e) => e.id),
    ...educations.map((e) => e.id),
    ...certs.map((c) => c.id),
  ]);

  for (const ev of existingEvidence) {
    if (ev.reference_id && !validReferenceIds.has(ev.reference_id)) {
      await db
        .update(schema.resumeBullets)
        .set({
          provenance_state: 'UNLINKED',
          evidence_id: null,
        })
        .where(eq(schema.resumeBullets.evidence_id, ev.id));

      await db
        .delete(schema.candidateEvidence)
        .where(
          and(
            eq(schema.candidateEvidence.id, ev.id),
            eq(schema.candidateEvidence.user_id, userId)
          )
        );
    }
  }

  // Query updated active evidence list after sync & prune
  const finalEvidence = await db
    .select()
    .from(schema.candidateEvidence)
    .where(eq(schema.candidateEvidence.user_id, userId));

  const totalActiveClaims = finalEvidence.length;
  const alreadyUpToDateCount = Math.max(0, totalActiveClaims - addedCount);

  return {
    syncedCount: addedCount,
    updatedCount: 0,
    alreadyUpToDateCount,
    totalActiveClaims,
  };
}

// ─── Direct Candidate Data Controls (Addressing User Editing Request) ─────────

export async function addCandidateSkill(
  userId: string,
  skillName: string,
  category: string = 'Technical'
) {
  const db = getDb();
  const trimmed = skillName.trim();
  const [newSkill] = await db
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
    await createCandidateEvidence(userId, {
      evidenceType: 'PROFILE_SKILL',
      referenceId: newSkill.id,
      claimText: `Demonstrated proficiency in ${newSkill.canonical_name}`,
      verifiedStatus: 'SELF_REPORTED',
    });
  }
  return newSkill;
}

export async function removeCandidateSkill(userId: string, skillId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.candidateSkills)
    .where(and(eq(schema.candidateSkills.id, skillId), eq(schema.candidateSkills.user_id, userId)))
    .returning();

  if (deleted.length > 0) {
    const evRows = await db
      .select()
      .from(schema.candidateEvidence)
      .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, skillId)));

    for (const ev of evRows) {
      await db
        .update(schema.resumeBullets)
        .set({ provenance_state: 'UNLINKED', evidence_id: null })
        .where(eq(schema.resumeBullets.evidence_id, ev.id));
    }

    await db
      .delete(schema.candidateEvidence)
      .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, skillId)));
    return true;
  }
  return false;
}

export async function addCandidateProject(
  userId: string,
  project: { title: string; description?: string; technologies?: string[]; url?: string }
) {
  const db = getDb();
  const [newProj] = await db
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

    await createCandidateEvidence(userId, {
      evidenceType: 'PROJECT',
      referenceId: newProj.id,
      claimText: claim,
      verifiedStatus: newProj.url ? 'PROJECT_SUPPORTED' : 'SELF_REPORTED',
    });
  }
  return newProj;
}

export async function deleteCandidateProject(userId: string, projectId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.candidateProjects)
    .where(and(eq(schema.candidateProjects.id, projectId), eq(schema.candidateProjects.user_id, userId)))
    .returning();

  if (deleted.length > 0) {
    const evRows = await db
      .select()
      .from(schema.candidateEvidence)
      .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, projectId)));

    for (const ev of evRows) {
      await db
        .update(schema.resumeBullets)
        .set({ provenance_state: 'UNLINKED', evidence_id: null })
        .where(eq(schema.resumeBullets.evidence_id, ev.id));
    }

    await db
      .delete(schema.candidateEvidence)
      .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, projectId)));
    return true;
  }
  return false;
}

export async function addCandidateExperience(
  userId: string,
  exp: { companyName: string; title: string; location?: string; isInternship?: boolean; description?: string }
) {
  const db = getDb();
  const [newExp] = await db
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

    await createCandidateEvidence(userId, {
      evidenceType: 'EXPERIENCE',
      referenceId: newExp.id,
      claimText: claim,
      verifiedStatus: 'SELF_REPORTED',
    });
  }
  return newExp;
}

export async function deleteCandidateExperience(userId: string, expId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.candidateExperiences)
    .where(and(eq(schema.candidateExperiences.id, expId), eq(schema.candidateExperiences.user_id, userId)))
    .returning();

  if (deleted.length > 0) {
    const evRows = await db
      .select()
      .from(schema.candidateEvidence)
      .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, expId)));

    for (const ev of evRows) {
      await db
        .update(schema.resumeBullets)
        .set({ provenance_state: 'UNLINKED', evidence_id: null })
        .where(eq(schema.resumeBullets.evidence_id, ev.id));
    }

    await db
      .delete(schema.candidateEvidence)
      .where(and(eq(schema.candidateEvidence.user_id, userId), eq(schema.candidateEvidence.reference_id, expId)));
    return true;
  }
  return false;
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
  const [newEdu] = await db
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

    await createCandidateEvidence(userId, {
      evidenceType: 'EDUCATION',
      referenceId: newEdu.id,
      claimText: claim,
      verifiedStatus: 'SELF_REPORTED',
    });
  }
  return newEdu;
}

export async function deleteCandidateEducation(userId: string, educationId: string): Promise<boolean> {
  const db = getDb();

  // 1. User-isolated deletion from candidateEducations
  const deleted = await db
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
  const evRows = await db
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
    await db
      .update(schema.resumeBullets)
      .set({
        provenance_state: 'UNLINKED',
        evidence_id: null,
      })
      .where(eq(schema.resumeBullets.evidence_id, ev.id));
  }

  // 4. Delete the evidence records so they are not falsely marked as supported
  if (evRows.length > 0) {
    await db
      .delete(schema.candidateEvidence)
      .where(
        and(
          eq(schema.candidateEvidence.user_id, userId),
          eq(schema.candidateEvidence.reference_id, educationId)
        )
      );
  }

  log.info({ userId, educationId }, 'CANDIDATE_EDUCATION_DELETED');
  return true;
}
