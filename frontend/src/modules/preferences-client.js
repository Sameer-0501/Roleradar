/**
 * RoleRadar Client API Service.
 *
 * Provides typed methods for Authentication, Companies, User Preferences,
 * and Relevance-Ranked Job Matches against the RoleRadar backend API.
 */

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:4000/api';
const TOKEN_KEY = 'roleradar_auth_token';
const USER_KEY = 'roleradar_auth_user';

export const apiClient = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = data.details ? data.details.join(', ') : data.error || 'Request failed';
      throw new Error(errorMsg);
    }

    return data;
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
    const data = await this.request('/companies');
    return data.companies || [];
  },

  // ── Taxonomy ──────────────────────────────────────────────────────────────

  async getTaxonomy() {
    const data = await this.request('/preferences/taxonomy');
    return data;
  },

  async getCanonicalTaxonomy() {
    const data = await this.request('/preferences/canonical-taxonomy');
    return data;
  },

  async getMigrationPreview() {
    const data = await this.request('/users/me/preferences/migration-preview');
    return data;
  },

  // ── Preferences ───────────────────────────────────────────────────────────

  async getPreferences() {
    const data = await this.request('/users/me/preferences');
    if (data && data.preferences) {
      return {
        ...data.preferences,
        onboardingCompleted: data.onboardingCompleted ?? data.preferences.onboardingCompleted,
      };
    }
    return data;
  },

  async savePreferences(preferences) {
    const data = await this.request('/users/me/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
    return data.preferences;
  },

  async completeOnboarding() {
    const data = await this.request('/users/me/preferences/complete', {
      method: 'POST',
    });
    return data;
  },

  // ── Notifications / Alerts ───────────────────────────────────────────────

  async getNotifications(page = 1, limit = 20) {
    const data = await this.request(`/notifications?page=${page}&limit=${limit}`);
    return data;
  },

  async getUnreadCount() {
    const data = await this.request('/notifications/unread-count');
    return data.unreadCount || 0;
  },

  async markNotificationRead(id) {
    const data = await this.request(`/notifications/${id}/read`, {
      method: 'PUT',
    });
    return data;
  },

  async markAllNotificationsRead() {
    const data = await this.request('/notifications/read-all', {
      method: 'POST',
    });
    return data;
  },

  async retryNotification(id) {
    const data = await this.request(`/notifications/${id}/retry`, {
      method: 'POST',
    });
    return data;
  },

  // ── Job Feed & Matches (Phase 9 Ranked) ───────────────────────────────────

  async getMatchedJobs(pageOrOptions = 1, limit = 20) {
    let queryParams = new URLSearchParams();

    if (typeof pageOrOptions === 'object') {
      const opts = pageOrOptions;
      if (opts.page) queryParams.set('page', String(opts.page));
      if (opts.limit) queryParams.set('limit', String(opts.limit));
      if (opts.sort) queryParams.set('sort', opts.sort);
      if (opts.roleFilter) queryParams.set('roleFilter', opts.roleFilter);
      if (opts.q) queryParams.set('q', opts.q);
      if (opts.workplace && opts.workplace !== 'ANY') queryParams.set('workplace', opts.workplace);
      if (opts.freshness && opts.freshness !== 'ALL') queryParams.set('freshness', opts.freshness);
      if (opts.country) queryParams.set('country', opts.country);
      if (opts.location) queryParams.set('location', opts.location);
      if (opts.experience) queryParams.set('experience', opts.experience);
      if (opts.companyId) queryParams.set('companyId', opts.companyId);
      if (opts.isToday) queryParams.set('onlyToday', 'true');
    } else {
      queryParams.set('page', String(pageOrOptions));
      queryParams.set('limit', String(limit));
    }

    const data = await this.request(`/jobs/matches?${queryParams.toString()}`);
    return data;
  },

  async getSearchSuggestions(query = '', limit = 8) {
    const data = await this.request(`/search/suggestions?q=${encodeURIComponent(query)}&limit=${limit}`);
    return data.suggestions || [];
  },

  async explainSearchIntent(query) {
    const data = await this.request('/search/explain', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
    return data;
  },

  async getTodayMatchedJobs(page = 1, limit = 20) {
    const data = await this.request(`/jobs/matches/today?page=${page}&limit=${limit}`);
    return data;
  },

  async getVerifiedJobs(page = 1, limit = 20, days = null) {
    let url = `/jobs/verified?page=${page}&limit=${limit}`;
    if (days) url += `&days=${days}`;
    const data = await this.request(url);
    return data;
  },

  async getJobById(jobId) {
    const data = await this.request(`/jobs/${jobId}`);
    return data;
  },

  // ── Personal Job-Seeker Workspace ────────────────────────────────────────

  async saveJob(jobId) {
    const data = await this.request(`/jobs/${jobId}/save`, { method: 'POST' });
    return data.interaction;
  },

  async unsaveJob(jobId) {
    const data = await this.request(`/jobs/${jobId}/save`, { method: 'DELETE' });
    return data.interaction;
  },

  async markJobApplied(jobId) {
    const data = await this.request(`/jobs/${jobId}/apply`, { method: 'POST' });
    return data.interaction;
  },

  async unmarkJobApplied(jobId) {
    const data = await this.request(`/jobs/${jobId}/apply`, { method: 'DELETE' });
    return data.interaction;
  },

  async dismissJob(jobId) {
    const data = await this.request(`/jobs/${jobId}/dismiss`, { method: 'POST' });
    return data.interaction;
  },

  async restoreJob(jobId) {
    const data = await this.request(`/jobs/${jobId}/dismiss`, { method: 'DELETE' });
    return data.interaction;
  },

  async recordJobView(jobId) {
    const data = await this.request(`/jobs/${jobId}/view`, { method: 'POST' });
    return data.interaction;
  },

  async setJobNotes(jobId, notes) {
    const data = await this.request(`/jobs/${jobId}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    });
    return data.interaction;
  },

  async deleteJobNotes(jobId) {
    const data = await this.request(`/jobs/${jobId}/notes`, { method: 'DELETE' });
    return data.interaction;
  },

  async getJobInteraction(jobId) {
    const data = await this.request(`/jobs/${jobId}/interaction`);
    return data.interaction;
  },

  async getSavedJobs(options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.applied) params.set('applied', options.applied);
    if (options.q) params.set('q', options.q);
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    const data = await this.request(`/users/me/saved-jobs?${params.toString()}`);
    return data;
  },

  async getAppliedJobs(options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.q) params.set('q', options.q);
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    const data = await this.request(`/users/me/applications?${params.toString()}`);
    return data;
  },

  async getDismissedJobs(options = {}) {
    const params = new URLSearchParams();
    if (options.q) params.set('q', options.q);
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    const data = await this.request(`/users/me/dismissed-jobs?${params.toString()}`);
    return data;
  },

  async getRecentlyViewedJobs(limit = 10) {
    const data = await this.request(`/users/me/recently-viewed?limit=${limit}`);
    return data;
  },

  async getWorkspaceStats() {
    const data = await this.request('/users/me/workspace-stats');
    return data;
  },

  // ── Phase 13: Candidate Profile & Resume Intelligence ──────────────────────

  async getCandidateProfile() {
    const data = await this.request('/profile');
    return data.profile;
  },

  async updateCandidateProfile(profileData) {
    const data = await this.request('/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
    return data.profile;
  },

  async uploadResume(payload) {
    const data = await this.request('/profile/resumes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  },

  async listResumes() {
    const data = await this.request('/profile/resumes');
    return data.resumes || [];
  },

  async activateResume(resumeId) {
    const data = await this.request(`/profile/resumes/${resumeId}/activate`, {
      method: 'POST',
    });
    return data;
  },

  async deleteResume(resumeId) {
    const data = await this.request(`/profile/resumes/${resumeId}`, {
      method: 'DELETE',
    });
    return data;
  },

  async getProfileCompleteness() {
    const data = await this.request('/profile/completeness');
    return data.completeness;
  },

  async compareJobWithProfile(jobId) {
    const data = await this.request(`/profile/compare-job/${jobId}`, {
      method: 'POST',
    });
    return data;
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
