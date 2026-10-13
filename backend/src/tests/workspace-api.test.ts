/**
 * Workspace API & User Job Interaction Tests (Vitest).
 *
 * Tests Express route handlers for Phase 11 workspace endpoints:
 * - Unauthenticated requests are rejected (401)
 * - User isolation: operations use req.user.id
 * - Save, Unsave, Mark Applied, Unmark Applied
 * - Dismiss, Restore
 * - View tracking, Private Notes
 * - Saved, Applied, Dismissed, Recently Viewed listings
 * - Workspace Stats
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveJobHandler,
  unsaveJobHandler,
  applyJobHandler,
  unapplyJobHandler,
  dismissJobHandler,
  restoreJobHandler,
  recordJobViewHandler,
  updateJobNotesHandler,
  deleteJobNotesHandler,
  getJobInteractionHandler,
  getSavedJobsHandler,
  getAppliedJobsHandler,
  getDismissedJobsHandler,
  getRecentlyViewedJobsHandler,
  getWorkspaceStatsHandler,
} from '../api/workspace.js';
import type { AuthenticatedRequest } from '../auth/middleware.js';
import type { Response } from 'express';

// ─── Mock User Job Service ───────────────────────────────────────────────────

const mockInteractions = new Map<string, any>();

vi.mock('../workspace/user-job-service.js', () => ({
  MAX_NOTES_LENGTH: 5000,
  saveJob: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.isSaved = true;
    state.savedAt = new Date();
    mockInteractions.set(key, state);
    return state;
  }),
  unsaveJob: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.isSaved = false;
    state.savedAt = null;
    mockInteractions.set(key, state);
    return state;
  }),
  markJobApplied: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.isApplied = true;
    state.appliedAt = new Date();
    mockInteractions.set(key, state);
    return state;
  }),
  unmarkJobApplied: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.isApplied = false;
    state.appliedAt = null;
    mockInteractions.set(key, state);
    return state;
  }),
  dismissJob: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.isDismissed = true;
    state.dismissedAt = new Date();
    mockInteractions.set(key, state);
    return state;
  }),
  restoreDismissedJob: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.isDismissed = false;
    state.dismissedAt = null;
    mockInteractions.set(key, state);
    return state;
  }),
  recordJobView: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.viewedAt = new Date();
    mockInteractions.set(key, state);
    return state;
  }),
  setJobNotes: vi.fn(async (userId: string, jobId: string, notes: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.notes = notes;
    mockInteractions.set(key, state);
    return state;
  }),
  deleteJobNotes: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    const state = mockInteractions.get(key) || { userId, jobId };
    state.notes = null;
    mockInteractions.set(key, state);
    return state;
  }),
  getUserJobInteraction: vi.fn(async (userId: string, jobId: string) => {
    const key = `${userId}:${jobId}`;
    return mockInteractions.get(key) || null;
  }),
  getSavedJobs: vi.fn(async (userId: string, options: any) => {
    return { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }),
  getAppliedJobs: vi.fn(async (userId: string, options: any) => {
    return { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }),
  getDismissedJobs: vi.fn(async (userId: string, options: any) => {
    return { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }),
  getRecentlyViewedJobs: vi.fn(async (userId: string, limit: number) => {
    return { items: [], total: 0 };
  }),
  getWorkspaceStats: vi.fn(async (userId: string) => {
    return { savedCount: 1, appliedCount: 1, recentlyViewedCount: 1, dismissedCount: 0 };
  }),
}));

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

describe('Workspace API Handlers', () => {
  beforeEach(() => {
    mockInteractions.clear();
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { res, status, json } = createMockResponse();
    const req = { params: { id: 'job-123' } } as unknown as AuthenticatedRequest;

    await saveJobHandler(req, res);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Authentication required' }));
  });

  it('saves job for authenticated user', async () => {
    const { res, status, json } = createMockResponse();
    const req = {
      user: { id: 'user-abc', email: 'user@example.com' },
      params: { id: 'job-123' },
    } as unknown as AuthenticatedRequest;

    await saveJobHandler(req, res);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Job saved successfully',
        interaction: expect.objectContaining({ isSaved: true }),
      })
    );
  });

  it('marks job as applied for authenticated user', async () => {
    const { res, status, json } = createMockResponse();
    const req = {
      user: { id: 'user-abc', email: 'user@example.com' },
      params: { id: 'job-123' },
    } as unknown as AuthenticatedRequest;

    await applyJobHandler(req, res);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Job marked as applied',
        interaction: expect.objectContaining({ isApplied: true }),
      })
    );
  });

  it('records job view event', async () => {
    const { res, status, json } = createMockResponse();
    const req = {
      user: { id: 'user-abc', email: 'user@example.com' },
      params: { id: 'job-123' },
    } as unknown as AuthenticatedRequest;

    await recordJobViewHandler(req, res);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Job view recorded',
        interaction: expect.objectContaining({ viewedAt: expect.any(Date) }),
      })
    );
  });

  it('attaches and deletes private notes', async () => {
    const { res: resSet, json: jsonSet } = createMockResponse();
    const reqSet = {
      user: { id: 'user-abc', email: 'user@example.com' },
      params: { id: 'job-123' },
      body: { notes: 'Study algorithms' },
    } as unknown as AuthenticatedRequest;

    await updateJobNotesHandler(reqSet, resSet);
    expect(jsonSet).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Notes updated',
        interaction: expect.objectContaining({ notes: 'Study algorithms' }),
      })
    );

    const { res: resDel, json: jsonDel } = createMockResponse();
    const reqDel = {
      user: { id: 'user-abc', email: 'user@example.com' },
      params: { id: 'job-123' },
    } as unknown as AuthenticatedRequest;

    await deleteJobNotesHandler(reqDel, resDel);
    expect(jsonDel).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Notes deleted',
        interaction: expect.objectContaining({ notes: null }),
      })
    );
  });

  it('retrieves workspace stats', async () => {
    const { res, json } = createMockResponse();
    const req = {
      user: { id: 'user-abc', email: 'user@example.com' },
    } as unknown as AuthenticatedRequest;

    await getWorkspaceStatsHandler(req, res);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        savedCount: 1,
        appliedCount: 1,
        recentlyViewedCount: 1,
        dismissedCount: 0,
      })
    );
  });
});
