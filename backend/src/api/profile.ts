/**
 * Candidate Profile & Resume Intelligence API Handlers.
 *
 * Provides endpoints for:
 *   GET    /api/profile                  — Retrieve candidate profile & completeness
 *   PUT    /api/profile                  — Update profile fields
 *   GET    /api/profile/resumes          — List user's resumes
 *   POST   /api/profile/resumes          — Upload & parse resume
 *   POST   /api/profile/resumes/:id/activate — Set active resume
 *   DELETE /api/profile/resumes/:id      — Delete resume
 *   GET    /api/profile/completeness     — Get detailed completeness breakdown
 *   POST   /api/profile/compare-job/:jobId — Compare profile with a specific job
 */

import type { Request, Response } from 'express';
import type { StrictlyAuthenticatedRequest } from '../auth/middleware.js';
import {
  getCandidateProfile,
  uploadAndParseResume,
  listUserResumes,
  setActiveResume,
  deleteResume,
  calculateProfileCompleteness,
} from '../resume/profile-service.js';
import { compareProfileWithJob } from '../resume/job-fit-evaluator.js';
import { getJobById } from '../jobs/job-service.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';

/**
 * GET /api/profile
 */
export async function getProfileHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const profile = await getCandidateProfile(userId);
    res.json({ profile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve profile', details: err.message });
  }
}

/**
 * PUT /api/profile
 */
export async function updateProfileHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const body = req.body || {};

  try {
    const db = getDb();
    await db
      .insert(schema.candidateProfiles)
      .values({
        user_id: userId,
        full_name: body.fullName || null,
        headline: body.headline || null,
        summary: body.summary || null,
        primary_role: body.primaryRole || null,
        target_roles: body.targetRoles || [],
        experience_level: body.experienceLevel || 'FRESHER',
        total_experience_months: body.totalExperienceMonths || 0,
      })
      .onConflictDoUpdate({
        target: [schema.candidateProfiles.user_id],
        set: {
          full_name: body.fullName || null,
          headline: body.headline || null,
          summary: body.summary || null,
          primary_role: body.primaryRole || null,
          target_roles: body.targetRoles || [],
          experience_level: body.experienceLevel || 'FRESHER',
          total_experience_months: body.totalExperienceMonths || 0,
          updated_at: new Date(),
        },
      });

    const updated = await getCandidateProfile(userId);
    res.json({ profile: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
}

/**
 * GET /api/profile/resumes
 */
export async function listResumesHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const resumesList = await listUserResumes(userId);
    res.json({ resumes: resumesList });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list resumes', details: err.message });
  }
}

/**
 * POST /api/profile/resumes
 * Accepts raw text or base64 file buffer with filename and mimeType.
 */
export async function uploadResumeHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;

  const { filename, content, base64, mimeType } = req.body || {};

  if (!filename) {
    res.status(400).json({ error: 'filename is required' });
    return;
  }

  try {
    let fileBuffer: Buffer;
    if (base64) {
      fileBuffer = Buffer.from(base64, 'base64');
    } else if (content) {
      fileBuffer = Buffer.from(String(content), 'utf-8');
    } else {
      res.status(400).json({ error: 'Resume content or base64 data required' });
      return;
    }

    const effectiveMime = mimeType || (filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
    const result = await uploadAndParseResume(userId, filename, fileBuffer, effectiveMime);

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to upload and parse resume', details: err.message });
  }
}

/**
 * POST /api/profile/resumes/:id/activate
 */
export async function activateResumeHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const resumeId = String(req.params.id || '');

  if (!resumeId) {
    res.status(400).json({ error: 'Resume ID required' });
    return;
  }

  try {
    await setActiveResume(userId, resumeId);
    const profile = await getCandidateProfile(userId);
    res.json({ message: 'Active resume updated', profile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to activate resume', details: err.message });
  }
}

/**
 * DELETE /api/profile/resumes/:id
 */
export async function deleteResumeHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const resumeId = String(req.params.id || '');

  if (!resumeId) {
    res.status(400).json({ error: 'Resume ID required' });
    return;
  }

  try {
    const success = await deleteResume(userId, resumeId);
    if (!success) {
      res.status(404).json({ error: 'Resume not found' });
      return;
    }
    const profile = await getCandidateProfile(userId);
    res.json({ message: 'Resume deleted successfully', profile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete resume', details: err.message });
  }
}

/**
 * GET /api/profile/completeness
 */
export async function getCompletenessHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;

  try {
    const profile = await getCandidateProfile(userId);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const completeness = calculateProfileCompleteness({
      hasResume: !!profile.activeResume,
      skillsCount: profile.skills.length,
      educationsCount: profile.educations.length,
      projectsCount: profile.projects.length,
      experiencesCount: profile.experiences.length,
      hasPreferredRoles: profile.targetRoles.length > 0 || !!profile.headline,
    });

    res.json({ completeness });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to calculate completeness', details: err.message });
  }
}

/**
 * POST /api/profile/compare-job/:jobId
 */
export async function compareJobHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as StrictlyAuthenticatedRequest;
  const userId = authReq.user.id;
  const jobId = String(req.params.jobId || '');

  if (!jobId) {
    res.status(400).json({ error: 'Job ID required' });
    return;
  }

  try {
    const profile = await getCandidateProfile(userId);
    if (!profile) {
      res.status(404).json({ error: 'Candidate profile not found' });
      return;
    }

    const job = await getJobById(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const fitResult = compareProfileWithJob(profile, {
      id: job.id,
      title: job.title,
      companyName: job.companyName || 'Company',
      location: job.location,
      workplaceType: job.workplaceType,
      description: job.description,
      requirements: job.requirements,
      experienceClassification: job.experienceClassification,
    });

    res.json(fitResult);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compare job with profile', details: err.message });
  }
}
