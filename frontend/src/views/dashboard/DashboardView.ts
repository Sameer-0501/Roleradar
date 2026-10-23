/**
 * RoleRadar Candidate Dashboard & Matched-Job Feed View.
 *
 * Encapsulates the candidate workspace, matching recommendation feed,
 * personal job tracking actions (save, apply, dismiss), recently viewed listings,
 * and background feed polling with strict lifecycle management.
 */

import {
  jobsService,
  workspaceService,
  preferencesService,
  authService,
  httpClient,
  type Job,
  type UserPreferences,
  type WorkspaceStatsResponse,
} from '../../services/api/index.js';
import { renderDashboardPreferencesSummary } from '../../modules/onboarding/onboarding-ui.js';
import { openJobDetailModal } from '../../components/JobDetailModal.js';
import { showToast as defaultShowToast } from '../../services/ui/toast.js';

export { openJobDetailModal };

export interface DashboardViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
  openJobDetailModal?: (jobId: string, onStateChange?: (action: string, id: string, val: boolean) => void) => void;
}

export interface DashboardViewController {
  destroy: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML & Formatting Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDetectedDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 60) return 'Detected ' + diffMins + ' min' + (diffMins !== 1 ? 's' : '') + ' ago';
    if (diffHours < 24) return 'Detected ' + diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
    if (diffDays === 0) return 'Detected today';
    if (diffDays === 1) return 'Detected yesterday';
    return 'Detected ' + diffDays + ' days ago';
  } catch (e) {
    return '';
  }
}

export function loadingHtml(message: string): string {
  return (
    '<div class="app-state app-state--loading">' +
    '<lemniscate-loader></lemniscate-loader>' +
    '<p class="app-state__message">' + escapeHtml(message || 'Loading...') + '</p>' +
    '</div>'
  );
}

export function emptyStateHtml(icon: string, title: string, subtitle: string, actionHtml = ''): string {
  return (
    '<div class="app-state app-state--empty">' +
    '<div class="app-state__icon" aria-hidden="true">' + (icon || '🔍') + '</div>' +
    '<h3 class="app-state__title">' + escapeHtml(title) + '</h3>' +
    '<p class="app-state__subtitle">' + escapeHtml(subtitle) + '</p>' +
    (actionHtml || '') +
    '</div>'
  );
}

export function errorStateHtml(message: string, retryId?: string): string {
  const retryBtn = retryId
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
// Verified Job Card Renderer
// ─────────────────────────────────────────────────────────────────────────────

export function verifiedJobCardHtml(job: Job, options: { context?: string; showVerifiedToday?: boolean } = {}): string {
  const context = options.context || 'feed';
  const showVerifiedToday = !!options.showVerifiedToday;

  const title = escapeHtml(job.title);
  const company = escapeHtml(job.companyName || job.company || '');
  const location = escapeHtml(job.location || '');
  const displayJobId = escapeHtml(job.externalJobId || job.externalId || job.id || '');
  const rawOfficialUrl = job.officialUrl || job.applyUrl || '#';
  const officialUrl = escapeHtml(rawOfficialUrl);
  const source = escapeHtml(job.sourceSystem || job.atsType || '');
  const detected = formatDetectedDate(job.firstSeenAt || job.detectedAt || job.createdAt || job.postedAt);

  let initialVerifiedLabel = '';
  if (showVerifiedToday && job.initialVerifiedAt) {
    initialVerifiedLabel = '📅 Verified Today';
  }

  const isClosed = (job.status === 'CLOSED');
  const isSaved = job.interaction ? !!job.interaction.isSaved : !!job.isSaved;
  const isApplied = job.interaction ? !!job.interaction.isApplied : !!job.isApplied;
  const notes = job.interaction ? job.interaction.notes : (job.notes || null);
  const savedAtStr = job.interaction && job.interaction.savedAt ? formatDetectedDate(job.interaction.savedAt) : (job.savedAt ? formatDetectedDate(job.savedAt) : '');
  const appliedAtStr = job.interaction && job.interaction.appliedAt ? formatDetectedDate(job.interaction.appliedAt) : (job.appliedAt ? formatDetectedDate(job.appliedAt) : '');

  let workplaceBadge = '';
  if (job.workplaceType && job.workplaceType !== 'UNKNOWN') {
    const wpIcon = job.workplaceType === 'REMOTE' ? '🌐 ' : '🏢 ';
    const wpText = job.workplaceType === 'REMOTE' ? 'Remote' : job.workplaceType === 'HYBRID' ? 'Hybrid' : 'On-site';
    workplaceBadge = '<span class="vjc__workplace-badge">' + wpIcon + wpText + '</span>';
  }

  let expBadge = '';
  if (job.experienceClassification) {
    const isFresher = job.experienceClassification === 'FRESHER_COMPATIBLE' || job.experienceClassification === 'BOTH';
    expBadge = '<span class="vjc__exp-badge ' + (isFresher ? 'vjc__exp-badge--fresher' : 'vjc__exp-badge--exp') + '">' +
      (isFresher ? '🎓 Fresher' : '💼 Experienced') + '</span>';
  }

  let freshnessBadge = '';
  if (job.freshnessState && !isClosed) {
    if (job.freshnessState === 'FRESH') {
      freshnessBadge = '<span class="vjc__freshness-badge vjc__freshness-badge--fresh">🟢 Fresh</span>';
    } else if (job.freshnessState === 'RECENT') {
      freshnessBadge = '<span class="vjc__freshness-badge vjc__freshness-badge--recent">🕐 Recent</span>';
    } else {
      freshnessBadge = '<span class="vjc__freshness-badge vjc__freshness-badge--aging">📅 Active</span>';
    }
  }

  let scoreBadge = '';
  if (job.relevanceScore !== undefined && job.relevanceScore !== null && !isClosed) {
    const scoreClass = job.relevanceScore >= 80 ? 'vjc__score-badge--high' : job.relevanceScore >= 60 ? 'vjc__score-badge--med' : '';
    scoreBadge = '<span class="vjc__score-badge ' + scoreClass + '">🎯 ' + job.relevanceScore + ' pts</span>';
  }

  const statusBadge = isClosed
    ? '<span class="vjc__closed-badge">⚠ Closed</span>'
    : '<span class="vjc__verified-badge">✓ Verified Official</span>';

  let userStateBadges = '';
  if (isApplied) {
    userStateBadges += '<span class="vjc__applied-badge">✓ Applied</span>';
  }
  if (isSaved && context !== 'saved') {
    userStateBadges += '<span class="vjc__saved-badge">♥ Saved</span>';
  }

  let explanationsHtml = '';
  if (job.matchExplanations && job.matchExplanations.length > 0) {
    const chips = job.matchExplanations.map(function (exp) {
      return '<li class="vjc__explanation-item">' + escapeHtml(exp) + '</li>';
    }).join('');
    explanationsHtml = '<ul class="vjc__explanations" aria-label="Why this matches">' + chips + '</ul>';
  } else if (job.matchSummary) {
    explanationsHtml = '<div class="vjc__match-row"><span class="vjc__match-badge">🎯 ' + escapeHtml(job.matchSummary) + '</span></div>';
  }

  const closedWarningHtml = isClosed
    ? '<div class="vjc__closed-warning">⚠ This position is no longer available on the official employer career portal.</div>'
    : '';

  const notesPreviewHtml = (notes && notes.trim().length > 0)
    ? '<div class="vjc__notes-preview"><strong>Private Note:</strong> <span>' + escapeHtml(notes) + '</span></div>'
    : '';

  const applyCta = isClosed
    ? '<button type="button" class="kn-btn kn-btn--secondary" disabled title="Position closed on official portal">Position Closed</button>'
    : '<a href="' + officialUrl + '" target="_blank" rel="noopener noreferrer" class="kn-btn kn-btn--primary vjc__view-btn">View Official Job & Apply →</a>';

  let interactionButtons = '';
  if (context === 'dismissed') {
    interactionButtons = '<button type="button" class="kn-btn kn-btn--secondary" data-job-restore-id="' + escapeHtml(job.id) + '">↩ Restore to Feed</button>';
  } else {
    const saveBtnText = isSaved ? '♥ Saved' : '♡ Save';
    const saveBtnClass = isSaved ? 'vjc__btn-action vjc__btn-action--saved' : 'vjc__btn-action';
    const applyBtnText = isApplied ? '✓ Applied' : 'Mark Applied';
    const applyBtnClass = isApplied ? 'vjc__btn-action vjc__btn-action--applied' : 'vjc__btn-action';

    interactionButtons =
      '<div class="vjc__actions-group">' +
        '<button type="button" class="' + saveBtnClass + '" data-job-save-id="' + escapeHtml(job.id) + '" aria-pressed="' + isSaved + '">' + saveBtnText + '</button>' +
        '<button type="button" class="' + applyBtnClass + '" data-job-apply-id="' + escapeHtml(job.id) + '" aria-pressed="' + isApplied + '">' + applyBtnText + '</button>' +
        '<button type="button" class="vjc__btn-action vjc__btn-action--dismiss" data-job-dismiss-id="' + escapeHtml(job.id) + '" title="Hide job from feed">⋯ Hide</button>' +
      '</div>';
  }

  const cardClass = 'vjc' + (isClosed ? ' vjc--closed' : '');

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

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar Layout Component
// ─────────────────────────────────────────────────────────────────────────────

export function renderSidebar(currentPath: string): string {
  const primaryLinks = [
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

  const accountLinks = [
    { path: 'dashboard/account', label: 'Account', icon: '👤' },
  ];

  const adminLinks: Array<{ path: string; label: string; icon: string }> = [];
  if (typeof localStorage !== 'undefined') {
    const userJson = localStorage.getItem('roleradar_auth_user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        if (user.isAdmin || user.is_admin) {
          adminLinks.push({ path: 'admin', label: 'Admin Console', icon: '⚡' });
        }
      } catch (e) {}
    }
  }

  function linkHtml(link: { path: string; label: string; icon: string }): string {
    const isActive = (currentPath === link.path) || (link.path !== 'dashboard' && currentPath.indexOf(link.path) === 0);
    const activeClass = isActive ? ' app-sidebar__link--active' : '';
    return (
      '<a href="#/' + link.path + '" class="app-sidebar__link' + activeClass + '" aria-current="' + (isActive ? 'page' : 'false') + '">' +
      '<span class="app-sidebar__icon" aria-hidden="true">' + link.icon + '</span>' +
      link.label +
      '</a>'
    );
  }

  const adminSection = adminLinks.length > 0 
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

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Detail Modal Fallback
// ─────────────────────────────────────────────────────────────────────────────

export async function defaultOpenJobDetailModal(
  jobId: string,
  onStateChange?: (action: string, id: string, val: boolean) => void,
  showToast = defaultShowToast
): Promise<void> {
  return openJobDetailModal(jobId, onStateChange as any, { showToast });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main View Mount Function
// ─────────────────────────────────────────────────────────────────────────────

export function mountDashboardView(options: DashboardViewOptions): DashboardViewController {
  const {
    container,
    routePath = 'dashboard',
    showToast = (msg: string) => { console.log(msg); },
    onNavigate = (route: string) => { if (typeof window !== 'undefined') window.location.hash = route; },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
    openJobDetailModal = defaultOpenJobDetailModal,
  } = options;

  let isDestroyed = false;
  let activePollTimer: ReturnType<typeof setInterval> | null = null;
  const boundListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = [];

  function addTrackedListener(target: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(event, handler);
    boundListeners.push({ target, event, handler });
  }

  function stopPolling(): void {
    if (activePollTimer) {
      clearInterval(activePollTimer);
      activePollTimer = null;
    }
  }

  // Determine greeting from logged-in user profile
  let greeting = 'Welcome to your Workspace.';
  const user = httpClient.getUser() as { name?: string } | null;
  if (user && user.name) {
    greeting = 'Welcome back, ' + escapeHtml(user.name.split(' ')[0]) + '.';
  }

  const skeletonStatsHtml = (
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

  const skeletonFeedHtml = (
    '<div style="min-height: 280px;" aria-busy="true">' +
      loadingHtml('Finding verified jobs matching your profile...') +
    '</div>'
  );

  // Render initial synchronous dashboard layout with sidebar and loading placeholders
  container.innerHTML = (
    '<div class="app-dashboard-layout" id="dashboard-view-root">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
        '<div class="app-dashboard-home">' +
          '<div class="dashboard-greeting">' +
            '<h1 class="kn-heading-1">' + greeting + '</h1>' +
            '<p class="dashboard-tagline">Your personal job-seeker workspace — track, save, and manage verified opportunities.</p>' +
          '</div>' +
          '<div id="dashboard-stats-slot">' + skeletonStatsHtml + '</div>' +
          '<div id="dashboard-prefs-slot"></div>' +
          '<div id="dashboard-matched-feed-slot">' + skeletonFeedHtml + '</div>' +
          '<div id="dashboard-recent-slot"></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  // Bind Sidebar Logout Button
  const sidebarLogoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
  if (sidebarLogoutBtn) {
    const handleLogoutClick = (e: Event) => {
      e.preventDefault();
      onLogout();
    };
    addTrackedListener(sidebarLogoutBtn, 'click', handleLogoutClick);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: Refresh Workspace Stats
  // ───────────────────────────────────────────────────────────────────────────
  const refreshStats = async (): Promise<void> => {
    try {
      const stats = await workspaceService.getWorkspaceStats();
      if (isDestroyed) return;
      const sEl = container.querySelector<HTMLElement>('#stat-saved-count');
      const aEl = container.querySelector<HTMLElement>('#stat-applied-count');
      const vEl = container.querySelector<HTMLElement>('#stat-viewed-count');
      if (sEl) sEl.textContent = String(stats.savedCount || 0);
      if (aEl) aEl.textContent = String(stats.appliedCount || 0);
      if (vEl && stats.recentlyViewedCount !== undefined) {
        vEl.textContent = String(stats.recentlyViewedCount || 0);
      }
    } catch (e) {
      // Ignore background refresh failure
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: Bind Interactive Job Card Actions (Save, Apply, Dismiss, Details)
  // ───────────────────────────────────────────────────────────────────────────
  const bindJobCardActions = (scopeContainer: HTMLElement): void => {
    if (!scopeContainer || isDestroyed) return;

    // Save / Unsave Toggle
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-save-id]').forEach(function (btn) {
      const handleSave = async (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-save-id');
        if (!jobId || isDestroyed) return;
        const isSaved = btn.classList.contains('vjc__btn-action--saved');
        btn.setAttribute('disabled', 'true');

        try {
          if (isSaved) {
            await workspaceService.unsaveJob(jobId);
            if (isDestroyed) return;
            btn.classList.remove('vjc__btn-action--saved');
            btn.textContent = '♡ Save';
            btn.setAttribute('aria-pressed', 'false');
            showToast('Job removed from saved list', 'info');
          } else {
            await workspaceService.saveJob(jobId);
            if (isDestroyed) return;
            btn.classList.add('vjc__btn-action--saved');
            btn.textContent = '♥ Saved';
            btn.setAttribute('aria-pressed', 'true');
            showToast('Job saved to your workspace!', 'success');
          }
          void refreshStats();
        } catch (err) {
          showToast('Failed to update saved state', 'error');
        } finally {
          btn.removeAttribute('disabled');
        }
      };
      addTrackedListener(btn, 'click', handleSave);
    });

    // Mark Applied / Undo Applied Toggle
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-apply-id]').forEach(function (btn) {
      const handleApply = async (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-apply-id');
        if (!jobId || isDestroyed) return;
        const isApplied = btn.classList.contains('vjc__btn-action--applied');
        btn.setAttribute('disabled', 'true');

        try {
          if (isApplied) {
            await workspaceService.unmarkJobApplied(jobId);
            if (isDestroyed) return;
            btn.classList.remove('vjc__btn-action--applied');
            btn.textContent = 'Mark Applied';
            btn.setAttribute('aria-pressed', 'false');
            showToast('Application record undone', 'info');
          } else {
            await workspaceService.markJobApplied(jobId);
            if (isDestroyed) return;
            btn.classList.add('vjc__btn-action--applied');
            btn.textContent = '✓ Applied';
            btn.setAttribute('aria-pressed', 'true');
            showToast('Job marked as applied! Tracked in workspace.', 'success');
          }
          void refreshStats();
        } catch (err) {
          showToast('Failed to update application state', 'error');
        } finally {
          btn.removeAttribute('disabled');
        }
      };
      addTrackedListener(btn, 'click', handleApply);
    });

    // Dismiss (Hide) Action
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-dismiss-id]').forEach(function (btn) {
      const handleDismiss = async (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-dismiss-id');
        if (!jobId || isDestroyed) return;
        btn.setAttribute('disabled', 'true');

        try {
          await workspaceService.dismissJob(jobId);
          if (isDestroyed) return;
          const card = container.querySelector<HTMLElement>('#job-card-' + jobId);
          if (card) {
            card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => {
              if (card && card.parentNode) card.parentNode.removeChild(card);
            }, 250);
          }
          showToast('Job hidden from feed. You can restore it in Hidden Jobs.', 'info');
          void refreshStats();
        } catch (err) {
          btn.removeAttribute('disabled');
          showToast('Failed to hide job', 'error');
        }
      };
      addTrackedListener(btn, 'click', handleDismiss);
    });

    // Details Modal Action
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-detail-id]').forEach(function (btn) {
      const handleDetail = (e: Event) => {
        e.stopPropagation();
        const jId = btn.getAttribute('data-job-detail-id');
        if (jId && !isDestroyed) {
          openJobDetailModal(jId, () => { void refreshStats(); });
        }
      };
      addTrackedListener(btn, 'click', handleDetail);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Async Hydration & Feed Loading
  // ───────────────────────────────────────────────────────────────────────────
  (async () => {
    const statsSlot = container.querySelector<HTMLElement>('#dashboard-stats-slot');
    const prefsSlot = container.querySelector<HTMLElement>('#dashboard-prefs-slot');
    const feedSlot = container.querySelector<HTMLElement>('#dashboard-matched-feed-slot');
    const recentSlot = container.querySelector<HTMLElement>('#dashboard-recent-slot');

    if (!prefsSlot || !feedSlot) return;

    // 1. Load Workspace Stats Counters
    if (statsSlot && authService.isAuthenticated()) {
      try {
        const stats: WorkspaceStatsResponse = await workspaceService.getWorkspaceStats();
        if (isDestroyed) return;
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
        if (!isDestroyed) statsSlot.innerHTML = '';
      }
    }

    // 2. Load and verify Candidate Preferences
    let prefs: UserPreferences | null = null;
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('roleradar_preferences');
        if (raw) prefs = JSON.parse(raw);
      } catch (e) {}
    }

    if (!prefs && authService.isAuthenticated()) {
      try {
        prefs = await preferencesService.getPreferences();
        if (prefs && typeof localStorage !== 'undefined') {
          localStorage.setItem('roleradar_preferences', JSON.stringify(prefs));
        }
      } catch (e) {}
    }

    if (isDestroyed) return;

    const hasPreferences = prefs && (
      (prefs.roles && prefs.roles.length > 0) ||
      (prefs.canonicalRoles && prefs.canonicalRoles.length > 0) ||
      (prefs.roleKeywords && prefs.roleKeywords.length > 0)
    );

    if (hasPreferences) {
      renderDashboardPreferencesSummary(prefsSlot, prefs, () => {
        onNavigate('#/preferences');
      });

      let isFetching = false;
      const fetchLatestMatches = async (showLoading: boolean): Promise<void> => {
        if (isFetching || isDestroyed) return;
        isFetching = true;

        try {
          if (showLoading) {
            feedSlot.innerHTML = loadingHtml('Finding verified jobs matching your profile...');
          }

          const data = await jobsService.getMatchedJobs({ page: 1, limit: 10, sort: 'BEST_MATCH' });
          if (isDestroyed) return;

          const matches = data.jobs || [];

          if (matches.length > 0) {
            const cardsHtml = matches.map((job: Job) => verifiedJobCardHtml(job, { context: 'feed' })).join('');
            feedSlot.innerHTML =
              '<div class="dashboard-feed-header">' +
                '<h2 class="kn-heading-2 dashboard-feed-title">🎯 Recommended Verified Matches' +
                  (data.totalMatches ? ' <span class="dashboard-feed-count">(' + data.totalMatches + ' total)</span>' : '') +
                '</h2>' +
                '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--secondary dashboard-feed-viewall">View All →</a>' +
              '</div>' +
              cardsHtml;

            bindJobCardActions(feedSlot);
          } else {
            feedSlot.innerHTML = emptyStateHtml(
              '🔍',
              'No Verified Matches Found Yet',
              'No active verified jobs strictly matching your target roles, locations, and experience level were found across official company career portals.',
              '<a href="#/preferences" class="kn-btn kn-btn--secondary">✏️ Edit Preferences</a>'
            );
          }
        } catch (err: unknown) {
          if (isDestroyed) return;
          if (showLoading) {
            const is401 = err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401;
            const errMsg = is401
              ? 'Session expired. Please sign in again.'
              : 'Failed to load matched jobs. Please try again.';

            feedSlot.innerHTML = errorStateHtml(errMsg, 'btn-retry-dashboard-feed');
            const retryBtn = feedSlot.querySelector<HTMLElement>('#btn-retry-dashboard-feed');
            if (retryBtn) {
              addTrackedListener(retryBtn, 'click', () => {
                void fetchLatestMatches(true);
              });
            }
          }
        } finally {
          isFetching = false;
        }
      };

      await fetchLatestMatches(true);

      // 3. Load Recently Viewed Jobs
      if (recentSlot && authService.isAuthenticated()) {
        try {
          const recData = await workspaceService.getRecentlyViewedJobs(6);
          if (isDestroyed) return;

          const recJobs = recData.items || [];
          if (recJobs.length > 0) {
            const recentCardsHtml = recJobs.map((j: Job) => {
              const company = escapeHtml(j.companyName || j.company || '');
              const title = escapeHtml(j.title || '');
              const location = escapeHtml(j.location || 'Location Unspecified');
              const viewTime = j.interaction && j.interaction.viewedAt ? formatDetectedDate(j.interaction.viewedAt) : '';
              const statusBadge = j.status === 'CLOSED'
                ? '<span class="vjc__closed-badge">⚠ Closed</span>'
                : '<span class="vjc__verified-badge">✓ Active</span>';

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

            recentSlot.querySelectorAll<HTMLElement>('[data-recent-id]').forEach(function (card) {
              const rId = card.getAttribute('data-recent-id');
              if (rId) {
                addTrackedListener(card, 'click', () => {
                  openJobDetailModal(rId, () => { void refreshStats(); });
                });
              }
            });
          } else {
            recentSlot.innerHTML = '';
          }
        } catch (e) {
          if (!isDestroyed) recentSlot.innerHTML = '';
        }
      }

      // 4. Background Periodic Polling (every 60s)
      stopPolling();
      activePollTimer = setInterval(() => {
        if (isDestroyed) {
          stopPolling();
          return;
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        if (!container.querySelector('#dashboard-matched-feed-slot')) {
          stopPolling();
          return;
        }
        void fetchLatestMatches(false);
      }, 60000);

    } else {
      // Preferences not set up yet
      prefsSlot.innerHTML =
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
  })();

  return {
    destroy: () => {
      isDestroyed = true;
      stopPolling();
      boundListeners.forEach(({ target, event, handler }) => {
        target.removeEventListener(event, handler);
      });
      boundListeners.length = 0;
    },
  };
}
