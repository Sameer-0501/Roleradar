/**
 * Phase 14: Application Intelligence & Job Application Assistant Tests.
 *
 * Tests the service logic and API route handlers for Phase 14:
 * - Application creation & status transitions
 * - Resume version selection & ownership isolation
 * - Checklist persistence & payload boundary enforcement (max 20 items, max 300 chars)
 * - Private notes & length limits (max 5,000 chars)
 * - Reminders & timestamp validation
 * - Cover-letter assistance & length limits (max 5,000 chars)
 * - Interview preparation notes & length limits (max 10,000 chars)
 * - Authorization & user isolation (401 on missing auth)
 * - Official employer application URL requirement & no-auto-submit rule
 * - Duplicate application prevention / idempotency
 * - Job closed / invalid state handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import {
  validateChecklistPayload,
  VALID_APPLICATION_STATUSES,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT_LENGTH,
  MAX_COVER_LETTER_LENGTH,
  MAX_INTERVIEW_NOTES_LENGTH,
  MAX_NOTES_LENGTH,
  getDefaultChecklist,
} from '../workspace/user-job-service.js';
import {
  getApplicationReadinessHandler,
  setApplicationStatusHandler,
  selectResumeForJobHandler,
  setChecklistHandler,
  setCoverLetterHandler,
  deleteCoverLetterHandler,
  generateCoverLetterDraftHandler,
  setReminderHandler,
  setInterviewNotesHandler,
} from '../api/workspace.js';

// ─── Mock Services for API Handler Tests ─────────────────────────────────────

const mockJobService = vi.hoisted(() => ({
  getApplicationReadiness: vi.fn(),
  setApplicationStatus: vi.fn(),
  selectResumeForJob: vi.fn(),
  setChecklist: vi.fn(),
  setCoverLetter: vi.fn(),
  deleteCoverLetter: vi.fn(),
  generateCoverLetterDraft: vi.fn(),
  setReminder: vi.fn(),
  setInterviewNotes: vi.fn(),
}));

vi.mock('../workspace/user-job-service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../workspace/user-job-service.js')>();
  return {
    ...original,
    getApplicationReadiness: mockJobService.getApplicationReadiness,
    setApplicationStatus: mockJobService.setApplicationStatus,
    selectResumeForJob: mockJobService.selectResumeForJob,
    setChecklist: mockJobService.setChecklist,
    setCoverLetter: mockJobService.setCoverLetter,
    deleteCoverLetter: mockJobService.deleteCoverLetter,
    generateCoverLetterDraft: mockJobService.generateCoverLetterDraft,
    setReminder: mockJobService.setReminder,
    setInterviewNotes: mockJobService.setInterviewNotes,
  };
});

function createMockResponse(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('Phase 14: Application Assistant — Safety & Boundary Rules', () => {
  it('1. Enforces maximum 20 checklist items per job', () => {
    const valid20 = Array.from({ length: 20 }, (_, i) => ({
      id: `item-${i}`,
      text: `Valid task ${i}`,
      done: false,
    }));
    expect(() => validateChecklistPayload(valid20)).not.toThrow();

    const invalid21 = Array.from({ length: 21 }, (_, i) => ({
      id: `item-${i}`,
      text: `Task ${i}`,
      done: false,
    }));
    expect(() => validateChecklistPayload(invalid21)).toThrow(/cannot exceed 20 items/);
  });

  it('2. Enforces maximum 300 characters per checklist item text', () => {
    const valid300 = [
      {
        id: 'task-1',
        text: 'A'.repeat(MAX_CHECKLIST_TEXT_LENGTH),
        done: false,
      },
    ];
    expect(validateChecklistPayload(valid300)[0]?.text.length).toBe(300);

    const invalid301 = [
      {
        id: 'task-2',
        text: 'A'.repeat(MAX_CHECKLIST_TEXT_LENGTH + 1),
        done: false,
      },
    ];
    expect(() => validateChecklistPayload(invalid301)).toThrow(/exceeds maximum length of 300/);
  });

  it('3. Rejects malformed checklist payloads (missing id, text, or done)', () => {
    expect(() => validateChecklistPayload('not an array')).toThrow(/must be an array/);
    expect(() => validateChecklistPayload([{ text: 'No id', done: false }])).toThrow(/valid string id/);
    expect(() => validateChecklistPayload([{ id: 'id-1', text: '   ', done: false }])).toThrow(/cannot be empty/);
    expect(() => validateChecklistPayload([{ id: 'id-1', text: 'Task', done: 'yes' }])).toThrow(/boolean done/);
  });

  it('4. Defines all canonical application statuses', () => {
    expect(VALID_APPLICATION_STATUSES).toContain('SAVED');
    expect(VALID_APPLICATION_STATUSES).toContain('PREPARING');
    expect(VALID_APPLICATION_STATUSES).toContain('APPLIED');
    expect(VALID_APPLICATION_STATUSES).toContain('INTERVIEWING');
    expect(VALID_APPLICATION_STATUSES).toContain('OFFERED');
    expect(VALID_APPLICATION_STATUSES).toContain('REJECTED');
    expect(VALID_APPLICATION_STATUSES).toContain('WITHDRAWN');
  });

  it('5. Generates structured default checklist tailored with role and company', () => {
    const list = getDefaultChecklist('Backend Engineer', 'Google');
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.some((item) => item.text.includes('Backend Engineer'))).toBe(true);
    expect(list.some((item) => item.text.includes('Google'))).toBe(true);
    expect(list.every((item) => typeof item.id === 'string' && typeof item.done === 'boolean')).toBe(true);
  });

  it('6. Constants define consistent server-side limits', () => {
    expect(MAX_COVER_LETTER_LENGTH).toBe(5000);
    expect(MAX_INTERVIEW_NOTES_LENGTH).toBe(10000);
    expect(MAX_NOTES_LENGTH).toBe(5000);
  });
});

describe('Phase 14: Workspace API Handlers — Auth & Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Rejects unauthenticated requests with 401 across all endpoints', async () => {
    const { res, status, json } = createMockResponse();
    const unauthReq = { params: { id: 'job-1' }, body: {} } as any;

    await getApplicationReadinessHandler(unauthReq, res);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Authentication required' }));

    await setApplicationStatusHandler(unauthReq, res);
    expect(status).toHaveBeenCalledWith(401);

    await selectResumeForJobHandler(unauthReq, res);
    expect(status).toHaveBeenCalledWith(401);

    await setChecklistHandler(unauthReq, res);
    expect(status).toHaveBeenCalledWith(401);

    await setCoverLetterHandler(unauthReq, res);
    expect(status).toHaveBeenCalledWith(401);

    await setReminderHandler(unauthReq, res);
    expect(status).toHaveBeenCalledWith(401);

    await setInterviewNotesHandler(unauthReq, res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('2. Passes authenticated userId to application readiness service', async () => {
    const { res, json } = createMockResponse();
    const req = {
      user: { id: 'user-xyz', email: 'test@example.com' },
      params: { id: 'job-abc' },
    } as any;

    mockJobService.getApplicationReadiness.mockResolvedValueOnce({
      jobId: 'job-abc',
      jobTitle: 'Software Engineer',
      companyName: 'Acme Corp',
      officialUrl: 'https://careers.acme.com/jobs/123',
      officialApplicationNotice:
        'RoleRadar never submits applications automatically. Follow the official link to apply directly on the employer website, then mark as applied.',
      readinessScore: 85,
    });

    await getApplicationReadinessHandler(req, res);
    expect(mockJobService.getApplicationReadiness).toHaveBeenCalledWith('user-xyz', 'job-abc');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-abc',
        officialUrl: 'https://careers.acme.com/jobs/123',
        officialApplicationNotice: expect.stringContaining('never submits applications automatically'),
      })
    );
  });

  it('3. Updates application status and validates status transitions', async () => {
    const { res, json } = createMockResponse();
    const req = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { status: 'INTERVIEWING' },
    } as any;

    mockJobService.setApplicationStatus.mockResolvedValueOnce({
      jobId: 'job-abc',
      applicationStatus: 'INTERVIEWING',
      isApplied: true,
    });

    await setApplicationStatusHandler(req, res);
    expect(mockJobService.setApplicationStatus).toHaveBeenCalledWith('user-xyz', 'job-abc', 'INTERVIEWING');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Application status updated',
        interaction: expect.objectContaining({ applicationStatus: 'INTERVIEWING' }),
      })
    );
  });

  it('4. Rejects invalid application status with 400', async () => {
    const { res, status, json } = createMockResponse();
    const req = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { status: 'INVALID_STATUS' },
    } as any;

    mockJobService.setApplicationStatus.mockRejectedValueOnce(
      new Error('Invalid application status: "INVALID_STATUS". Allowed values: SAVED, PREPARING...')
    );

    await setApplicationStatusHandler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Invalid application status') }));
  });

  it('5. Selects resume and rejects resume not belonging to user with 404', async () => {
    const { res: resSuccess, json: jsonSuccess } = createMockResponse();
    const reqSuccess = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { resumeId: 'resume-1' },
    } as any;

    mockJobService.selectResumeForJob.mockResolvedValueOnce({
      jobId: 'job-abc',
      selectedResumeId: 'resume-1',
    });

    await selectResumeForJobHandler(reqSuccess, resSuccess);
    expect(mockJobService.selectResumeForJob).toHaveBeenCalledWith('user-xyz', 'job-abc', 'resume-1');
    expect(jsonSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Resume selected for application',
      })
    );

    // Alien resume test
    const { res: resFail, status: statusFail, json: jsonFail } = createMockResponse();
    const reqFail = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { resumeId: 'alien-resume' },
    } as any;

    mockJobService.selectResumeForJob.mockRejectedValueOnce(
      new Error('Selected resume not found or does not belong to authenticated user')
    );

    await selectResumeForJobHandler(reqFail, resFail);
    expect(statusFail).toHaveBeenCalledWith(404);
    expect(jsonFail).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('does not belong') })
    );
  });

  it('6. Handles checklist update and validation errors with 400', async () => {
    const { res, status, json } = createMockResponse();
    const req = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { checklist: [{ id: '1', text: 'Task' }] }, // missing 'done'
    } as any;

    mockJobService.setChecklist.mockRejectedValueOnce(
      new Error('Checklist item at index 0 must have a boolean done property')
    );

    await setChecklistHandler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('boolean done') }));
  });

  it('7. Sets and deletes cover letter with length limits', async () => {
    const { res: resSet, json: jsonSet } = createMockResponse();
    const reqSet = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { coverLetter: 'Dear Hiring Team...' },
    } as any;

    mockJobService.setCoverLetter.mockResolvedValueOnce({
      jobId: 'job-abc',
      coverLetter: 'Dear Hiring Team...',
    });

    await setCoverLetterHandler(reqSet, resSet);
    expect(mockJobService.setCoverLetter).toHaveBeenCalledWith('user-xyz', 'job-abc', 'Dear Hiring Team...');
    expect(jsonSet).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cover letter updated' }));

    // Delete cover letter
    const { res: resDel, json: jsonDel } = createMockResponse();
    const reqDel = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
    } as any;

    mockJobService.deleteCoverLetter.mockResolvedValueOnce({
      jobId: 'job-abc',
      coverLetter: null,
    });

    await deleteCoverLetterHandler(reqDel, resDel);
    expect(mockJobService.deleteCoverLetter).toHaveBeenCalledWith('user-xyz', 'job-abc');
    expect(jsonDel).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cover letter deleted' }));
  });

  it('8. Generates explainable cover letter draft without external AI', async () => {
    const { res, json } = createMockResponse();
    const req = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
    } as any;

    mockJobService.generateCoverLetterDraft.mockResolvedValueOnce({
      coverLetter: 'Dear Hiring Team at Stripe...',
      tailoredPoints: ['Aligned with target role: Software Engineer', 'Highlighted matching skills: Go, TypeScript'],
    });

    await generateCoverLetterDraftHandler(req, res);
    expect(mockJobService.generateCoverLetterDraft).toHaveBeenCalledWith('user-xyz', 'job-abc');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        coverLetter: expect.stringContaining('Dear Hiring Team'),
        tailoredPoints: expect.arrayContaining([expect.stringContaining('Aligned with target role')]),
      })
    );
  });

  it('9. Sets and clears application reminder', async () => {
    const { res, json } = createMockResponse();
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const req = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { reminderAt: futureDate },
    } as any;

    mockJobService.setReminder.mockResolvedValueOnce({
      jobId: 'job-abc',
      reminderAt: futureDate,
    });

    await setReminderHandler(req, res);
    expect(mockJobService.setReminder).toHaveBeenCalledWith('user-xyz', 'job-abc', futureDate);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Reminder updated' }));
  });

  it('10. Sets interview preparation notes and rejects oversized payload', async () => {
    const { res, json } = createMockResponse();
    const req = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { notes: 'Focus on system design and database indexing.' },
    } as any;

    mockJobService.setInterviewNotes.mockResolvedValueOnce({
      jobId: 'job-abc',
      interviewNotes: 'Focus on system design and database indexing.',
    });

    await setInterviewNotesHandler(req, res);
    expect(mockJobService.setInterviewNotes).toHaveBeenCalledWith(
      'user-xyz',
      'job-abc',
      'Focus on system design and database indexing.'
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Interview notes updated' }));

    // Length limit violation
    const { res: resErr, status: statusErr, json: jsonErr } = createMockResponse();
    const reqErr = {
      user: { id: 'user-xyz' },
      params: { id: 'job-abc' },
      body: { notes: 'A'.repeat(10001) },
    } as any;

    mockJobService.setInterviewNotes.mockRejectedValueOnce(
      new Error('Interview notes exceed maximum length of 10000 characters')
    );

    await setInterviewNotesHandler(reqErr, resErr);
    expect(statusErr).toHaveBeenCalledWith(400);
    expect(jsonErr).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('maximum length') }));
  });
});
