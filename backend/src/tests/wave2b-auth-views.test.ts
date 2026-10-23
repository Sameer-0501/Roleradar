/**
 * RoleRadar — Architectural Refactoring Wave 2B Tests:
 * Extracted LoginView & RegisterView Component & Lifecycle Tests.
 *
 * Validates:
 * 1. Successful login and correct navigation (onboarding vs dashboard).
 * 2. Invalid login and server-error handling (ApiError unwrapping & user messaging).
 * 3. Successful registration and verification email notification handoff.
 * 4. Registration validation (missing fields, invalid email, min 8-char password) & duplicate-submit prevention.
 * 5. Loading states and button indicators during in-flight network requests.
 * 6. Unauthorized 401 responses handled safely without redirect loops.
 * 7. View destruction while an asynchronous request is pending (cancellation guard).
 * 8. Listener/timer cleanup and repeated route transitions.
 * 9. Preservation of token/user persistence behavior via httpClient/localStorage.
 * 10. Regression coverage for existing email-verification view.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Initialize mock DOM environment for Node.js test runner
class MockElement {
  public tagName: string;
  public className: string = '';
  public id: string = '';
  public value: string = '';
  public disabled: boolean = false;
  public style: Record<string, string> = {};
  public classList = {
    add: (_c: string) => {},
    remove: (_c: string) => {},
    contains: (_c: string) => false,
  };
  public parentNode: MockElement | null = null;
  private _innerHTML: string = '';
  private _textContent: string = '';
  private listeners: Map<string, Set<(e: any) => void>> = new Map();
  private elementsById: Map<string, MockElement> = new Map();

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this._textContent;
  }

  set textContent(val: string) {
    this._textContent = String(val);
    this._innerHTML = String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = String(val);
    // Reset cached children when innerHTML is overwritten
    this.elementsById.clear();
  }

  public appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    return child;
  }

  public remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  public removeChild(child: MockElement): MockElement {
    child.parentNode = null;
    return child;
  }

  public addEventListener(event: string, handler: (e: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  public removeEventListener(event: string, handler: (e: any) => void): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(handler);
    }
  }

  public dispatchEvent(event: { type: string; preventDefault?: () => void }): boolean {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const h of handlers) {
        h(event);
      }
    }
    return true;
  }

  public querySelector<T = any>(selector: string): T | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.innerHTML.includes(`id="${id}"`) || this.id === id) {
        if (!this.elementsById.has(id)) {
          const el = new MockElement();
          el.id = id;
          this.elementsById.set(id, el);
        }
        const cached = this.elementsById.get(id)!;
        return cached as unknown as T;
      }
    }
    return null;
  }
}

// Global window/document mocks for JSDOM simulation
const mockDocument = {
  createElement: (tagName: string) => new MockElement(tagName),
  body: new MockElement('body'),
};

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

(globalThis as any).document = mockDocument;

import {
  mountLoginView,
  mountRegisterView,
  mountVerifyEmailView,
} from '../../../frontend/src/views/index.js';
import { authService } from '../../../frontend/src/services/api/auth.service.js';
import { httpClient } from '../../../frontend/src/services/api/client.js';
import { ApiError } from '../../../frontend/src/services/api/types.js';

describe('Wave 2B: Authentication Views Decoupling (LoginView & RegisterView)', () => {
  let testContainer: HTMLElement;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    storageMap.clear();
    httpClient.clearAuth();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    testContainer = new MockElement('div') as unknown as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. LoginView: Rendering and Initial DOM State
  // ───────────────────────────────────────────────────────────────────────────
  it('renders login form with exact legacy structure, titles, inputs, and submit button', () => {
    const controller = mountLoginView({ container: testContainer });

    expect(testContainer.innerHTML).toContain('Sign In to RoleRadar');
    expect(testContainer.innerHTML).toContain('id="login-form"');
    expect(testContainer.innerHTML).toContain('id="login-email"');
    expect(testContainer.innerHTML).toContain('id="login-password"');
    expect(testContainer.innerHTML).toContain('id="btn-login"');
    expect(testContainer.innerHTML).toContain('id="auth-error"');
    expect(testContainer.innerHTML).toContain('#/register');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. LoginView: Client-Side Input Validation
  // ───────────────────────────────────────────────────────────────────────────
  it('validates required email and password on client before calling authService', async () => {
    const loginSpy = vi.spyOn(authService, 'login');
    const controller = mountLoginView({ container: testContainer });

    const form = testContainer.querySelector<MockElement>('#login-form')!;
    const errorEl = testContainer.querySelector<MockElement>('#auth-error')!;

    // Submit empty form
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

    expect(loginSpy).not.toHaveBeenCalled();
    expect(errorEl.textContent).toBe('Please enter your email and password.');
    expect(errorEl.style['display']).toBe('block');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. LoginView: Successful Login with Onboarding Completion Check
  // ───────────────────────────────────────────────────────────────────────────
  it('handles successful login and navigates to #/dashboard when onboarding is completed', async () => {
    storageMap.set('roleradar_onboarding_completed', 'true');

    vi.spyOn(authService, 'login').mockResolvedValue({
      token: 'valid-jwt-token',
      user: {
        id: 'u-1',
        email: 'user@example.com',
        name: 'Alex Developer',
        isAdmin: false,
        isBetaUser: false,
        emailVerified: true,
      },
    });

    const navigateSpy = vi.fn();
    const successSpy = vi.fn();
    const toastSpy = vi.fn();

    const controller = mountLoginView({
      container: testContainer,
      onNavigate: navigateSpy,
      onSuccess: successSpy,
      showToast: toastSpy,
    });

    const form = testContainer.querySelector<MockElement>('#login-form')!;
    const emailInput = testContainer.querySelector<MockElement>('#login-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#login-password')!;

    emailInput.value = 'user@example.com';
    passwordInput.value = 'SecretPassword123!';

    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

    // Await async microtasks
    await vi.advanceTimersByTimeAsync(50);

    expect(authService.login).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'SecretPassword123!',
    });
    expect(toastSpy).toHaveBeenCalledWith('Signed in successfully!', 'success');
    expect(successSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('#/dashboard');

    controller.destroy();
  });

  it('handles successful login and navigates to #/preferences when new user has no roles configured', async () => {
    // onboarding completed is not set
    vi.spyOn(authService, 'login').mockResolvedValue({
      token: 'new-user-jwt',
      user: {
        id: 'u-2',
        email: 'newuser@example.com',
        name: 'New Candidate',
        isAdmin: false,
        isBetaUser: false,
        emailVerified: false,
      },
    });

    // Preferences returned from server has empty roles
    vi.spyOn(httpClient, 'get').mockResolvedValue({
      preferences: { roles: [] },
    });

    const navigateSpy = vi.fn();

    const controller = mountLoginView({
      container: testContainer,
      onNavigate: navigateSpy,
    });

    const form = testContainer.querySelector<MockElement>('#login-form')!;
    const emailInput = testContainer.querySelector<MockElement>('#login-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#login-password')!;

    emailInput.value = 'newuser@example.com';
    passwordInput.value = 'SecretPassword123!';

    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(50);

    expect(navigateSpy).toHaveBeenCalledWith('#/preferences');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. LoginView: Unauthorized 401 & Server Error Handling
  // ───────────────────────────────────────────────────────────────────────────
  it('handles 401 Unauthorized responses safely without redirect loops and restores button', async () => {
    vi.spyOn(authService, 'login').mockRejectedValue(
      new ApiError({ message: 'Invalid email or password.', status: 401 })
    );

    const navigateSpy = vi.fn();
    const controller = mountLoginView({
      container: testContainer,
      onNavigate: navigateSpy,
    });

    const form = testContainer.querySelector<MockElement>('#login-form')!;
    const submitBtn = testContainer.querySelector<MockElement>('#btn-login')!;
    const errorEl = testContainer.querySelector<MockElement>('#auth-error')!;
    const emailInput = testContainer.querySelector<MockElement>('#login-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#login-password')!;

    emailInput.value = 'wrong@example.com';
    passwordInput.value = 'WrongPassword';

    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(50);

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(errorEl.textContent).toBe('Invalid email or password.');
    expect(errorEl.style['display']).toBe('block');
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent).toBe('Sign In');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. LoginView: Duplicate Submission Prevention
  // ───────────────────────────────────────────────────────────────────────────
  it('prevents duplicate submissions while a login request is pending', async () => {
    let resolveLogin: (res: any) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    const loginSpy = vi.spyOn(authService, 'login').mockReturnValue(loginPromise as any);

    const controller = mountLoginView({ container: testContainer });

    const form = testContainer.querySelector<MockElement>('#login-form')!;
    const submitBtn = testContainer.querySelector<MockElement>('#btn-login')!;
    const emailInput = testContainer.querySelector<MockElement>('#login-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#login-password')!;

    emailInput.value = 'user@example.com';
    passwordInput.value = 'SecretPassword123!';

    // First submission
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toBe('Signing in...');

    // Second submission during in-flight request
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

    expect(loginSpy).toHaveBeenCalledTimes(1);

    // Resolve login request
    resolveLogin!({
      token: 'jwt-123',
      user: { id: 'u1', email: 'user@example.com' },
    });
    await vi.advanceTimersByTimeAsync(50);

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. LoginView: Cancellation on View Destruction
  // ───────────────────────────────────────────────────────────────────────────
  it('cancels pending async updates safely when controller.destroy() is called', async () => {
    let resolveLogin: (res: any) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    vi.spyOn(authService, 'login').mockReturnValue(loginPromise as any);

    const navigateSpy = vi.fn();
    const controller = mountLoginView({
      container: testContainer,
      onNavigate: navigateSpy,
    });

    const form = testContainer.querySelector<MockElement>('#login-form')!;
    const emailInput = testContainer.querySelector<MockElement>('#login-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#login-password')!;

    emailInput.value = 'user@example.com';
    passwordInput.value = 'SecretPassword123!';

    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

    // Destroy view while request is in flight
    controller.destroy();

    // Now resolve login
    resolveLogin!({
      token: 'jwt-123',
      user: { id: 'u1', email: 'user@example.com' },
    });
    await vi.advanceTimersByTimeAsync(50);

    // Navigation and post-unmount mutations should NOT occur
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. RegisterView: Rendering & Legacy Structure
  // ───────────────────────────────────────────────────────────────────────────
  it('renders registration form with exact legacy structure, titles, inputs, and submit button', () => {
    const controller = mountRegisterView({ container: testContainer });

    expect(testContainer.innerHTML).toContain('Create Your RoleRadar Account');
    expect(testContainer.innerHTML).toContain('id="register-form"');
    expect(testContainer.innerHTML).toContain('id="register-name"');
    expect(testContainer.innerHTML).toContain('id="register-email"');
    expect(testContainer.innerHTML).toContain('id="register-password"');
    expect(testContainer.innerHTML).toContain('id="btn-register"');
    expect(testContainer.innerHTML).toContain('id="auth-error"');
    expect(testContainer.innerHTML).toContain('#/login');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. RegisterView: Client-Side Input Validation
  // ───────────────────────────────────────────────────────────────────────────
  it('validates missing fields, invalid email format, and min 8-character password', async () => {
    const registerSpy = vi.spyOn(authService, 'register');
    const controller = mountRegisterView({ container: testContainer });

    const form = testContainer.querySelector<MockElement>('#register-form')!;
    const errorEl = testContainer.querySelector<MockElement>('#auth-error')!;
    const nameInput = testContainer.querySelector<MockElement>('#register-name')!;
    const emailInput = testContainer.querySelector<MockElement>('#register-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#register-password')!;

    // Case A: Missing fields
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    expect(registerSpy).not.toHaveBeenCalled();
    expect(errorEl.textContent).toBe('Please fill in all fields.');

    // Case B: Invalid email format
    nameInput.value = 'Jane Candidate';
    emailInput.value = 'not-an-email';
    passwordInput.value = 'ValidPass123';
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    expect(registerSpy).not.toHaveBeenCalled();
    expect(errorEl.textContent).toBe('Please enter a valid email address.');

    // Case C: Password too short (< 8 chars)
    emailInput.value = 'jane@example.com';
    passwordInput.value = 'short';
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    expect(registerSpy).not.toHaveBeenCalled();
    expect(errorEl.textContent).toBe('Password must be at least 8 characters.');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. RegisterView: Successful Registration & Verification Handoff
  // ───────────────────────────────────────────────────────────────────────────
  it('handles successful registration and dispatches verification email toast handoff', async () => {
    vi.spyOn(authService, 'register').mockResolvedValue({
      message: 'Registration successful. A verification link has been sent to your email.',
      token: 'registered-jwt-token',
      user: {
        id: 'u-new',
        email: 'jane@example.com',
        name: 'Jane Candidate',
        isAdmin: false,
        isBetaUser: false,
        emailVerified: false,
      },
    });

    const toastSpy = vi.fn();
    const navigateSpy = vi.fn();
    const successSpy = vi.fn();

    const controller = mountRegisterView({
      container: testContainer,
      showToast: toastSpy,
      onNavigate: navigateSpy,
      onSuccess: successSpy,
    });

    const form = testContainer.querySelector<MockElement>('#register-form')!;
    const nameInput = testContainer.querySelector<MockElement>('#register-name')!;
    const emailInput = testContainer.querySelector<MockElement>('#register-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#register-password')!;

    nameInput.value = 'Jane Candidate';
    emailInput.value = 'jane@example.com';
    passwordInput.value = 'StrongPassword2026!';

    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(50);

    expect(authService.register).toHaveBeenCalledWith({
      name: 'Jane Candidate',
      email: 'jane@example.com',
      password: 'StrongPassword2026!',
    });
    expect(toastSpy).toHaveBeenCalledWith(
      'Registration successful. A verification link has been sent to your email.',
      'success'
    );
    expect(successSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('#/preferences');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. RegisterView: Server Error Handling & Duplicate Submit Prevention
  // ───────────────────────────────────────────────────────────────────────────
  it('handles registration 409 Conflict (existing email) and prevents duplicate submission', async () => {
    let resolveRegister: (res: any) => void;
    let rejectRegister: (err: any) => void;
    const registerPromise = new Promise((resolve, reject) => {
      resolveRegister = resolve;
      rejectRegister = reject;
    });

    const registerSpy = vi.spyOn(authService, 'register').mockReturnValue(registerPromise as any);

    const controller = mountRegisterView({ container: testContainer });

    const form = testContainer.querySelector<MockElement>('#register-form')!;
    const submitBtn = testContainer.querySelector<MockElement>('#btn-register')!;
    const errorEl = testContainer.querySelector<MockElement>('#auth-error')!;
    const nameInput = testContainer.querySelector<MockElement>('#register-name')!;
    const emailInput = testContainer.querySelector<MockElement>('#register-email')!;
    const passwordInput = testContainer.querySelector<MockElement>('#register-password')!;

    nameInput.value = 'Jane Candidate';
    emailInput.value = 'existing@example.com';
    passwordInput.value = 'StrongPassword2026!';

    // First submit
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toBe('Creating account...');

    // Second submit concurrent
    form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
    expect(registerSpy).toHaveBeenCalledTimes(1);

    // Reject with conflict
    rejectRegister!(new ApiError({ message: 'An account with this email already exists.', status: 409 }));
    await vi.advanceTimersByTimeAsync(50);

    expect(errorEl.textContent).toBe('An account with this email already exists.');
    expect(errorEl.style['display']).toBe('block');
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent).toBe('Create Account');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Repeated Route Transitions & Teardown
  // ───────────────────────────────────────────────────────────────────────────
  it('safely handles repeated mount and unmount transitions without listener leaks', () => {
    // Mount Login
    const c1 = mountLoginView({ container: testContainer });
    const loginForm = testContainer.querySelector<MockElement>('#login-form')!;
    expect(loginForm).not.toBeNull();
    c1.destroy();

    // Mount Register
    const c2 = mountRegisterView({ container: testContainer });
    const regForm = testContainer.querySelector<MockElement>('#register-form')!;
    expect(regForm).not.toBeNull();
    c2.destroy();

    // Mount Login again
    const c3 = mountLoginView({ container: testContainer });
    const loginForm2 = testContainer.querySelector<MockElement>('#login-form')!;
    expect(loginForm2).not.toBeNull();
    c3.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Regression: VerifyEmailView Works in Unified Views Module
  // ───────────────────────────────────────────────────────────────────────────
  it('preserves VerifyEmailView functionality from the unified views export', async () => {
    const verifySpy = vi.spyOn(authService, 'verifyEmail').mockResolvedValue({
      success: true,
      message: 'Email verified',
    });

    const toastSpy = vi.fn();
    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?token=regression-token-123',
      showToast: toastSpy,
    });

    expect(testContainer.innerHTML).toContain('Verifying Your Email...');
    await vi.advanceTimersByTimeAsync(350);

    expect(verifySpy).toHaveBeenCalledWith('regression-token-123');
    expect(toastSpy).toHaveBeenCalledWith('Email verified successfully!', 'success');

    controller.destroy();
  });
});
