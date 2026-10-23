/**
 * RoleRadar Client API Service.
 *
 * Provides typed methods for Authentication, Companies, User Preferences,
 * and Relevance-Ranked Job Matches against the RoleRadar backend API.
 */

import { httpClient, preferencesService, jobsService, workspaceService, alertsService, profileService, TOKEN_KEY, USER_KEY, ApiError } from '../services/api/index.js';

export { TOKEN_KEY, USER_KEY, ApiError, preferencesService, jobsService, workspaceService, alertsService, profileService };

export const apiClient = {
  getToken() {
    return httpClient.getToken();
  },

  setAuth(token, user) {
    httpClient.setAuth(token, user);
  },

  clearAuth() {
    httpClient.clearAuth();
  },

  getUser() {
    return httpClient.getUser();
  },

  async request(endpoint, options = {}) {
    return httpClient.request(endpoint, options);
  },

  // ── Auth ──────────────────────────────────────────────────────────────────

  async register(email, password, name) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    if (data.token && data.user) {
      this.setAuth(data.token, data.user);
    }
    return data;
  },

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token && data.user) {
      this.setAuth(data.token, data.user);
    }
    return data;
  },

  async verifyEmail(token) {
    const data = await this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    // Update cached user verification state if logged in
    const user = this.getUser();
    if (user) {
      user.emailVerified = true;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    return data;
  },

  async resendVerification(email) {
    const data = await this.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return data;
  },

  async getMe() {
    const data = await this.request('/users/me');
    if (data.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return data.user;
  },

  // ── Companies ─────────────────────────────────────────────────────────────

  async getCompanies() {
    return preferencesService.getCompanies();
  },

  // ── Taxonomy ──────────────────────────────────────────────────────────────

  async getTaxonomy() {
    const data = await this.request('/preferences/taxonomy');
    return data;
  },

  async getCanonicalTaxonomy() {
    return preferencesService.getCanonicalTaxonomy();
  },

  async getMigrationPreview() {
    return preferencesService.getMigrationPreview();
  },

  // ── Preferences ───────────────────────────────────────────────────────────

  async getPreferences() {
    return preferencesService.getPreferences();
  },

  async savePreferences(preferences) {
    return preferencesService.savePreferences(preferences);
  },

  async completeOnboarding() {
    return preferencesService.completeOnboarding();
  },

  // ── Notifications / Alerts ───────────────────────────────────────────────

  async getNotifications(page = 1, limit = 20) {
    return alertsService.getNotifications(page, limit);
  },

  async getUnreadCount() {
    return alertsService.getUnreadCount();
  },

  async markNotificationRead(id) {
    return alertsService.markNotificationRead(id);
  },

  async markAllNotificationsRead() {
    return alertsService.markAllNotificationsRead();
  },

  async retryNotification(id) {
    return alertsService.retryNotification(id);
  },

  // ── Job Feed & Matches (Phase 9 Ranked) ───────────────────────────────────

  async getMatchedJobs(pageOrOptions = 1, limit = 20) {
    if (typeof pageOrOptions === 'object') {
      return jobsService.getMatchedJobs(pageOrOptions);
    }
    return jobsService.getMatchedJobs({ page: pageOrOptions, limit });
  },

  async getSearchSuggestions(query = '', limit = 8) {
    return jobsService.getSearchSuggestions(query, limit);
  },

  async explainSearchIntent(query) {
    return jobsService.explainSearchIntent(query);
  },

  async getTodayMatchedJobs(page = 1, limit = 20) {
    return jobsService.getTodayMatchedJobs(page, limit);
  },

  async getVerifiedJobs(page = 1, limit = 20, days = null) {
    return jobsService.getVerifiedJobs(page, limit, days);
  },

  async getJobById(jobId) {
    return jobsService.getJobById(jobId);
  },

  // ── Personal Job-Seeker Workspace ────────────────────────────────────────

  async saveJob(jobId) {
    return workspaceService.saveJob(jobId);
  },

  async unsaveJob(jobId) {
    return workspaceService.unsaveJob(jobId);
  },

  async markJobApplied(jobId) {
    return workspaceService.markJobApplied(jobId);
  },

  async unmarkJobApplied(jobId) {
    return workspaceService.unmarkJobApplied(jobId);
  },

  async dismissJob(jobId) {
    return workspaceService.dismissJob(jobId);
  },

  async restoreJob(jobId) {
    return workspaceService.restoreJob(jobId);
  },

  async recordJobView(jobId) {
    return workspaceService.recordJobView(jobId);
  },

  async setJobNotes(jobId, notes) {
    return workspaceService.setJobNotes(jobId, notes);
  },

  async deleteJobNotes(jobId) {
    return workspaceService.deleteJobNotes(jobId);
  },

  async getJobInteraction(jobId) {
    return workspaceService.getJobInteraction(jobId);
  },

  async getSavedJobs(options = {}) {
    return workspaceService.getSavedJobs(options);
  },

  async getAppliedJobs(options = {}) {
    return workspaceService.getAppliedJobs(options);
  },

  async getDismissedJobs(options = {}) {
    return workspaceService.getDismissedJobs(options);
  },

  async getRecentlyViewedJobs(limit = 10) {
    return workspaceService.getRecentlyViewedJobs(limit);
  },

  async getWorkspaceStats() {
    return workspaceService.getWorkspaceStats();
  },

  // ── Phase 13: Candidate Profile & Resume Intelligence ──────────────────────

  async getCandidateProfile() {
    return profileService.getCandidateProfile();
  },

  async updateCandidateProfile(profileData) {
    return profileService.updateCandidateProfile(profileData);
  },

  async uploadResume(payload) {
    return profileService.uploadResume(payload);
  },

  async listResumes() {
    return profileService.listResumes();
  },

  async activateResume(resumeId) {
    return profileService.activateResume(resumeId);
  },

  async deleteResume(resumeId) {
    return profileService.deleteResume(resumeId);
  },

  async getProfileCompleteness() {
    return profileService.getProfileCompleteness();
  },

  async compareJobWithProfile(jobId) {
    return profileService.compareJobWithProfile(jobId);
  },

  // ── Phase 14: Application Intelligence & Assistant ────────────────────────

  async getApplicationReadiness(jobId) {
    const data = await this.request(`/jobs/${jobId}/application/readiness`);
    return data;
  },

  async setApplicationStatus(jobId, status) {
    const data = await this.request(`/jobs/${jobId}/application/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return data;
  },

  async selectResumeForJob(jobId, resumeId) {
    const data = await this.request(`/jobs/${jobId}/application/resume`, {
      method: 'POST',
      body: JSON.stringify({ resumeId }),
    });
    return data;
  },

  async setChecklist(jobId, checklist) {
    const data = await this.request(`/jobs/${jobId}/application/checklist`, {
      method: 'PUT',
      body: JSON.stringify({ checklist }),
    });
    return data;
  },

  async setCoverLetter(jobId, coverLetter) {
    const data = await this.request(`/jobs/${jobId}/application/cover-letter`, {
      method: 'PUT',
      body: JSON.stringify({ coverLetter }),
    });
    return data;
  },

  async deleteCoverLetter(jobId) {
    const data = await this.request(`/jobs/${jobId}/application/cover-letter`, {
      method: 'DELETE',
    });
    return data;
  },

  async generateCoverLetterDraft(jobId) {
    const data = await this.request(`/jobs/${jobId}/application/cover-letter/generate`, {
      method: 'POST',
    });
    return data;
  },

  async setReminder(jobId, reminderAt) {
    const data = await this.request(`/jobs/${jobId}/application/reminder`, {
      method: 'PUT',
      body: JSON.stringify({ reminderAt }),
    });
    return data;
  },

  async setInterviewNotes(jobId, notes) {
    const data = await this.request(`/jobs/${jobId}/application/interview-notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    });
    return data;
  },
};
