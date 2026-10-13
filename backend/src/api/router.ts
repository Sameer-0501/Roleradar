/**
 * API Router.
 *
 * Combines all API route handlers into a single Express router.
 */

import { Router } from 'express';
import { healthHandler } from './health.js';
import {
  engineStatusHandler,
  sourcesHealthHandler,
  fresherCoverageHandler,
  triggerSourceScanHandler,
  triggerLifecycleSweepHandler,
  getLifecycleStatsHandler,
} from './engine-status.js';
import {
  listJobsHandler,
  listVerifiedJobsHandler,
  getJobByIdHandler,
} from './jobs.js';
import { getMatchedJobsHandler, getTodayMatchedJobsHandler } from './matching.js';
import { listCompaniesHandler } from './companies.js';
import {
  registerHandler,
  loginHandler,
  meHandler,
  verifyEmailHandler,
  resendVerificationHandler,
} from './auth.js';
import {
  getPreferencesHandler,
  savePreferencesHandler,
  completeOnboardingHandler,
  getTaxonomyHandler,
  getCanonicalTaxonomyHandler,
  migrationPreviewHandler,
} from './preferences.js';
import {
  listNotificationsHandler,
  getUnreadCountHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
  retryNotificationHandler,
} from './notifications.js';
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
  listSavedJobsHandler,
  listApplicationsHandler,
  listDismissedJobsHandler,
  listRecentlyViewedHandler,
  getWorkspaceStatsHandler,
  getApplicationReadinessHandler,
  setApplicationStatusHandler,
  selectResumeForJobHandler,
  setChecklistHandler,
  setCoverLetterHandler,
  deleteCoverLetterHandler,
  generateCoverLetterDraftHandler,
  setReminderHandler,
  setInterviewNotesHandler,
} from './workspace.js';
import {
  searchJobsHandler,
  getSuggestionsHandler,
  explainSearchIntentHandler,
} from './search.js';
import {
  getProfileHandler,
  updateProfileHandler,
  listResumesHandler,
  uploadResumeHandler,
  activateResumeHandler,
  deleteResumeHandler,
  getCompletenessHandler,
  compareJobHandler,
} from './profile.js';
import { submitBetaFeedbackHandler } from './feedback.js';
import { requireAuth, optionalAuth, requireInternalKey, requireAdmin } from '../auth/middleware.js';
import { createAdminRouter } from './admin.js';
import { scheduler } from '../scheduler/scheduler.js';
import { createLogger } from '../utils/logger.js';
import {
  registerLimiter,
  loginLimiter,
  resendVerificationLimiter,
  searchLimiter,
  bulkScanTriggerLimiter,
  perSourceScanTriggerLimiter,
} from './rate-limiters.js';
import { config } from '../config/env.js';

const log = createLogger('api:router');

export function createRouter(): Router {
  const router = Router();

  // ── Health check ────────────────────────────────────────────────────────
  router.get('/health', (req, res) => {
    void healthHandler(req, res);
  });

  // ─── Beta Feedback ───────────────────────────────────────────────────────
  router.post('/beta/feedback', requireAuth, submitBetaFeedbackHandler);

  // ── Auth Endpoints ──────────────────────────────────────────────────────
  router.post('/auth/register', registerLimiter, (req, res) => {
    void registerHandler(req, res);
  });

  router.post('/auth/login', loginLimiter, (req, res) => {
    void loginHandler(req, res);
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    void meHandler(req, res);
  });

  router.get('/auth/verify-email', (req, res) => {
    void verifyEmailHandler(req, res);
  });

  router.post('/auth/verify-email', (req, res) => {
    void verifyEmailHandler(req, res);
  });

  router.post('/auth/resend-verification', resendVerificationLimiter, optionalAuth, (req, res) => {
    void resendVerificationHandler(req, res);
  });

  // ── Companies Endpoint (Public Read-Only) ───────────────────────────────
  router.get('/companies', (req, res) => {
    void listCompaniesHandler(req, res);
  });

  // ── Taxonomy Endpoint (Public Read-Only) ────────────────────────────────
  router.get('/preferences/taxonomy', (req, res) => {
    getTaxonomyHandler(req, res);
  });

  router.get('/preferences/canonical-taxonomy', (req, res) => {
    getCanonicalTaxonomyHandler(req, res);
  });

  // ── User Profile & Preferences Endpoints (Authenticated) ────────────────
  router.get('/users/me', requireAuth, (req, res) => {
    void meHandler(req, res);
  });

  router.get('/users/me/preferences', requireAuth, (req, res) => {
    void getPreferencesHandler(req, res);
  });

  router.get('/users/me/preferences/migration-preview', requireAuth, (req, res) => {
    void migrationPreviewHandler(req, res);
  });

  router.put('/users/me/preferences', requireAuth, (req, res) => {
    void savePreferencesHandler(req, res);
  });

  router.post('/users/me/preferences/complete', requireAuth, (req, res) => {
    void completeOnboardingHandler(req, res);
  });

  // ── Candidate Profile & Resume Intelligence Endpoints (Authenticated) ───
  router.get('/profile', requireAuth, (req, res) => {
    void getProfileHandler(req, res);
  });

  router.put('/profile', requireAuth, (req, res) => {
    void updateProfileHandler(req, res);
  });

  router.get('/profile/resumes', requireAuth, (req, res) => {
    void listResumesHandler(req, res);
  });

  router.post('/profile/resumes', requireAuth, (req, res) => {
    void uploadResumeHandler(req, res);
  });

  router.post('/profile/resumes/:id/activate', requireAuth, (req, res) => {
    void activateResumeHandler(req, res);
  });

  router.delete('/profile/resumes/:id', requireAuth, (req, res) => {
    void deleteResumeHandler(req, res);
  });

  router.get('/profile/completeness', requireAuth, (req, res) => {
    void getCompletenessHandler(req, res);
  });

  router.post('/profile/compare-job/:jobId', requireAuth, (req, res) => {
    void compareJobHandler(req, res);
  });

  // ── Personal Job-Seeker Workspace Endpoints (Authenticated) ──────────────
  router.get('/users/me/saved-jobs', requireAuth, (req, res) => {
    void listSavedJobsHandler(req, res);
  });

  router.get('/users/me/applications', requireAuth, (req, res) => {
    void listApplicationsHandler(req, res);
  });

  router.get('/users/me/dismissed-jobs', requireAuth, (req, res) => {
    void listDismissedJobsHandler(req, res);
  });

  router.get('/users/me/recently-viewed', requireAuth, (req, res) => {
    void listRecentlyViewedHandler(req, res);
  });

  router.get('/users/me/workspace-stats', requireAuth, (req, res) => {
    void getWorkspaceStatsHandler(req, res);
  });

  // Workspace aliases
  router.get('/workspace/saved', requireAuth, (req, res) => {
    void listSavedJobsHandler(req, res);
  });

  router.get('/workspace/applications', requireAuth, (req, res) => {
    void listApplicationsHandler(req, res);
  });

  router.get('/workspace/dismissed', requireAuth, (req, res) => {
    void listDismissedJobsHandler(req, res);
  });

  router.get('/workspace/recently-viewed', requireAuth, (req, res) => {
    void listRecentlyViewedHandler(req, res);
  });

  router.get('/workspace/stats', requireAuth, (req, res) => {
    void getWorkspaceStatsHandler(req, res);
  });

  // ── Personal Job Interaction Endpoints (Authenticated) ────────────────────
  router.post('/jobs/:id/save', requireAuth, (req, res) => {
    void saveJobHandler(req, res);
  });

  router.delete('/jobs/:id/save', requireAuth, (req, res) => {
    void unsaveJobHandler(req, res);
  });

  router.post('/jobs/:id/apply', requireAuth, (req, res) => {
    void applyJobHandler(req, res);
  });

  router.delete('/jobs/:id/apply', requireAuth, (req, res) => {
    void unapplyJobHandler(req, res);
  });

  router.post('/jobs/:id/dismiss', requireAuth, (req, res) => {
    void dismissJobHandler(req, res);
  });

  router.delete('/jobs/:id/dismiss', requireAuth, (req, res) => {
    void restoreJobHandler(req, res);
  });

  router.post('/jobs/:id/view', requireAuth, (req, res) => {
    void recordJobViewHandler(req, res);
  });

  router.put('/jobs/:id/notes', requireAuth, (req, res) => {
    void updateJobNotesHandler(req, res);
  });

  router.delete('/jobs/:id/notes', requireAuth, (req, res) => {
    void deleteJobNotesHandler(req, res);
  });

  router.get('/jobs/:id/interaction', requireAuth, (req, res) => {
    void getJobInteractionHandler(req, res);
  });

  // ── Phase 14 Application Intelligence & Assistant Endpoints (Authenticated) ─
  router.get('/jobs/:id/application/readiness', requireAuth, (req, res) => {
    void getApplicationReadinessHandler(req, res);
  });

  router.put('/jobs/:id/application/status', requireAuth, (req, res) => {
    void setApplicationStatusHandler(req, res);
  });

  router.post('/jobs/:id/application/resume', requireAuth, (req, res) => {
    void selectResumeForJobHandler(req, res);
  });

  router.put('/jobs/:id/application/checklist', requireAuth, (req, res) => {
    void setChecklistHandler(req, res);
  });

  router.put('/jobs/:id/application/cover-letter', requireAuth, (req, res) => {
    void setCoverLetterHandler(req, res);
  });

  router.delete('/jobs/:id/application/cover-letter', requireAuth, (req, res) => {
    void deleteCoverLetterHandler(req, res);
  });

  router.post('/jobs/:id/application/cover-letter/generate', requireAuth, (req, res) => {
    void generateCoverLetterDraftHandler(req, res);
  });

  router.put('/jobs/:id/application/reminder', requireAuth, (req, res) => {
    void setReminderHandler(req, res);
  });

  router.put('/jobs/:id/application/interview-notes', requireAuth, (req, res) => {
    void setInterviewNotesHandler(req, res);
  });

  // ── Notification Endpoints (Authenticated) ──────────────────────────────
  router.get('/notifications', requireAuth, (req, res) => {
    void listNotificationsHandler(req, res);
  });

  router.get('/notifications/unread-count', requireAuth, (req, res) => {
    void getUnreadCountHandler(req, res);
  });

  router.put('/notifications/:id/read', requireAuth, (req, res) => {
    void markNotificationReadHandler(req, res);
  });

  router.post('/notifications/read-all', requireAuth, (req, res) => {
    void markAllNotificationsReadHandler(req, res);
  });

  router.post('/notifications/:id/retry', requireAuth, (req, res) => {
    void retryNotificationHandler(req, res);
  });

  // ── Job engine operational status (public summary — no sensitive data) ──
  router.get('/jobs/engine/status', (req, res) => {
    void engineStatusHandler(req, res);
  });

  // ── Source health & coverage: internal-only operational details ─────────
  router.get('/jobs/engine/sources/health', requireInternalKey, (req, res) => {
    void sourcesHealthHandler(req, res);
  });

  router.get('/jobs/engine/coverage/fresher', requireInternalKey, (req, res) => {
    void fresherCoverageHandler(req, res);
  });

  router.post('/jobs/engine/sources/:companyName/scan', requireInternalKey, perSourceScanTriggerLimiter, (req, res) => {
    void triggerSourceScanHandler(req, res);
  });

  // ── Job Lifecycle Endpoints ──────────────────────────────────────────────
  router.post('/jobs/engine/lifecycle/trigger', requireInternalKey, (req, res) => {
    void triggerLifecycleSweepHandler(req, res);
  });

  router.get('/jobs/engine/lifecycle/stats', requireInternalKey, (req, res) => {
    void getLifecycleStatsHandler(req, res);
  });

  // ── Matching Job Endpoints (Authenticated) ─────────────────────────────
  router.get('/jobs/matches/today', requireAuth, (req, res) => {
    void getTodayMatchedJobsHandler(req, res);
  });

  router.get('/jobs/matches', requireAuth, (req, res) => {
    void getMatchedJobsHandler(req, res);
  });

  router.get('/jobs/matched/today', requireAuth, (req, res) => {
    void getTodayMatchedJobsHandler(req, res);
  });

  router.get('/jobs/matched', requireAuth, (req, res) => {
    void getMatchedJobsHandler(req, res);
  });

  // ── Search Intelligence Endpoints ───────────────────────────────────────
  router.get('/search/suggestions', searchLimiter, (req, res) => {
    void getSuggestionsHandler(req, res);
  });

  router.post('/search/explain', searchLimiter, (req, res) => {
    void explainSearchIntentHandler(req, res);
  });

  router.get('/search', searchLimiter, optionalAuth, (req, res) => {
    void searchJobsHandler(req, res);
  });

  // ── Job listing endpoints (read-only) ───────────────────────────────────
  // NOTE: /jobs/verified and /jobs/matches must be registered BEFORE /jobs/:id
  // to prevent Express matching keywords as an :id param.
  router.get('/jobs/verified', (req, res) => {
    void listVerifiedJobsHandler(req, res);
  });

  router.get('/jobs', (req, res) => {
    void listJobsHandler(req, res);
  });

  router.get('/jobs/:id', (req, res) => {
    void getJobByIdHandler(req, res);
  });

  // ── Dev utility: manually trigger a scan (internal-key + non-production only) ──
  router.post('/jobs/engine/scan/trigger', requireInternalKey, bulkScanTriggerLimiter, (_req, res) => {
    void (async () => {
      // Extra safety: bulk trigger is disabled in production
      if (config.nodeEnv === 'production') {
        res.status(403).json({ error: 'Bulk scan trigger is disabled in production. Use per-source scan instead.' });
        return;
      }

      log.warn('DEV scan trigger invoked via API');
      const state = scheduler.getState();
      if (state.registeredJobs === 0) {
        res.status(400).json({ error: 'No collectors registered' });
        return;
      }

      for (const job of state.jobs) {
        void scheduler.triggerScan(job.name).catch((err: unknown) => {
          log.error(
            { name: job.name, err: err instanceof Error ? err.message : String(err) },
            'Triggered scan failed'
          );
        });
      }

      res.json({
        message: 'Scan triggered for all registered collectors',
        collectors: state.jobs.map((j) => j.name),
      });
    })();
  });

  // ── Admin Endpoints (Phase 16) ──────────────────────────────────────────
  router.use('/admin', requireAdmin, createAdminRouter());

  return router;
}
