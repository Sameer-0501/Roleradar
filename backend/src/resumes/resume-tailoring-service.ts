/**
 * Truth-Preserving Resume Tailoring Service — Engine 3.
 *
 * Implements JD-tailored resume generation with Bullet-to-Evidence Claim Provenance.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS (Blueprint Section 6.1 & 6.5):
 * 1. Zero Fact Invention: Does NOT fabricate achievements, metrics, or technologies.
 * 2. Strict Claim Provenance: Every generated bullet point links to an explicit candidate_evidence record.
 * 3. Transparent Unlinked Tagging: Any high-level synthesis without a single supporting claim is tagged 'UNLINKED'.
 * 4. Multi-Variant Support: Generates and preserves role-specific variants without mutating the master evidence profile.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { extractJobRequirements } from '../matching/proof-based-fit-service.js';
import { getOrCreateCareerProfile, listCandidateEvidence, type CandidateEvidenceDto } from './career-evidence-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('resumes:tailoring-service');

export type ProvenanceState = 'PROVENANCE_BACKED' | 'UNLINKED';

export interface TailoredBulletDto {
  id: string;
  bulletText: string;
  provenanceState: ProvenanceState;
  evidenceId: string | null;
  evidenceClaimText?: string | null;
  evidenceType?: string | null;
  displayOrder: number;
}

export interface TailoredResumeResultDto {
  id: string;
  resumeId: string;
  profileId: string;
  variantName: string;
  targetJobId: string;
  targetJob: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
  };
  truthfulnessScore: number; // 0–100% (% of bullets with provenance backing)
  totalBulletsCount: number;
  provenanceBackedCount: number;
  unlinkedCount: number;
  matchedHighlights: Array<{
    requirementText: string;
    evidenceClaim: string;
    evidenceType: string;
  }>;
  unsupportedRequirements: string[];
  bullets: TailoredBulletDto[];
  createdAt: string;
  updatedAt: string;
}

export interface TailorResumeInput {
  userId: string;
  jobId: string;
  variantName?: string;
}

/**
 * Extracts key domain tokens from text for relevance ranking.
 */
export function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s+#.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'you', 'will', 'are', 'that', 'this'].includes(w));
  return new Set(words);
}

/**
 * Tailors a truthful, provenance-backed resume variant for a specific verified job.
 */
export async function tailorResumeForJob(input: TailorResumeInput): Promise<TailoredResumeResultDto> {
  const db = getDb();
  const { userId, jobId, variantName } = input;

  // 1. Get or create Master Career Profile & ensure evidence is synced
  const masterProfile = await getOrCreateCareerProfile(userId);
  const evidenceList = await listCandidateEvidence(userId);

  // 2. Retrieve target job posting and company
  const [jobRecord] = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      employmentType: schema.jobs.employment_type,
      companyId: schema.jobs.company_id,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!jobRecord) {
    throw new Error(`Target job "${jobId}" not found.`);
  }

  let companyName = 'Hiring Organization';
  if (jobRecord.companyId) {
    const [comp] = await db
      .select({ name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.id, jobRecord.companyId))
      .limit(1);
    if (comp?.name) companyName = comp.name;
  }

  // 3. Atomize job requirements
  const extracted = extractJobRequirements({
    title: jobRecord.title,
    description: jobRecord.description,
    requirements: jobRecord.requirements,
    location: jobRecord.location,
    workplaceType: jobRecord.workplaceType,
    employmentType: jobRecord.employmentType,
  });

  const allRequirements: Array<{ text: string; group: string }> = [
    ...extracted.mandatorySkills.map((s) => ({ text: s, group: 'MANDATORY' })),
    ...extracted.preferredSkills.map((s) => ({ text: s, group: 'PREFERRED' })),
    ...extracted.responsibilities.map((r) => ({ text: r, group: 'RESPONSIBILITY' })),
  ];

  // 4. Score and match candidate evidence against target job requirements
  const matchedHighlights: Array<{
    requirementText: string;
    evidenceClaim: string;
    evidenceType: string;
    evidenceId: string;
  }> = [];

  const matchedEvidenceIds = new Set<string>();
  const unsupportedRequirements: string[] = [];

  for (const req of allRequirements) {
    const reqWords = extractKeywords(req.text);
    let bestMatch: CandidateEvidenceDto | null = null;
    let maxOverlap = 0;

    for (const ev of evidenceList) {
      const evWords = extractKeywords(ev.claimText);
      let overlap = 0;
      for (const w of reqWords) {
        if (evWords.has(w)) overlap++;
      }
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = ev;
      }
    }

    if (bestMatch && maxOverlap >= 1) {
      matchedHighlights.push({
        requirementText: req.text,
        evidenceClaim: bestMatch.claimText,
        evidenceType: bestMatch.evidenceType,
        evidenceId: bestMatch.id,
      });
      matchedEvidenceIds.add(bestMatch.id);
    } else {
      unsupportedRequirements.push(req.text);
    }
  }

  // 5. Construct Truth-Preserving Tailored Bullets
  // Structure:
  // - Top: Professional Headline / Tailored Objective (Synthesized from candidate profile + job)
  // - Project & Practical Achievements (Highest relevance evidence)
  // - Experience / Work History
  // - Skills & Technical Arsenal
  // - Education & Credentials
  const generatedBullets: Array<{
    text: string;
    provenanceState: ProvenanceState;
    evidenceId: string | null;
    evidenceClaimText?: string | null;
    evidenceType?: string | null;
  }> = [];

  // Bullet 1: Targeted Professional Summary / Objective
  const summaryBullet = masterProfile.careerObjective
    ? `Targeting ${jobRecord.title} at ${companyName}: ${masterProfile.careerObjective}`
    : `Candidate for ${jobRecord.title} role at ${companyName} with focus on verifiable software engineering and project delivery.`;
  generatedBullets.push({
    text: summaryBullet,
    provenanceState: 'UNLINKED',
    evidenceId: null,
  });

  // Bullets from Matched Highlights (Priority order: Projects -> Experience -> Skills -> Education)
  const prioritizedEvidence = [...evidenceList].sort((a, b) => {
    const aMatched = matchedEvidenceIds.has(a.id) ? 1 : 0;
    const bMatched = matchedEvidenceIds.has(b.id) ? 1 : 0;
    if (aMatched !== bMatched) return bMatched - aMatched;

    const typeWeight = { PROJECT: 5, EXPERIENCE: 4, CERTIFICATION: 3, PROFILE_SKILL: 2, EDUCATION: 1, ASSESSMENT: 1 };
    return (typeWeight[b.evidenceType] || 0) - (typeWeight[a.evidenceType] || 0);
  });

  // Limit to top 8 concrete evidence claims to maintain standard 1-page resume density
  const selectedEvidence = prioritizedEvidence.slice(0, 8);

  for (const ev of selectedEvidence) {
    let bulletText = ev.claimText;
    if (ev.evidenceType === 'PROFILE_SKILL' && !bulletText.toLowerCase().startsWith('core skill')) {
      bulletText = `Proficient in: ${ev.claimText.replace(/^demonstrated proficiency in /i, '')}`;
    }

    generatedBullets.push({
      text: bulletText,
      provenanceState: 'PROVENANCE_BACKED',
      evidenceId: ev.id,
      evidenceClaimText: ev.claimText,
      evidenceType: ev.evidenceType,
    });
  }

  // If candidate has very few claims, add a transparent unlinked prompt bullet rather than hallucinating
  if (generatedBullets.length < 3) {
    generatedBullets.push({
      text: 'Academic background and foundational engineering principles aligned with role specifications.',
      provenanceState: 'UNLINKED',
      evidenceId: null,
    });
  }

  // 6. Persist Variant Document & Bullets
  const finalVariantName = variantName?.trim() || `${jobRecord.title} Variant`;

  // Find existing variant with same name or create new
  let [doc] = await db
    .select()
    .from(schema.resumeDocuments)
    .where(
      and(
        eq(schema.resumeDocuments.user_id, userId),
        eq(schema.resumeDocuments.variant_name, finalVariantName)
      )
    )
    .limit(1);

  if (!doc) {
    const [newDoc] = await db
      .insert(schema.resumeDocuments)
      .values({
        user_id: userId,
        profile_id: masterProfile.id,
        variant_name: finalVariantName,
        is_master: false,
      })
      .returning();
    doc = newDoc!;
  } else {
    // Clear previous bullets for this variant before replacing
    await db.delete(schema.resumeBullets).where(eq(schema.resumeBullets.resume_id, doc.id));
  }

  // Insert bullets with explicit display order
  const savedBullets: TailoredBulletDto[] = [];
  for (let idx = 0; idx < generatedBullets.length; idx++) {
    const b = generatedBullets[idx]!;
    const [insertedBullet] = await db
      .insert(schema.resumeBullets)
      .values({
        resume_id: doc.id,
        evidence_id: b.evidenceId,
        bullet_text: b.text,
        provenance_state: b.provenanceState,
        display_order: idx + 1,
      })
      .returning();

    savedBullets.push({
      id: insertedBullet!.id,
      bulletText: insertedBullet!.bullet_text,
      provenanceState: insertedBullet!.provenance_state as ProvenanceState,
      evidenceId: insertedBullet!.evidence_id,
      evidenceClaimText: b.evidenceClaimText || null,
      evidenceType: b.evidenceType || null,
      displayOrder: insertedBullet!.display_order,
    });
  }

  const provenanceBackedCount = savedBullets.filter((b) => b.provenanceState === 'PROVENANCE_BACKED').length;
  const truthfulnessScore = savedBullets.length > 0 ? Math.round((provenanceBackedCount / savedBullets.length) * 100) : 100;

  log.info(
    { userId, resumeId: doc.id, bulletsCount: savedBullets.length, truthfulnessScore },
    'RESUME_TAILORED_WITH_PROVENANCE'
  );

  return {
    id: doc.id,
    resumeId: doc.id,
    profileId: doc.profile_id,
    variantName: doc.variant_name,
    targetJobId: jobRecord.id,
    targetJob: {
      id: jobRecord.id,
      title: jobRecord.title,
      companyName,
      location: jobRecord.location,
    },
    truthfulnessScore,
    totalBulletsCount: savedBullets.length,
    provenanceBackedCount,
    unlinkedCount: savedBullets.length - provenanceBackedCount,
    matchedHighlights: matchedHighlights.map((m) => ({
      requirementText: m.requirementText,
      evidenceClaim: m.evidenceClaim,
      evidenceType: m.evidenceType,
    })),
    unsupportedRequirements: unsupportedRequirements.slice(0, 5), // top 5 transparent gaps
    bullets: savedBullets,
    createdAt: doc.created_at.toISOString(),
    updatedAt: doc.updated_at.toISOString(),
  };
}


/**
 * Lists all resume documents/variants for a user.
 */
export async function listUserResumeDocuments(userId: string) {
  const db = getDb();
  const docs = await db
    .select()
    .from(schema.resumeDocuments)
    .where(eq(schema.resumeDocuments.user_id, userId))
    .orderBy(desc(schema.resumeDocuments.updated_at));

  return docs.map((d) => ({
    id: d.id,
    profileId: d.profile_id,
    variantName: d.variant_name,
    isMaster: d.is_master,
    createdAt: d.created_at.toISOString(),
    updatedAt: d.updated_at.toISOString(),
  }));
}

/**
 * Retrieves a specific resume document with full bullet provenance.
 */
export async function getResumeDocumentWithBullets(userId: string, resumeId: string) {
  const db = getDb();

  const [doc] = await db
    .select()
    .from(schema.resumeDocuments)
    .where(and(eq(schema.resumeDocuments.id, resumeId), eq(schema.resumeDocuments.user_id, userId)))
    .limit(1);

  if (!doc) return null;

  const bulletRows = await db
    .select({
      id: schema.resumeBullets.id,
      bulletText: schema.resumeBullets.bullet_text,
      provenanceState: schema.resumeBullets.provenance_state,
      evidenceId: schema.resumeBullets.evidence_id,
      displayOrder: schema.resumeBullets.display_order,
      evidenceClaim: schema.candidateEvidence.claim_text,
      evidenceType: schema.candidateEvidence.evidence_type,
    })
    .from(schema.resumeBullets)
    .leftJoin(schema.candidateEvidence, eq(schema.resumeBullets.evidence_id, schema.candidateEvidence.id))
    .where(eq(schema.resumeBullets.resume_id, doc.id))
    .orderBy(schema.resumeBullets.display_order);

  const bullets: TailoredBulletDto[] = bulletRows.map((b) => ({
    id: b.id,
    bulletText: b.bulletText,
    provenanceState: b.provenanceState as ProvenanceState,
    evidenceId: b.evidenceId,
    evidenceClaimText: b.evidenceClaim || null,
    evidenceType: b.evidenceType || null,
    displayOrder: b.displayOrder,
  }));

  const provenanceBackedCount = bullets.filter((b) => b.provenanceState === 'PROVENANCE_BACKED').length;
  const truthfulnessScore = bullets.length > 0 ? Math.round((provenanceBackedCount / bullets.length) * 100) : 100;

  return {
    id: doc.id,
    profileId: doc.profile_id,
    variantName: doc.variant_name,
    isMaster: doc.is_master,
    truthfulnessScore,
    bullets,
    createdAt: doc.created_at.toISOString(),
    updatedAt: doc.updated_at.toISOString(),
  };
}

/**
 * Adds a bullet to a resume variant.
 */
export async function addResumeBullet(
  userId: string,
  resumeId: string,
  params: {
    bulletText: string;
    evidenceId?: string | null;
  }
) {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(schema.resumeDocuments)
    .where(and(eq(schema.resumeDocuments.id, resumeId), eq(schema.resumeDocuments.user_id, userId)))
    .limit(1);

  if (!doc) {
    throw new Error('Resume variant not found or access denied');
  }

  let provenanceState: ProvenanceState = 'UNLINKED';
  let verifiedEvidenceId: string | null = null;

  if (params.evidenceId) {
    const [ev] = await db
      .select()
      .from(schema.candidateEvidence)
      .where(and(eq(schema.candidateEvidence.id, params.evidenceId), eq(schema.candidateEvidence.user_id, userId)))
      .limit(1);
    if (ev) {
      provenanceState = 'PROVENANCE_BACKED';
      verifiedEvidenceId = ev.id;
    }
  }

  const existingBullets = await db
    .select({ displayOrder: schema.resumeBullets.display_order })
    .from(schema.resumeBullets)
    .where(eq(schema.resumeBullets.resume_id, resumeId));

  const maxOrder = existingBullets.reduce((max, b) => Math.max(max, b.displayOrder), 0);

  const [newBullet] = await db
    .insert(schema.resumeBullets)
    .values({
      resume_id: resumeId,
      evidence_id: verifiedEvidenceId,
      bullet_text: params.bulletText.trim(),
      provenance_state: provenanceState,
      display_order: maxOrder + 1,
    })
    .returning();

  return newBullet;
}

/**
 * Deletes a bullet from a resume variant.
 */
export async function deleteResumeBullet(userId: string, resumeId: string, bulletId: string) {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(schema.resumeDocuments)
    .where(and(eq(schema.resumeDocuments.id, resumeId), eq(schema.resumeDocuments.user_id, userId)))
    .limit(1);

  if (!doc) {
    throw new Error('Resume variant not found or access denied');
  }

  await db
    .delete(schema.resumeBullets)
    .where(and(eq(schema.resumeBullets.id, bulletId), eq(schema.resumeBullets.resume_id, resumeId)));

  return true;
}

/**
 * Deletes an entire resume variant and cascades bullets.
 */
export async function deleteResumeVariant(userId: string, resumeId: string) {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(schema.resumeDocuments)
    .where(and(eq(schema.resumeDocuments.id, resumeId), eq(schema.resumeDocuments.user_id, userId)))
    .limit(1);

  if (!doc) {
    throw new Error('Resume variant not found or access denied');
  }

  await db.delete(schema.resumeBullets).where(eq(schema.resumeBullets.resume_id, resumeId));
  await db.delete(schema.resumeDocuments).where(eq(schema.resumeDocuments.id, resumeId));

  return true;
}

