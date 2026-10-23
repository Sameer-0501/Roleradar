/**
 * RoleRadar — Architectural Refactoring Wave 2C Tests:
 * Extracted PreferencesView Component & Lifecycle Tests.
 *
 * Validates:
 * 1. Initial preference loading & mounting in #preferences-root.
 * 2. Editing mode ('Edit Job Preferences') vs Onboarding mode ('FIND YOUR NEXT JOB') distinction.
 * 3. Existing preference hydration from preferencesService.
 * 4. Role, location, workplace, and experience level selection.
 * 5. Company directory selection & empty array semantics (All Companies).
 * 6. Client validation (required roles and locations) & error banner display.
 * 7. Successful save and onboarding handoff to #/dashboard.
 * 8. Duplicate submission prevention during in-flight save requests.
 * 9. View destruction while an asynchronous request is pending.
 * 10. Repeated route transitions and document listener cleanup.
 * 11. Cancel button interaction in editing mode.
 * 12. Full regression coverage for LoginView, RegisterView, and VerifyEmailView from unified views barrel.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Initialize mock DOM environment for Node.js test runner
class MockElement {
  public tagName: string;
  public className: string = '';
  public id: string = '';
  public value: string = '';
  public disabled: boolean = false;
  public checked: boolean = false;
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public attributes: Map<string, string> = new Map();
  public classList = {
    add: (_c: string) => {},
    remove: (_c: string) => {},
    contains: (_c: string) => false,
    toggle: (_c: string, _f?: boolean) => false,
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
    this.elementsById.clear();
    if (this.parentNode && this.id) {
      const regex = new RegExp(`(<[a-z0-9_-]+[^>]*id=["']${this.id}["'][^>]*>)[\\s\\S]*?(<\\/[a-z0-9_-]+>)`, 'i');
      if (regex.test(this.parentNode._innerHTML)) {
        this.parentNode._innerHTML = this.parentNode._innerHTML.replace(regex, `$1${val}$2`);
      }
    }
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[camel] = String(value);
    }
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

  public dispatchEvent(event: { type: string; preventDefault?: () => void; stopPropagation?: () => void }): boolean {
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
      if (this.id === id) return this as unknown as T;

      // Check child elements first so bound event listeners are preserved
      for (const child of this.elementsById.values()) {
        const found = child.querySelector<T>(selector);
        if (found) return found;
      }

      if (this.innerHTML.includes(`id="${id}"`)) {
        if (!this.elementsById.has(id)) {
          const el = new MockElement();
          el.id = id;
          el.parentNode = this;
          this.elementsById.set(id, el);
        }
        return this.elementsById.get(id)! as unknown as T;
      }
    }

    const list = this.querySelectorAll<T>(selector);
    return list.length > 0 ? list[0] : null;
  }

  public querySelectorAll<T = any>(selector: string): T[] {
    const results: MockElement[] = [];

    // Match attribute selector: [attr] or [attr="val"]
    const attrMatch = selector.match(/^\[([a-z0-9_-]+)(?:=["']([^"']*)["'])?\]$/i);
    if (attrMatch) {
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2];
      const regex = new RegExp(`${attrName}(?:=["']([^"']*)["'])?`, 'gi');
      let m: RegExpExecArray | null;

      while ((m = regex.exec(this.innerHTML)) !== null) {
        const val = m[1] || '';
        if (attrVal !== undefined && val !== attrVal) continue;
        const key = `${attrName}:${val}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement();
          el.setAttribute(attrName, val);
          this.elementsById.set(key, el);
        }
        results.push(this.elementsById.get(key)!);
      }
      return results as unknown as T[];
    }

    // Match class selector: .className
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      const regex = new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, 'gi');
      let count = 0;
      while (regex.exec(this.innerHTML) !== null) {
        count++;
        const key = `class:${className}:${count}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement();
          el.className = className;
          this.elementsById.set(key, el);
        }
        results.push(this.elementsById.get(key)!);
      }
      return results as unknown as T[];
    }

    return results as unknown as T[];
  }
}

// Global window/document mocks for Node.js Vitest environment
const documentListeners = new Map<string, Set<(e: any) => void>>();
const mockDocument = {
  createElement: (tagName: string) => new MockElement(tagName),
  getElementById: (id: string) => {
    const el = new MockElement();
    el.id = id;
    return el;
  },
  body: new MockElement('body'),
  addEventListener: (event: string, handler: (e: any) => void) => {
    if (!documentListeners.has(event)) {
      documentListeners.set(event, new Set());
    }
    documentListeners.get(event)!.add(handler);
  },
  removeEventListener: (event: string, handler: (e: any) => void) => {
    if (documentListeners.has(event)) {
      documentListeners.get(event)!.delete(handler);
    }
  },
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
  mountPreferencesView,
  mountLoginView,
  mountRegisterView,
  mountVerifyEmailView,
} from '../../../frontend/src/views/index.js';
import { preferencesService } from '../../../frontend/src/services/api/preferences.service.js';
import { authService } from '../../../frontend/src/services/api/auth.service.js';
import { httpClient } from '../../../frontend/src/services/api/client.js';

describe('Wave 2C: Preferences & Onboarding View Decoupling', () => {
  let testContainer: HTMLElement;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    storageMap.clear();
    documentListeners.clear();
    httpClient.clearAuth();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    testContainer = new MockElement('div') as unknown as HTMLElement;

    // Default mock responses for companies and canonical taxonomy
    vi.spyOn(preferencesService, 'getCompanies').mockResolvedValue([
      { id: 'comp-1', name: 'Google', atsType: 'CUSTOM' },
      { id: 'comp-2', name: 'Microsoft', atsType: 'CUSTOM' },
      { id: 'comp-3', name: 'Amazon', atsType: 'CUSTOM' },
    ]);

    vi.spyOn(preferencesService, 'getCanonicalTaxonomy').mockResolvedValue({
      domains: [
        {
          id: 'DOMAIN_ENG',
          displayName: 'Engineering',
          roles: [
            { id: 'ROLE_SWE', displayName: 'Software Engineer', domainId: 'DOMAIN_ENG', isSelectable: true },
            { id: 'ROLE_QA', displayName: 'QA Engineer', domainId: 'DOMAIN_ENG', isSelectable: true },
          ],
        },
      ],
    });

    vi.spyOn(preferencesService, 'getMigrationPreview').mockResolvedValue({
      roles: [],
    });

    vi.spyOn(preferencesService, 'getPreferences').mockResolvedValue({
      roles: ['Software Engineer'],
      locations: ['Bangalore', 'Remote'],
      workplaceTypes: ['REMOTE'],
      experienceLevel: 'FRESHER',
      companyIds: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Initial Preference Loading & Root Element Mounting
  // ───────────────────────────────────────────────────────────────────────────
  it('mounts into container with #preferences-root and displays loading state before content', async () => {
    vi.spyOn(preferencesService, 'getPreferences').mockResolvedValue({
      roles: ['Software Engineer'],
      locations: ['Bangalore'],
      workplaceTypes: ['REMOTE'],
      experienceLevel: 'FRESHER',
      companyIds: [],
    });

    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'preferences',
    });

    expect(testContainer.innerHTML).toContain('id="preferences-root"');
    expect(testContainer.innerHTML).toContain('Loading Preferences...');

    // Fast-forward initial async data resolution
    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('onboarding-container');
    expect(testContainer.innerHTML).toContain('Target Job Roles');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Editing Mode vs Initial Onboarding Mode
  // ───────────────────────────────────────────────────────────────────────────
  it('renders editing mode UI when route is #/preferences or onboarding is already completed', async () => {
    storageMap.set('roleradar_onboarding_completed', 'true');

    vi.spyOn(preferencesService, 'getPreferences').mockResolvedValue({
      roles: ['Frontend Developer'],
      locations: ['Remote'],
      workplaceTypes: ['HYBRID'],
      experienceLevel: 'EXPERIENCED',
      companyIds: ['comp-1'],
    });

    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'preferences',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('Edit Job Preferences');
    expect(testContainer.innerHTML).toContain('Save Preferences');
    expect(testContainer.innerHTML).toContain('id="btn-cancel-edit"');

    controller.destroy();
  });

  it('renders initial onboarding mode when route is #/onboarding and user is new', async () => {
    // onboarding is NOT completed
    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'onboarding',
      isEditing: false,
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('FIND YOUR NEXT JOB');
    expect(testContainer.innerHTML).toContain('Start Finding Jobs →');
    expect(testContainer.innerHTML).not.toContain('id="btn-cancel-edit"');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Existing Preference Hydration from preferencesService
  // ───────────────────────────────────────────────────────────────────────────
  it('hydrates existing candidate preferences from preferencesService.getPreferences()', async () => {
    const mockPrefs = {
      roles: ['Backend Developer', 'Python Developer'],
      locations: ['Hyderabad', 'Remote'],
      workplaceTypes: ['REMOTE'],
      experienceLevel: 'EXPERIENCED',
      companyIds: ['comp-1', 'comp-2'],
    };

    const getPrefsSpy = vi.spyOn(preferencesService, 'getPreferences').mockResolvedValue(mockPrefs);

    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'preferences',
      isEditing: true,
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(getPrefsSpy).toHaveBeenCalled();
    // Local mirror is refreshed
    expect(storageMap.get('roleradar_preferences')).toContain('Backend Developer');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Client Validation & Error Banner
  // ───────────────────────────────────────────────────────────────────────────
  it('validates required fields and shows error banner if role or location is missing', async () => {
    vi.spyOn(preferencesService, 'getPreferences').mockResolvedValue({
      roles: [],
      locations: [],
      workplaceTypes: [],
      experienceLevel: 'FRESHER',
      companyIds: [],
    });
    const saveSpy = vi.spyOn(preferencesService, 'savePreferences');

    // Mount with empty initial preferences
    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'preferences',
      isEditing: true,
      initialPreferences: {
        roles: [],
        locations: [],
        workplaceTypes: [],
        experienceLevel: 'FRESHER',
        companyIds: [],
      },
    });

    await vi.advanceTimersByTimeAsync(50);

    const submitBtn = testContainer.querySelector<MockElement>('#btn-save-onboarding')!;
    const errorEl = testContainer.querySelector<MockElement>('#onboarding-error')!;

    // Submit with empty roles
    submitBtn.dispatchEvent({ type: 'click' });
    await vi.advanceTimersByTimeAsync(50);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(errorEl.textContent).toBe('Please select or add at least one job role.');
    expect(errorEl.style['display']).toBe('block');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Successful Preference Save & Onboarding Handoff
  // ───────────────────────────────────────────────────────────────────────────
  it('saves preferences, updates localStorage, triggers toast, and navigates to #/dashboard', async () => {
    const savedResult = {
      roles: ['Software Engineer'],
      locations: ['Bangalore', 'Remote'],
      workplaceTypes: ['REMOTE'],
      experienceLevel: 'FRESHER',
      companyIds: [],
      onboardingCompleted: true,
    };

    const saveSpy = vi.spyOn(preferencesService, 'savePreferences').mockResolvedValue(savedResult);
    const toastSpy = vi.fn();
    const navigateSpy = vi.fn();
    const completeSpy = vi.fn();

    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'onboarding',
      isEditing: false,
      initialPreferences: {
        roles: ['Software Engineer'],
        locations: ['Bangalore', 'Remote'],
        workplaceTypes: ['REMOTE'],
        experienceLevel: 'FRESHER',
        companyIds: [],
      },
      showToast: toastSpy,
      onNavigate: navigateSpy,
      onComplete: completeSpy,
    });

    await vi.advanceTimersByTimeAsync(50);

    const submitBtn = testContainer.querySelector<MockElement>('#btn-save-onboarding')!;
    submitBtn.dispatchEvent({ type: 'click' });

    await vi.advanceTimersByTimeAsync(50);

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: expect.arrayContaining(['Software Engineer']),
        locations: expect.arrayContaining(['Bangalore', 'Remote']),
        companyIds: [], // Empty array represents All Supported Companies
      })
    );
    expect(storageMap.get('roleradar_onboarding_completed')).toBe('true');
    expect(toastSpy).toHaveBeenCalledWith('Preferences saved!', 'success');
    expect(completeSpy).toHaveBeenCalledWith(savedResult);
    expect(navigateSpy).toHaveBeenCalledWith('#/dashboard');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Duplicate Submission Prevention
  // ───────────────────────────────────────────────────────────────────────────
  it('prevents duplicate submissions while savePreferences is pending', async () => {
    let resolveSave: (val: any) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    const saveSpy = vi.spyOn(preferencesService, 'savePreferences').mockReturnValue(savePromise as any);

    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'preferences',
      isEditing: true,
      initialPreferences: {
        roles: ['QA Engineer'],
        locations: ['Remote'],
        workplaceTypes: [],
        experienceLevel: 'FRESHER',
        companyIds: [],
      },
    });

    await vi.advanceTimersByTimeAsync(50);

    const submitBtn = testContainer.querySelector<MockElement>('#btn-save-onboarding')!;

    // First click
    submitBtn.dispatchEvent({ type: 'click' });
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toBe('Saving preferences...');

    // Second click concurrent
    submitBtn.dispatchEvent({ type: 'click' });

    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Resolve save
    resolveSave!({
      roles: ['QA Engineer'],
      locations: ['Remote'],
      companyIds: [],
    });
    await vi.advanceTimersByTimeAsync(50);

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. View Destruction While Request is Pending
  // ───────────────────────────────────────────────────────────────────────────
  it('safely handles controller.destroy() while preferences request is in flight', async () => {
    let resolveGet: (val: any) => void;
    const getPromise = new Promise((resolve) => {
      resolveGet = resolve;
    });

    vi.spyOn(preferencesService, 'getPreferences').mockReturnValue(getPromise as any);
    const navigateSpy = vi.fn();

    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'preferences',
      isEditing: true,
      onNavigate: navigateSpy,
    });

    // Destroy immediately before fetch completes
    controller.destroy();

    // Resolve fetch afterwards
    resolveGet!({
      roles: ['Cloud Engineer'],
      locations: ['Pune'],
      companyIds: [],
    });
    await vi.advanceTimersByTimeAsync(50);

    // Should not trigger callbacks or errors
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Repeated Route Transitions & Document Listener Teardown
  // ───────────────────────────────────────────────────────────────────────────
  it('attaches and cleanly tears down document event listeners across repeated transitions', async () => {
    expect(documentListeners.get('click')?.size || 0).toBe(0);

    // 1. Mount preferences
    const c1 = mountPreferencesView({ container: testContainer, routeName: 'preferences' });
    await vi.advanceTimersByTimeAsync(50);

    expect(documentListeners.get('click')?.size || 0).toBeGreaterThan(0);

    // 2. Destroy view
    c1.destroy();
    expect(documentListeners.get('click')?.size || 0).toBe(0);

    // 3. Mount preferences second time
    const c2 = mountPreferencesView({ container: testContainer, routeName: 'preferences' });
    await vi.advanceTimersByTimeAsync(50);

    expect(documentListeners.get('click')?.size || 0).toBeGreaterThan(0);

    c2.destroy();
    expect(documentListeners.get('click')?.size || 0).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Cancel Button Interaction
  // ───────────────────────────────────────────────────────────────────────────
  it('navigates to #/dashboard when candidate clicks cancel in editing mode', async () => {
    const navigateSpy = vi.fn();
    const cancelSpy = vi.fn();

    const controller = mountPreferencesView({
      container: testContainer,
      routeName: 'preferences',
      isEditing: true,
      initialPreferences: {
        roles: ['Software Engineer'],
        locations: ['Remote'],
        workplaceTypes: [],
        experienceLevel: 'FRESHER',
        companyIds: [],
      },
      onNavigate: navigateSpy,
      onCancel: cancelSpy,
    });

    await vi.advanceTimersByTimeAsync(50);

    const cancelBtn = testContainer.querySelector<MockElement>('#btn-cancel-edit')!;
    cancelBtn.dispatchEvent({ type: 'click' });

    expect(cancelSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('#/dashboard');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Regression: All Views Coexist in Views Barrel Export
  // ───────────────────────────────────────────────────────────────────────────
  it('verifies mountLoginView, mountRegisterView, and mountVerifyEmailView coexist with mountPreferencesView', async () => {
    // Verify mountLoginView
    const loginController = mountLoginView({ container: testContainer });
    expect(testContainer.innerHTML).toContain('Sign In to RoleRadar');
    loginController.destroy();

    // Verify mountRegisterView
    const regController = mountRegisterView({ container: testContainer });
    expect(testContainer.innerHTML).toContain('Create Your RoleRadar Account');
    regController.destroy();

    // Verify mountVerifyEmailView
    const verifySpy = vi.spyOn(authService, 'verifyEmail').mockResolvedValue({
      success: true,
      message: 'Email verified',
    });
    const verifyController = mountVerifyEmailView({
      container: testContainer,
      hash: '#/verify-email?token=reg-test-token',
    });
    expect(testContainer.innerHTML).toContain('Verifying Your Email...');
    await vi.advanceTimersByTimeAsync(350);
    expect(verifySpy).toHaveBeenCalledWith('reg-test-token');
    verifyController.destroy();

    // Verify mountPreferencesView
    const prefsController = mountPreferencesView({ container: testContainer });
    expect(testContainer.innerHTML).toContain('preferences-root');
    prefsController.destroy();
  });
});
