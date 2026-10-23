/**
 * RoleRadar Workspace API Service.
 *
 * Encapsulates personal candidate job tracking, bookmarks, applications,
 * dismissed jobs, private notes, and interaction telemetry.
 */

import { httpClient } from './client.js';
import type {
  Job,
  JobInteraction,
  WorkspaceListOptions,
  WorkspaceListResponse,
  WorkspaceStatsResponse,
  RecentlyViewedResponse,
} from './types.js';

export const workspaceService = {
  /**
   * Retrieves user's saved job bookmarks with optional filtering and pagination.
   */
  async getSavedJobs(options: WorkspaceListOptions = {}): Promise<WorkspaceListResponse> {
    const params: Record<string, string | number | undefined> = {};
    if (options.status) params['status'] = options.status;
    if (options.applied) params['applied'] = options.applied;
    if (options.q) params['q'] = options.q;
    if (options.page) params['page'] = options.page;
    if (options.limit) params['limit'] = options.limit;

    return httpClient.get<WorkspaceListResponse>('/users/me/saved-jobs', { params });
  },

  /**
   * Saves a job to candidate bookmarks.
   */
  async saveJob(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.post<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/save`
    );
    return data.interaction;
  },

  /**
   * Removes a job from candidate bookmarks.
   */
  async unsaveJob(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.delete<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/save`
    );
    return data.interaction;
  },

  /**
   * Retrieves jobs the user has marked as applied.
   */
  async getAppliedJobs(options: WorkspaceListOptions = {}): Promise<WorkspaceListResponse> {
    const params: Record<string, string | number | undefined> = {};
    if (options.status) params['status'] = options.status;
    if (options.q) params['q'] = options.q;
    if (options.page) params['page'] = options.page;
    if (options.limit) params['limit'] = options.limit;

    return httpClient.get<WorkspaceListResponse>('/users/me/applications', { params });
  },

  /**
   * Marks a job as applied.
   */
  async markJobApplied(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.post<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/apply`
    );
    return data.interaction;
  },

  /**
   * Unmarks a job as applied.
   */
  async unmarkJobApplied(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.delete<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/apply`
    );
    return data.interaction;
  },

  /**
   * Retrieves jobs hidden or dismissed by the user.
   */
  async getDismissedJobs(options: WorkspaceListOptions = {}): Promise<WorkspaceListResponse> {
    const params: Record<string, string | number | undefined> = {};
    if (options.q) params['q'] = options.q;
    if (options.page) params['page'] = options.page;
    if (options.limit) params['limit'] = options.limit;

    return httpClient.get<WorkspaceListResponse>('/users/me/dismissed-jobs', { params });
  },

  /**
   * Dismisses a job from discovery and feeds.
   */
  async dismissJob(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.post<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/dismiss`
    );
    return data.interaction;
  },

  /**
   * Restores a previously dismissed job back to active discovery.
   */
  async restoreJob(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.delete<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/dismiss`
    );
    return data.interaction;
  },

  /**
   * Records a user view event on a job.
   */
  async recordJobView(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.post<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/view`
    );
    return data.interaction;
  },

  /**
   * Sets or updates private personal notes on a job.
   */
  async setJobNotes(jobId: string, notes: string): Promise<JobInteraction> {
    const data = await httpClient.put<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/notes`,
      { notes }
    );
    return data.interaction;
  },

  /**
   * Deletes private personal notes on a job.
   */
  async deleteJobNotes(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.delete<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/notes`
    );
    return data.interaction;
  },

  /**
   * Fetches full interaction status for a specific job.
   */
  async getJobInteraction(jobId: string): Promise<JobInteraction> {
    const data = await httpClient.get<{ interaction: JobInteraction }>(
      `/jobs/${encodeURIComponent(jobId)}/interaction`
    );
    return data.interaction;
  },

  /**
   * Returns high-level statistics for the candidate's workspace.
   */
  async getWorkspaceStats(): Promise<WorkspaceStatsResponse> {
    return httpClient.get<WorkspaceStatsResponse>('/users/me/workspace-stats');
  },

  /**
   * Retrieves recently viewed jobs.
   */
  async getRecentlyViewedJobs(limit = 10): Promise<RecentlyViewedResponse> {
    const data = await httpClient.get<{ items?: Job[]; jobs?: Job[]; total?: number }>('/users/me/recently-viewed', {
      params: { limit },
    });
    const items = data.items || data.jobs || [];
    return {
      items,
      total: data.total || items.length,
    };
  },
};
