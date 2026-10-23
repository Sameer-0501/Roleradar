/**
 * RoleRadar Account Settings View.
 *
 * Encapsulates candidate account management (#/dashboard/account),
 * user profile identity, email verification status, verification email re-dispatching,
 * preferences shortcuts, and session logout controls with strict lifecycle teardown.
 */

import {
  authService,
  httpClient,
  type User,
} from '../../services/api/index.js';
import {
  renderSidebar,
} from '../dashboard/DashboardView.js';

export interface AccountSettingsViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
}

export interface AccountSettingsViewController {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main View Mount Function
// ─────────────────────────────────────────────────────────────────────────────

export function mountAccountSettingsView(options: AccountSettingsViewOptions): AccountSettingsViewController {
  const {
    container,
    routePath = 'dashboard/account',
    showToast = (msg: string) => { console.log(msg); },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
  } = options;

  let isDestroyed = false;
  let resendTimer: ReturnType<typeof setTimeout> | null = null;
  const boundListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = [];

  function addTrackedListener(target: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(event, handler);
    boundListeners.push({ target, event, handler });
  }

  // Obtain cached user record
  const user = (httpClient.getUser() as User | null) ?? null;
  const name = user && user.name ? escapeHtml(user.name) : 'User';
  const email = user && user.email ? escapeHtml(user.email) : '';
  const isVerified = !!(user && (user.emailVerified || (user as any).isVerified));

  const verificationBadge = isVerified
    ? '<span class="notif-badge notif-badge--sent" style="margin-left: 8px;">✓ Verified</span>'
    : '<span class="notif-badge notif-badge--failed" style="margin-left: 8px;">⚠️ Unverified</span> ' +
      '<button type="button" id="btn-account-resend" class="kn-btn kn-btn--secondary notif-card__retry-btn" style="margin-left: 8px;">Resend Verification Email</button>';

  // Layout Rendering
  container.innerHTML = (
    '<div class="app-dashboard-layout">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
        '<div class="app-account">' +
          '<h1 class="kn-heading-1 kn-mb-3">Account</h1>' +

          '<div class="kn-card kn-p-4 kn-mb-3 app-account__profile">' +
            '<h2 class="kn-heading-3 kn-mb-2">Profile & Verification</h2>' +
            '<div class="app-account__field">' +
              '<span class="app-account__label">Name</span>' +
              '<span class="app-account__value">' + name + '</span>' +
            '</div>' +
            (email
              ? '<div class="app-account__field">' +
                  '<span class="app-account__label">Email</span>' +
                  '<span class="app-account__value">' + email + ' ' + verificationBadge + '</span>' +
                '</div>'
              : '') +
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
        '</div>' +
      '</div>' +
    '</div>'
  );

  // Wire up sidebar Sign Out button
  const sidebarLogoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
  if (sidebarLogoutBtn) {
    addTrackedListener(sidebarLogoutBtn, 'click', () => {
      onLogout();
    });
  }

  // Wire up card Sign Out button
  const cardLogoutBtn = container.querySelector<HTMLElement>('#btn-logout');
  if (cardLogoutBtn) {
    addTrackedListener(cardLogoutBtn, 'click', () => {
      onLogout();
    });
  }

  // Wire up Resend Verification Email Button
  const resendBtn = container.querySelector<HTMLButtonElement>('#btn-account-resend');
  if (resendBtn) {
    const handleResend = async () => {
      if (isDestroyed) return;

      const targetEmail = user?.email || '';
      if (!targetEmail) {
        showToast('No email address associated with this account', 'error');
        return;
      }

      const origText = 'Resend Verification Email';
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending...';

      try {
        const res = await authService.resendVerification(targetEmail);
        if (isDestroyed) return;

        showToast(res.message || 'Verification email sent!', 'success');
        resendBtn.textContent = '✓ Sent!';

        resendTimer = setTimeout(() => {
          if (!isDestroyed && resendBtn) {
            resendBtn.disabled = false;
            resendBtn.textContent = origText;
          }
        }, 5000);
      } catch (err: any) {
        if (isDestroyed) return;
        showToast(err?.message || 'Failed to resend verification email', 'error');
        resendBtn.disabled = false;
        resendBtn.textContent = origText;
      }
    };

    addTrackedListener(resendBtn, 'click', handleResend);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Teardown & Lifecycle Controller
  // ───────────────────────────────────────────────────────────────────────────
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

      if (resendTimer) {
        clearTimeout(resendTimer);
        resendTimer = null;
      }

      boundListeners.forEach(({ target, event, handler }) => {
        target.removeEventListener(event, handler);
      });
      boundListeners.length = 0;
    },
  };
}
