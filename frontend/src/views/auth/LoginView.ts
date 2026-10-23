/**
 * RoleRadar — Login View Module (Wave 2B).
 *
 * Extracted from legacy/app.js into a standalone, typed view component.
 * Handles candidate authentication lifecycle:
 * - Email and password input capture & client validation.
 * - Credential submission via authService.login().
 * - Duplicate submission prevention and loading state indicators.
 * - User-facing error reporting via #auth-error and ApiError unwrapping.
 * - Onboarding completion check and navigation to #/dashboard or #/preferences.
 * - Clean disposal, pending request cancellation guards, and listener detachment.
 */

import { authService } from '../../services/api/auth.service.js';
import { httpClient } from '../../services/api/client.js';
import { ApiError } from '../../services/api/types.js';
import type { AuthResponse } from '../../services/api/types.js';
import { showToast as defaultToast } from '../../services/ui/toast.js';

export interface LoginViewOptions {
  /** The container DOM element where the view should be mounted */
  container: HTMLElement;
  /** Toast notification callback */
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  /** Route navigation handler (defaults to window.location.hash) */
  onNavigate?: (route: string) => void;
  /** Optional callback invoked on successful authentication before navigation */
  onSuccess?: (authResponse: AuthResponse) => void;
  /** Optional override destination route upon successful login */
  redirectTo?: string;
}

export interface LoginViewController {
  /** Unmounts the view, detaches event listeners, and cancels pending async callbacks */
  destroy: () => void;
}

export function mountLoginView(options: LoginViewOptions): LoginViewController {
  const {
    container,
    showToast = defaultToast,
    onNavigate = (route: string) => {
      if (typeof window !== 'undefined') window.location.hash = route;
    },
    onSuccess,
    redirectTo,
  } = options;

  let isDestroyed = false;
  let isSubmitting = false;

  // Render HTML structure preserving exact legacy class names, hierarchy, and element IDs
  container.innerHTML = `
    <div class="app-auth">
      <div class="app-auth__box">
        <h1 class="kn-heading-2 app-auth__title">Sign In to RoleRadar</h1>
        <p class="app-auth__subtitle">Access your verified job matches.</p>
        <div id="auth-error" class="app-auth__error" style="display:none;" role="alert"></div>
        <form id="login-form" class="app-auth__form" novalidate>
          <div class="kn-form-group">
            <label class="kn-label" for="login-email">Email address</label>
            <input type="email" id="login-email" name="email" class="kn-input" placeholder="you@example.com" autocomplete="email" required>
          </div>
          <div class="kn-form-group">
            <label class="kn-label" for="login-password">Password</label>
            <input type="password" id="login-password" name="password" class="kn-input" placeholder="Your password" autocomplete="current-password" required>
          </div>
          <button type="submit" id="btn-login" class="kn-btn kn-btn--primary app-auth__submit">Sign In</button>
        </form>
        <p class="app-auth__switch">Don't have an account? <a href="#/register" class="app-auth__switch-link">Get Started</a></p>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#login-form');
  const errorEl = container.querySelector<HTMLElement>('#auth-error');
  const submitBtn = container.querySelector<HTMLButtonElement>('#btn-login');
  const emailInput = container.querySelector<HTMLInputElement>('#login-email');
  const passwordInput = container.querySelector<HTMLInputElement>('#login-password');

  const handleSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    if (isSubmitting || isDestroyed) return;

    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';

    if (!email || !password) {
      if (errorEl) {
        errorEl.textContent = 'Please enter your email and password.';
        errorEl.style.display = 'block';
      }
      return;
    }

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }

    try {
      const authData = await authService.login({ email, password });
      if (isDestroyed) return;

      showToast('Signed in successfully!', 'success');
      onSuccess?.(authData);

      if (redirectTo) {
        onNavigate(redirectTo);
        return;
      }

      // Check onboarding state consistent with legacy behavior
      const onboardingDone = typeof localStorage !== 'undefined'
        ? localStorage.getItem('roleradar_onboarding_completed')
        : null;

      if (!onboardingDone) {
        try {
          const prefData = await httpClient.get<{
            preferences?: { roles?: string[] };
            roles?: string[];
          }>('/users/me/preferences');

          if (isDestroyed) return;

          const prefs = prefData?.preferences || prefData;
          if (prefs && Array.isArray(prefs.roles) && prefs.roles.length > 0) {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('roleradar_preferences', JSON.stringify(prefs));
              localStorage.setItem('roleradar_onboarding_completed', 'true');
            }
            onNavigate('#/dashboard');
          } else {
            onNavigate('#/preferences');
          }
        } catch {
          if (isDestroyed) return;
          onNavigate('#/preferences');
        }
      } else {
        onNavigate('#/dashboard');
      }
    } catch (err: unknown) {
      if (isDestroyed) return;

      const msg = err instanceof ApiError
        ? (err.message || err.userMessage)
        : (err instanceof Error ? err.message : 'Login failed. Please check your credentials.');

      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    } finally {
      if (!isDestroyed) {
        isSubmitting = false;
      }
    }
  };

  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  return {
    destroy: () => {
      isDestroyed = true;
      isSubmitting = false;
      if (form) {
        form.removeEventListener('submit', handleSubmit);
      }
    },
  };
}
