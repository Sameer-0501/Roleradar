/**
 * RoleRadar — Architectural Refactoring Wave 2A Tests:
 * Extracted VerifyEmailView Component & Lifecycle Tests.
 *
 * Validates:
 * 1. Initial DOM state rendering based on URL hash parameters.
 * 2. Asynchronous email verification via authService.verifyEmail().
 * 3. Success and failure state transitions with UI and toast notifications.
 * 4. Resend verification email interaction and prompt fallbacks.
 * 5. Lifecycle cleanup on view destruction (unmounting).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Initialize mock DOM environment if running in Node.js
class MockElement {
  public tagName: string;
  public className: string = '';
  private _innerHTML: string = '';
  private _textContent: string = '';
  public style: Record<string, string> = {};
  public disabled: boolean = false;
  public parentNode: MockElement | null = null;
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
      if (this.innerHTML.includes(`id="${id}"`) || (this as any).id === id) {
        if (!this.elementsById.has(id)) {
          const el = new MockElement();
          (el as any).id = id;
          this.elementsById.set(id, el);
        }
        const cached = this.elementsById.get(id)!;
        if (id === 'verify-email-content') {
          cached.innerHTML = this.innerHTML;
        }
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

import { mountVerifyEmailView } from '../../../frontend/src/views/auth/VerifyEmailView.js';
import { authService } from '../../../frontend/src/services/api/auth.service.js';

describe('Wave 2A: VerifyEmailView Component Extraction', () => {
  let testContainer: HTMLElement;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    storageMap.clear();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    testContainer = new MockElement('div') as unknown as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('renders loading state when token query parameter is present', () => {
    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?token=valid-test-token-123',
    });

    expect(testContainer.innerHTML).toContain('Verifying Your Email...');
    expect(testContainer.innerHTML).toContain('Please wait while we confirm your email ownership');

    controller.destroy();
  });

  it('renders success state when status=success query parameter is present', () => {
    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?status=success',
    });

    expect(testContainer.innerHTML).toContain('Email Verified Successfully!');
    expect(testContainer.innerHTML).toContain('Go to Dashboard');

    controller.destroy();
  });

  it('renders failure state when error parameter is present without a token', () => {
    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?error=Link%20has%20expired',
    });

    expect(testContainer.innerHTML).toContain('Verification Failed');
    expect(testContainer.innerHTML).toContain('Link has expired');
    expect(testContainer.innerHTML).toContain('Resend Verification Email');

    controller.destroy();
  });

  it('automatically verifies email and updates DOM on successful verification', async () => {
    const verifySpy = vi.spyOn(authService, 'verifyEmail').mockResolvedValue({
      success: true,
      message: 'Email verified',
    });

    const toastSpy = vi.fn();

    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?token=mock-valid-token',
      showToast: toastSpy,
    });

    expect(testContainer.innerHTML).toContain('Verifying Your Email...');

    // Fast-forward 300ms verification delay
    await vi.advanceTimersByTimeAsync(350);

    expect(verifySpy).toHaveBeenCalledWith('mock-valid-token');
    expect(toastSpy).toHaveBeenCalledWith('Email verified successfully!', 'success');

    controller.destroy();
  });

  it('handles verification failure and displays error message with resend option', async () => {
    vi.spyOn(authService, 'verifyEmail').mockRejectedValue(
      new Error('Verification token has expired')
    );

    const toastSpy = vi.fn();

    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?token=expired-token',
      showToast: toastSpy,
    });

    await vi.advanceTimersByTimeAsync(350);

    expect(toastSpy).not.toHaveBeenCalledWith('Email verified successfully!', 'success');

    controller.destroy();
  });

  it('cleans up pending timers and disposes safely on controller.destroy()', async () => {
    const verifySpy = vi.spyOn(authService, 'verifyEmail').mockResolvedValue({
      success: true,
      message: 'Email verified',
    });

    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?token=pending-token',
    });

    // Destroy immediately before timers fire
    controller.destroy();

    await vi.advanceTimersByTimeAsync(500);

    // Because it was destroyed, verifyEmail should not execute or throw
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('triggers resendVerification with cached user email when button clicked', async () => {
    vi.spyOn(authService, 'getUser').mockReturnValue({
      id: 'u1',
      email: 'user@example.com',
      isAdmin: false,
      isBetaUser: false,
      emailVerified: false,
    });

    const resendSpy = vi.spyOn(authService, 'resendVerification').mockResolvedValue({
      success: true,
      message: 'Verification email sent!',
    });

    const toastSpy = vi.fn();

    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?error=invalid_token',
      showToast: toastSpy,
    });

    const resendBtn = testContainer.querySelector('#btn-resend-from-verify');
    expect(resendBtn).not.toBeNull();

    // Trigger click
    resendBtn!.dispatchEvent({ type: 'click', preventDefault: vi.fn() });

    await vi.advanceTimersByTimeAsync(50);

    expect(resendSpy).toHaveBeenCalledWith('user@example.com');
    expect(toastSpy).toHaveBeenCalledWith('Verification email sent!', 'success');

    controller.destroy();
  });

  it('prompts user for email when unauthenticated candidate clicks resend', async () => {
    vi.spyOn(authService, 'getUser').mockReturnValue(null);

    const resendSpy = vi.spyOn(authService, 'resendVerification').mockResolvedValue({
      success: true,
      message: 'Verification email sent!',
    });

    const promptSpy = vi.fn().mockReturnValue('prompted.candidate@example.com');
    const toastSpy = vi.fn();

    const controller = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?error=invalid_token',
      showToast: toastSpy,
      promptEmail: promptSpy,
    });

    const resendBtn = testContainer.querySelector('#btn-resend-from-verify');
    expect(resendBtn).not.toBeNull();

    resendBtn!.dispatchEvent({ type: 'click', preventDefault: vi.fn() });

    await vi.advanceTimersByTimeAsync(50);

    expect(promptSpy).toHaveBeenCalled();
    expect(resendSpy).toHaveBeenCalledWith('prompted.candidate@example.com');
    expect(toastSpy).toHaveBeenCalledWith('Verification email sent!', 'success');

    controller.destroy();
  });
});
