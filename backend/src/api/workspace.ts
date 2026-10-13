/**
 * Personal Job-Seeker Workspace API Handlers.
 *
 * All endpoints require authentication.
 */

import type { Request, Response } from 'express';
import {
  saveJob,
  unsaveJob,
  markJobApplied,
  unmarkJobApplied,
  dismissJob,
  restoreDismissedJob,
  recordJobView,
  setJobNotes,
  deleteJobNotes,
  getSavedJobs,
  getAppliedJobs,
  getDismissedJobs,
  getRecentlyViewedJobs,
  getWorkspaceStats,
  getUserJobInteraction,
  setApplicationStatus,
  selectResumeForJob,
  setChecklist,
  setCoverLetter,
  deleteCoverLetter,
  setReminder,
  setInterviewNotes,
  generateCoverLetterDraft,
  getApplicationReadiness,
  MAX_COVER_LETTER_LENGTH,
  MAX_INTERVIEW_NOTES_LENGTH,
  MAX_NOTES_LENGTH,
} from '../workspace/user-job-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('api:workspace');

function getUserId(req: Request): string | null {
  const user = (req as any).user;
  return user?.id ?? user?.userId ?? null;
}

export async function saveJobHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await saveJob(userId, jobId);
    res.json({ message: 'Job saved successfully', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to save job');
    res.status(500).json({ error: 'Failed to save job' });
  }
}

export async function unsaveJobHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await unsaveJob(userId, jobId);
    res.json({ message: 'Job unsaved successfully', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to unsave job');
    res.status(500).json({ error: 'Failed to unsave job' });
  }
}

export async function applyJobHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await markJobApplied(userId, jobId);
    res.json({ message: 'Job marked as applied', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to mark job as applied');
    res.status(500).json({ error: 'Failed to mark job as applied' });
  }
}

export async function unapplyJobHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await unmarkJobApplied(userId, jobId);
    res.json({ message: 'Job unmarked as applied', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to unmark job as applied');
    res.status(500).json({ error: 'Failed to unmark job as applied' });
  }
}

export async function dismissJobHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await dismissJob(userId, jobId);
    res.json({ message: 'Job dismissed from feed', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to dismiss job');
    res.status(500).json({ error: 'Failed to dismiss job' });
  }
}

export async function restoreJobHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await restoreDismissedJob(userId, jobId);
    res.json({ message: 'Job restored to feed', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to restore job');
    res.status(500).json({ error: 'Failed to restore job' });
  }
}

export async function recordJobViewHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await recordJobView(userId, jobId);
    res.json({ message: 'Job view recorded', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to record job view');
    res.status(500).json({ error: 'Failed to record job view' });
  }
}

export async function updateJobNotesHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  const notes = String(req.body.notes || '');

  if (notes.length > MAX_NOTES_LENGTH) {
    res.status(400).json({
      error: `Notes exceed maximum length of ${MAX_NOTES_LENGTH} characters`,
    });
    return;
  }

  try {
    const interaction = await setJobNotes(userId, jobId!, notes);
    res.json({ message: 'Notes updated', interaction });
  } catch (err: any) {
    log.error({ err: err.message, userId, jobId }, 'Failed to update job notes');
    res.status(400).json({ error: err.message || 'Failed to update notes' });
  }
}

export async function deleteJobNotesHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');

  try {
    const interaction = await deleteJobNotes(userId, jobId!);
    res.json({ message: 'Notes deleted', interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to delete job notes');
    res.status(500).json({ error: 'Failed to delete notes' });
  }
}

export async function getJobInteractionHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');

  try {
    const interaction = await getUserJobInteraction(userId, jobId!);
    res.json({ interaction });
  } catch (err) {
    log.error({ err, userId, jobId }, 'Failed to get job interaction');
    res.status(500).json({ error: 'Failed to retrieve interaction' });
  }
}

export async function listSavedJobsHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const status = (req.query['status'] as any) || 'ALL';
  const applied = (req.query['applied'] as any) || 'ALL';
  const q = req.query['q'] ? String(req.query['q']) : undefined;
  const page = parseInt(String(req.query['page'] || '1'), 10) || 1;
  const limit = parseInt(String(req.query['limit'] || '15'), 10) || 15;

  try {
    const result = await getSavedJobs(userId, { status, applied, q, page, limit });
    res.json(result);
  } catch (err) {
    log.error({ err, userId }, 'Failed to list saved jobs');
    res.status(500).json({ error: 'Failed to list saved jobs' });
  }
}

export async function listApplicationsHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const status = (req.query['status'] as any) || 'ALL';
  const q = req.query['q'] ? String(req.query['q']) : undefined;
  const page = parseInt(String(req.query['page'] || '1'), 10) || 1;
  const limit = parseInt(String(req.query['limit'] || '15'), 10) || 15;

  try {
    const result = await getAppliedJobs(userId, { status, q, page, limit });
    res.json(result);
  } catch (err) {
    log.error({ err, userId }, 'Failed to list applications');
    res.status(500).json({ error: 'Failed to list applications' });
  }
}

export async function listDismissedJobsHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const q = req.query['q'] ? String(req.query['q']) : undefined;
  const page = parseInt(String(req.query['page'] || '1'), 10) || 1;
  const limit = parseInt(String(req.query['limit'] || '15'), 10) || 15;

  try {
    const result = await getDismissedJobs(userId, { q, page, limit });
    res.json(result);
  } catch (err) {
    log.error({ err, userId }, 'Failed to list dismissed jobs');
    res.status(500).json({ error: 'Failed to list dismissed jobs' });
  }
}

export async function listRecentlyViewedHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const limit = parseInt(String(req.query['limit'] || '10'), 10) || 10;

  try {
    const items = await getRecentlyViewedJobs(userId, limit);
    res.json({ items, total: items.length });
  } catch (err) {
    log.error({ err, userId }, 'Failed to list recently viewed jobs');
    res.status(500).json({ error: 'Failed to list recently viewed jobs' });
  }
}

export async function getWorkspaceStatsHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const stats = await getWorkspaceStats(userId);
    res.json(stats);
  } catch (err) {
    log.error({ err, userId }, 'Failed to get workspace stats');
    res.status(500).json({ error: 'Failed to retrieve workspace statistics' });
  }
}

// ─── Phase 14 Application Intelligence Handlers ──────────────────────────────

export async function getApplicationReadinessHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const readiness = await getApplicationReadiness(userId, jobId);
    res.json(readiness);
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 500;
    log.error({ err: err.message, userId, jobId }, 'Failed to get application readiness');
    res.status(status).json({ error: err.message || 'Failed to retrieve application readiness' });
  }
}

export async function setApplicationStatusHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  const status = String(req.body.status || '');
  if (!jobId || !status) {
    res.status(400).json({ error: 'Job ID and status are required' });
    return;
  }

  try {
    const interaction = await setApplicationStatus(userId, jobId, status);
    res.json({ message: 'Application status updated', interaction });
  } catch (err: any) {
    const statusCode = err.message?.includes('Invalid application status') ? 400 : 500;
    log.error({ err: err.message, userId, jobId }, 'Failed to update application status');
    res.status(statusCode).json({ error: err.message || 'Failed to update application status' });
  }
}

export async function selectResumeForJobHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  const resumeId = req.body.resumeId ? String(req.body.resumeId) : null;
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await selectResumeForJob(userId, jobId, resumeId);
    res.json({ message: 'Resume selected for application', interaction });
  } catch (err: any) {
    const statusCode = err.message?.includes('not found or does not belong') ? 404 : 500;
    log.error({ err: err.message, userId, jobId }, 'Failed to select resume for job');
    res.status(statusCode).json({ error: err.message || 'Failed to select resume' });
  }
}

export async function setChecklistHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  const checklist = req.body.checklist;
  if (!jobId || !checklist) {
    res.status(400).json({ error: 'Job ID and checklist payload are required' });
    return;
  }

  try {
    const interaction = await setChecklist(userId, jobId, checklist);
    res.json({ message: 'Checklist updated', interaction });
  } catch (err: any) {
    log.error({ err: err.message, userId, jobId }, 'Failed to update checklist');
    res.status(400).json({ error: err.message || 'Invalid checklist payload' });
  }
}

export async function setCoverLetterHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  const coverLetter = req.body.coverLetter !== undefined ? String(req.body.coverLetter) : '';
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  if (coverLetter.length > MAX_COVER_LETTER_LENGTH) {
    res.status(400).json({
      error: `Cover letter exceeds maximum length of ${MAX_COVER_LETTER_LENGTH} characters`,
    });
    return;
  }

  try {
    const interaction = await setCoverLetter(userId, jobId, coverLetter);
    res.json({ message: 'Cover letter updated', interaction });
  } catch (err: any) {
    log.error({ err: err.message, userId, jobId }, 'Failed to update cover letter');
    res.status(400).json({ error: err.message || 'Failed to update cover letter' });
  }
}

export async function deleteCoverLetterHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await deleteCoverLetter(userId, jobId);
    res.json({ message: 'Cover letter deleted', interaction });
  } catch (err: any) {
    log.error({ err: err.message, userId, jobId }, 'Failed to delete cover letter');
    res.status(500).json({ error: 'Failed to delete cover letter' });
  }
}

export async function generateCoverLetterDraftHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const draft = await generateCoverLetterDraft(userId, jobId);
    res.json(draft);
  } catch (err: any) {
    const statusCode = err.message?.includes('not found') ? 404 : 500;
    log.error({ err: err.message, userId, jobId }, 'Failed to generate cover letter draft');
    res.status(statusCode).json({ error: err.message || 'Failed to generate draft' });
  }
}

export async function setReminderHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  const reminderAt = req.body.reminderAt !== undefined ? req.body.reminderAt : null;
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  try {
    const interaction = await setReminder(userId, jobId, reminderAt);
    res.json({ message: 'Reminder updated', interaction });
  } catch (err: any) {
    const statusCode = err.message?.includes('Invalid reminder') ? 400 : 500;
    log.error({ err: err.message, userId, jobId }, 'Failed to update reminder');
    res.status(statusCode).json({ error: err.message || 'Failed to update reminder' });
  }
}

export async function setInterviewNotesHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const jobId = String(req.params.id || '');
  const notes = req.body.notes !== undefined ? String(req.body.notes) : '';
  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required' });
    return;
  }

  if (notes.length > MAX_INTERVIEW_NOTES_LENGTH) {
    res.status(400).json({
      error: `Interview notes exceed maximum length of ${MAX_INTERVIEW_NOTES_LENGTH} characters`,
    });
    return;
  }

  try {
    const interaction = await setInterviewNotes(userId, jobId, notes);
    res.json({ message: 'Interview notes updated', interaction });
  } catch (err: any) {
    log.error({ err: err.message, userId, jobId }, 'Failed to update interview notes');
    res.status(400).json({ error: err.message || 'Failed to update interview notes' });
  }
}

// Export aliases for backward compatibility and test consistency
export {
  listSavedJobsHandler as getSavedJobsHandler,
  listApplicationsHandler as getAppliedJobsHandler,
  listDismissedJobsHandler as getDismissedJobsHandler,
  listRecentlyViewedHandler as getRecentlyViewedJobsHandler,
};
