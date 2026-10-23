/**
 * RoleRadar — Verify Email View Module (Wave 2A).
 *
 * Extracted from legacy/app.js into a standalone, typed view component.
 * Handles email ownership verification lifecycle:
 * - Query parameter parsing (token, status, error).
 * - Automatic background token verification via authService.
 * - Loading, success, and error state transitions.
 * - Resend verification email trigger with rate-limit protection.
 * - Clean disposal and event listener detachment on unmount.
 */

import { authService } from '../../services/api/auth.service.js';
import { ApiError } from '../../services/api/types.js';
import { showToast as defaultToast } from '../../services/ui/toast.js';

export interface VerifyEmailViewOptions {
  /** The container DOM element where the view should be mounted */
  container: HTMLElement;
  /** Custom window hash override for unit testing (defaults to window.location.hash) */
  hash?: string;
  /** Toast notification callback */
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  /** Email prompt provider for resend flow (defaults to window.prompt) */
  promptEmail?: () => string | null;
}

export interface VerifyEmailViewController {
  /** Unmounts the view, cancels pending timers, and removes all attached event listeners */
  destroy: () => void;
}

function escapeHtml(s: unknown): string {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

export function mountVerifyEmailView(options: VerifyEmailViewOptions): VerifyEmailViewController {
  const {
    container,
    hash = typeof window !== 'undefined' ? window.location.hash || '' : '',
    showToast = defaultToast,
    promptEmail = () => (typeof window !== 'undefined' ? window.prompt('Enter your email address:') : null),
  } = options;

  let isDestroyed = false;
  let verificationTimer: ReturnType<typeof setTimeout> | null = null;
  let resendResetTimer: ReturnType<typeof setTimeout> | null = null;
  let resendListener: ((e: Event) => void) | null = null;

  // Extract query parameters from hash
  const queryString = hash.indexOf('?') !== -1 ? hash.slice(hash.indexOf('?') + 1) : '';
  const params = new URLSearchParams(queryString);
  const token = params.get('token');
  const status = params.get('status');
  const errorMsg = params.get('error');

  // Render initial frame
  container.innerHTML = `
    <div class="app-auth">
      <div class="app-auth__box" id="verify-email-box">
        <div id="verify-email-content">
          ${
            token
              ? `<div class="state-container">
                   <div class="state-icon">⏳</div>
                   <h2 class="kn-heading-2">Verifying Your Email...</h2>
                   <p class="state-message">Please wait while we confirm your email ownership.</p>
                 </div>`
              : status === 'success'
              ? `<div class="state-container">
                   <div class="state-icon" style="color: #059669;">✓</div>
                   <h2 class="kn-heading-2">Email Verified Successfully!</h2>
                   <p class="state-message">Your email has been verified. You will now receive verified job alerts matching your preferences.</p>
                   <a href="#/dashboard" class="kn-btn kn-btn--primary kn-mt-3">Go to Dashboard →</a>
                 </div>`
              : `<div class="state-container">
                   <div class="state-icon" style="color: #dc2626;">⚠️</div>
                   <h2 class="kn-heading-2">Verification Failed</h2>
                   <p class="state-message">${escapeHtml(errorMsg || 'Invalid or missing verification token.')}</p>
                   <div class="kn-mt-3">
                     <button type="button" id="btn-resend-from-verify" class="kn-btn kn-btn--secondary">Resend Verification Email</button>
                   </div>
                 </div>`
          }
        </div>
      </div>
    </div>
  `;

  const bindResendButton = () => {
    const btn = container.querySelector<HTMLButtonElement>('#btn-resend-from-verify');
    if (!btn || isDestroyed) return;

    if (resendListener) {
      btn.removeEventListener('click', resendListener);
    }

    resendListener = async (e: Event) => {
      e.preventDefault();
      if (isDestroyed) return;

      btn.disabled = true;
      const origText = btn.textContent || 'Resend Verification Email';
      btn.textContent = 'Sending...';

      const user = authService.getUser();
      const email = user?.email || promptEmail();

      if (!email) {
        btn.disabled = false;
        btn.textContent = origText;
        return;
      }

      try {
        const res = await authService.resendVerification(email);
        if (isDestroyed) return;
        showToast(res.message || 'Verification email sent!', 'success');
        btn.textContent = '✓ Sent!';
        resendResetTimer = setTimeout(() => {
          if (!isDestroyed && btn) {
            btn.disabled = false;
            btn.textContent = origText;
          }
        }, 5000);
      } catch (err: unknown) {
        if (isDestroyed) return;
        const msg = err instanceof ApiError ? err.userMessage : (err instanceof Error ? err.message : 'Failed to resend verification email');
        showToast(msg, 'error');
        btn.disabled = false;
        btn.textContent = origText;
      }
    };

    btn.addEventListener('click', resendListener);
  };

  // If token is present, perform async verification
  if (token) {
    verificationTimer = setTimeout(async () => {
      const contentEl = container.querySelector<HTMLElement>('#verify-email-content');
      if (!contentEl || isDestroyed) return;

      try {
        await authService.verifyEmail(token);
        if (isDestroyed) return;

        contentEl.innerHTML = `
          <div class="state-container">
            <div class="state-icon" style="color: #059669;">✓</div>
            <h2 class="kn-heading-2">Email Verified Successfully!</h2>
            <p class="state-message">Your email address has been verified. Real-time alerts for verified job openings are now active.</p>
            <div class="kn-mt-3" style="display: flex; gap: 10px; justify-content: center;">
              <a href="#/dashboard" class="kn-btn kn-btn--primary">Go to Dashboard →</a>
              <a href="#/preferences" class="kn-btn kn-btn--secondary">Alert Settings</a>
            </div>
          </div>
        `;
        showToast('Email verified successfully!', 'success');
      } catch (err: unknown) {
        if (isDestroyed) return;
        const msg = err instanceof ApiError ? err.userMessage : (err instanceof Error ? err.message : 'Verification link expired or invalid.');

        contentEl.innerHTML = `
          <div class="state-container">
            <div class="state-icon" style="color: #dc2626;">⚠️</div>
            <h2 class="kn-heading-2">Verification Failed</h2>
            <p class="state-message">${escapeHtml(msg)}</p>
            <div class="kn-mt-3" style="display: flex; gap: 10px; justify-content: center;">
              <button type="button" id="btn-resend-from-verify" class="kn-btn kn-btn--secondary">Resend Verification Email</button>
              <a href="#/dashboard" class="kn-btn kn-btn--secondary">Dashboard</a>
            </div>
          </div>
        `;
        bindResendButton();
      }
    }, 300);
  } else {
    bindResendButton();
  }

  return {
    destroy: () => {
      isDestroyed = true;
      if (verificationTimer) clearTimeout(verificationTimer);
      if (resendResetTimer) clearTimeout(resendResetTimer);
      const btn = container.querySelector<HTMLButtonElement>('#btn-resend-from-verify');
      if (btn && resendListener) {
        btn.removeEventListener('click', resendListener);
      }
    },
  };
}
