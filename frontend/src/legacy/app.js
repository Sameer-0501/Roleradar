import { renderOnboardingView, renderDashboardPreferencesSummary } from '../modules/onboarding/onboarding-ui.js';
import { apiClient } from '../modules/preferences-client.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & State
// ─────────────────────────────────────────────────────────────────────────────

const ROUTES = {
  '': 'landing',
  'login': 'login',
  'register': 'register',
  'preferences': 'preferences',
  'onboarding': 'onboarding', // legacy alias
  'settings': 'preferences',  // legacy alias → canonical preferences
  'verify-email': 'verify-email',
  'dashboard': 'dashboard',
  'dashboard/verified-jobs': 'verified-jobs',
  'dashboard/saved': 'saved',
  'dashboard/applications': 'applications',
  'dashboard/dismissed': 'dismissed',
  'dashboard/hidden': 'dismissed', // alias
  'dashboard/alerts': 'alerts',
  'dashboard/account': 'account',
  'dashboard/profile': 'account', // legacy alias
  // secondary (keep functional but not in primary nav)
  'dashboard/resume': 'resume',
  'dashboard/prep': 'prep',
  'admin': 'admin',
};

// Protected routes — require valid auth token
const PROTECTED_ROUTES = new Set([
  'dashboard',
  'verified-jobs',
  'saved',
  'applications',
  'dismissed',
  'alerts',
  'account',
  'preferences',
  'onboarding',
  'resume',
  'prep',
  'admin',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

function isAuthenticated() {
  return !!apiClient.getToken();
}

function requiresAuth(routeName) {
  return PROTECTED_ROUTES.has(routeName);
}

function onLogout() {
  stopPolling();
  apiClient.clearAuth();
  localStorage.removeItem('roleradar_preferences');
  localStorage.removeItem('roleradar_onboarding_completed');
  updateNavVisibility();
  window.location.hash = '#/login';
}

// ─────────────────────────────────────────────────────────────────────────────
// Route helpers
// ─────────────────────────────────────────────────────────────────────────────

function getRoute() {
  var hash = window.location.hash.slice(1) || '';
  return hash.replace(/^\/?|\/?$/g, '') || '';
}

function getRouteName(path) {
  var cleanPath = (path || '').split('?')[0];
  if (ROUTES[cleanPath]) return ROUTES[cleanPath];
  if (cleanPath === 'verify-email' || cleanPath.indexOf('verify-email') === 0) return 'verify-email';
  if (cleanPath === 'dashboard' || cleanPath.indexOf('dashboard') === 0) {
    // check sub-routes
    if (cleanPath.indexOf('dashboard/verified-jobs') === 0) return 'verified-jobs';
    if (cleanPath.indexOf('dashboard/saved') === 0) return 'saved';
    if (cleanPath.indexOf('dashboard/applications') === 0) return 'applications';
    if (cleanPath.indexOf('dashboard/dismissed') === 0 || cleanPath.indexOf('dashboard/hidden') === 0) return 'dismissed';
    if (cleanPath.indexOf('dashboard/alerts') === 0) return 'alerts';
    if (cleanPath.indexOf('dashboard/account') === 0) return 'account';
    if (cleanPath.indexOf('dashboard/profile') === 0) return 'profile';
    if (cleanPath.indexOf('dashboard/resume') === 0) return 'resume';
    if (cleanPath.indexOf('dashboard/prep') === 0) return 'prep';
    return 'dashboard';
  }
  if (cleanPath === 'admin' || cleanPath.indexOf('admin') === 0) return 'admin';
  return 'landing';
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

function showToast(message, type) {
  type = type || 'info';
  var toast = document.createElement('div');
  toast.className = 'app-toast app-toast--' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function () { toast.classList.add('is-visible'); }, 10);
  setTimeout(function () {
    toast.classList.remove('is-visible');
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 3000);
}

function formatDetectedDate(dateStr) {
  if (!dateStr) return '';
  try {
    var d = new Date(dateStr);
    var now = new Date();
    var diffMs = now - d;
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMins / 60);
    var diffDays = Math.floor(diffHours / 24);
    if (diffMins < 60) return 'Detected ' + diffMins + ' min' + (diffMins !== 1 ? 's' : '') + ' ago';
    if (diffHours < 24) return 'Detected ' + diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
    if (diffDays === 0) return 'Detected today';
    if (diffDays === 1) return 'Detected yesterday';
    return 'Detected ' + diffDays + ' days ago';
  } catch (e) {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav visibility
// ─────────────────────────────────────────────────────────────────────────────

function updateNavVisibility() {
  var navAuth = document.getElementById('nav-authenticated');
  var navGuest = document.getElementById('nav-guest');
  if (!navAuth || !navGuest) return;
  var auth = isAuthenticated();
  navAuth.style.display = auth ? '' : 'none';
  navGuest.style.display = auth ? 'none' : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Verified Job Card & Details Modal — Phase 11 Personal Workspace Design
// ─────────────────────────────────────────────────────────────────────────────

function verifiedJobCardHtml(job, options) {
  options = options || {};
  var context = options.context || 'feed';
  // showVerifiedToday: when true (Today's Verified Jobs mode), display initialVerifiedAt
  // alongside the usual firstSeenAt "Detected" label so the user understands
  // why a job appears in today's filter even if it was discovered days ago.
  var showVerifiedToday = !!options.showVerifiedToday;

  var title = escapeHtml(job.title);
  var company = escapeHtml(job.companyName || job.company || '');
  var location = escapeHtml(job.location || '');
  var displayJobId = escapeHtml(job.externalJobId || job.externalId || job.id || '');
  var rawOfficialUrl = job.officialUrl || job.applyUrl || '#';
  var officialUrl = escapeHtml(rawOfficialUrl);
  var source = escapeHtml(job.sourceSystem || job.atsType || '');
  var detected = formatDetectedDate(job.firstSeenAt || job.detectedAt || job.createdAt || job.postedAt);
  // initialVerifiedLabel: shown only in Today's Verified Jobs context to clarify the filter semantics.
  // "Detected" shows when we first discovered the job (first_seen_at);
  // "Verified Today" shows when it first entered ACTIVE+VERIFIED state (initial_verified_at).
  var initialVerifiedLabel = '';
  if (showVerifiedToday && job.initialVerifiedAt) {
    initialVerifiedLabel = '📅 Verified Today';
  }

  var isClosed = (job.status === 'CLOSED');
  var isSaved = job.interaction ? !!job.interaction.isSaved : !!job.isSaved;
  var isApplied = job.interaction ? !!job.interaction.isApplied : !!job.isApplied;
  var isDismissed = job.interaction ? !!job.interaction.isDismissed : !!job.isDismissed;
  var notes = job.interaction ? job.interaction.notes : (job.notes || null);
  var savedAtStr = job.interaction && job.interaction.savedAt ? formatDetectedDate(job.interaction.savedAt) : (job.savedAt ? formatDetectedDate(job.savedAt) : '');
  var appliedAtStr = job.interaction && job.interaction.appliedAt ? formatDetectedDate(job.interaction.appliedAt) : (job.appliedAt ? formatDetectedDate(job.appliedAt) : '');

  var workplaceBadge = '';
  if (job.workplaceType && job.workplaceType !== 'UNKNOWN') {
    var wpIcon = job.workplaceType === 'REMOTE' ? '🌐 ' : '🏢 ';
    var wpText = job.workplaceType === 'REMOTE' ? 'Remote' : job.workplaceType === 'HYBRID' ? 'Hybrid' : 'On-site';
    workplaceBadge = '<span class="vjc__workplace-badge">' + wpIcon + wpText + '</span>';
  }

  var expBadge = '';
  if (job.experienceClassification) {
    var isFresher = job.experienceClassification === 'FRESHER_COMPATIBLE' || job.experienceClassification === 'BOTH';
    expBadge = '<span class="vjc__exp-badge ' + (isFresher ? 'vjc__exp-badge--fresher' : 'vjc__exp-badge--exp') + '">' +
      (isFresher ? '🎓 Fresher' : '💼 Experienced') + '</span>';
  }

  var freshnessBadge = '';
  if (job.freshnessState && !isClosed) {
    if (job.freshnessState === 'FRESH') {
      freshnessBadge = '<span class="vjc__freshness-badge vjc__freshness-badge--fresh">🟢 Fresh</span>';
    } else if (job.freshnessState === 'RECENT') {
      freshnessBadge = '<span class="vjc__freshness-badge vjc__freshness-badge--recent">🕐 Recent</span>';
    } else {
      freshnessBadge = '<span class="vjc__freshness-badge vjc__freshness-badge--aging">📅 Active</span>';
    }
  }

  var scoreBadge = '';
  if (job.relevanceScore !== undefined && job.relevanceScore !== null && !isClosed) {
    var scoreClass = job.relevanceScore >= 80 ? 'vjc__score-badge--high' : job.relevanceScore >= 60 ? 'vjc__score-badge--med' : '';
    scoreBadge = '<span class="vjc__score-badge ' + scoreClass + '">🎯 ' + job.relevanceScore + ' pts</span>';
  }

  var statusBadge = '';
  if (isClosed) {
    statusBadge = '<span class="vjc__closed-badge">⚠ Closed</span>';
  } else {
    statusBadge = '<span class="vjc__verified-badge">✓ Verified Official</span>';
  }

  var userStateBadges = '';
  if (isApplied) {
    userStateBadges += '<span class="vjc__applied-badge">✓ Applied</span>';
  }
  if (isSaved && context !== 'saved') {
    userStateBadges += '<span class="vjc__saved-badge">♥ Saved</span>';
  }

  var explanationsHtml = '';
  if (job.matchExplanations && job.matchExplanations.length > 0) {
    var chips = job.matchExplanations.map(function (exp) {
      return '<li class="vjc__explanation-item">' + escapeHtml(exp) + '</li>';
    }).join('');
    explanationsHtml = '<ul class="vjc__explanations" aria-label="Why this matches">' + chips + '</ul>';
  } else if (job.matchSummary) {
    explanationsHtml = '<div class="vjc__match-row"><span class="vjc__match-badge">🎯 ' + escapeHtml(job.matchSummary) + '</span></div>';
  }

  var closedWarningHtml = isClosed
    ? '<div class="vjc__closed-warning">⚠ This position is no longer available on the official employer career portal.</div>'
    : '';

  var notesPreviewHtml = (notes && notes.trim().length > 0)
    ? '<div class="vjc__notes-preview"><strong>Private Note:</strong> <span>' + escapeHtml(notes) + '</span></div>'
    : '';

  var applyCta = '';
  if (isClosed) {
    applyCta = '<button type="button" class="kn-btn kn-btn--secondary" disabled title="Position closed on official portal">Position Closed</button>';
  } else {
    applyCta = '<a href="' + officialUrl + '" target="_blank" rel="noopener noreferrer" class="kn-btn kn-btn--primary vjc__view-btn">View Official Job & Apply →</a>';
  }

  var interactionButtons = '';
  if (context === 'dismissed') {
    interactionButtons = '<button type="button" class="kn-btn kn-btn--secondary" data-job-restore-id="' + escapeHtml(job.id) + '">↩ Restore to Feed</button>';
  } else {
    var saveBtnText = isSaved ? '♥ Saved' : '♡ Save';
    var saveBtnClass = isSaved ? 'vjc__btn-action vjc__btn-action--saved' : 'vjc__btn-action';
    var applyBtnText = isApplied ? '✓ Applied' : 'Mark Applied';
    var applyBtnClass = isApplied ? 'vjc__btn-action vjc__btn-action--applied' : 'vjc__btn-action';

    interactionButtons =
      '<div class="vjc__actions-group">' +
        '<button type="button" class="' + saveBtnClass + '" data-job-save-id="' + escapeHtml(job.id) + '" aria-pressed="' + isSaved + '">' + saveBtnText + '</button>' +
        '<button type="button" class="' + applyBtnClass + '" data-job-apply-id="' + escapeHtml(job.id) + '" aria-pressed="' + isApplied + '">' + applyBtnText + '</button>' +
        '<button type="button" class="vjc__btn-action vjc__btn-action--dismiss" data-job-dismiss-id="' + escapeHtml(job.id) + '" title="Hide job from feed">⋯ Hide</button>' +
      '</div>';
  }

  var cardClass = 'vjc' + (isClosed ? ' vjc--closed' : '');

  return (
    '<article class="' + cardClass + '" id="job-card-' + escapeHtml(job.id) + '">' +
      '<div class="vjc__header">' +
        '<div class="vjc__header-left">' +
          '<div class="vjc__company">' + company + '</div>' +
          '<div class="vjc__tags">' +
            workplaceBadge +
            expBadge +
            freshnessBadge +
            scoreBadge +
            userStateBadges +
          '</div>' +
        '</div>' +
        statusBadge +
      '</div>' +
      '<h3 class="vjc__title">' + title + '</h3>' +
      '<div class="vjc__meta">' +
        (location ? '<span class="vjc__location">📍 ' + location + '</span>' : '') +
        (displayJobId ? '<span class="vjc__job-id">Job ID: ' + displayJobId + '</span>' : '') +
        (savedAtStr && context === 'saved' ? '<span class="vjc__detected">Saved ' + savedAtStr + '</span>' : '') +
        (appliedAtStr && context === 'applications' ? '<span class="vjc__detected">Applied ' + appliedAtStr + '</span>' : '') +
      '</div>' +
      closedWarningHtml +
      notesPreviewHtml +
      explanationsHtml +
      '<div class="vjc__footer">' +
        '<div class="vjc__footer-left">' +
          (detected ? '<span class="vjc__detected">' + detected + '</span>' : '') +
          (initialVerifiedLabel ? '<span class="vjc__initial-verified">' + initialVerifiedLabel + '</span>' : '') +
          (source ? '<span class="vjc__source">Source: ' + source + '</span>' : '') +
        '</div>' +
        '<div class="vjc__footer-actions">' +
          interactionButtons +
          '<button type="button" class="kn-btn kn-btn--secondary vjc__details-btn" data-job-detail-id="' + escapeHtml(job.id) + '">ℹ️ Details</button>' +
          applyCta +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

/**
 * Bind personal workspace interactive actions (Save, Apply, Dismiss, Restore, Details)
 */
function bindJobCardActions(container, onAction) {
  if (!container) return;

  // Save / Unsave Toggle
  container.querySelectorAll('[data-job-save-id]').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var jobId = btn.getAttribute('data-job-save-id');
      var isSaved = btn.classList.contains('vjc__btn-action--saved');
      btn.disabled = true;

      try {
        if (isSaved) {
          await apiClient.unsaveJob(jobId);
          btn.classList.remove('vjc__btn-action--saved');
          btn.textContent = '♡ Save';
          btn.setAttribute('aria-pressed', 'false');
          showToast('Job removed from saved list', 'info');
        } else {
          await apiClient.saveJob(jobId);
          btn.classList.add('vjc__btn-action--saved');
          btn.textContent = '♥ Saved';
          btn.setAttribute('aria-pressed', 'true');
          showToast('Job saved to your workspace!', 'success');
        }
        if (onAction) onAction('save', jobId, !isSaved);
      } catch (err) {
        showToast('Failed to update saved state', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Mark Applied / Undo Applied Toggle
  container.querySelectorAll('[data-job-apply-id]').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var jobId = btn.getAttribute('data-job-apply-id');
      var isApplied = btn.classList.contains('vjc__btn-action--applied');
      btn.disabled = true;

      try {
        if (isApplied) {
          await apiClient.unmarkJobApplied(jobId);
          btn.classList.remove('vjc__btn-action--applied');
          btn.textContent = 'Mark Applied';
          btn.setAttribute('aria-pressed', 'false');
          showToast('Application record undone', 'info');
        } else {
          await apiClient.markJobApplied(jobId);
          btn.classList.add('vjc__btn-action--applied');
          btn.textContent = '✓ Applied';
          btn.setAttribute('aria-pressed', 'true');
          showToast('Job marked as applied! Tracked in workspace.', 'success');
        }
        if (onAction) onAction('apply', jobId, !isApplied);
      } catch (err) {
        showToast('Failed to update application state', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Dismiss (Hide) Action
  container.querySelectorAll('[data-job-dismiss-id]').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var jobId = btn.getAttribute('data-job-dismiss-id');
      btn.disabled = true;

      try {
        await apiClient.dismissJob(jobId);
        var card = document.getElementById('job-card-' + jobId);
        if (card) {
          card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(function () {
            if (card && card.parentNode) card.parentNode.removeChild(card);
          }, 250);
        }
        showToast('Job hidden from feed. You can restore it in Hidden Jobs.', 'info');
        if (onAction) onAction('dismiss', jobId, true);
      } catch (err) {
        btn.disabled = false;
        showToast('Failed to hide job', 'error');
      }
    });
  });

  // Restore Action
  container.querySelectorAll('[data-job-restore-id]').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var jobId = btn.getAttribute('data-job-restore-id');
      btn.disabled = true;

      try {
        await apiClient.restoreJob(jobId);
        var card = document.getElementById('job-card-' + jobId);
        if (card) {
          card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
          card.style.opacity = '0';
          setTimeout(function () {
            if (card && card.parentNode) card.parentNode.removeChild(card);
          }, 250);
        }
        showToast('Job restored to your feed!', 'success');
        if (onAction) onAction('restore', jobId, false);
      } catch (err) {
        btn.disabled = false;
        showToast('Failed to restore job', 'error');
      }
    });
  });

  // Details Modal Action
  container.querySelectorAll('[data-job-detail-id]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var jId = btn.getAttribute('data-job-detail-id');
      if (jId) openJobDetailModal(jId, onAction);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Details Modal with View Tracking & Private Notes Editor
// ─────────────────────────────────────────────────────────────────────────────

async function openJobDetailModal(jobId, onStateChange) {
  var modalRoot = document.getElementById('job-detail-modal-root');
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'job-detail-modal-root';
    document.body.appendChild(modalRoot);
  }

  modalRoot.innerHTML = (
    '<div class="app-modal-backdrop" id="job-modal-backdrop">' +
      '<div class="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-job-title">' +
        '<div class="app-modal-header">' +
          '<lemniscate-loader></lemniscate-loader>' +
          '<p class="kn-text-muted">Loading official job details...</p>' +
          '<button type="button" class="app-modal-close" id="btn-close-job-modal" aria-label="Close">✕</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  var closeBtn = document.getElementById('btn-close-job-modal');
  var backdrop = document.getElementById('job-modal-backdrop');
  var closeModal = function () {
    modalRoot.innerHTML = '';
  };
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });
  }

  // 1. Record Detail View Event (Principle 15: authenticated view tracking)
  if (isAuthenticated()) {
    apiClient.recordJobView(jobId).catch(function () {});
  }

  try {
    var jobRes = await apiClient.getJobById(jobId);
    var job = jobRes.job;
    var verifications = jobRes.verifications || [];

    var interaction = null;
    var jobFit = null;
    var readiness = null;
    if (isAuthenticated()) {
      try {
        var results = await Promise.allSettled([
          apiClient.getJobInteraction(jobId),
          apiClient.compareJobWithProfile(jobId),
          apiClient.getApplicationReadiness(jobId),
        ]);
        if (results[0].status === 'fulfilled') interaction = results[0].value;
        if (results[1].status === 'fulfilled') jobFit = results[1].value;
        if (results[2].status === 'fulfilled') readiness = results[2].value;
      } catch (e) {}
    }

    if (!job) {
      modalRoot.innerHTML = '';
      showToast('Job not found', 'error');
      return;
    }

    var title = escapeHtml(job.title);
    var company = escapeHtml(job.company_name || 'Official Employer');
    var location = escapeHtml(job.location || 'Location Unspecified');
    var officialUrl = escapeHtml(job.official_url || '#');
    var workplace = escapeHtml(job.workplace_type || 'Unspecified');
    var expText = escapeHtml(job.experience_reason || job.experience_classification || 'Standard compatibility');
    var freshnessState = escapeHtml(job.freshness_state || 'ACTIVE');
    var freshnessReason = escapeHtml(job.freshness_reason || 'Verified active');
    var isClosed = (job.status === 'CLOSED');

    var isSaved = readiness && readiness.interaction ? !!readiness.interaction.isSaved : (interaction ? !!interaction.isSaved : false);
    var isApplied = readiness && readiness.interaction ? !!readiness.interaction.isApplied : (interaction ? !!interaction.isApplied : false);
    var currentNotes = (readiness && readiness.interaction && readiness.interaction.notes) ? readiness.interaction.notes : (interaction && interaction.notes ? interaction.notes : '');

    var fitSectionHtml = jobFit ? (
      '<div class="modal-section modal-fit-section">' +
        '<h3 class="modal-section-title">⚡ Resume & Candidate Fit Analysis</h3>' +
        '<div class="modal-fit-card">' +
          '<div class="modal-fit-header">' +
            '<span class="modal-fit-score-badge modal-fit-score--' + escapeHtml((jobFit.fitTier || 'exploratory').toLowerCase()) + '">' +
              '🎯 ' + jobFit.fitScore + '% Match · ' + escapeHtml((jobFit.fitTier || '').replace('_', ' ')) +
            '</span>' +
          '</div>' +
          (jobFit.fitReasons && jobFit.fitReasons.length > 0 ? (
            '<ul class="modal-fit-reasons">' +
              jobFit.fitReasons.map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') +
            '</ul>'
          ) : '') +
          '<div class="modal-fit-skills-grid">' +
            '<div>' +
              '<strong>Matching Skills (' + (jobFit.matchingSkills ? jobFit.matchingSkills.length : 0) + ')</strong>' +
              '<div class="modal-skill-tags">' +
                (jobFit.matchingSkills && jobFit.matchingSkills.length > 0
                  ? jobFit.matchingSkills.map(function (s) { return '<span class="skill-tag skill-tag--matching">✓ ' + escapeHtml(s) + '</span>'; }).join('')
                  : '<span class="kn-text-muted" style="font-size:0.8rem;">No exact keyword matches found</span>') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<strong>Skills Not Found in Profile (' + (jobFit.missingSkills ? jobFit.missingSkills.length : 0) + ')</strong>' +
              '<div class="modal-skill-tags">' +
                (jobFit.missingSkills && jobFit.missingSkills.length > 0
                  ? jobFit.missingSkills.map(function (s) { return '<span class="skill-tag skill-tag--missing" title="Not found in your current profile">⚠ ' + escapeHtml(s) + '</span>'; }).join('')
                  : '<span class="kn-text-muted" style="font-size:0.8rem;">No missing required skills detected</span>') +
              '</div>' +
            '</div>' +
          '</div>' +
          (jobFit.fresherReadiness && jobFit.fresherReadiness.actionableAdvice && jobFit.fresherReadiness.actionableAdvice.length > 0 ? (
            '<div class="modal-fresher-advice">' +
              '<strong>🎓 Fresher Optimization Tip:</strong> ' +
              escapeHtml(jobFit.fresherReadiness.actionableAdvice[0]) +
            '</div>'
          ) : '') +
        '</div>' +
      '</div>'
    ) : '';

    var readinessScore = readiness ? readiness.readinessScore : 0;
    var readinessPillClass = readinessScore >= 75 ? 'readiness-score-pill--high' : readinessScore >= 45 ? 'readiness-score-pill--medium' : 'readiness-score-pill--low';
    var appStatus = (readiness && readiness.interaction && readiness.interaction.applicationStatus) || (interaction && interaction.applicationStatus) || 'SAVED';
    var selectedResumeId = (readiness && readiness.interaction && readiness.interaction.selectedResumeId) || '';
    var checklist = (readiness && readiness.interaction && Array.isArray(readiness.interaction.checklist)) ? readiness.interaction.checklist : [];
    var coverLetter = (readiness && readiness.interaction && readiness.interaction.coverLetter) || '';
    var reminderAt = (readiness && readiness.interaction && readiness.interaction.reminderAt) ? readiness.interaction.reminderAt.slice(0, 16) : '';
    var interviewNotes = (readiness && readiness.interaction && readiness.interaction.interviewNotes) || '';
    var availableResumes = (readiness && readiness.availableResumes) || [];
    var missingReqs = (readiness && readiness.missingRequirements) || [];

    var resumeOptionsHtml = '<option value="">-- Select Resume Version --</option>' +
      availableResumes.map(function(r) {
        var isSel = (r.id === selectedResumeId) || (!selectedResumeId && r.isActive);
        return '<option value="' + escapeHtml(r.id) + '" ' + (isSel ? 'selected' : '') + '>' + escapeHtml(r.filename) + (r.isActive ? ' (Active)' : '') + '</option>';
      }).join('');

    var statusOptionsHtml = ['SAVED', 'PREPARING', 'APPLIED', 'INTERVIEWING', 'OFFERED', 'REJECTED', 'WITHDRAWN'].map(function(s) {
      return '<option value="' + s + '" ' + (appStatus === s ? 'selected' : '') + '>' + s + '</option>';
    }).join('');

    var checklistItemsHtml = checklist.map(function(item, idx) {
      var itemClass = 'checklist-item-row' + (item.done ? ' is-done' : '');
      return '<li class="' + itemClass + '" data-checklist-id="' + escapeHtml(item.id) + '">' +
        '<input type="checkbox" id="chk-item-' + idx + '" class="checklist-item-chk" data-item-id="' + escapeHtml(item.id) + '" ' + (item.done ? 'checked' : '') + ' />' +
        '<span>' + escapeHtml(item.text) + '</span>' +
      '</li>';
    }).join('');

    var missingReqsHtml = missingReqs.length > 0 ? (
      '<div style="margin-top:8px; padding:8px 10px; background:#fff1f2; border-left:3px solid #f43f5e; border-radius:4px; font-size:0.8rem; color:#9f1239;">' +
        '<strong>Missing Requirements / Preparation Recommendations:</strong>' +
        '<ul style="margin:4px 0 0 16px; padding:0;">' +
          missingReqs.map(function(m) { return '<li>' + escapeHtml(m) + '</li>'; }).join('') +
        '</ul>' +
      '</div>'
    ) : '';

    var assistantSectionHtml = isAuthenticated() ? (
      '<div class="modal-section modal-assistant-section">' +
        '<h3 class="modal-section-title">🚀 Job Application Assistant & Readiness</h3>' +
        '<div class="modal-assistant-card">' +
          '<div class="modal-readiness-header">' +
            '<div class="readiness-score-pill ' + readinessPillClass + '" id="readiness-score-display">' +
              '🎯 ' + readinessScore + '% Application Ready' +
            '</div>' +
            '<div class="modal-readiness-controls">' +
              '<label style="font-size:0.8rem; font-weight:600;">Status: ' +
                '<select id="modal-app-status-select" class="modal-select-control">' + statusOptionsHtml + '</select>' +
              '</label>' +
              '<label style="font-size:0.8rem; font-weight:600;">Resume: ' +
                '<select id="modal-resume-select" class="modal-select-control">' + resumeOptionsHtml + '</select>' +
              '</label>' +
            '</div>' +
          '</div>' +
          missingReqsHtml +
          '<div class="official-apply-banner">' +
            '<span class="official-apply-banner__text">🛡️ <strong>Official Application:</strong> RoleRadar never submits applications automatically. Review checklist, tailor resume, apply on official site, then mark applied.</span>' +
            (isClosed ? '' : '<a href="' + officialUrl + '" target="_blank" rel="noopener noreferrer" class="kn-btn kn-btn--primary" style="font-size:0.8rem; padding:6px 12px;">Go to Official Career Portal ↗</a>') +
          '</div>' +
          '<div class="modal-assistant-grid">' +
            '<div class="checklist-container">' +
              '<div class="checklist-title">' +
                '<span>✓ Application Checklist</span>' +
                '<span id="checklist-progress-text" class="kn-text-muted" style="font-size:0.75rem;">' +
                  (checklist.filter(function(i){ return i.done; }).length) + '/' + checklist.length + ' done' +
                '</span>' +
              '</div>' +
              '<ul class="checklist-items-list" id="modal-checklist-list">' +
                (checklistItemsHtml || '<li class="kn-text-muted" style="font-size:0.8rem;">No checklist items yet</li>') +
              '</ul>' +
              '<div class="checklist-add-row">' +
                '<input type="text" id="checklist-new-input" class="checklist-add-input" placeholder="Add task (max 300 chars)..." maxlength="300" />' +
                '<button type="button" class="kn-btn kn-btn--secondary" id="btn-add-checklist-item" style="font-size:0.78rem; padding:4px 8px;">+ Add</button>' +
              '</div>' +
            '</div>' +
            '<div class="assistant-box">' +
              '<div class="assistant-box-title">' +
                '<span>✍️ Tailored Cover Letter</span>' +
                '<button type="button" class="kn-btn kn-btn--secondary" id="btn-generate-cover-draft" style="font-size:0.75rem; padding:2px 8px;">⚡ Auto-Draft</button>' +
              '</div>' +
              '<textarea id="modal-cover-letter-input" class="assistant-textarea" rows="5" placeholder="Draft a customized cover letter for this employer..." maxlength="5000">' + escapeHtml(coverLetter) + '</textarea>' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">' +
                '<span id="cover-letter-char-count" class="kn-text-muted" style="font-size:0.72rem;">' + coverLetter.length + '/5000</span>' +
                '<div style="display:flex; gap:6px;">' +
                  '<button type="button" class="kn-btn kn-btn--secondary" id="btn-clear-cover-letter" style="font-size:0.75rem; padding:3px 8px;">Clear</button>' +
                  '<button type="button" class="kn-btn kn-btn--primary" id="btn-save-cover-letter" style="font-size:0.75rem; padding:3px 8px;">Save Letter</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-assistant-grid">' +
            '<div class="assistant-box">' +
              '<div class="assistant-box-title">' +
                '<span>⏰ Application Follow-up Reminder</span>' +
              '</div>' +
              '<div style="display:flex; gap:6px; margin-top:4px; align-items:center; flex-wrap:wrap;">' +
                '<input type="datetime-local" id="modal-reminder-input" class="modal-select-control" value="' + escapeHtml(reminderAt) + '" />' +
                '<button type="button" class="kn-btn kn-btn--primary" id="btn-save-reminder" style="font-size:0.75rem; padding:4px 10px;">Set Reminder</button>' +
                '<button type="button" class="kn-btn kn-btn--secondary" id="btn-clear-reminder" style="font-size:0.75rem; padding:4px 8px;">Clear</button>' +
              '</div>' +
            '</div>' +
            '<div class="assistant-box">' +
              '<div class="assistant-box-title">' +
                '<span>🎯 Interview Preparation Notes</span>' +
                '<button type="button" class="kn-btn kn-btn--primary" id="btn-save-interview-notes" style="font-size:0.75rem; padding:3px 8px;">Save Prep</button>' +
              '</div>' +
              '<textarea id="modal-interview-notes-input" class="assistant-textarea" rows="3" placeholder="Company questions, technical rounds prep, questions to ask interviewer..." maxlength="10000">' + escapeHtml(interviewNotes) + '</textarea>' +
              '<span id="interview-notes-char-count" class="kn-text-muted" style="font-size:0.72rem; text-align:right;">' + interviewNotes.length + '/10000</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    ) : '';

    var verifListHtml = verifications.length > 0
      ? verifications.slice(0, 3).map(function (v) {
          var dateStr = new Date(v.checked_at).toLocaleDateString();
          var score = v.verification_score ? Math.round(v.verification_score * 100) + '%' : '100%';
          return '<div class="modal-verif-item"><span>✓ ' + dateStr + '</span><span>Official Portal Check: ' + (v.job_exists_check ? 'Active' : 'Passed') + '</span><span>Score: ' + score + '</span></div>';
        }).join('')
      : '<p class="kn-text-muted">Verified directly on company career portal.</p>';

    var descHtml = job.description
      ? '<div class="modal-job-desc">' + job.description + '</div>'
      : '<p class="kn-text-muted">Direct description available on the official company careers page.</p>';

    var reqHtml = job.requirements
      ? '<div class="modal-job-reqs"><h4>Requirements</h4>' + job.requirements + '</div>'
      : '';

    var closedBannerHtml = isClosed
      ? '<div class="vjc__closed-warning" style="margin-bottom: 12px;">⚠ This position is no longer active on the official career portal. You can keep your private notes and history.</div>'
      : '';

    var applyButtonHtml = isClosed
      ? '<button type="button" class="kn-btn kn-btn--secondary" disabled>Position Closed</button>'
      : '<a href="' + officialUrl + '" target="_blank" rel="noopener noreferrer" class="kn-btn kn-btn--primary">View Official Job & Apply ↗</a>';

    var notesSectionHtml = isAuthenticated()
      ? (
        '<div class="modal-notes-section">' +
          '<div class="modal-notes-title">' +
            '<span>📝 Private Notes (Only visible to you)</span>' +
            '<span id="notes-save-status" class="kn-text-muted" style="font-size:0.75rem;"></span>' +
          '</div>' +
          '<textarea id="modal-notes-input" class="modal-notes-textarea" placeholder="Add private notes (e.g. revise system design, interview rounds, contact info)...">' + escapeHtml(currentNotes) + '</textarea>' +
          '<div class="modal-notes-actions">' +
            '<button type="button" class="kn-btn kn-btn--secondary" id="btn-modal-clear-notes" style="font-size:0.8rem; padding:4px 10px;">Clear Note</button>' +
            '<button type="button" class="kn-btn kn-btn--primary" id="btn-modal-save-notes" style="font-size:0.8rem; padding:4px 10px;">Save Note</button>' +
          '</div>' +
        '</div>'
      )
      : '';

    modalRoot.innerHTML = (
      '<div class="app-modal-backdrop" id="job-modal-backdrop">' +
        '<div class="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-job-title">' +
          '<div class="app-modal-header">' +
            '<div>' +
              '<span class="app-modal-company">' + company + ' · ' + (isClosed ? '<span class="vjc__closed-badge">⚠ Closed</span>' : '<span class="app-modal-verif-tag">✓ Verified Official</span>') + '</span>' +
              '<h2 class="app-modal-title" id="modal-job-title">' + title + '</h2>' +
            '</div>' +
            '<button type="button" class="app-modal-close" id="btn-close-job-modal" aria-label="Close">✕</button>' +
          '</div>' +
          '<div class="app-modal-body">' +
            closedBannerHtml +
            '<div class="modal-meta-grid">' +
              '<div class="modal-meta-card"><strong>Location</strong><span>📍 ' + location + '</span></div>' +
              '<div class="modal-meta-card"><strong>Workplace</strong><span>🏢 ' + workplace + '</span></div>' +
              '<div class="modal-meta-card"><strong>Freshness</strong><span>🟢 ' + freshnessState + ' (' + freshnessReason + ')</span></div>' +
              '<div class="modal-meta-card"><strong>Experience Level</strong><span>🎓 ' + expText + '</span></div>' +
            '</div>' +
            fitSectionHtml +
            assistantSectionHtml +
            '<div class="modal-section">' +
              '<h3 class="modal-section-title">🛡️ Official Verification Audit</h3>' +
              '<div class="modal-verif-box">' + verifListHtml + '</div>' +
            '</div>' +
            notesSectionHtml +
            '<div class="modal-section">' +
              '<h3 class="modal-section-title">📄 Job Description</h3>' +
              descHtml +
              reqHtml +
            '</div>' +
          '</div>' +
          '<div class="app-modal-footer">' +
            '<div class="vjc__actions-group">' +
              (isAuthenticated() ? '<button type="button" class="' + (isSaved ? 'vjc__btn-action vjc__btn-action--saved' : 'vjc__btn-action') + '" id="btn-modal-toggle-save">' + (isSaved ? '♥ Saved' : '♡ Save') + '</button>' : '') +
              (isAuthenticated() ? '<button type="button" class="' + (isApplied ? 'vjc__btn-action vjc__btn-action--applied' : 'vjc__btn-action') + '" id="btn-modal-toggle-apply">' + (isApplied ? '✓ Applied' : 'Mark as Applied') + '</button>' : '') +
              (isAuthenticated() ? '<button type="button" class="vjc__btn-action vjc__btn-action--dismiss" id="btn-modal-dismiss-job">⋯ Hide</button>' : '') +
            '</div>' +
            '<div style="display:flex; gap:8px;">' +
              '<button type="button" class="kn-btn kn-btn--secondary" id="btn-modal-dismiss">Close</button>' +
              applyButtonHtml +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    var newCloseBtn = document.getElementById('btn-close-job-modal');
    var newDismissBtn = document.getElementById('btn-modal-dismiss');
    var newBackdrop = document.getElementById('job-modal-backdrop');
    if (newCloseBtn) newCloseBtn.addEventListener('click', closeModal);
    if (newDismissBtn) newDismissBtn.addEventListener('click', closeModal);
    if (newBackdrop) {
      newBackdrop.addEventListener('click', function (e) {
        if (e.target === newBackdrop) closeModal();
      });
    }

    // Modal Save Toggle
    var modalSaveBtn = document.getElementById('btn-modal-toggle-save');
    if (modalSaveBtn) {
      modalSaveBtn.addEventListener('click', async function () {
        var curSaved = modalSaveBtn.classList.contains('vjc__btn-action--saved');
        modalSaveBtn.disabled = true;
        try {
          if (curSaved) {
            await apiClient.unsaveJob(jobId);
            modalSaveBtn.classList.remove('vjc__btn-action--saved');
            modalSaveBtn.textContent = '♡ Save';
            showToast('Job removed from saved list', 'info');
          } else {
            await apiClient.saveJob(jobId);
            modalSaveBtn.classList.add('vjc__btn-action--saved');
            modalSaveBtn.textContent = '♥ Saved';
            showToast('Job saved to your workspace!', 'success');
          }
          if (onStateChange) onStateChange('save', jobId, !curSaved);
        } catch (err) {
          showToast('Failed to update saved state', 'error');
        } finally {
          modalSaveBtn.disabled = false;
        }
      });
    }

    // Modal Apply Toggle
    var modalApplyBtn = document.getElementById('btn-modal-toggle-apply');
    if (modalApplyBtn) {
      modalApplyBtn.addEventListener('click', async function () {
        var curApplied = modalApplyBtn.classList.contains('vjc__btn-action--applied');
        modalApplyBtn.disabled = true;
        try {
          if (curApplied) {
            await apiClient.unmarkJobApplied(jobId);
            modalApplyBtn.classList.remove('vjc__btn-action--applied');
            modalApplyBtn.textContent = 'Mark as Applied';
            showToast('Application tracking undone', 'info');
          } else {
            await apiClient.markJobApplied(jobId);
            modalApplyBtn.classList.add('vjc__btn-action--applied');
            modalApplyBtn.textContent = '✓ Applied';
            showToast('Job marked as applied! Tracked in workspace.', 'success');
          }
          if (onStateChange) onStateChange('apply', jobId, !curApplied);
        } catch (err) {
          showToast('Failed to update application state', 'error');
        } finally {
          modalApplyBtn.disabled = false;
        }
      });
    }

    // Modal Dismiss Toggle
    var modalDismissJobBtn = document.getElementById('btn-modal-dismiss-job');
    if (modalDismissJobBtn) {
      modalDismissJobBtn.addEventListener('click', async function () {
        modalDismissJobBtn.disabled = true;
        try {
          await apiClient.dismissJob(jobId);
          showToast('Job hidden from feed.', 'info');
          closeModal();
          if (onStateChange) onStateChange('dismiss', jobId, true);
        } catch (err) {
          modalDismissJobBtn.disabled = false;
          showToast('Failed to hide job', 'error');
        }
      });
    }

    // Modal Notes Handlers
    var saveNotesBtn = document.getElementById('btn-modal-save-notes');
    var clearNotesBtn = document.getElementById('btn-modal-clear-notes');
    var notesInput = document.getElementById('modal-notes-input');
    var notesStatus = document.getElementById('notes-save-status');

    if (saveNotesBtn && notesInput) {
      saveNotesBtn.addEventListener('click', async function () {
        var text = notesInput.value.trim();
        saveNotesBtn.disabled = true;
        if (notesStatus) notesStatus.textContent = 'Saving...';
        try {
          await apiClient.setJobNotes(jobId, text);
          if (notesStatus) notesStatus.textContent = '✓ Saved';
          showToast('Private note saved', 'success');
          setTimeout(function () { if (notesStatus) notesStatus.textContent = ''; }, 2000);
          if (onStateChange) onStateChange('note', jobId, text);
        } catch (err) {
          showToast('Failed to save notes', 'error');
          if (notesStatus) notesStatus.textContent = 'Failed';
        } finally {
          saveNotesBtn.disabled = false;
        }
      });
    }

    if (clearNotesBtn && notesInput) {
      clearNotesBtn.addEventListener('click', async function () {
        clearNotesBtn.disabled = true;
        try {
          await apiClient.deleteJobNotes(jobId);
          notesInput.value = '';
          if (notesStatus) notesStatus.textContent = 'Cleared';
          showToast('Private note cleared', 'info');
          setTimeout(function () { if (notesStatus) notesStatus.textContent = ''; }, 2000);
          if (onStateChange) onStateChange('note', jobId, '');
        } catch (err) {
          showToast('Failed to delete notes', 'error');
        } finally {
          clearNotesBtn.disabled = false;
        }
      });
    }

    // ── Phase 14 Application Assistant Event Listeners ──
    var statusSelect = document.getElementById('modal-app-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', async function () {
        var newStatus = statusSelect.value;
        statusSelect.disabled = true;
        try {
          await apiClient.setApplicationStatus(jobId, newStatus);
          showToast('Application status set to ' + newStatus, 'success');
          if (newStatus === 'APPLIED' && modalApplyBtn) {
            modalApplyBtn.classList.add('vjc__btn-action--applied');
            modalApplyBtn.textContent = '✓ Applied';
          }
          if (onStateChange) onStateChange('status', jobId, newStatus);
        } catch (err) {
          showToast('Failed to update status', 'error');
        } finally {
          statusSelect.disabled = false;
        }
      });
    }

    var resumeSelect = document.getElementById('modal-resume-select');
    if (resumeSelect) {
      resumeSelect.addEventListener('change', async function () {
        var resumeId = resumeSelect.value || null;
        resumeSelect.disabled = true;
        try {
          await apiClient.selectResumeForJob(jobId, resumeId);
          showToast('Resume version selected for this application', 'success');
        } catch (err) {
          showToast('Failed to select resume version', 'error');
        } finally {
          resumeSelect.disabled = false;
        }
      });
    }

    // Checklist checkboxes
    function bindChecklistListeners() {
      var chks = document.querySelectorAll('.checklist-item-chk');
      var list = document.getElementById('modal-checklist-list');
      var progText = document.getElementById('checklist-progress-text');
      chks.forEach(function (chk) {
        chk.addEventListener('change', async function () {
          var itemId = chk.getAttribute('data-item-id');
          var isDone = chk.checked;
          var row = chk.closest('li');
          if (row) {
            if (isDone) row.classList.add('is-done');
            else row.classList.remove('is-done');
          }

          var updated = [];
          var rows = list ? list.querySelectorAll('li[data-checklist-id]') : [];
          rows.forEach(function (r) {
            var id = r.getAttribute('data-checklist-id');
            var c = r.querySelector('.checklist-item-chk');
            var t = r.querySelector('span');
            if (id && t) {
              updated.push({
                id: id,
                text: t.textContent.trim(),
                done: c ? c.checked : false,
              });
            }
          });

          if (progText) {
            var doneCount = updated.filter(function (u) { return u.done; }).length;
            progText.textContent = doneCount + '/' + updated.length + ' done';
          }

          try {
            await apiClient.setChecklist(jobId, updated);
          } catch (err) {
            showToast('Failed to save checklist state', 'error');
          }
        });
      });
    }
    bindChecklistListeners();

    // Add Checklist Item
    var addChecklistBtn = document.getElementById('btn-add-checklist-item');
    var addChecklistInput = document.getElementById('checklist-new-input');
    async function handleAddChecklistItem() {
      if (!addChecklistInput) return;
      var text = addChecklistInput.value.trim();
      if (!text) return;
      if (text.length > 300) {
        showToast('Checklist task cannot exceed 300 characters', 'error');
        return;
      }
      var list = document.getElementById('modal-checklist-list');
      var rows = list ? list.querySelectorAll('li[data-checklist-id]') : [];
      if (rows.length >= 20) {
        showToast('Maximum 20 checklist tasks allowed per job', 'error');
        return;
      }

      var newItem = {
        id: 'item-' + Date.now(),
        text: text,
        done: false,
      };

      var currentItems = [];
      rows.forEach(function (r) {
        var id = r.getAttribute('data-checklist-id');
        var c = r.querySelector('.checklist-item-chk');
        var t = r.querySelector('span');
        if (id && t) {
          currentItems.push({ id: id, text: t.textContent.trim(), done: c ? c.checked : false });
        }
      });
      currentItems.push(newItem);

      try {
        await apiClient.setChecklist(jobId, currentItems);
        addChecklistInput.value = '';
        var newLi = document.createElement('li');
        newLi.className = 'checklist-item-row';
        newLi.setAttribute('data-checklist-id', newItem.id);
        newLi.innerHTML =
          '<input type="checkbox" class="checklist-item-chk" data-item-id="' + escapeHtml(newItem.id) + '" />' +
          '<span>' + escapeHtml(newItem.text) + '</span>';
        if (list) list.appendChild(newLi);
        bindChecklistListeners();
        var progText = document.getElementById('checklist-progress-text');
        if (progText) {
          var doneCount = currentItems.filter(function (u) { return u.done; }).length;
          progText.textContent = doneCount + '/' + currentItems.length + ' done';
        }
        showToast('Task added to application checklist', 'success');
      } catch (err) {
        showToast('Failed to add checklist task', 'error');
      }
    }

    if (addChecklistBtn) addChecklistBtn.addEventListener('click', handleAddChecklistItem);
    if (addChecklistInput) {
      addChecklistInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddChecklistItem();
        }
      });
    }

    // Cover Letter Draft, Save, Clear
    var coverDraftBtn = document.getElementById('btn-generate-cover-draft');
    var coverInput = document.getElementById('modal-cover-letter-input');
    var coverSaveBtn = document.getElementById('btn-save-cover-letter');
    var coverClearBtn = document.getElementById('btn-clear-cover-letter');
    var coverCharCount = document.getElementById('cover-letter-char-count');

    if (coverInput && coverCharCount) {
      coverInput.addEventListener('input', function () {
        coverCharCount.textContent = coverInput.value.length + '/5000';
      });
    }

    if (coverDraftBtn && coverInput) {
      coverDraftBtn.addEventListener('click', async function () {
        coverDraftBtn.disabled = true;
        coverDraftBtn.textContent = 'Generating...';
        try {
          var draftRes = await apiClient.generateCoverLetterDraft(jobId);
          if (draftRes && draftRes.coverLetter) {
            coverInput.value = draftRes.coverLetter;
            if (coverCharCount) coverCharCount.textContent = coverInput.value.length + '/5000';
            showToast('Tailored cover letter draft generated!', 'success');
          }
        } catch (err) {
          showToast('Failed to generate draft', 'error');
        } finally {
          coverDraftBtn.disabled = false;
          coverDraftBtn.textContent = '⚡ Auto-Draft';
        }
      });
    }

    if (coverSaveBtn && coverInput) {
      coverSaveBtn.addEventListener('click', async function () {
        var text = coverInput.value.trim();
        coverSaveBtn.disabled = true;
        try {
          await apiClient.setCoverLetter(jobId, text);
          showToast('Cover letter saved to application record', 'success');
        } catch (err) {
          showToast('Failed to save cover letter', 'error');
        } finally {
          coverSaveBtn.disabled = false;
        }
      });
    }

    if (coverClearBtn && coverInput) {
      coverClearBtn.addEventListener('click', async function () {
        coverClearBtn.disabled = true;
        try {
          await apiClient.deleteCoverLetter(jobId);
          coverInput.value = '';
          if (coverCharCount) coverCharCount.textContent = '0/5000';
          showToast('Cover letter cleared', 'info');
        } catch (err) {
          showToast('Failed to clear cover letter', 'error');
        } finally {
          coverClearBtn.disabled = false;
        }
      });
    }

    // Reminder Set & Clear
    var reminderInput = document.getElementById('modal-reminder-input');
    var reminderSaveBtn = document.getElementById('btn-save-reminder');
    var reminderClearBtn = document.getElementById('btn-clear-reminder');

    if (reminderSaveBtn && reminderInput) {
      reminderSaveBtn.addEventListener('click', async function () {
        var dateVal = reminderInput.value;
        if (!dateVal) {
          showToast('Please select a date and time for follow-up', 'info');
          return;
        }
        reminderSaveBtn.disabled = true;
        try {
          var isoDate = new Date(dateVal).toISOString();
          await apiClient.setReminder(jobId, isoDate);
          showToast('Follow-up reminder set!', 'success');
        } catch (err) {
          showToast('Failed to set reminder', 'error');
        } finally {
          reminderSaveBtn.disabled = false;
        }
      });
    }

    if (reminderClearBtn && reminderInput) {
      reminderClearBtn.addEventListener('click', async function () {
        reminderClearBtn.disabled = true;
        try {
          await apiClient.setReminder(jobId, null);
          reminderInput.value = '';
          showToast('Follow-up reminder cleared', 'info');
        } catch (err) {
          showToast('Failed to clear reminder', 'error');
        } finally {
          reminderClearBtn.disabled = false;
        }
      });
    }

    // Interview Notes Save
    var interviewNotesInput = document.getElementById('modal-interview-notes-input');
    var interviewNotesSaveBtn = document.getElementById('btn-save-interview-notes');
    var interviewNotesCharCount = document.getElementById('interview-notes-char-count');

    if (interviewNotesInput && interviewNotesCharCount) {
      interviewNotesInput.addEventListener('input', function () {
        interviewNotesCharCount.textContent = interviewNotesInput.value.length + '/10000';
      });
    }

    if (interviewNotesSaveBtn && interviewNotesInput) {
      interviewNotesSaveBtn.addEventListener('click', async function () {
        var text = interviewNotesInput.value.trim();
        interviewNotesSaveBtn.disabled = true;
        try {
          await apiClient.setInterviewNotes(jobId, text);
          showToast('Interview preparation notes saved!', 'success');
        } catch (err) {
          showToast('Failed to save interview notes', 'error');
        } finally {
          interviewNotesSaveBtn.disabled = false;
        }
      });
    }
  } catch (err) {
    modalRoot.innerHTML = '';
    showToast('Failed to load job details', 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / Empty / Error state helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadingHtml(message) {
  return (
    '<div class="app-state app-state--loading">' +
    '<lemniscate-loader></lemniscate-loader>' +
    '<p class="app-state__message">' + escapeHtml(message || 'Loading...') + '</p>' +
    '</div>'
  );
}

function emptyStateHtml(icon, title, subtitle, actionHtml) {
  return (
    '<div class="app-state app-state--empty">' +
    '<div class="app-state__icon" aria-hidden="true">' + (icon || '🔍') + '</div>' +
    '<h3 class="app-state__title">' + escapeHtml(title) + '</h3>' +
    '<p class="app-state__subtitle">' + escapeHtml(subtitle) + '</p>' +
    (actionHtml || '') +
    '</div>'
  );
}

function errorStateHtml(message, retryId) {
  var retryBtn = retryId
    ? '<button type="button" class="kn-btn kn-btn--secondary app-state__retry" id="' + retryId + '">Try Again</button>'
    : '';
  return (
    '<div class="app-state app-state--error">' +
    '<div class="app-state__icon" aria-hidden="true">⚠️</div>' +
    '<h3 class="app-state__title">Something went wrong</h3>' +
    '<p class="app-state__subtitle">' + escapeHtml(message || 'Unable to load data. Please try again.') + '</p>' +
    retryBtn +
    '</div>'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderLanding() {
  if (isAuthenticated()) {
    setTimeout(function () { window.location.hash = '#/dashboard'; }, 0);
    return '<div class="app-state app-state--loading"><p>Redirecting...</p></div>';
  }
  return (
    '<div class="app-landing">' +
    '<div class="app-landing__content">' +
    '<h1 class="app-landing__headline kn-heading-1">Find Jobs That Are Actually Real.</h1>' +
    '<p class="app-landing__subtext">RoleRadar monitors official company career portals, verifies job listings directly from the source, and alerts you when a match is found — no aggregators, no fakes.</p>' +
    '<div class="app-landing__features">' +
    '<div class="app-landing__feature"><span class="app-landing__feature-icon">✓</span><span>Only verified, official job listings</span></div>' +
    '<div class="app-landing__feature"><span class="app-landing__feature-icon">✓</span><span>Matched to your exact preferences</span></div>' +
    '<div class="app-landing__feature"><span class="app-landing__feature-icon">✓</span><span>Direct links to official job pages</span></div>' +
    '</div>' +
    '<div class="app-landing__actions">' +
    '<a href="#/register" class="kn-btn kn-btn--primary app-landing__cta">Get Started — It\'s Free</a>' +
    '<a href="#/login" class="kn-btn kn-btn--secondary">Sign In</a>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function renderLogin() {
  return (
    '<div class="app-auth">' +
    '<div class="app-auth__box">' +
    '<h1 class="kn-heading-2 app-auth__title">Sign In to RoleRadar</h1>' +
    '<p class="app-auth__subtitle">Access your verified job matches.</p>' +
    '<div id="auth-error" class="app-auth__error" style="display:none;" role="alert"></div>' +
    '<form id="login-form" class="app-auth__form" novalidate>' +
    '<div class="kn-form-group">' +
    '<label class="kn-label" for="login-email">Email address</label>' +
    '<input type="email" id="login-email" name="email" class="kn-input" placeholder="you@example.com" autocomplete="email" required>' +
    '</div>' +
    '<div class="kn-form-group">' +
    '<label class="kn-label" for="login-password">Password</label>' +
    '<input type="password" id="login-password" name="password" class="kn-input" placeholder="Your password" autocomplete="current-password" required>' +
    '</div>' +
    '<button type="submit" id="btn-login" class="kn-btn kn-btn--primary app-auth__submit">Sign In</button>' +
    '</form>' +
    '<p class="app-auth__switch">Don\'t have an account? <a href="#/register" class="app-auth__switch-link">Get Started</a></p>' +
    '</div>' +
    '</div>'
  );
}

function renderRegister() {
  return (
    '<div class="app-auth">' +
    '<div class="app-auth__box">' +
    '<h1 class="kn-heading-2 app-auth__title">Create Your RoleRadar Account</h1>' +
    '<p class="app-auth__subtitle">Start receiving verified job alerts from official company career portals.</p>' +
    '<div id="auth-error" class="app-auth__error" style="display:none;" role="alert"></div>' +
    '<form id="register-form" class="app-auth__form" novalidate>' +
    '<div class="kn-form-group">' +
    '<label class="kn-label" for="register-name">Full name</label>' +
    '<input type="text" id="register-name" name="name" class="kn-input" placeholder="Your name" autocomplete="name" required>' +
    '</div>' +
    '<div class="kn-form-group">' +
    '<label class="kn-label" for="register-email">Email address</label>' +
    '<input type="email" id="register-email" name="email" class="kn-input" placeholder="you@example.com" autocomplete="email" required>' +
    '</div>' +
    '<div class="kn-form-group">' +
    '<label class="kn-label" for="register-password">Password</label>' +
    '<input type="password" id="register-password" name="password" class="kn-input" placeholder="At least 8 characters" autocomplete="new-password" required minlength="8">' +
    '</div>' +
    '<button type="submit" id="btn-register" class="kn-btn kn-btn--primary app-auth__submit">Create Account</button>' +
    '</form>' +
    '<p class="app-auth__switch">Already have an account? <a href="#/login" class="app-auth__switch-link">Sign In</a></p>' +
    '</div>' +
    '</div>'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling Manager (Lightweight, Visibility-Aware)
// ─────────────────────────────────────────────────────────────────────────────
var activePollTimer = null;

function stopPolling() {
  if (activePollTimer) {
    clearInterval(activePollTimer);
    activePollTimer = null;
  }
}

function renderDashboardHome() {
  setTimeout(async function () {
    var statsSlot = document.getElementById('dashboard-stats-slot');
    var slot = document.getElementById('dashboard-prefs-slot');
    var feedSlot = document.getElementById('dashboard-matched-feed-slot');
    var recentSlot = document.getElementById('dashboard-recent-slot');
    if (!slot || !feedSlot) return;

    // 1. Load Workspace Stats Counters
    if (statsSlot && isAuthenticated()) {
      try {
        var stats = await apiClient.getWorkspaceStats();
        statsSlot.innerHTML = (
          '<div class="workspace-stats-grid">' +
            '<div class="workspace-stat-card">' +
              '<div class="workspace-stat-header">' +
                '<span class="workspace-stat-label">Saved Jobs</span>' +
                '<span class="workspace-stat-icon">♥</span>' +
              '</div>' +
              '<div class="workspace-stat-num" id="stat-saved-count">' + (stats.savedCount || 0) + '</div>' +
              '<a href="#/dashboard/saved" class="workspace-stat-link">View Saved Jobs →</a>' +
            '</div>' +
            '<div class="workspace-stat-card">' +
              '<div class="workspace-stat-header">' +
                '<span class="workspace-stat-label">Applications</span>' +
                '<span class="workspace-stat-icon">📋</span>' +
              '</div>' +
              '<div class="workspace-stat-num" id="stat-applied-count">' + (stats.appliedCount || 0) + '</div>' +
              '<a href="#/dashboard/applications" class="workspace-stat-link">View Applications →</a>' +
            '</div>' +
            '<div class="workspace-stat-card">' +
              '<div class="workspace-stat-header">' +
                '<span class="workspace-stat-label">Recently Viewed</span>' +
                '<span class="workspace-stat-icon">👁️</span>' +
              '</div>' +
              '<div class="workspace-stat-num" id="stat-viewed-count">' + (stats.recentlyViewedCount || 0) + '</div>' +
              '<a href="#/dashboard/verified-jobs" class="workspace-stat-link">Explore Feed →</a>' +
            '</div>' +
          '</div>'
        );
      } catch (e) {
        statsSlot.innerHTML = '';
      }
    }

    var prefs = null;
    try {
      var raw = localStorage.getItem('roleradar_preferences');
      if (raw) prefs = JSON.parse(raw);
    } catch (e) {}

    if (!prefs && isAuthenticated()) {
      try {
        prefs = await apiClient.getPreferences();
        if (prefs) localStorage.setItem('roleradar_preferences', JSON.stringify(prefs));
      } catch (e) {}
    }

    if (prefs && (prefs.roles || prefs.roleKeywords)) {
      renderDashboardPreferencesSummary(slot, prefs, function () {
        window.location.hash = '#/preferences';
      });

      feedSlot.innerHTML = loadingHtml('Finding verified jobs matching your profile...');

      var isFetching = false;
      var fetchLatestMatches = async function (showLoading) {
        if (isFetching) return;
        isFetching = true;
        try {
          if (showLoading) {
            feedSlot.innerHTML = loadingHtml('Finding verified jobs matching your profile...');
          }
          var data = await apiClient.getMatchedJobs({ page: 1, limit: 10, sort: 'BEST_MATCH' });
          var matches = data.jobs || [];

          if (matches.length > 0) {
            var cardsHtml = matches.map(function (job) { return verifiedJobCardHtml(job, { context: 'feed' }); }).join('');
            feedSlot.innerHTML =
              '<div class="dashboard-feed-header">' +
                '<h2 class="kn-heading-2 dashboard-feed-title">🎯 Recommended Verified Matches' +
                  (data.totalMatches ? ' <span class="dashboard-feed-count">(' + data.totalMatches + ' total)</span>' : '') +
                '</h2>' +
                '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--secondary dashboard-feed-viewall">View All →</a>' +
              '</div>' +
              cardsHtml;

            bindJobCardActions(feedSlot, function () {
              // Refresh stats on card action
              apiClient.getWorkspaceStats().then(function (st) {
                var sEl = document.getElementById('stat-saved-count');
                var aEl = document.getElementById('stat-applied-count');
                if (sEl) sEl.textContent = String(st.savedCount || 0);
                if (aEl) aEl.textContent = String(st.appliedCount || 0);
              }).catch(function () {});
            });
          } else {
            feedSlot.innerHTML = emptyStateHtml(
              '🔍',
              'No Verified Matches Found Yet',
              'No active verified jobs strictly matching your target roles, locations, and experience level were found across official company career portals.',
              '<a href="#/preferences" class="kn-btn kn-btn--secondary">✏️ Edit Preferences</a>'
            );
          }
        } catch (err) {
          if (showLoading) {
            var errMsg = (err && err.status === 401) ? 'Session expired. Please sign in again.' : 'Failed to load matched jobs. Please try again.';
            feedSlot.innerHTML = errorStateHtml(errMsg, 'btn-retry-dashboard-feed');
            var retryBtn = document.getElementById('btn-retry-dashboard-feed');
            if (retryBtn) {
              retryBtn.addEventListener('click', function () {
                fetchLatestMatches(true);
              });
            }
          }
        } finally {
          isFetching = false;
        }
      };

      await fetchLatestMatches(true);

      // Load Recently Viewed Jobs
      if (recentSlot && isAuthenticated()) {
        try {
          var recData = await apiClient.getRecentlyViewedJobs(6);
          var recJobs = recData.items || [];
          if (recJobs.length > 0) {
            var recentCardsHtml = recJobs.map(function (j) {
              var company = escapeHtml(j.companyName || '');
              var title = escapeHtml(j.title || '');
              var location = escapeHtml(j.location || 'Location Unspecified');
              var viewTime = j.interaction && j.interaction.viewedAt ? formatDetectedDate(j.interaction.viewedAt) : '';
              var statusBadge = j.status === 'CLOSED' ? '<span class="vjc__closed-badge">⚠ Closed</span>' : '<span class="vjc__verified-badge">✓ Active</span>';

              return (
                '<div class="workspace-recent-card" data-recent-id="' + escapeHtml(j.id) + '">' +
                  '<div>' +
                    '<div class="workspace-recent-card-company">' + company + '</div>' +
                    '<div class="workspace-recent-card-title">' + title + '</div>' +
                    '<div style="font-size:0.8rem; color:#475569;">📍 ' + location + '</div>' +
                  '</div>' +
                  '<div class="workspace-recent-card-meta">' +
                    '<span>' + (viewTime ? 'Viewed ' + viewTime : '') + '</span>' +
                    statusBadge +
                  '</div>' +
                '</div>'
              );
            }).join('');

            recentSlot.innerHTML = (
              '<div class="workspace-recent-section">' +
                '<div class="workspace-recent-header">' +
                  '<h3 class="workspace-recent-title">👁️ Recently Viewed</h3>' +
                '</div>' +
                '<div class="workspace-recent-grid">' +
                  recentCardsHtml +
                '</div>' +
              '</div>'
            );

            recentSlot.querySelectorAll('[data-recent-id]').forEach(function (card) {
              card.addEventListener('click', function () {
                var rId = card.getAttribute('data-recent-id');
                if (rId) openJobDetailModal(rId);
              });
            });
          } else {
            recentSlot.innerHTML = '';
          }
        } catch (e) {
          recentSlot.innerHTML = '';
        }
      }

      stopPolling();
      activePollTimer = setInterval(function () {
        if (document.visibilityState === 'hidden') return;
        if (!document.getElementById('dashboard-matched-feed-slot')) {
          stopPolling();
          return;
        }
        fetchLatestMatches(false);
      }, 60000);
    } else {
      slot.innerHTML =
        '<div class="kn-card kn-p-4 kn-mb-4 app-prefs-prompt">' +
        '<h3 class="kn-heading-3 kn-mb-2">👋 Set Up Your Job Preferences</h3>' +
        '<p class="kn-mb-3">You haven\'t configured your job matching preferences yet. Complete setup to receive verified job alerts from official company career portals.</p>' +
        '<a href="#/preferences" class="kn-btn kn-btn--primary" id="btn-go-prefs">Get Started →</a>' +
        '</div>';

      feedSlot.innerHTML = emptyStateHtml(
        '🎯',
        'Your Verified Job Feed',
        'Complete onboarding to see verified jobs matching your preferences from official company career portals.',
        ''
      );
    }
  }, 10);

  var user = apiClient.getUser();
  var greeting = user && user.name ? 'Welcome back, ' + escapeHtml(user.name.split(' ')[0]) + '.' : 'Welcome to your Workspace.';

  var skeletonStatsHtml = (
    '<div class="workspace-stats-grid" aria-busy="true">' +
      '<div class="workspace-stat-card">' +
        '<div class="workspace-stat-header"><span class="workspace-stat-label">Saved Jobs</span><span class="workspace-stat-icon">♥</span></div>' +
        '<div class="workspace-stat-num" style="opacity:0.25;">—</div>' +
        '<span class="workspace-stat-link" style="opacity:0.4;">Loading...</span>' +
      '</div>' +
      '<div class="workspace-stat-card">' +
        '<div class="workspace-stat-header"><span class="workspace-stat-label">Applications</span><span class="workspace-stat-icon">📋</span></div>' +
        '<div class="workspace-stat-num" style="opacity:0.25;">—</div>' +
        '<span class="workspace-stat-link" style="opacity:0.4;">Loading...</span>' +
      '</div>' +
      '<div class="workspace-stat-card">' +
        '<div class="workspace-stat-header"><span class="workspace-stat-label">Recently Viewed</span><span class="workspace-stat-icon">👁️</span></div>' +
        '<div class="workspace-stat-num" style="opacity:0.25;">—</div>' +
        '<span class="workspace-stat-link" style="opacity:0.4;">Loading...</span>' +
      '</div>' +
    '</div>'
  );

  var skeletonFeedHtml = (
    '<div style="min-height: 280px;" aria-busy="true">' +
      loadingHtml('Finding verified jobs matching your profile...') +
    '</div>'
  );

  return (
    '<div class="app-dashboard-home">' +
      '<div class="dashboard-greeting">' +
        '<h1 class="kn-heading-1">' + greeting + '</h1>' +
        '<p class="dashboard-tagline">Your personal job-seeker workspace — track, save, and manage verified opportunities.</p>' +
      '</div>' +
      '<div id="dashboard-stats-slot">' + skeletonStatsHtml + '</div>' +
      '<div id="dashboard-prefs-slot"></div>' +
      '<div id="dashboard-matched-feed-slot">' + skeletonFeedHtml + '</div>' +
      '<div id="dashboard-recent-slot"></div>' +
    '</div>'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved Jobs Page
// ─────────────────────────────────────────────────────────────────────────────

function renderSavedJobsPage() {
  var container = document.createElement('div');
  container.innerHTML = (
    '<div class="app-saved-jobs">' +
      '<div class="vjp__header">' +
        '<div>' +
          '<h1 class="kn-heading-1">Saved Jobs</h1>' +
          '<p class="vjp__subtitle">Positions bookmarked for later review. Closed listings remain for your records.</p>' +
        '</div>' +
        '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--secondary">Explore Verified Feed →</a>' +
      '</div>' +

      '<div class="workspace-toolbar" id="saved-toolbar">' +
        '<div class="workspace-toolbar__search">' +
          '<input type="search" id="saved-search-input" class="kn-input" placeholder="🔍 Search saved jobs by title, company, or location..." />' +
        '</div>' +
        '<div class="workspace-toolbar__filters">' +
          '<label for="saved-status-select" class="workspace-toolbar__label">Status:</label>' +
          '<select id="saved-status-select" class="kn-select workspace-toolbar__select">' +
            '<option value="ALL" selected>All Statuses</option>' +
            '<option value="ACTIVE">🟢 Active Only</option>' +
            '<option value="CLOSED">⚠ Closed Only</option>' +
          '</select>' +
          '<label for="saved-applied-select" class="workspace-toolbar__label">Application:</label>' +
          '<select id="saved-applied-select" class="kn-select workspace-toolbar__select">' +
            '<option value="ALL" selected>All</option>' +
            '<option value="APPLIED">✓ Applied</option>' +
            '<option value="NOT_APPLIED">Unapplied</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div id="saved-feed">' + loadingHtml('Loading saved jobs...') + '</div>' +
      '<div id="saved-pagination" class="vjp__pagination"></div>' +
    '</div>'
  );

  setTimeout(async function () {
    var feed = document.getElementById('saved-feed');
    var paginationEl = document.getElementById('saved-pagination');
    var searchInput = document.getElementById('saved-search-input');
    var statusSelect = document.getElementById('saved-status-select');
    var appliedSelect = document.getElementById('saved-applied-select');

    if (!feed) return;

    var state = {
      page: 1,
      limit: 15,
      status: 'ALL',
      applied: 'ALL',
      q: '',
    };

    var isFetching = false;
    var fetchSaved = async function (showLoading) {
      if (isFetching) return;
      isFetching = true;
      try {
        if (showLoading) {
          feed.innerHTML = loadingHtml('Loading saved jobs...');
        }

        var data = await apiClient.getSavedJobs(state);
        var items = data.items || [];
        var total = data.total || 0;
        var totalPages = data.totalPages || Math.ceil(total / state.limit) || 1;

        if (items.length === 0) {
          feed.innerHTML = emptyStateHtml(
            '♥',
            'No Saved Jobs Found',
            'Save jobs you want to revisit later from the verified job feed or search results.',
            '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--primary">Browse Verified Jobs →</a>'
          );
          if (paginationEl) paginationEl.innerHTML = '';
          return;
        }

        var cardsHtml = items.map(function (job) {
          return verifiedJobCardHtml(job, { context: 'saved' });
        }).join('');

        var totalInfo =
          '<div class="vjp__results-header">' +
            '<p class="vjp__total">Showing ' + items.length + ' of ' + total + ' saved job' + (total !== 1 ? 's' : '') + '</p>' +
          '</div>';

        feed.innerHTML = totalInfo + cardsHtml;

        bindJobCardActions(feed, function (action) {
          if (action === 'save') {
            // Re-fetch saved list to update view
            fetchSaved(false);
          }
        });

        // Pagination
        if (paginationEl) {
          if (totalPages > 1) {
            var prevDisabled = state.page <= 1 ? 'disabled' : '';
            var nextDisabled = state.page >= totalPages ? 'disabled' : '';
            paginationEl.innerHTML = (
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="saved-prev-page" ' + prevDisabled + '>« Previous</button>' +
              '<span class="vjp__page-indicator">Page ' + state.page + ' of ' + totalPages + '</span>' +
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="saved-next-page" ' + nextDisabled + '>Next »</button>'
            );

            var prevBtn = document.getElementById('saved-prev-page');
            var nextBtn = document.getElementById('saved-next-page');
            if (prevBtn && state.page > 1) {
              prevBtn.addEventListener('click', function () {
                state.page -= 1;
                fetchSaved(true);
              });
            }
            if (nextBtn && state.page < totalPages) {
              nextBtn.addEventListener('click', function () {
                state.page += 1;
                fetchSaved(true);
              });
            }
          } else {
            paginationEl.innerHTML = '';
          }
        }
      } catch (err) {
        if (showLoading) {
          feed.innerHTML = errorStateHtml('Failed to load saved jobs.', 'btn-retry-saved');
          var retryBtn = document.getElementById('btn-retry-saved');
          if (retryBtn) retryBtn.addEventListener('click', function () { fetchSaved(true); });
        }
      } finally {
        isFetching = false;
      }
    };

    var searchTimeout = null;
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function () {
          state.q = e.target.value.trim();
          state.page = 1;
          fetchSaved(true);
        }, 300);
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', function (e) {
        state.status = e.target.value;
        state.page = 1;
        fetchSaved(true);
      });
    }

    if (appliedSelect) {
      appliedSelect.addEventListener('change', function (e) {
        state.applied = e.target.value;
        state.page = 1;
        fetchSaved(true);
      });
    }

    await fetchSaved(true);
  }, 10);

  return container.innerHTML;
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Tracking Page
// ─────────────────────────────────────────────────────────────────────────────

function renderApplicationsPage() {
  var container = document.createElement('div');
  container.innerHTML = (
    '<div class="app-applications">' +
      '<div class="vjp__header">' +
        '<div>' +
          '<h1 class="kn-heading-1">Tracked Applications</h1>' +
          '<p class="vjp__subtitle">Record and manage official career portal applications you submitted.</p>' +
        '</div>' +
        '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--secondary">Find New Opportunities →</a>' +
      '</div>' +

      '<div class="workspace-toolbar" id="app-toolbar">' +
        '<div class="workspace-toolbar__search">' +
          '<input type="search" id="app-search-input" class="kn-input" placeholder="🔍 Search applications by title, company, or location..." />' +
        '</div>' +
        '<div class="workspace-toolbar__filters">' +
          '<label for="app-status-select" class="workspace-toolbar__label">Status:</label>' +
          '<select id="app-status-select" class="kn-select workspace-toolbar__select">' +
            '<option value="ALL" selected>All Statuses</option>' +
            '<option value="ACTIVE">🟢 Active Positions</option>' +
            '<option value="CLOSED">⚠ Closed Positions</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div id="app-feed">' + loadingHtml('Loading tracked applications...') + '</div>' +
      '<div id="app-pagination" class="vjp__pagination"></div>' +
    '</div>'
  );

  setTimeout(async function () {
    var feed = document.getElementById('app-feed');
    var paginationEl = document.getElementById('app-pagination');
    var searchInput = document.getElementById('app-search-input');
    var statusSelect = document.getElementById('app-status-select');

    if (!feed) return;

    var state = {
      page: 1,
      limit: 15,
      status: 'ALL',
      q: '',
    };

    var isFetching = false;
    var fetchApps = async function (showLoading) {
      if (isFetching) return;
      isFetching = true;
      try {
        if (showLoading) {
          feed.innerHTML = loadingHtml('Loading tracked applications...');
        }

        var data = await apiClient.getAppliedJobs(state);
        var items = data.items || [];
        var total = data.total || 0;
        var totalPages = data.totalPages || Math.ceil(total / state.limit) || 1;

        if (items.length === 0) {
          feed.innerHTML = emptyStateHtml(
            '📋',
            'No Applications Tracked Yet',
            'Mark a job as applied after submitting your application on the employer\'s official career portal.',
            '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--primary">Explore Verified Jobs →</a>'
          );
          if (paginationEl) paginationEl.innerHTML = '';
          return;
        }

        var cardsHtml = items.map(function (job) {
          return verifiedJobCardHtml(job, { context: 'applications' });
        }).join('');

        var totalInfo =
          '<div class="vjp__results-header">' +
            '<p class="vjp__total">Showing ' + items.length + ' of ' + total + ' tracked application' + (total !== 1 ? 's' : '') + '</p>' +
          '</div>';

        feed.innerHTML = totalInfo + cardsHtml;

        bindJobCardActions(feed, function (action) {
          if (action === 'apply') {
            fetchApps(false);
          }
        });

        // Pagination
        if (paginationEl) {
          if (totalPages > 1) {
            var prevDisabled = state.page <= 1 ? 'disabled' : '';
            var nextDisabled = state.page >= totalPages ? 'disabled' : '';
            paginationEl.innerHTML = (
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="apps-prev-page" ' + prevDisabled + '>« Previous</button>' +
              '<span class="vjp__page-indicator">Page ' + state.page + ' of ' + totalPages + '</span>' +
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="apps-next-page" ' + nextDisabled + '>Next »</button>'
            );

            var prevBtn = document.getElementById('apps-prev-page');
            var nextBtn = document.getElementById('apps-next-page');
            if (prevBtn && state.page > 1) {
              prevBtn.addEventListener('click', function () {
                state.page -= 1;
                fetchApps(true);
              });
            }
            if (nextBtn && state.page < totalPages) {
              nextBtn.addEventListener('click', function () {
                state.page += 1;
                fetchApps(true);
              });
            }
          } else {
            paginationEl.innerHTML = '';
          }
        }
      } catch (err) {
        if (showLoading) {
          feed.innerHTML = errorStateHtml('Failed to load application records.', 'btn-retry-apps');
          var retryBtn = document.getElementById('btn-retry-apps');
          if (retryBtn) retryBtn.addEventListener('click', function () { fetchApps(true); });
        }
      } finally {
        isFetching = false;
      }
    };

    var searchTimeout = null;
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function () {
          state.q = e.target.value.trim();
          state.page = 1;
          fetchApps(true);
        }, 300);
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', function (e) {
        state.status = e.target.value;
        state.page = 1;
        fetchApps(true);
      });
    }

    await fetchApps(true);
  }, 10);

  return container.innerHTML;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hidden / Dismissed Jobs Page
// ─────────────────────────────────────────────────────────────────────────────

function renderDismissedJobsPage() {
  var container = document.createElement('div');
  container.innerHTML = (
    '<div class="app-dismissed-jobs">' +
      '<div class="vjp__header">' +
        '<div>' +
          '<h1 class="kn-heading-1">Hidden Jobs</h1>' +
          '<p class="vjp__subtitle">Positions you dismissed from your feed. You can restore them anytime.</p>' +
        '</div>' +
        '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--secondary">Back to Feed →</a>' +
      '</div>' +

      '<div class="workspace-toolbar" id="dismissed-toolbar">' +
        '<div class="workspace-toolbar__search">' +
          '<input type="search" id="dismissed-search-input" class="kn-input" placeholder="🔍 Search hidden jobs..." />' +
        '</div>' +
      '</div>' +

      '<div id="dismissed-feed">' + loadingHtml('Loading hidden jobs...') + '</div>' +
      '<div id="dismissed-pagination" class="vjp__pagination"></div>' +
    '</div>'
  );

  setTimeout(async function () {
    var feed = document.getElementById('dismissed-feed');
    var paginationEl = document.getElementById('dismissed-pagination');
    var searchInput = document.getElementById('dismissed-search-input');

    if (!feed) return;

    var state = {
      page: 1,
      limit: 15,
      q: '',
    };

    var isFetching = false;
    var fetchDismissed = async function (showLoading) {
      if (isFetching) return;
      isFetching = true;
      try {
        if (showLoading) {
          feed.innerHTML = loadingHtml('Loading hidden jobs...');
        }

        var data = await apiClient.getDismissedJobs(state);
        var items = data.items || [];
        var total = data.total || 0;
        var totalPages = data.totalPages || Math.ceil(total / state.limit) || 1;

        if (items.length === 0) {
          feed.innerHTML = emptyStateHtml(
            '👁️',
            'No Hidden Jobs',
            'When you dismiss jobs you aren\'t interested in from the feed, they will appear here.',
            '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--primary">Browse Verified Jobs →</a>'
          );
          if (paginationEl) paginationEl.innerHTML = '';
          return;
        }

        var cardsHtml = items.map(function (job) {
          return verifiedJobCardHtml(job, { context: 'dismissed' });
        }).join('');

        var totalInfo =
          '<div class="vjp__results-header">' +
            '<p class="vjp__total">Showing ' + items.length + ' of ' + total + ' hidden job' + (total !== 1 ? 's' : '') + '</p>' +
          '</div>';

        feed.innerHTML = totalInfo + cardsHtml;

        bindJobCardActions(feed, function (action) {
          if (action === 'restore') {
            fetchDismissed(false);
          }
        });

        // Pagination
        if (paginationEl) {
          if (totalPages > 1) {
            var prevDisabled = state.page <= 1 ? 'disabled' : '';
            var nextDisabled = state.page >= totalPages ? 'disabled' : '';
            paginationEl.innerHTML = (
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="dism-prev-page" ' + prevDisabled + '>« Previous</button>' +
              '<span class="vjp__page-indicator">Page ' + state.page + ' of ' + totalPages + '</span>' +
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="dism-next-page" ' + nextDisabled + '>Next »</button>'
            );

            var prevBtn = document.getElementById('dism-prev-page');
            var nextBtn = document.getElementById('dism-next-page');
            if (prevBtn && state.page > 1) {
              prevBtn.addEventListener('click', function () {
                state.page -= 1;
                fetchDismissed(true);
              });
            }
            if (nextBtn && state.page < totalPages) {
              nextBtn.addEventListener('click', function () {
                state.page += 1;
                fetchDismissed(true);
              });
            }
          } else {
            paginationEl.innerHTML = '';
          }
        }
      } catch (err) {
        if (showLoading) {
          feed.innerHTML = errorStateHtml('Failed to load hidden jobs.', 'btn-retry-dismissed');
          var retryBtn = document.getElementById('btn-retry-dismissed');
          if (retryBtn) retryBtn.addEventListener('click', function () { fetchDismissed(true); });
        }
      } finally {
        isFetching = false;
      }
    };

    var searchTimeout = null;
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function () {
          state.q = e.target.value.trim();
          state.page = 1;
          fetchDismissed(true);
        }, 300);
      });
    }

    await fetchDismissed(true);
  }, 10);

  return container.innerHTML;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verified Jobs Feed Page
// ─────────────────────────────────────────────────────────────────────────────

function renderVerifiedJobsPage() {
  var container = document.createElement('div');
  container.innerHTML = (
    '<div class="app-verified-jobs">' +
      '<div class="vjp__header">' +
        '<div>' +
          '<h1 class="kn-heading-1">Verified Jobs</h1>' +
          '<p class="vjp__subtitle">Only active, verified listings from official company career portals — ranked by relevance.</p>' +
        '</div>' +
        '<a href="#/preferences" class="kn-btn kn-btn--secondary">✏️ Edit Preferences</a>' +
      '</div>' +

      '<!-- Phase 12 Search Intelligence Toolbar -->' +
      '<div class="vjp__toolbar" id="vjp-toolbar">' +
        '<div class="vjp__search-wrap" style="position:relative; flex:1;">' +
          '<input type="search" id="vjp-search-input" class="kn-input vjp__search-input" placeholder="🔍 Search naturally (e.g. \'fresher java developer in Bangalore\', \'finance analyst Mumbai\')..." autocomplete="off" />' +
          '<div id="vjp-suggestions" class="vjp__suggestions-dropdown" style="display:none;"></div>' +
        '</div>' +
        '<div class="vjp__filter-controls">' +
          '<div class="vjp__control-group">' +
            '<label for="vjp-role-select" class="vjp__control-label">Role:</label>' +
            '<select id="vjp-role-select" class="kn-select vjp__select">' +
              '<option value="ALL" selected>All Roles</option>' +
            '</select>' +
          '</div>' +
          '<div class="vjp__control-group">' +
            '<label for="vjp-sort-select" class="vjp__control-label">Sort:</label>' +
            '<select id="vjp-sort-select" class="kn-select vjp__select">' +
              '<option value="BEST_MATCH" selected>🎯 Best Match</option>' +
              '<option value="NEWEST">⚡ Newest First</option>' +
              '<option value="MOST_RELEVANT">🎯 Most Relevant</option>' +
              '<option value="RECENTLY_VERIFIED">🕒 Recently Verified</option>' +
            '</select>' +
          '</div>' +
          '<div class="vjp__control-group">' +
            '<label for="vjp-workplace-select" class="vjp__control-label">Workplace:</label>' +
            '<select id="vjp-workplace-select" class="kn-select vjp__select">' +
              '<option value="ANY" selected>All Workplaces</option>' +
              '<option value="ONSITE">🏢 On-site</option>' +
              '<option value="HYBRID">🏢 Hybrid</option>' +
              '<option value="REMOTE">🌐 Remote</option>' +
            '</select>' +
          '</div>' +
          '<div class="vjp__control-group">' +
            '<label for="vjp-freshness-select" class="vjp__control-label">Freshness:</label>' +
            '<select id="vjp-freshness-select" class="kn-select vjp__select">' +
              '<option value="ALL" selected>All Verified</option>' +
              '<option value="FRESH">🟢 Fresh (&le; 48h)</option>' +
              '<option value="RECENT">🕐 Recent (&le; 7d)</option>' +
            '</select>' +
          '</div>' +
          '<div class="vjp__control-group" style="margin-top: 24px;">' +
            '<button type="button" id="btn-today-filter" class="kn-btn kn-btn--secondary">📅 Today\'s Verified Jobs</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div id="vjp-intent-bar" class="vjp__intent-bar" style="display:none;"></div>' +
      '<div id="vjp-feed">' + loadingHtml('Finding verified jobs matching your profile...') + '</div>' +
      '<div id="vjp-pagination" class="vjp__pagination"></div>' +
    '</div>'
  );

  setTimeout(async function () {
    var feed = document.getElementById('vjp-feed');
    var paginationEl = document.getElementById('vjp-pagination');
    var searchInput = document.getElementById('vjp-search-input');
    var suggestionsEl = document.getElementById('vjp-suggestions');
    var intentBarEl = document.getElementById('vjp-intent-bar');
    var roleSelect = document.getElementById('vjp-role-select');
    var sortSelect = document.getElementById('vjp-sort-select');
    var workplaceSelect = document.getElementById('vjp-workplace-select');
    var freshnessSelect = document.getElementById('vjp-freshness-select');

    if (!feed) return;
    
    // Populate Role Select from User Preferences
    if (roleSelect) {
      try {
        var rawPrefs = localStorage.getItem('roleradar_preferences');
        if (rawPrefs) {
          var prefs = JSON.parse(rawPrefs);
          var roles = prefs.roles || prefs.roleKeywords || [];
          // Pre-populate with saved roles if available
          if (roles.length > 0) {
            roles.forEach(function(r) {
              var opt = document.createElement('option');
              opt.value = r;
              opt.textContent = r;
              // If we want it to default to their first preferred role instead of "All Roles", we can do it here.
              // But requirements ask "All Roles" to be the default broad option.
              roleSelect.appendChild(opt);
            });
          }
        }
      } catch (e) {
        console.error('Failed to load roles for select', e);
      }
    }

    var state = {
      page: 1,
      limit: 15,
      sort: 'BEST_MATCH',
      q: '',
      roleFilter: 'ALL',
      workplace: 'ANY',
      freshness: 'ALL',
      isToday: false,
    };

    var isFetching = false;
    var fetchJobs = async function (showLoading) {
      if (isFetching) return;
      isFetching = true;
      try {
        if (showLoading) {
          feed.innerHTML = loadingHtml('Finding verified jobs matching your profile...');
        }

        var data = await apiClient.getMatchedJobs(state);
        var matches = data.jobs || [];
        var totalMatches = data.totalMatches || 0;
        var totalPages = Math.ceil(totalMatches / state.limit) || 1;

        // Render Interpreted Search Intent Bar
        if (intentBarEl) {
          if (data.searchIntent && data.searchIntent.isNaturalLanguage) {
            var intentPills = [];
            var si = data.searchIntent;
            if (si.experienceLevel) {
              intentPills.push('<span class="vjp__intent-pill">🎓 ' + escapeHtml(si.experienceLevel) + '</span>');
            }
            if (si.roles && si.roles.length > 0) {
              intentPills.push('<span class="vjp__intent-pill">🎯 ' + escapeHtml(si.roles.join(', ')) + '</span>');
            }
            if (si.skills && si.skills.length > 0) {
              intentPills.push('<span class="vjp__intent-pill">💻 ' + escapeHtml(si.skills.join(', ')) + '</span>');
            }
            if (si.locations && si.locations.length > 0) {
              intentPills.push('<span class="vjp__intent-pill">📍 ' + escapeHtml(si.locations.join(', ')) + '</span>');
            } else if (si.country) {
              intentPills.push('<span class="vjp__intent-pill">🌍 ' + escapeHtml(si.country) + '</span>');
            }
            if (si.workplaceTypes && si.workplaceTypes.length > 0) {
              intentPills.push('<span class="vjp__intent-pill">🏢 ' + escapeHtml(si.workplaceTypes.join('/')) + '</span>');
            }
            intentBarEl.innerHTML = '<div class="vjp__intent-inner"><span class="vjp__intent-label">Interpreted Intent:</span>' + intentPills.join('') + '</div>';
            intentBarEl.style.display = 'block';
          } else {
            intentBarEl.style.display = 'none';
          }
        }

        if (matches.length === 0) {
          var actionChips =
            '<div class="vjp__empty-actions">' +
              '<button type="button" class="kn-btn kn-btn--secondary" id="btn-empty-reset">🔄 Reset Filters</button>' +
              '<button type="button" class="kn-btn kn-btn--secondary" id="btn-empty-remote">🌐 Try Remote / Hybrid</button>' +
              '<a href="#/preferences" class="kn-btn kn-btn--secondary">✏️ Edit Preferences</a>' +
            '</div>';

          feed.innerHTML = emptyStateHtml(
            '🔍',
            'No Verified Jobs Match Current Filters',
            'We didn\'t find any active verified listings matching your current filter criteria.',
            actionChips
          );

          var resetBtn = document.getElementById('btn-empty-reset');
          if (resetBtn) {
            resetBtn.addEventListener('click', function () {
              if (searchInput) searchInput.value = '';
              if (sortSelect) sortSelect.value = 'BEST_MATCH';
              if (workplaceSelect) workplaceSelect.value = 'ANY';
              if (freshnessSelect) freshnessSelect.value = 'ALL';
              state.q = '';
              state.sort = 'BEST_MATCH';
              state.workplace = 'ANY';
              state.freshness = 'ALL';
              state.page = 1;
              fetchJobs(true);
            });
          }

          var tryRemoteBtn = document.getElementById('btn-empty-remote');
          if (tryRemoteBtn) {
            tryRemoteBtn.addEventListener('click', function () {
              if (workplaceSelect) workplaceSelect.value = 'REMOTE';
              state.workplace = 'REMOTE';
              state.page = 1;
              fetchJobs(true);
            });
          }

          if (paginationEl) paginationEl.innerHTML = '';
          return;
        }

        var cardsHtml = matches.map(function (job) { return verifiedJobCardHtml(job, { context: 'feed', showVerifiedToday: state.isToday }); }).join('');
        var totalInfo =
          '<div class="vjp__results-header">' +
            '<p class="vjp__total">Showing ' + matches.length + ' of ' + totalMatches + ' verified job matches</p>' +
          '</div>';

        feed.innerHTML = totalInfo + cardsHtml;

        bindJobCardActions(feed);

        // Render Pagination
        if (paginationEl) {
          if (totalPages > 1) {
            var prevDisabled = state.page <= 1 ? 'disabled' : '';
            var nextDisabled = state.page >= totalPages ? 'disabled' : '';
            paginationEl.innerHTML = (
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="vjp-prev-page" ' + prevDisabled + '>« Previous</button>' +
              '<span class="vjp__page-indicator">Page ' + state.page + ' of ' + totalPages + '</span>' +
              '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="vjp-next-page" ' + nextDisabled + '>Next »</button>'
            );

            var prevBtn = document.getElementById('vjp-prev-page');
            var nextBtn = document.getElementById('vjp-next-page');
            if (prevBtn && state.page > 1) {
              prevBtn.addEventListener('click', function () {
                state.page -= 1;
                fetchJobs(true);
              });
            }
            if (nextBtn && state.page < totalPages) {
              nextBtn.addEventListener('click', function () {
                state.page += 1;
                fetchJobs(true);
              });
            }
          } else {
            paginationEl.innerHTML = '';
          }
        }
      } catch (err) {
        if (showLoading) {
          var errorMsg = err.message || err.toString();
          feed.innerHTML = errorStateHtml('Failed to load verified jobs. Error: ' + escapeHtml(errorMsg), 'btn-retry-vjp');
          var retryBtn = document.getElementById('btn-retry-vjp');
          if (retryBtn) {
            retryBtn.addEventListener('click', function () {
              fetchJobs(true);
            });
          }
        }
      } finally {
        isFetching = false;
      }
    };

    // Bind Search Input & Autocomplete Suggestions
    var searchTimeout = null;
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        var query = e.target.value.trim();
        clearTimeout(searchTimeout);

        if (suggestionsEl && query.length >= 2) {
          apiClient.getSearchSuggestions(query, 6).then(function (suggestions) {
            if (suggestions && suggestions.length > 0) {
              var suggHtml = suggestions.map(function (s) {
                var badgeHtml = s.badge ? '<span class="vjp__sugg-badge">' + escapeHtml(s.badge) + '</span>' : '';
                return '<div class="vjp__sugg-item" data-query="' + escapeHtml(s.text) + '">' +
                  '<span class="vjp__sugg-icon">🔍</span>' +
                  '<span class="vjp__sugg-text">' + escapeHtml(s.text) + '</span>' +
                  badgeHtml +
                '</div>';
              }).join('');

              suggestionsEl.innerHTML = suggHtml;
              suggestionsEl.style.display = 'block';

              // Bind click on suggestion items
              var items = suggestionsEl.querySelectorAll('.vjp__sugg-item');
              items.forEach(function (item) {
                item.addEventListener('click', function () {
                  var qVal = item.getAttribute('data-query');
                  searchInput.value = qVal;
                  suggestionsEl.style.display = 'none';
                  state.q = qVal;
                  state.page = 1;
                  fetchJobs(true);
                });
              });
            } else {
              suggestionsEl.style.display = 'none';
            }
          }).catch(function () {
            suggestionsEl.style.display = 'none';
          });
        } else if (suggestionsEl) {
          suggestionsEl.style.display = 'none';
        }

        searchTimeout = setTimeout(function () {
          state.q = query;
          state.page = 1;
          fetchJobs(true);
        }, 300);
      });

      // Hide suggestions on outside click
      document.addEventListener('click', function (e) {
        if (suggestionsEl && !searchInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
          suggestionsEl.style.display = 'none';
        }
      });
    }

    if (roleSelect) {
      roleSelect.addEventListener('change', function () {
        state.roleFilter = this.value;
        state.page = 1;
        fetchJobs(true);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', function (e) {
        state.sort = e.target.value;
        state.page = 1;
        fetchJobs(true);
      });
    }

    if (workplaceSelect) {
      workplaceSelect.addEventListener('change', function (e) {
        state.workplace = e.target.value;
        state.page = 1;
        fetchJobs(true);
      });
    }

    if (freshnessSelect) {
      freshnessSelect.addEventListener('change', function (e) {
        state.freshness = e.target.value;
        state.page = 1;
        fetchJobs(true);
      });
    }

    var todayBtn = document.getElementById('btn-today-filter');
    if (todayBtn) {
      todayBtn.addEventListener('click', function () {
        state.isToday = !state.isToday;
        if (state.isToday) {
          todayBtn.classList.add('kn-btn--primary');
          todayBtn.classList.remove('kn-btn--secondary');
        } else {
          todayBtn.classList.remove('kn-btn--primary');
          todayBtn.classList.add('kn-btn--secondary');
        }
        state.page = 1;
        fetchJobs(true);
      });
    }

    await fetchJobs(true);

    // Visibility-aware polling
    stopPolling();
    activePollTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      if (!document.getElementById('vjp-feed')) {
        stopPolling();
        return;
      }
      fetchJobs(false);
    }, 60000);
  }, 10);

  return container.innerHTML;
}

function renderPreferences() {
  return '<div id="preferences-root" class="app-preferences-container"></div>';
}

function notificationStatusBadge(status) {
  switch (status) {
    case 'SENT':
      return '<span class="notif-badge notif-badge--sent">✓ Sent</span>';
    case 'PROCESSING':
      return '<span class="notif-badge notif-badge--processing">⏳ In Progress</span>';
    case 'PENDING':
      return '<span class="notif-badge notif-badge--pending">⏳ Queued</span>';
    case 'FAILED':
      return '<span class="notif-badge notif-badge--failed">⚠️ Delivery Failed</span>';
    case 'FAILED_PERMANENT':
      return '<span class="notif-badge notif-badge--permanent">❌ Undeliverable</span>';
    default:
      return '<span class="notif-badge">' + escapeHtml(status) + '</span>';
  }
}

function notificationCardHtml(item) {
  var job = item.job;
  var isUnread = !item.isRead;
  var unreadClass = isUnread ? ' notif-card--unread' : '';
  var statusBadge = notificationStatusBadge(item.deliveryStatus);
  var timeAgo = formatDetectedDate(item.sentAt || item.createdAt);

  var jobTitle = job ? escapeHtml(job.title) : 'Verified Job Alert';
  var company = job ? escapeHtml(job.companyName) : 'Verified Company';
  var location = job && job.location ? escapeHtml(job.location) : '';
  var jobId = job && job.externalJobId ? escapeHtml(job.externalJobId) : '';
  var officialUrl = job && job.officialUrl ? escapeHtml(job.officialUrl) : '#';

  var retryBtn = (item.deliveryStatus === 'FAILED' || item.deliveryStatus === 'FAILED_PERMANENT')
    ? '<button type="button" class="kn-btn kn-btn--secondary notif-card__retry-btn" data-retry-id="' + item.id + '">🔄 Retry Delivery</button>'
    : '';

  var markReadBtn = isUnread
    ? '<button type="button" class="notif-card__mark-read" data-read-id="' + item.id + '" title="Mark as read">✓ Mark Read</button>'
    : '';

  return (
    '<article class="notif-card' + unreadClass + '" id="notif-' + item.id + '">' +
    '<div class="notif-card__header">' +
    '<div class="notif-card__header-left">' +
    (isUnread ? '<span class="notif-card__unread-dot" title="Unread"></span>' : '') +
    '<span class="notif-card__type">' + (item.notificationType === 'DAILY_DIGEST' ? '📋 Daily Digest' : '🔔 Instant Alert') + '</span>' +
    '<span class="notif-card__time">' + timeAgo + '</span>' +
    '</div>' +
    '<div class="notif-card__header-right">' +
    statusBadge +
    markReadBtn +
    '</div>' +
    '</div>' +
    '<div class="notif-card__body">' +
    '<div class="notif-card__company">' + company + ' <span class="notif-card__verified">✓ Verified Official</span></div>' +
    '<h3 class="notif-card__title">' + jobTitle + '</h3>' +
    (location ? '<div class="notif-card__meta">📍 ' + location + (jobId ? ' · Job ID: ' + jobId : '') + '</div>' : '') +
    (item.failureReason ? '<div class="notif-card__error-box">⚠️ ' + escapeHtml(item.failureReason) + '</div>' : '') +
    '</div>' +
    '<div class="notif-card__footer">' +
    '<div class="notif-card__footer-left">' +
    retryBtn +
    '</div>' +
    (job ? '<a href="' + officialUrl + '" target="_blank" rel="noopener noreferrer" class="kn-btn kn-btn--primary notif-card__link">View Official Job →</a>' : '') +
    '</div>' +
    '</article>'
  );
}

function renderAlerts() {
  var container = document.createElement('div');
  container.innerHTML = (
    '<div class="app-alerts">' +
    '<div class="alerts-header">' +
    '<div>' +
    '<h1 class="kn-heading-1 kn-mb-1">Alerts & Notifications</h1>' +
    '<p class="alerts-subtitle">Real-time delivery history of verified job matches sent to your email.</p>' +
    '</div>' +
    '<div class="alerts-header-actions">' +
    '<button type="button" id="btn-mark-all-read" class="kn-btn kn-btn--secondary">Mark All Read</button>' +
    '<a href="#/preferences" class="kn-btn kn-btn--secondary">⚙️ Alert Settings</a>' +
    '</div>' +
    '</div>' +
    '<div id="alerts-feed">' + loadingHtml('Loading notification history...') + '</div>' +
    '</div>'
  );

  setTimeout(async function () {
    var feed = document.getElementById('alerts-feed');
    if (!feed) return;

    var isFetching = false;
    var fetchAlerts = async function (showLoading) {
      if (isFetching) return;
      isFetching = true;
      try {
        if (showLoading) {
          feed.innerHTML = loadingHtml('Loading notification history...');
        }
        var data = await apiClient.getNotifications(1, 30);
        var notifs = data.notifications || [];

        if (notifs.length === 0) {
          feed.innerHTML = emptyStateHtml(
            '🔔',
            'No Alerts Dispatched Yet',
            'When new verified jobs matching your target roles and locations are detected, automatic email alerts will appear here.',
            '<a href="#/preferences" class="kn-btn kn-btn--secondary">Configure Alert Preferences</a>'
          );
          return;
        }

        var cardsHtml = notifs.map(function (n) { return notificationCardHtml(n); }).join('');
        var summaryInfo = data.total
          ? '<p class="alerts-total-info">Showing ' + notifs.length + ' of ' + data.total + ' alert notification' + (data.total !== 1 ? 's' : '') + '</p>'
          : '';
        feed.innerHTML = summaryInfo + cardsHtml;

        // Bind Mark Read buttons
        feed.querySelectorAll('[data-read-id]').forEach(function (btn) {
          btn.addEventListener('click', async function (e) {
            e.preventDefault();
            var notifId = btn.getAttribute('data-read-id');
            try {
              await apiClient.markNotificationRead(notifId);
              var card = document.getElementById('notif-' + notifId);
              if (card) {
                card.classList.remove('notif-card--unread');
                var dot = card.querySelector('.notif-card__unread-dot');
                if (dot) dot.remove();
                btn.remove();
              }
            } catch (err) {
              showToast('Failed to mark notification as read', 'error');
            }
          });
        });

        // Bind Retry buttons
        feed.querySelectorAll('[data-retry-id]').forEach(function (btn) {
          btn.addEventListener('click', async function (e) {
            e.preventDefault();
            var notifId = btn.getAttribute('data-retry-id');
            btn.disabled = true;
            btn.textContent = 'Queuing...';
            try {
              await apiClient.retryNotification(notifId);
              showToast('Notification queued for retry', 'success');
              setTimeout(function () { fetchAlerts(false); }, 1000);
            } catch (err) {
              btn.disabled = false;
              btn.textContent = '🔄 Retry Delivery';
              showToast('Failed to retry notification', 'error');
            }
          });
        });
      } catch (err) {
        if (showLoading) {
          feed.innerHTML = errorStateHtml('Failed to load alert history.', 'btn-retry-alerts');
          var retryBtn = document.getElementById('btn-retry-alerts');
          if (retryBtn) {
            retryBtn.addEventListener('click', function () {
              fetchAlerts(true);
            });
          }
        }
      } finally {
        isFetching = false;
      }
    };

    // Bind Mark All Read
    var markAllBtn = document.getElementById('btn-mark-all-read');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async function () {
        try {
          await apiClient.markAllNotificationsRead();
          showToast('All notifications marked as read', 'success');
          fetchAlerts(false);
        } catch (err) {
          showToast('Failed to mark all as read', 'error');
        }
      });
    }

    await fetchAlerts(true);

    // Visibility-aware background polling (60s)
    stopPolling();
    activePollTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      if (!document.getElementById('alerts-feed')) {
        stopPolling();
        return;
      }
      fetchAlerts(false);
    }, 60000);
  }, 10);

  return container.innerHTML;
}

function renderVerifyEmailPage() {
  var hash = window.location.hash || '';
  var queryString = hash.indexOf('?') !== -1 ? hash.slice(hash.indexOf('?') + 1) : '';
  var params = new URLSearchParams(queryString);
  var token = params.get('token');
  var status = params.get('status');
  var errorMsg = params.get('error');

  return (
    '<div class="app-auth">' +
    '<div class="app-auth__box" id="verify-email-box">' +
    '<div id="verify-email-content">' +
    (token
      ? '<div class="state-container"><div class="state-icon">⏳</div><h2 class="kn-heading-2">Verifying Your Email...</h2><p class="state-message">Please wait while we confirm your email ownership.</p></div>'
      : status === 'success'
      ? '<div class="state-container"><div class="state-icon" style="color: #059669;">✓</div><h2 class="kn-heading-2">Email Verified Successfully!</h2><p class="state-message">Your email has been verified. You will now receive verified job alerts matching your preferences.</p><a href="#/dashboard" class="kn-btn kn-btn--primary kn-mt-3">Go to Dashboard →</a></div>'
      : '<div class="state-container"><div class="state-icon" style="color: #dc2626;">⚠️</div><h2 class="kn-heading-2">Verification Failed</h2><p class="state-message">' + escapeHtml(errorMsg || 'Invalid or missing verification token.') + '</p><div class="kn-mt-3"><button type="button" id="btn-resend-from-verify" class="kn-btn kn-btn--secondary">Resend Verification Email</button></div></div>'
    ) +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function bindVerifyEmailEvents() {
  var hash = window.location.hash || '';
  var queryString = hash.indexOf('?') !== -1 ? hash.slice(hash.indexOf('?') + 1) : '';
  var params = new URLSearchParams(queryString);
  var token = params.get('token');

  var contentEl = document.getElementById('verify-email-content');

  if (token && contentEl) {
    setTimeout(async function () {
      try {
        await apiClient.verifyEmail(token);
        contentEl.innerHTML = (
          '<div class="state-container">' +
          '<div class="state-icon" style="color: #059669;">✓</div>' +
          '<h2 class="kn-heading-2">Email Verified Successfully!</h2>' +
          '<p class="state-message">Your email address has been verified. Real-time alerts for verified job openings are now active.</p>' +
          '<div class="kn-mt-3" style="display: flex; gap: 10px; justify-content: center;">' +
          '<a href="#/dashboard" class="kn-btn kn-btn--primary">Go to Dashboard →</a>' +
          '<a href="#/preferences" class="kn-btn kn-btn--secondary">Alert Settings</a>' +
          '</div>' +
          '</div>'
        );
        showToast('Email verified successfully!', 'success');
      } catch (err) {
        contentEl.innerHTML = (
          '<div class="state-container">' +
          '<div class="state-icon" style="color: #dc2626;">⚠️</div>' +
          '<h2 class="kn-heading-2">Verification Failed</h2>' +
          '<p class="state-message">' + escapeHtml(err.message || 'Verification link expired or invalid.') + '</p>' +
          '<div class="kn-mt-3" style="display: flex; gap: 10px; justify-content: center;">' +
          '<button type="button" id="btn-resend-from-verify" class="kn-btn kn-btn--secondary">Resend Verification Email</button>' +
          '<a href="#/dashboard" class="kn-btn kn-btn--secondary">Dashboard</a>' +
          '</div>' +
          '</div>'
        );
        bindResendTrigger('btn-resend-from-verify');
      }
    }, 300);
  }

  bindResendTrigger('btn-resend-from-verify');
}

function bindResendTrigger(elementId) {
  var btn = document.getElementById(elementId);
  if (!btn) return;

  btn.addEventListener('click', async function (e) {
    e.preventDefault();
    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = 'Sending...';

    var user = apiClient.getUser();
    var email = user ? user.email : prompt('Enter your email address:');

    if (!email) {
      btn.disabled = false;
      btn.textContent = origText;
      return;
    }

    try {
      var res = await apiClient.resendVerification(email);
      showToast(res.message || 'Verification email sent!', 'success');
      btn.textContent = '✓ Sent!';
      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = origText;
      }, 5000);
    } catch (err) {
      showToast(err.message || 'Failed to resend verification email', 'error');
      btn.disabled = false;
      btn.textContent = origText;
    }
  });
}

function renderAccount() {
  var user = apiClient.getUser();
  var name = user && user.name ? escapeHtml(user.name) : 'User';
  var email = user && user.email ? escapeHtml(user.email) : '';
  var isVerified = user && user.emailVerified;

  var verificationBadge = isVerified
    ? '<span class="notif-badge notif-badge--sent" style="margin-left: 8px;">✓ Verified</span>'
    : '<span class="notif-badge notif-badge--failed" style="margin-left: 8px;">⚠️ Unverified</span> <button type="button" id="btn-account-resend" class="kn-btn kn-btn--secondary notif-card__retry-btn" style="margin-left: 8px;">Resend Verification Email</button>';

  return (
    '<div class="app-account">' +
    '<h1 class="kn-heading-1 kn-mb-3">Account</h1>' +
    '<div class="kn-card kn-p-4 kn-mb-3 app-account__profile">' +
    '<h2 class="kn-heading-3 kn-mb-2">Profile & Verification</h2>' +
    '<div class="app-account__field">' +
    '<span class="app-account__label">Name</span>' +
    '<span class="app-account__value">' + name + '</span>' +
    '</div>' +
    (email ? '<div class="app-account__field">' +
    '<span class="app-account__label">Email</span>' +
    '<span class="app-account__value">' + email + ' ' + verificationBadge + '</span>' +
    '</div>' : '') +
    '</div>' +
    '<div class="kn-card kn-p-4 kn-mb-3">' +
    '<h2 class="kn-heading-3 kn-mb-2">Job Preferences</h2>' +
    '<p class="kn-mb-3">Manage your target roles, locations, and company preferences to keep your job feed accurate.</p>' +
    '<a href="#/preferences" class="kn-btn kn-btn--secondary">✏️ Edit Preferences</a>' +
    '</div>' +
    '<div class="kn-card kn-p-4 app-account__logout-section">' +
    '<h2 class="kn-heading-3 kn-mb-2">Session</h2>' +
    '<p class="kn-mb-3">Sign out of your RoleRadar account on this device.</p>' +
    '<button type="button" id="btn-logout" class="kn-btn kn-btn--secondary app-account__logout-btn">Sign Out</button>' +
    '</div>' +
    '</div>'
  );
}

function renderCandidateProfilePage() {
  var container = document.createElement('div');
  container.innerHTML = (
    '<div class="app-profile-view">' +
      '<div class="cpp__header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">' +
        '<div>' +
          '<h1 class="kn-heading-1">Candidate Profile & Resumes</h1>' +
          '<p class="kn-text-muted" style="margin-top:4px;">Structured career intelligence extracted from your verified resumes and credentials.</p>' +
        '</div>' +
        '<button type="button" id="btn-refresh-profile" class="kn-btn kn-btn--secondary">🔄 Refresh</button>' +
      '</div>' +
      '<div id="profile-content-slot">' + loadingHtml('Loading candidate profile...') + '</div>' +
    '</div>'
  );

  setTimeout(async function () {
    var slot = document.getElementById('profile-content-slot');
    var refreshBtn = document.getElementById('btn-refresh-profile');
    if (!slot) return;

    var loadProfileData = async function () {
      try {
        slot.innerHTML = loadingHtml('Loading candidate profile and resumes...');
        var profile = await apiClient.getCandidateProfile();
        var resumes = await apiClient.listResumes();
        var completeness = await apiClient.getProfileCompleteness();

        var score = completeness ? completeness.score : (profile ? profile.completenessScore : 0);
        var tips = completeness && completeness.actionableTips ? completeness.actionableTips : [];

        var tipsHtml = tips.length > 0
          ? '<ul class="profile-tips-list">' + tips.map(function (t) { return '<li>⚡ ' + escapeHtml(t) + '</li>'; }).join('') + '</ul>'
          : '<p class="kn-text-muted" style="color:var(--color-success,#10b981);">✓ Your candidate profile is 100% complete and fully optimized for discovery!</p>';

        var resumesListHtml = resumes.length > 0
          ? resumes.map(function (r) {
              var sizeKb = Math.round(r.fileSize / 1024);
              var dateStr = new Date(r.createdAt).toLocaleDateString();
              var activeBadge = r.isActive
                ? '<span class="resume-badge resume-badge--active">✓ Active</span>'
                : '<button type="button" class="kn-btn kn-btn--secondary btn-activate-resume" data-resume-id="' + r.id + '" style="font-size:0.75rem; padding:2px 8px;">Make Active</button>';

              return (
                '<div class="resume-item-card">' +
                  '<div class="resume-item-info">' +
                    '<span class="resume-item-icon">📄</span>' +
                    '<div>' +
                      '<strong class="resume-item-name">' + escapeHtml(r.filename) + '</strong>' +
                      '<div class="resume-item-meta">' + sizeKb + ' KB · Uploaded ' + dateStr + '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="resume-item-actions">' +
                    activeBadge +
                    '<button type="button" class="kn-btn kn-btn--secondary btn-delete-resume" data-resume-id="' + r.id + '" style="font-size:0.75rem; padding:2px 8px; color:var(--color-danger,#ef4444); margin-left:6px;">Delete</button>' +
                  '</div>' +
                '</div>'
              );
            }).join('')
          : '<p class="kn-text-muted">No resumes uploaded yet. Upload a PDF, DOCX, or TXT resume to auto-populate your skills.</p>';

        var skillsHtml = profile && profile.skills && profile.skills.length > 0
          ? profile.skills.map(function (s) {
              return '<span class="profile-skill-chip">' + escapeHtml(s.canonicalName) + '<span class="profile-skill-cat">' + escapeHtml(s.category || 'Tech') + '</span></span>';
            }).join('')
          : '<p class="kn-text-muted">No skills parsed yet. Upload your resume or add target skills.</p>';

        var eduHtml = profile && profile.educations && profile.educations.length > 0
          ? profile.educations.map(function (e) {
              var years = e.startYear && e.endYear ? e.startYear + ' - ' + e.endYear : (e.endYear || '');
              return (
                '<div class="profile-history-item">' +
                  '<strong>' + escapeHtml(e.degree) + (e.fieldOfStudy ? ' in ' + escapeHtml(e.fieldOfStudy) : '') + '</strong>' +
                  '<div>' + escapeHtml(e.institution) + (years ? ' · ' + years : '') + '</div>' +
                '</div>'
              );
            }).join('')
          : '<p class="kn-text-muted">No education history recorded.</p>';

        var projHtml = profile && profile.projects && profile.projects.length > 0
          ? profile.projects.map(function (p) {
              var techChips = p.technologies && p.technologies.length > 0
                ? '<div class="profile-proj-techs">' + p.technologies.map(function (t) { return '<span class="profile-tech-mini">' + escapeHtml(t) + '</span>'; }).join('') + '</div>'
                : '';
              return (
                '<div class="profile-history-item">' +
                  '<strong>' + escapeHtml(p.title) + '</strong>' +
                  (p.description ? '<p class="kn-text-muted" style="margin:4px 0;">' + escapeHtml(p.description) + '</p>' : '') +
                  techChips +
                '</div>'
              );
            }).join('')
          : '<p class="kn-text-muted">No projects recorded yet.</p>';

        var expHtml = profile && profile.experiences && profile.experiences.length > 0
          ? profile.experiences.map(function (exp) {
              return (
                '<div class="profile-history-item">' +
                  '<strong>' + escapeHtml(exp.title) + ' at ' + escapeHtml(exp.companyName) + ' ' + (exp.isInternship ? '<span class="resume-badge">Internship</span>' : '') + '</strong>' +
                  (exp.description ? '<p class="kn-text-muted" style="margin:4px 0;">' + escapeHtml(exp.description) + '</p>' : '') +
                '</div>'
              );
            }).join('')
          : '<p class="kn-text-muted">No experience or internships recorded.</p>';

        slot.innerHTML = (
          '<div class="profile-grid">' +
            '<!-- Column 1: Identity & Completeness -->' +
            '<div class="profile-col-left">' +
              '<div class="kn-card profile-card">' +
                '<div class="profile-identity">' +
                  '<div class="profile-avatar">👤</div>' +
                  '<div>' +
                    '<h2 class="profile-name">' + escapeHtml(profile && profile.fullName ? profile.fullName : 'Candidate Profile') + '</h2>' +
                    '<p class="profile-headline">' + escapeHtml(profile && profile.headline ? profile.headline : 'Job Seeker') + '</p>' +
                    '<span class="profile-tier-badge">🎓 ' + escapeHtml(profile && profile.experienceLevel ? profile.experienceLevel : 'FRESHER') + '</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<div class="kn-card profile-card">' +
                '<div class="profile-completeness-header">' +
                  '<h3 style="font-size:1.1rem; font-weight:600;">Profile Completeness</h3>' +
                  '<span class="profile-score-num">' + score + '%</span>' +
                '</div>' +
                '<div class="profile-progress-bar-bg">' +
                  '<div class="profile-progress-bar-fill" style="width:' + score + '%;"></div>' +
                '</div>' +
                '<div class="profile-tips-container">' +
                  '<h4 style="font-size:0.85rem; font-weight:600; margin-bottom:6px;">Optimization Suggestions:</h4>' +
                  tipsHtml +
                '</div>' +
              '</div>' +

              '<div class="kn-card profile-card">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:8px;">Manage Resumes</h3>' +
                '<p class="kn-text-muted" style="font-size:0.85rem; margin-bottom:12px;">Upload a resume file to automatically extract your skills, education, and experience.</p>' +
                '<div class="resume-upload-zone" id="resume-drop-zone">' +
                  '<input type="file" id="resume-file-input" accept=".pdf,.docx,.txt" style="display:none;" />' +
                  '<button type="button" id="btn-browse-resume" class="kn-btn kn-btn--primary" style="width:100%;">📤 Upload Resume (.pdf, .docx, .txt)</button>' +
                  '<p class="kn-text-muted" style="font-size:0.75rem; margin-top:6px; text-align:center;">Max size: 5MB · Private & securely stored</p>' +
                '</div>' +
                '<div class="resume-list-container kn-mt-3">' +
                  resumesListHtml +
                '</div>' +
              '</div>' +
            '</div>' +

            '<!-- Column 2: Extracted Structured Data -->' +
            '<div class="profile-col-right">' +
              '<div class="kn-card profile-card">' +
                '<div class="profile-section-header">' +
                  '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">⚡ Extracted Skills (' + (profile && profile.skills ? profile.skills.length : 0) + ')</h3>' +
                '</div>' +
                '<div class="profile-skills-wrap">' +
                  skillsHtml +
                '</div>' +
              '</div>' +

              '<div class="kn-card profile-card">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">🎓 Education</h3>' +
                '<div class="profile-section-content">' +
                  eduHtml +
                '</div>' +
              '</div>' +

              '<div class="kn-card profile-card">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">💼 Experience & Internships</h3>' +
                '<div class="profile-section-content">' +
                  expHtml +
                '</div>' +
              '</div>' +

              '<div class="kn-card profile-card">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">🚀 Projects & Portfolio</h3>' +
                '<div class="profile-section-content">' +
                  projHtml +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>'
        );

        // Bind Upload button
        var browseBtn = document.getElementById('btn-browse-resume');
        var fileInput = document.getElementById('resume-file-input');
        if (browseBtn && fileInput) {
          browseBtn.addEventListener('click', function () { fileInput.click(); });
          fileInput.addEventListener('change', async function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;

            browseBtn.disabled = true;
            browseBtn.textContent = '⏳ Parsing Resume...';

            var reader = new FileReader();
            reader.onload = async function () {
              try {
                var content = reader.result;
                await apiClient.uploadResume({
                  filename: file.name,
                  content: typeof content === 'string' ? content : '',
                  mimeType: file.type || 'text/plain',
                });
                showToast('Resume uploaded and parsed successfully!', 'success');
                await loadProfileData();
              } catch (err) {
                showToast(err.message || 'Failed to upload resume', 'error');
                browseBtn.disabled = false;
                browseBtn.textContent = '📤 Upload Resume (.pdf, .docx, .txt)';
              }
            };
            reader.readAsText(file);
          });
        }

        // Bind Activate buttons
        slot.querySelectorAll('.btn-activate-resume').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var rId = btn.getAttribute('data-resume-id');
            if (!rId) return;
            btn.disabled = true;
            try {
              await apiClient.activateResume(rId);
              showToast('Active resume updated', 'success');
              await loadProfileData();
            } catch (err) {
              showToast(err.message || 'Failed to activate resume', 'error');
              btn.disabled = false;
            }
          });
        });

        // Bind Delete buttons
        slot.querySelectorAll('.btn-delete-resume').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var rId = btn.getAttribute('data-resume-id');
            if (!rId) return;
            if (!confirm('Are you sure you want to delete this resume?')) return;
            btn.disabled = true;
            try {
              await apiClient.deleteResume(rId);
              showToast('Resume deleted', 'success');
              await loadProfileData();
            } catch (err) {
              showToast(err.message || 'Failed to delete resume', 'error');
              btn.disabled = false;
            }
          });
        });
      } catch (err) {
        slot.innerHTML = '<div class="kn-card kn-p-4"><p class="kn-text-danger">Failed to load candidate profile: ' + escapeHtml(err.message) + '</p></div>';
      }
    };

    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadProfileData);
    }

    await loadProfileData();
  });

  return container.innerHTML;
}

function renderResumeBuilder() {
  return '<div id="resume-builder-root" style="min-height: 80vh;"></div>';
}

function renderPlacementPrep() {
  return '<div id="prep-root" style="min-height: 80vh;"></div>';
}

function renderAdminConsole() {
  return '<div id="admin-console-root" style="min-height: 80vh;"></div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard layout (sidebar + content)
// ─────────────────────────────────────────────────────────────────────────────

function renderSidebar(currentPath) {
  var primaryLinks = [
    { path: 'dashboard', label: 'Home', icon: '⊞' },
    { path: 'dashboard/verified-jobs', label: 'Verified Jobs', icon: '✓' },
    { path: 'dashboard/saved', label: 'Saved Jobs', icon: '♥' },
    { path: 'dashboard/applications', label: 'Applications', icon: '📋' },
    { path: 'dashboard/dismissed', label: 'Hidden Jobs', icon: '👁️' },
    { path: 'dashboard/profile', label: 'Candidate Profile', icon: '👤' },
    { path: 'dashboard/resume', label: 'Resume Builder', icon: '📄' },
    { path: 'dashboard/prep', label: 'Placement Prep', icon: '🎯' },
    { path: 'preferences', label: 'Preferences', icon: '⚙' },
    { path: 'dashboard/alerts', label: 'Alerts', icon: '🔔' },
  ];

  var accountLinks = [
    { path: 'dashboard/account', label: 'Account', icon: '👤' },
  ];

  var adminLinks = [];
  var userJson = localStorage.getItem('roleradar_auth_user');
  if (userJson) {
    try {
      var user = JSON.parse(userJson);
      if (user.isAdmin || user.is_admin) {
        adminLinks.push({ path: 'admin', label: 'Admin Console', icon: '⚡' });
      }
    } catch (e) {}
  }

  function linkHtml(link) {
    var isActive = (currentPath === link.path) || (link.path !== 'dashboard' && currentPath.indexOf(link.path) === 0);
    var activeClass = isActive ? ' app-sidebar__link--active' : '';
    return (
      '<a href="#/' + link.path + '" class="app-sidebar__link' + activeClass + '" aria-current="' + (isActive ? 'page' : 'false') + '">' +
      '<span class="app-sidebar__icon" aria-hidden="true">' + link.icon + '</span>' +
      link.label +
      '</a>'
    );
  }

  var adminSection = adminLinks.length > 0 
    ? '<div class="app-sidebar__section-label">Admin</div><nav class="app-sidebar__nav">' + adminLinks.map(linkHtml).join('') + '</nav>'
    : '';

  return (
    '<aside class="app-sidebar" role="navigation" aria-label="Sidebar navigation">' +
    '<div class="app-sidebar__brand">RoleRadar</div>' +
    '<nav class="app-sidebar__nav kn-mt-3">' +
    primaryLinks.map(linkHtml).join('') +
    '</nav>' +
    adminSection +
    '<div class="app-sidebar__section-label">Account</div>' +
    '<nav class="app-sidebar__nav">' +
    accountLinks.map(linkHtml).join('') +
    '<button type="button" class="app-sidebar__link app-sidebar__logout-btn" id="btn-sidebar-logout">' +
    '<span class="app-sidebar__icon" aria-hidden="true">↩</span>Sign Out' +
    '</button>' +
    '</nav>' +
    '</aside>'
  );
}

function renderDashboardLayout(currentPath) {
  var routeName = getRouteName(currentPath);
  var contentHtml = '';

  if (routeName === 'verified-jobs') {
    contentHtml = renderVerifiedJobsPage();
  } else if (routeName === 'saved') {
    contentHtml = renderSavedJobsPage();
  } else if (routeName === 'applications') {
    contentHtml = renderApplicationsPage();
  } else if (routeName === 'dismissed') {
    contentHtml = renderDismissedJobsPage();
  } else if (routeName === 'alerts') {
    contentHtml = renderAlerts();
  } else if (routeName === 'account') {
    contentHtml = renderAccount();
  } else if (routeName === 'profile') {
    contentHtml = renderCandidateProfilePage();
  } else if (routeName === 'resume') {
    contentHtml = renderResumeBuilder();
  } else if (routeName === 'prep') {
    contentHtml = renderPlacementPrep();
  } else if (routeName === 'admin') {
    contentHtml = renderAdminConsole();
  } else {
    contentHtml = renderDashboardHome();
  }

  return (
    '<div class="app-dashboard-layout">' +
    renderSidebar(currentPath) +
    '<div class="app-dashboard-main">' +
    contentHtml +
    '</div>' +
    '</div>'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main render function
// ─────────────────────────────────────────────────────────────────────────────

function render() {
  stopPolling();
  var path = getRoute();
  var name = getRouteName(path);

  // Auth guard
  if (requiresAuth(name) && !isAuthenticated()) {
    window.location.hash = '#/login';
    return;
  }

  // If authenticated user hits login/register/landing → dashboard
  if (isAuthenticated() && (name === 'login' || name === 'register' || name === 'landing')) {
    window.location.hash = '#/dashboard';
    return;
  }

  var container = document.getElementById('app-page');
  var main = document.getElementById('app-main');
  if (!container || !main) return;

  // Dashboard layout gets full-width
  if (
    name === 'dashboard' ||
    name === 'verified-jobs' ||
    name === 'saved' ||
    name === 'applications' ||
    name === 'dismissed' ||
    name === 'alerts' ||
    name === 'account' ||
    name === 'profile' ||
    name === 'resume' ||
    name === 'prep' ||
    name === 'admin'
  ) {
    main.classList.add('app-main--dashboard');
    container.style.maxWidth = '';
    container.style.padding = '0';
  } else {
    main.classList.remove('app-main--dashboard');
    container.style.maxWidth = '';
    container.style.padding = '';
  }

  container.dataset.route = path;
  container.className = 'app-page app-page--' + name;

  switch (name) {
    case 'landing':
      container.innerHTML = renderLanding();
      break;
    case 'login':
      container.innerHTML = renderLogin();
      bindLoginForm();
      break;
    case 'register':
      container.innerHTML = renderRegister();
      bindRegisterForm();
      break;
    case 'preferences':
    case 'onboarding':
      container.innerHTML = renderPreferences();
      bindPreferencesView(name === 'onboarding' ? false : true);
      break;
    case 'verify-email':
      container.innerHTML = renderVerifyEmailPage();
      bindVerifyEmailEvents();
      break;
    case 'saved':
    case 'applications':
    case 'dismissed':
    case 'alerts':
    case 'account':
    case 'profile':
    case 'verified-jobs':
    case 'dashboard':
      container.innerHTML = renderDashboardLayout(path);
      bindDashboardEvents();
      break;
    case 'resume':
      container.innerHTML = renderDashboardLayout(path);
      bindDashboardEvents();
      import('../dashboard/resume/main-resume').then(function (m) {
        if (m.mountResumeBuilder) m.mountResumeBuilder();
      }).catch(function (e) { console.error('Failed to load resume builder', e); });
      break;
    case 'prep':
      container.innerHTML = renderDashboardLayout(path);
      bindDashboardEvents();
      import('../dashboard/prep/main-prep').then(function (m) {
        if (m.mountPrep) m.mountPrep();
      }).catch(function (e) { console.error('Failed to load placement prep', e); });
      break;
    case 'admin':
      container.innerHTML = renderDashboardLayout(path);
      bindDashboardEvents();
      import('../dashboard/admin/main-admin').then(function (m) {
        if (m.mountAdminConsole) m.mountAdminConsole();
      }).catch(function (e) { console.error('Failed to load admin console', e); });
      break;
    default:
      container.innerHTML = renderLanding();
  }

  updateNavVisibility();
  updateNavActiveState(path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Event binders
// ─────────────────────────────────────────────────────────────────────────────

function bindLoginForm() {
  var form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var errorEl = document.getElementById('auth-error');
    var submitBtn = document.getElementById('btn-login');
    var email = form.querySelector('#login-email').value.trim();
    var password = form.querySelector('#login-password').value;

    if (!email || !password) {
      errorEl.textContent = 'Please enter your email and password.';
      errorEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';
    errorEl.style.display = 'none';

    try {
      await apiClient.login(email, password);
      updateNavVisibility();

      // Check if onboarding needed
      var onboardingDone = localStorage.getItem('roleradar_onboarding_completed');
      if (!onboardingDone) {
        // Try to get prefs from server
        try {
          var prefs = await apiClient.getPreferences();
          if (prefs && (prefs.roles && prefs.roles.length > 0)) {
            localStorage.setItem('roleradar_preferences', JSON.stringify(prefs));
            localStorage.setItem('roleradar_onboarding_completed', 'true');
            window.location.hash = '#/dashboard';
          } else {
            window.location.hash = '#/preferences';
          }
        } catch (e) {
          window.location.hash = '#/preferences';
        }
      } else {
        window.location.hash = '#/dashboard';
      }
    } catch (err) {
      var msg = (err && err.message) ? err.message : 'Login failed. Please check your credentials.';
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
}

function bindRegisterForm() {
  var form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var errorEl = document.getElementById('auth-error');
    var submitBtn = document.getElementById('btn-register');
    var name = form.querySelector('#register-name').value.trim();
    var email = form.querySelector('#register-email').value.trim();
    var password = form.querySelector('#register-password').value;

    if (!name || !email || !password) {
      errorEl.textContent = 'Please fill in all fields.';
      errorEl.style.display = 'block';
      return;
    }
    if (password.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters.';
      errorEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';
    errorEl.style.display = 'none';

    try {
      await apiClient.register(email, password, name);
      updateNavVisibility();
      // New users always go to preferences/onboarding
      window.location.hash = '#/preferences';
    } catch (err) {
      var msg = (err && err.message) ? err.message : 'Registration failed. Please try again.';
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
}

async function bindPreferencesView(isEditing) {
  var root = document.getElementById('preferences-root');
  if (!root) return;

  // Determine if this is truly a first-time setup
  var onboardingDone = localStorage.getItem('roleradar_onboarding_completed');
  var editing = isEditing || !!onboardingDone;

  // Try loading existing prefs from localStorage first
  var existingPrefs = null;
  try {
    var raw = localStorage.getItem('roleradar_preferences');
    if (raw) existingPrefs = JSON.parse(raw);
  } catch (e) {}

  // If editing and user is authenticated, always attempt to fetch fresh preferences from API
  if (editing && isAuthenticated()) {
    try {
      var fetched = await apiClient.getPreferences();
      var cleanFetched = (fetched && fetched.preferences) ? fetched.preferences : fetched;
      if (cleanFetched && (cleanFetched.roles || cleanFetched.canonicalRoles)) {
        existingPrefs = cleanFetched;
        localStorage.setItem('roleradar_preferences', JSON.stringify(cleanFetched));
      }
    } catch (e) {}
  }

  renderOnboardingView(root, {
    isEditing: editing,
    currentPreferences: existingPrefs,
    onComplete: function (saved) {
      if (saved) {
        localStorage.setItem('roleradar_preferences', JSON.stringify(saved));
      }
      localStorage.setItem('roleradar_onboarding_completed', 'true');
      showToast('Preferences saved!', 'success');
      window.location.hash = '#/dashboard';
    },
    onCancel: function () {
      window.location.hash = '#/dashboard';
    },
  });
}

function bindDashboardEvents() {
  // Logout buttons (sidebar + account page)
  document.addEventListener('click', function handleLogout(e) {
    if (e.target.id === 'btn-logout' || e.target.id === 'btn-sidebar-logout') {
      onLogout();
    }
  }, { once: true });

  // Verification resend buttons (banner & account page)
  bindResendTrigger('btn-banner-resend');
  bindResendTrigger('btn-account-resend');
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation helpers
// ─────────────────────────────────────────────────────────────────────────────

function updateNavActiveState(currentPath) {
  document.querySelectorAll('.app-nav__link[data-route]').forEach(function (link) {
    var route = link.getAttribute('data-route');
    var isActive = route && (currentPath === route || (route !== '' && currentPath.indexOf(route) === 0));
    link.classList.toggle('is-active', !!isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function setupNav() {
  var toggle = document.querySelector('.app-nav__toggle');
  var nav = document.querySelector('.app-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var expanded = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? 'Close menu' : 'Open menu');
    });
  }

  // Close mobile menu when a link is clicked
  document.querySelectorAll('.app-nav__link').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 768px)').matches && nav) {
        nav.classList.remove('is-open');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'Open menu');
        }
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// App init
// ─────────────────────────────────────────────────────────────────────────────

var appInitialized = false;

export function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  updateNavVisibility();
  render();
  window.addEventListener('hashchange', render);
  setupNav();
}

// Auto-init fallback
if (typeof window !== 'undefined' && !window.initApp) {
  window.initApp = initApp;
  if (document.readyState === 'complete') {
    initApp();
  } else {
    window.addEventListener('load', initApp);
  }
}
