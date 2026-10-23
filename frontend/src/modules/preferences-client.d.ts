/**
 * Type declarations for preferences-client.js module.
 */

export const TOKEN_KEY: string;
export const USER_KEY: string;
export { ApiError } from '../services/api/types.js';
export { preferencesService } from '../services/api/preferences.service.js';
export { jobsService } from '../services/api/jobs.service.js';
export { workspaceService } from '../services/api/workspace.service.js';
export { alertsService } from '../services/api/alerts.service.js';
export { profileService } from '../services/api/profile.service.js';

export interface ApiClient {
  getToken(): string | null;
  setAuth(token: string, user: any): void;
  clearAuth(): void;
  getUser(): any;
  request(endpoint: string, options?: RequestInit): Promise<any>;
  register(email: string, password: string, name?: string): Promise<any>;
  login(email: string, password: string): Promise<any>;
  verifyEmail(token: string): Promise<any>;
  resendVerification(email?: string): Promise<any>;
  getCompanies(): Promise<any>;
  getPreferences(): Promise<any>;
  savePreferences(prefs: any): Promise<any>;
  getJobs(params?: Record<string, any>): Promise<any>;
  getJob(id: string): Promise<any>;
  saveJob(jobId: string): Promise<any>;
  unsaveJob(jobId: string): Promise<any>;
  applyJob(jobId: string): Promise<any>;
  dismissJob(jobId: string): Promise<any>;
  undismissJob(jobId: string): Promise<any>;
  updateJobStatus(jobId: string, status: string, notes?: string): Promise<any>;
  saveJobNote(jobId: string, notes: string): Promise<any>;
  getApplications(): Promise<any>;
  getSavedJobs(): Promise<any>;
  getDismissedJobs(): Promise<any>;
  getNotifications(unreadOnly?: boolean): Promise<any>;
  markNotificationRead(id: string): Promise<any>;
  markAllNotificationsRead(): Promise<any>;
  retryNotification(id: string): Promise<any>;
  getDashboardStats(): Promise<any>;
  [key: string]: any;
}

export const apiClient: ApiClient;
