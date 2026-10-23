/**
 * RoleRadar Candidate Alerts & Notifications View.
 *
 * Encapsulates delivery history for verified job match notifications (#/dashboard/alerts),
 * read/unread state management, delivery retries for failed dispatches,
 * direct links to official employer job postings, and visibility-aware background polling with strict lifecycle cleanup.
 */

import {
  alertsService,
  type AlertNotification,
} from '../../services/api/index.js';
import {
  renderSidebar,
  loadingHtml,
  emptyStateHtml,
  errorStateHtml,
} from '../dashboard/DashboardView.js';

export interface AlertsViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
}

export interface AlertsViewController {
  destroy: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML & Formatting Helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDetectedDate(dateStr: string | null | undefined): string {
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

function notificationStatusBadge(status: string): string {
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

export function notificationCardHtml(item: AlertNotification): string {
  const job = item.job;
  const isUnread = !item.isRead;
  const unreadClass = isUnread ? ' notif-card--unread' : '';
  const statusBadge = notificationStatusBadge(item.deliveryStatus);
  const timeAgo = formatDetectedDate(item.sentAt || item.createdAt);

  const jobTitle = job ? escapeHtml(job.title) : 'Verified Job Alert';
  const company = job ? escapeHtml(job.companyName) : 'Verified Company';
  const location = job && job.location ? escapeHtml(job.location) : '';
  const jobId = job && job.externalJobId ? escapeHtml(job.externalJobId) : '';
  const officialUrl = job && job.officialUrl ? escapeHtml(job.officialUrl) : '#';

  const retryBtn = (item.deliveryStatus === 'FAILED' || item.deliveryStatus === 'FAILED_PERMANENT')
    ? '<button type="button" class="kn-btn kn-btn--secondary notif-card__retry-btn" data-retry-id="' + escapeHtml(item.id) + '">🔄 Retry Delivery</button>'
    : '';

  const markReadBtn = isUnread
    ? '<button type="button" class="notif-card__mark-read" data-read-id="' + escapeHtml(item.id) + '" title="Mark as read">✓ Mark Read</button>'
    : '';

  return (
    '<article class="notif-card' + unreadClass + '" id="notif-' + escapeHtml(item.id) + '">' +
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Alerts View Mount Function
// ─────────────────────────────────────────────────────────────────────────────

export function mountAlertsView(options: AlertsViewOptions): AlertsViewController {
  const {
    container,
    routePath = 'dashboard/alerts',
    showToast = (msg: string) => { console.log(msg); },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
  } = options;

  let isDestroyed = false;
  let isFetching = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  const retryTimeouts: Array<ReturnType<typeof setTimeout>> = [];
  const boundListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = [];

  function addTrackedListener(target: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(event, handler);
    boundListeners.push({ target, event, handler });
  }

  // Initial layout rendering
  container.innerHTML = (
    '<div class="app-dashboard-layout">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
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
        '</div>' +
      '</div>' +
    '</div>'
  );

  // Wire up sidebar Sign Out button
  const logoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
  if (logoutBtn) {
    addTrackedListener(logoutBtn, 'click', () => {
      onLogout();
    });
  }

  const feedEl = container.querySelector<HTMLElement>('#alerts-feed');
  const markAllBtn = container.querySelector<HTMLButtonElement>('#btn-mark-all-read');

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: Bind Card-Level Actions (Mark Read & Retry Delivery)
  // ───────────────────────────────────────────────────────────────────────────
  const bindNotificationCardActions = (scopeContainer: HTMLElement): void => {
    if (!scopeContainer || isDestroyed) return;

    // Mark single notification as read
    scopeContainer.querySelectorAll<HTMLElement>('[data-read-id]').forEach((btn) => {
      const handleMarkRead = async (e: Event) => {
        e.preventDefault();
        const notifId = btn.getAttribute('data-read-id');
        if (!notifId || isDestroyed) return;

        btn.setAttribute('disabled', 'true');
        (btn as HTMLButtonElement).disabled = true;

        try {
          await alertsService.markNotificationRead(notifId);
          if (isDestroyed) return;

          const card = scopeContainer.querySelector<HTMLElement>('#notif-' + notifId);
          if (card) {
            card.classList.remove('notif-card--unread');
            const dot = card.querySelector<HTMLElement>('.notif-card__unread-dot');
            if (dot) dot.remove();
            btn.remove();
          }
        } catch (err) {
          if (isDestroyed) return;
          btn.removeAttribute('disabled');
          (btn as HTMLButtonElement).disabled = false;
          showToast('Failed to mark notification as read', 'error');
        }
      };

      addTrackedListener(btn, 'click', handleMarkRead);
    });

    // Retry failed delivery
    scopeContainer.querySelectorAll<HTMLElement>('[data-retry-id]').forEach((btn) => {
      const handleRetry = async (e: Event) => {
        e.preventDefault();
        const notifId = btn.getAttribute('data-retry-id');
        if (!notifId || isDestroyed) return;

        btn.setAttribute('disabled', 'true');
        (btn as HTMLButtonElement).disabled = true;
        btn.textContent = 'Queuing...';

        try {
          await alertsService.retryNotification(notifId);
          if (isDestroyed) return;

          showToast('Notification queued for retry', 'success');

          const timer = setTimeout(() => {
            if (!isDestroyed) {
              void fetchAlerts(false);
            }
          }, 1000);
          retryTimeouts.push(timer);
        } catch (err) {
          if (isDestroyed) return;
          btn.removeAttribute('disabled');
          (btn as HTMLButtonElement).disabled = false;
          btn.textContent = '🔄 Retry Delivery';
          showToast('Failed to retry notification', 'error');
        }
      };

      addTrackedListener(btn, 'click', handleRetry);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Data Fetching and Re-rendering
  // ───────────────────────────────────────────────────────────────────────────
  const fetchAlerts = async (showLoading: boolean): Promise<void> => {
    if (isFetching || isDestroyed || !feedEl) return;
    isFetching = true;

    try {
      if (showLoading) {
        feedEl.innerHTML = loadingHtml('Loading notification history...');
      }

      const data = await alertsService.getNotifications(1, 30);
      if (isDestroyed) return;

      const notifs: AlertNotification[] = data.notifications || [];

      if (notifs.length === 0) {
        feedEl.innerHTML = emptyStateHtml(
          '🔔',
          'No Alerts Dispatched Yet',
          'When new verified jobs matching your target roles and locations are detected, automatic email alerts will appear here.',
          '<a href="#/preferences" class="kn-btn kn-btn--secondary">Configure Alert Preferences</a>'
        );
        return;
      }

      const cardsHtml = notifs.map((n) => notificationCardHtml(n)).join('');
      const totalCount = typeof data.total === 'number' ? data.total : notifs.length;
      const summaryInfo = totalCount > 0
        ? '<p class="alerts-total-info">Showing ' + notifs.length + ' of ' + totalCount + ' alert notification' + (totalCount !== 1 ? 's' : '') + '</p>'
        : '';

      feedEl.innerHTML = summaryInfo + cardsHtml;
      bindNotificationCardActions(feedEl);
    } catch (err) {
      if (isDestroyed) return;
      if (showLoading) {
        feedEl.innerHTML = errorStateHtml('Failed to load alert history.', 'btn-retry-alerts');
        const retryBtn = container.querySelector<HTMLElement>('#btn-retry-alerts');
        if (retryBtn) {
          addTrackedListener(retryBtn, 'click', () => {
            void fetchAlerts(true);
          });
        }
      }
    } finally {
      isFetching = false;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Mark All Read Button
  // ───────────────────────────────────────────────────────────────────────────
  if (markAllBtn) {
    const handleMarkAll = async (e: Event) => {
      e.preventDefault();
      if (isDestroyed) return;

      markAllBtn.disabled = true;
      try {
        await alertsService.markAllNotificationsRead();
        if (isDestroyed) return;

        showToast('All notifications marked as read', 'success');
        void fetchAlerts(false);
      } catch (err) {
        if (isDestroyed) return;
        showToast('Failed to mark all as read', 'error');
      } finally {
        if (!isDestroyed) {
          markAllBtn.disabled = false;
        }
      }
    };

    addTrackedListener(markAllBtn, 'click', handleMarkAll);
  }

  // Initial fetch
  void fetchAlerts(true);

  // ───────────────────────────────────────────────────────────────────────────
  // Visibility-Aware Background Polling (60 seconds)
  // ───────────────────────────────────────────────────────────────────────────
  pollInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (isDestroyed || !feedEl) return;
    void fetchAlerts(false);
  }, 60000);

  // ───────────────────────────────────────────────────────────────────────────
  // Teardown & Lifecycle Controller
  // ───────────────────────────────────────────────────────────────────────────
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      retryTimeouts.forEach((timer) => clearTimeout(timer));
      retryTimeouts.length = 0;

      boundListeners.forEach(({ target, event, handler }) => {
        target.removeEventListener(event, handler);
      });
      boundListeners.length = 0;
    },
  };
}
