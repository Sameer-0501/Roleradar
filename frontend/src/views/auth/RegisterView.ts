/**
 * RoleRadar — Register View Module (Wave 2B).
 *
 * Extracted from legacy/app.js into a standalone, typed view component.
 * Handles candidate registration lifecycle:
 * - Candidate name, email, and password input capture & client validation.
 * - Minimum 8-character password enforcement and email regex verification.
 * - Account creation submission via authService.register().
 * - Duplicate submission prevention and loading state indicators.
 * - User-facing error reporting via #auth-error and ApiError unwrapping.
 * - Verification email notification dispatch & routing to #/preferences (or #/verify-email).
 * - Clean disposal, pending request cancellation guards, and listener detachment.
 */

import { authService } from '../../services/api/auth.service.js';
import { ApiError } from '../../services/api/types.js';
import type { AuthResponse } from '../../services/api/types.js';
import { showToast as defaultToast } from '../../services/ui/toast.js';

export interface RegisterViewOptions {
  /** The container DOM element where the view should be mounted */
  container: HTMLElement;
  /** Toast notification callback */
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  /** Route navigation handler (defaults to window.location.hash) */
  onNavigate?: (route: string) => void;
  /** Optional callback invoked on successful registration before navigation */
  onSuccess?: (authResponse: AuthResponse) => void;
  /** Optional override destination route upon successful registration (defaults to #/preferences) */
  redirectTo?: string;
}

export interface RegisterViewController {
  /** Unmounts the view, detaches event listeners, and cancels pending async callbacks */
  destroy: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function mountRegisterView(options: RegisterViewOptions): RegisterViewController {
  const {
    container,
    showToast = defaultToast,
    onNavigate = (route: string) => {
      if (typeof window !== 'undefined') window.location.hash = route;
    },
    onSuccess,
    redirectTo = '#/preferences',
  } = options;

  let isDestroyed = false;
  let isSubmitting = false;

  // Render HTML structure preserving exact legacy class names, hierarchy, and element IDs
  container.innerHTML = `
    <div class="app-auth">
      <div class="app-auth__box">
        <h1 class="kn-heading-2 app-auth__title">Create Your RoleRadar Account</h1>
        <p class="app-auth__subtitle">Start receiving verified job alerts from official company career portals.</p>
        <div id="auth-error" class="app-auth__error" style="display:none;" role="alert"></div>
        <form id="register-form" class="app-auth__form" novalidate>
          <div class="kn-form-group">
            <label class="kn-label" for="register-name">Full name</label>
            <input type="text" id="register-name" name="name" class="kn-input" placeholder="Your name" autocomplete="name" required>
          </div>
          <div class="kn-form-group">
            <label class="kn-label" for="register-email">Email address</label>
            <input type="email" id="register-email" name="email" class="kn-input" placeholder="you@example.com" autocomplete="email" required>
          </div>
          <div class="kn-form-group">
            <label class="kn-label" for="register-password">Password</label>
            <input type="password" id="register-password" name="password" class="kn-input" placeholder="At least 8 characters" autocomplete="new-password" required minlength="8">
          </div>
          <button type="submit" id="btn-register" class="kn-btn kn-btn--primary app-auth__submit">Create Account</button>
        </form>
        <p class="app-auth__switch">Already have an account? <a href="#/login" class="app-auth__switch-link">Sign In</a></p>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#register-form');
  const errorEl = container.querySelector<HTMLElement>('#auth-error');
  const submitBtn = container.querySelector<HTMLButtonElement>('#btn-register');
  const nameInput = container.querySelector<HTMLInputElement>('#register-name');
  const emailInput = container.querySelector<HTMLInputElement>('#register-email');
  const passwordInput = container.querySelector<HTMLInputElement>('#register-password');

  const handleSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    if (isSubmitting || isDestroyed) return;

    const name = nameInput?.value?.trim() || '';
    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';

    if (!name || !email || !password) {
      if (errorEl) {
        errorEl.textContent = 'Please fill in all fields.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      if (errorEl) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (password.length < 8) {
      if (errorEl) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
      }
      return;
    }

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';
    }
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }

    try {
      const authData = await authService.register({ email, password, name });
      if (isDestroyed) return;

      showToast(
        authData.message || 'Registration successful. A verification link has been sent to your email.',
        'success'
      );

      onSuccess?.(authData);
      onNavigate(redirectTo);
    } catch (err: unknown) {
      if (isDestroyed) return;

      const msg = err instanceof ApiError
        ? (err.message || err.userMessage)
        : (err instanceof Error ? err.message : 'Registration failed. Please try again.');

      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
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
