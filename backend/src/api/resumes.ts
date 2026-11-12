/**
 * Career Evidence Profile & Resume Studio 2.0 API Handlers — Engine 3.
 *
 * Implements endpoints for:
 *   - Master Career Evidence Vault (CRUD for claims & direct candidate controls)
 *   - Truth-Preserving Resume Studio & Variant Tailoring
 *   - Claim Provenance Inspection (bullet-to-evidence linkage)
 *   - Local Machine Extraction (ATS) Simulator
 *
 * Complies with Blueprint Section 6 and docs/ENGINEERING_STANDARDS.md.
 */

import type { Request, Response } from 'express';
import type { StrictlyAuthenticatedRequest } from '../auth/middleware.js';
import {
  getOrCreateCareerProfile,
  updateCareerProfile,
  listCandidateEvidence,
  createCandidateEvidence,
  deleteCandidateEvidence,
  reactivateCandidateEvidence,
  syncProfileToEvidence,
  addCandidateSkill,
  removeCandidateSkill,
  addCandidateProject,
  deleteCandidateProject,
  addCandidateExperience,
  deleteCandidateExperience,
  addCandidateEducation,
  deleteCandidateEducation,
  type EvidenceType,
} from '../resumes/career-evidence-service.js';
import {
  tailorResumeForJob,
  listUserResumeDocuments,
  getResumeDocumentWithBullets,
  addResumeBullet,
  deleteResumeBullet,
  deleteResumeVariant,
} from '../resumes/resume-tailoring-service.js';
import { inspectResumeParseQuality } from '../resumes/ats-parser-simulator.js';
import { getJobById } from '../jobs/job-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('api:resumes');

// ── Master Career Profile Handlers ───────────────────────────────────────────

export async function getCareerProfileHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const profile = await getOrCreateCareerProfile(userId);
    res.json({ profile });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to get career profile');
    res.status(500).json({ error: 'Failed to retrieve career profile', details: err.message });
  }
}

export async function updateCareerProfileHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { professionalHeadline, careerObjective } = req.body;

  try {
    const profile = await updateCareerProfile(userId, { professionalHeadline, careerObjective });
    res.json({ profile });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to update career profile');
    res.status(500).json({ error: 'Failed to update career profile', details: err.message });
  }
}

// ── Master Evidence Vault Handlers ───────────────────────────────────────────

export async function listEvidenceHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const typeParam = typeof req.query.type === 'string' ? (req.query.type as EvidenceType) : undefined;
  const includeWithdrawn = req.query.includeWithdrawn === 'true';

  try {
    const evidence = await listCandidateEvidence(userId, typeParam, includeWithdrawn);
    res.json({ evidence });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to list evidence');
    res.status(500).json({ error: 'Failed to list career evidence', details: err.message });
  }
}

export async function addEvidenceHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { evidenceType, claimText, referenceId, verifiedStatus, lifecycleState } = req.body;

  if (!evidenceType || !claimText) {
    res.status(400).json({ error: 'evidenceType and claimText are required' });
    return;
  }

  // Safeguard: Candidate self-created claims are strictly SELF_REPORTED.
  // Candidates cannot self-assign DOCUMENT_SUPPORTED or EXTERNALLY_VERIFIED via client input.
  if (verifiedStatus && verifiedStatus !== 'SELF_REPORTED') {
    res.status(400).json({
      error: 'Unsupported verification level requested. Direct candidate claims must be SELF_REPORTED.',
    });
    return;
  }

  try {
    const created = await createCandidateEvidence(userId, {
      evidenceType,
      claimText,
      referenceId,
      verifiedStatus: 'SELF_REPORTED',
      lifecycleState,
    });
    res.status(201).json({ evidence: created });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to add evidence claim');
    res.status(500).json({ error: 'Failed to add career evidence', details: err.message });
  }
}

export async function deleteEvidenceHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);

  try {
    const deleted = await deleteCandidateEvidence(userId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Evidence claim not found or access denied' });
      return;
    }
    res.json({ message: 'Evidence claim deleted successfully' });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to delete evidence');
    res.status(500).json({ error: 'Failed to delete evidence', details: err.message });
  }
}

export async function reactivateEvidenceHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);
  const { newVerifiedStatus, referenceId } = req.body || {};

  // Safeguard: Candidate clients cannot self-upgrade their verification level.
  // Verification upgrades require authoritative assessment or independent external verification.
  if (newVerifiedStatus && newVerifiedStatus !== 'SELF_REPORTED') {
    res.status(400).json({
      error: 'Unsupported verification upgrade requested. Candidates cannot self-assign document or external verification.',
    });
    return;
  }

  try {
    const reactivated = await reactivateCandidateEvidence(userId, id, {
      referenceId,
    });
    if (!reactivated) {
      res.status(404).json({ error: 'Evidence claim not found or access denied' });
      return;
    }
    res.json({ evidence: reactivated });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to reactivate evidence');
    res.status(500).json({ error: 'Failed to reactivate evidence', details: err.message });
  }
}

export async function syncEvidenceHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const syncResult = await syncProfileToEvidence(userId);
    const profile = await getOrCreateCareerProfile(userId);
    res.json({
      message: 'Evidence synced successfully',
      syncedCount: syncResult.syncedCount,
      updatedCount: syncResult.updatedCount,
      alreadyUpToDateCount: syncResult.alreadyUpToDateCount,
      totalActiveClaims: syncResult.totalActiveClaims,
      profile,
    });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to sync evidence');
    res.status(500).json({ error: 'Failed to sync evidence', details: err.message });
  }
}

// ── Direct Candidate Data Controls Handlers (Skills, Projects, Experience) ───

export async function addCandidateSkillHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { skillName, category } = req.body;

  if (!skillName || typeof skillName !== 'string' || !skillName.trim()) {
    res.status(400).json({ error: 'skillName is required' });
    return;
  }

  try {
    const skill = await addCandidateSkill(
      userId,
      skillName.trim(),
      typeof category === 'string' ? category : 'Technical'
    );
    res.status(201).json({ skill });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to add candidate skill');
    res.status(500).json({ error: 'Failed to add skill', details: err.message });
  }
}

export async function deleteCandidateSkillHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);

  try {
    const deleted = await removeCandidateSkill(userId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Skill not found or access denied' });
      return;
    }
    res.json({ message: 'Skill deleted successfully' });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to delete candidate skill');
    res.status(500).json({ error: 'Failed to delete skill', details: err.message });
  }
}

export async function addCandidateProjectHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { title, description, technologies, url } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  try {
    const project = await addCandidateProject(userId, {
      title: title.trim(),
      description,
      technologies: Array.isArray(technologies) ? technologies : [],
      url,
    });
    res.status(201).json({ project });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to add candidate project');
    res.status(500).json({ error: 'Failed to add project', details: err.message });
  }
}

export async function deleteCandidateProjectHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);

  try {
    const deleted = await deleteCandidateProject(userId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found or access denied' });
      return;
    }
    res.json({ message: 'Project deleted successfully' });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to delete candidate project');
    res.status(500).json({ error: 'Failed to delete project', details: err.message });
  }
}

export async function addCandidateExperienceHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { title, company, location, description } = req.body;

  const companyName = company || req.body.companyName;
  if (!title || !companyName) {
    res.status(400).json({ error: 'title and company are required' });
    return;
  }

  try {
    const experience = await addCandidateExperience(userId, {
      title: title.trim(),
      companyName: String(companyName).trim(),
      location,
      isInternship: Boolean(req.body.isInternship || req.body.employmentType === 'INTERNSHIP'),
      description,
    });
    res.status(201).json({ experience });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to add candidate experience');
    res.status(500).json({ error: 'Failed to add experience', details: err.message });
  }
}

export async function deleteCandidateExperienceHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);

  try {
    const deleted = await deleteCandidateExperience(userId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Experience record not found or access denied' });
      return;
    }
    res.json({ message: 'Experience record deleted successfully' });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to delete candidate experience');
    res.status(500).json({ error: 'Failed to delete experience', details: err.message });
  }
}

export async function addCandidateEducationHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { institution, degree, fieldOfStudy, startYear, endYear } = req.body;

  if (!institution || !degree) {
    res.status(400).json({ error: 'institution and degree are required' });
    return;
  }

  try {
    const education = await addCandidateEducation(userId, {
      institution: String(institution).trim(),
      degree: String(degree).trim(),
      fieldOfStudy: fieldOfStudy ? String(fieldOfStudy).trim() : null,
      startYear: startYear ? parseInt(String(startYear), 10) : null,
      endYear: endYear ? parseInt(String(endYear), 10) : null,
    });
    res.status(201).json({ education });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to add candidate education');
    res.status(500).json({ error: 'Failed to add education', details: err.message });
  }
}

export async function deleteCandidateEducationHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);

  try {
    const deleted = await deleteCandidateEducation(userId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Education record not found or access denied' });
      return;
    }
    res.json({ message: 'Education record deleted successfully' });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to delete candidate education');
    res.status(500).json({ error: 'Failed to delete education', details: err.message });
  }
}

// ── Resume Studio & Tailoring Handlers ────────────────────────────────────────

export async function tailorResumeHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { jobId, variantName } = req.body;

  if (!jobId) {
    res.status(400).json({ error: 'jobId is required to tailor resume' });
    return;
  }

  try {
    const tailored = await tailorResumeForJob({
      userId,
      jobId,
      variantName: variantName ? String(variantName) : undefined,
    });
    res.status(201).json({ tailored });
  } catch (err: any) {
    log.error({ err: err.message, jobId, userId }, 'Failed to tailor resume for job');
    res.status(500).json({ error: 'Failed to tailor resume', details: err.message });
  }
}

export async function listResumeVariantsHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const variants = await listUserResumeDocuments(userId);
    res.json({ variants });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to list resume variants');
    res.status(500).json({ error: 'Failed to list resume variants', details: err.message });
  }
}

export async function getResumeVariantHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);

  try {
    const variant = await getResumeDocumentWithBullets(userId, id);
    if (!variant) {
      res.status(404).json({ error: 'Resume variant not found' });
      return;
    }
    res.json({ variant });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to get resume variant');
    res.status(500).json({ error: 'Failed to retrieve resume variant', details: err.message });
  }
}

export async function addResumeBulletHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);
  const { bulletText, evidenceId } = req.body;

  if (!bulletText || !bulletText.trim()) {
    res.status(400).json({ error: 'bulletText is required' });
    return;
  }

  try {
    const bullet = await addResumeBullet(userId, id, {
      bulletText,
      evidenceId: evidenceId ? String(evidenceId) : null,
    });
    res.status(201).json({ bullet });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to add resume bullet');
    res.status(500).json({ error: 'Failed to add bullet', details: err.message });
  }
}

export async function deleteResumeBulletHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);
  const bulletId = String(req.params.bulletId);

  try {
    await deleteResumeBullet(userId, id, bulletId);
    res.json({ message: 'Bullet deleted successfully' });
  } catch (err: any) {
    log.error({ err: err.message, id, bulletId, userId }, 'Failed to delete resume bullet');
    res.status(500).json({ error: 'Failed to delete bullet', details: err.message });
  }
}

export async function deleteResumeVariantHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const id = String(req.params.id);

  try {
    await deleteResumeVariant(userId, id);
    res.json({ message: 'Resume variant deleted successfully' });
  } catch (err: any) {
    log.error({ err: err.message, id, userId }, 'Failed to delete resume variant');
    res.status(500).json({ error: 'Failed to delete resume variant', details: err.message });
  }
}

// ── Machine Extraction (ATS) Simulator Handler ───────────────────────────────

export async function inspectATSResumeHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const { resumeText, resumeId, targetJobId, targetJobText } = req.body;

  try {
    let resolvedResumeText = resumeText || '';
    let resolvedBullets: Array<{ bulletText: string; provenanceState: string }> = [];

    // If resumeId provided, pull variant text and bullets
    if (resumeId) {
      const variant = await getResumeDocumentWithBullets(userId, String(resumeId));
      if (variant) {
        resolvedBullets = variant.bullets.map((b) => ({
          bulletText: b.bulletText,
          provenanceState: b.provenanceState,
        }));
        if (!resolvedResumeText) {
          resolvedResumeText = variant.bullets.map((b) => b.bulletText).join('\n');
        }
      }
    }

    let resolvedJobText = targetJobText || '';
    if (targetJobId && !resolvedJobText) {
      const job = await getJobById(String(targetJobId));
      if (job) {
        resolvedJobText = `${job.title}\n${job.description || ''}\n${job.requirements || ''}`;
      }
    }

    const inspection = inspectResumeParseQuality({
      resumeText: resolvedResumeText,
      targetJobText: resolvedJobText,
      bullets: resolvedBullets.map((b) => ({
        bulletText: b.bulletText,
        provenanceState: b.provenanceState as any,
      })),
    });

    res.json({ inspection });
  } catch (err: any) {
    log.error({ err: err.message, userId }, 'Failed to inspect resume with ATS simulator');
    res.status(500).json({ error: 'Failed to run ATS inspection', details: err.message });
  }
}
