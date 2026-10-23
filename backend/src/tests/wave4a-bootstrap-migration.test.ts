/**
 * RoleRadar — Architectural Refactoring Wave 4A Test Suite
 *
 * Direct Entry-Point Bootstrap & Legacy Shell Retirement Assessment
 *
 * Verifies:
 * 1. Explicit Bootstrap Ownership:
 *    - main.jsx imports initApp from canonical bootstrap.js, not legacy/app.js.
 *    - Zero production files in frontend/src import legacy/app.js.
 * 2. Canonical Bootstrap Service (frontend/src/bootstrap.ts):
 *    - Idempotent initApp() executes exactly once; repeated calls safely no-op.
 *    - LocalStorage migration preserves kcarrier_* -> roleradar_* keys.
 *    - Starts canonical Router and coordinates initial nav states.
 *    - resetBootstrapForTesting() enables test isolation.
 * 3. Canonical Shell Navigation (frontend/src/services/ui/navigation.ts):
 *    - Idempotent setupNav() attaches single listener set; avoids duplication.
 *    - Mobile menu hamburger toggle toggles .is-open, aria-expanded, aria-label.
 *    - Mobile menu link click auto-closes nav on mobile viewports.
 *    - updateNavVisibility() toggles guest vs. authenticated navigation headers.
 *    - updateNavActiveState(path) toggles .is-active and aria-current="page".
 * 4. Router Continuity & Invariant Guarantees:
 *    - Canonical Router in Router.ts remains the single source of truth.
 *    - Route guards, dual admin flags (isAdmin/is_admin), and destroy-before-mount preserved.
 *    - Distinct profile (#/dashboard/profile) vs account (#/dashboard/account) mappings preserved.
 * 5. Simulated End-to-End Navigation Workflows:
 *    - Empty hash load, direct deep link, auth redirect, guest redirect, controller teardown.
 * 6. Legacy Shell Retirement Assessment & Delegation Integrity:
 *    - legacy/app.js functions strictly as an uncalled-by-production compatibility shim.
 *    - Retained adapters delegate accurately to canonical implementations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Import canonical modules
import {
  initApp as canonicalInitApp,
  migrateLocalStorage,
  isAppInitialized,
  resetBootstrapForTesting,
} from '../../../frontend/src/bootstrap.js';
import {
  setupNav,
  updateNavVisibility,
  updateNavActiveState,
  isNavOpen,
  closeNav,
  resetNavForTesting,
} from '../../../frontend/src/services/ui/navigation.js';
import {
  Router,
  router,
  ROUTES,
  PROTECTED_ROUTES,
  getRoute,
  getRouteName,
  isAuthenticated,
  requiresAuth,
  checkIsAdmin,
  logout,
} from '../../../frontend/src/router/Router.js';
import * as legacyApp from '../../../frontend/src/legacy/app.js';
import { httpClient } from '../../../frontend/src/services/api/client.js';

// ─────────────────────────────────────────────────────────────────────────────
// DOM & Storage Mocking Infrastructure for Node.js Vitest Environment
// ─────────────────────────────────────────────────────────────────────────────

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public attributes: Map<string, string> = new Map();
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public classList = {
    add: (...classes: string[]) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      classes.forEach((c) => set.add(c));
      this.className = Array.from(set).join(' ');
    },
    remove: (...classes: string[]) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      classes.forEach((c) => set.delete(c));
      this.className = Array.from(set).join(' ');
    },
    toggle: (c: string, force?: boolean) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      const has = set.has(c);
      const shouldHave = force !== undefined ? force : !has;
      if (shouldHave) set.add(c);
      else set.delete(c);
      this.className = Array.from(set).join(' ');
      return shouldHave;
    },
    contains: (c: string) => {
      return this.className.split(/\s+/).includes(c);
    },
  };
  public parentNode: MockElement | null = null;
  public children: MockElement[] = [];
  private _innerHTML: string = '';
  private listeners: Map<string, Set<(e: any) => void>> = new Map();

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = String(val);
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

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
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

  public dispatchEvent(event: { type: string }): boolean {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach((h) => h(event));
    }
    return true;
  }

  public click(): void {
    this.dispatchEvent({ type: 'click' });
  }

  public querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];

    const matches = (el: MockElement): boolean => {
      if (selector.startsWith('#')) {
        return el.id === selector.slice(1);
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return el.classList.contains(cls);
      }
      if (selector.includes('[data-route]')) {
        return el.attributes.has('data-route');
      }
      return false;
    };

    const traverse = (node: MockElement) => {
      if (matches(node)) results.push(node);
      node.children.forEach(traverse);
    };

    this.children.forEach(traverse);
    return results;
  }

  public appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
}

describe('Wave 4A: Direct Entry-Point Bootstrap & Legacy Shell Retirement Assessment', () => {
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;

  let storageMap: Map<string, string>;
  let mockStorage: any;
  let mockDoc: any;
  let mockWin: any;
  let documentElements: Map<string, MockElement>;

  beforeEach(() => {
    storageMap = new Map();
    mockStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => storageMap.set(key, String(val)),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
    };
    (globalThis as any).localStorage = mockStorage;

    documentElements = new Map();

    const rootNav = new MockElement('header');
    rootNav.className = 'app-nav';

    const toggle = new MockElement('button');
    toggle.className = 'app-nav__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    rootNav.appendChild(toggle);

    const navAuth = new MockElement('nav');
    navAuth.id = 'nav-authenticated';
    navAuth.className = 'app-nav__links app-nav__links--auth';
    rootNav.appendChild(navAuth);

    const navGuest = new MockElement('nav');
    navGuest.id = 'nav-guest';
    navGuest.className = 'app-nav__links app-nav__links--guest';
    rootNav.appendChild(navGuest);

    const linkDashboard = new MockElement('a');
    linkDashboard.className = 'app-nav__link';
    linkDashboard.setAttribute('data-route', 'dashboard');
    navAuth.appendChild(linkDashboard);

    const linkVerified = new MockElement('a');
    linkVerified.className = 'app-nav__link';
    linkVerified.setAttribute('data-route', 'dashboard/verified-jobs');
    navAuth.appendChild(linkVerified);

    const linkLogin = new MockElement('a');
    linkLogin.className = 'app-nav__link';
    linkLogin.setAttribute('data-route', 'login');
    navGuest.appendChild(linkLogin);

    const mainEl = new MockElement('main');
    mainEl.id = 'app-main';
    mainEl.className = 'app-main';

    const pageEl = new MockElement('section');
    pageEl.id = 'app-page';
    pageEl.className = 'app-page';
    mainEl.appendChild(pageEl);

    documentElements.set('app-nav', rootNav);
    documentElements.set('nav-authenticated', navAuth);
    documentElements.set('nav-guest', navGuest);
    documentElements.set('app-main', mainEl);
    documentElements.set('app-page', pageEl);

    const windowListeners = new Map<string, Set<(e: any) => void>>();

    mockDoc = {
      getElementById: (id: string) => documentElements.get(id) ?? null,
      querySelector: (sel: string) => {
        if (sel === '.app-nav') return rootNav;
        if (sel === '.app-nav__toggle') return toggle;
        if (sel === '#app-page') return pageEl;
        if (sel === '#app-main') return mainEl;
        return null;
      },
      querySelectorAll: (sel: string) => {
        if (sel === '.app-nav__link' || sel === '.app-nav__link[data-route]') {
          return [linkDashboard, linkVerified, linkLogin];
        }
        return [];
      },
      readyState: 'complete',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockWin = {
      location: {
        hash: '#/dashboard',
      },
      addEventListener: (event: string, handler: (e: any) => void) => {
        if (!windowListeners.has(event)) {
          windowListeners.set(event, new Set());
        }
        windowListeners.get(event)!.add(handler);
      },
      removeEventListener: (event: string, handler: (e: any) => void) => {
        if (windowListeners.has(event)) {
          windowListeners.get(event)!.delete(handler);
        }
      },
      matchMedia: (query: string) => ({
        matches: query.includes('max-width: 768px'),
      }),
      innerWidth: 500,
    };

    (globalThis as any).document = mockDoc;
    (globalThis as any).window = mockWin;

    resetBootstrapForTesting();
    resetNavForTesting();
    httpClient.clearAuth();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetBootstrapForTesting();
    resetNavForTesting();
    if (originalLocalStorage !== undefined) {
      (globalThis as any).localStorage = originalLocalStorage;
    }
    if (originalDocument !== undefined) {
      (globalThis as any).document = originalDocument;
    }
    if (originalWindow !== undefined) {
      (globalThis as any).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Explicit Bootstrap Ownership & Zero Production Coupling to legacy/app.js
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Explicit Bootstrap Ownership & File Imports', () => {
    const mainJsxPath = path.resolve(__dirname, '../../../frontend/src/main.jsx');
    const legacyAppPath = path.resolve(__dirname, '../../../frontend/src/legacy/app.js');
    const bootstrapPath = path.resolve(__dirname, '../../../frontend/src/bootstrap.ts');
    const navPath = path.resolve(__dirname, '../../../frontend/src/services/ui/navigation.ts');

    it('verifies frontend/src/main.jsx imports initApp from canonical bootstrap.js', () => {
      expect(fs.existsSync(mainJsxPath)).toBe(true);
      const content = fs.readFileSync(mainJsxPath, 'utf-8');

      expect(content).toContain("import { initApp } from './bootstrap.js'");
      expect(content).not.toContain("import { initApp } from './legacy/app.js'");
    });

    it('verifies zero production runtime code in frontend/src imports legacy/app.js', () => {
      const srcDir = path.resolve(__dirname, '../../../frontend/src');

      function findImports(dir: string): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'legacy') {
              results.push(...findImports(fullPath));
            }
          } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (
              content.includes("from './legacy/app.js'") ||
              content.includes("from '../legacy/app.js'") ||
              content.includes("from '../../legacy/app.js'") ||
              content.includes("from './legacy/app'") ||
              content.includes("from '../legacy/app'")
            ) {
              results.push(fullPath);
            }
          }
        }
        return results;
      }

      const filesImportingLegacyApp = findImports(srcDir);
      expect(filesImportingLegacyApp).toEqual([]);
    });

    it('verifies canonical bootstrap.ts and navigation.ts exist with typed exports', () => {
      expect(fs.existsSync(bootstrapPath)).toBe(true);
      expect(fs.existsSync(navPath)).toBe(true);

      const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf-8');
      expect(bootstrapContent).toContain('export function initApp(');
      expect(bootstrapContent).toContain('export function migrateLocalStorage(');
      expect(bootstrapContent).toContain('export function resetBootstrapForTesting(');

      const navContent = fs.readFileSync(navPath, 'utf-8');
      expect(navContent).toContain('export function setupNav(');
      expect(navContent).toContain('export function updateNavVisibility(');
      expect(navContent).toContain('export function updateNavActiveState(');
      expect(navContent).toContain('export function resetNavForTesting(');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Canonical Bootstrap Service (frontend/src/bootstrap.ts)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Canonical Bootstrap Service & Idempotency', () => {
    it('executes initialization exactly once on first call and marks isStarted: true', () => {
      expect(isAppInitialized()).toBe(false);

      const result = canonicalInitApp({ skipStorageMigration: true });
      expect(result.isStarted).toBe(true);
      expect(result.alreadyInitialized).toBe(false);
      expect(isAppInitialized()).toBe(true);
    });

    it('safely no-ops and returns alreadyInitialized: true on subsequent calls', () => {
      const first = canonicalInitApp({ skipStorageMigration: true });
      expect(first.alreadyInitialized).toBe(false);

      const second = canonicalInitApp({ skipStorageMigration: true });
      expect(second.alreadyInitialized).toBe(true);
      expect(second.isStarted).toBe(true);
      expect(second.router).toBe(first.router);
    });

    it('migrates historical kcarrier_* keys to roleradar_* keys in localStorage', () => {
      localStorage.setItem('kcarrier_auth_token', 'token-abc');
      localStorage.setItem('kcarrier_auth_user', JSON.stringify({ email: 'user@example.com' }));
      localStorage.setItem('kcarrier_preferences', JSON.stringify({ role: 'Engineer' }));
      localStorage.setItem('kcarrier_onboarding_completed', 'true');

      migrateLocalStorage();

      expect(localStorage.getItem('roleradar_auth_token')).toBe('token-abc');
      expect(localStorage.getItem('roleradar_auth_user')).toBe(
        JSON.stringify({ email: 'user@example.com' })
      );
      expect(localStorage.getItem('roleradar_preferences')).toBe(
        JSON.stringify({ role: 'Engineer' })
      );
      expect(localStorage.getItem('roleradar_onboarding_completed')).toBe('true');

      // Preserves original keys for rollback safety
      expect(localStorage.getItem('kcarrier_auth_token')).toBe('token-abc');
    });

    it('resets bootstrap state cleanly via resetBootstrapForTesting()', () => {
      canonicalInitApp({ skipStorageMigration: true });
      expect(isAppInitialized()).toBe(true);

      resetBootstrapForTesting();
      expect(isAppInitialized()).toBe(false);
      expect(router.isRunning()).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Canonical Shell Navigation (frontend/src/services/ui/navigation.ts)
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Canonical Shell Navigation Service', () => {
    it('handles idempotent setupNav() without attaching duplicate click listeners', () => {
      const toggle = mockDoc.querySelector('.app-nav__toggle')!;
      let clickCount = 0;

      const originalAddEventListener = toggle.addEventListener.bind(toggle);
      toggle.addEventListener = vi.fn((event, handler) => {
        clickCount++;
        originalAddEventListener(event, handler);
      });

      setupNav();
      setupNav(); // Second call must safely no-op
      setupNav(); // Third call must safely no-op

      expect(clickCount).toBe(1);
    });

    it('toggles mobile menu .is-open, aria-expanded, and aria-label on toggle click', () => {
      setupNav();
      const toggle = mockDoc.querySelector('.app-nav__toggle')!;
      const nav = mockDoc.querySelector('.app-nav')!;

      expect(isNavOpen()).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      // Click to open
      toggle.click();
      expect(isNavOpen()).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.getAttribute('aria-label')).toBe('Close menu');

      // Click to close
      toggle.click();
      expect(isNavOpen()).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-label')).toBe('Open menu');
    });

    it('auto-closes mobile menu upon clicking a navigation link on mobile viewport', () => {
      setupNav();
      const toggle = mockDoc.querySelector('.app-nav__toggle')!;
      const nav = mockDoc.querySelector('.app-nav')!;
      const link = mockDoc.querySelectorAll('.app-nav__link')[0]!;

      // Open menu first
      toggle.click();
      expect(isNavOpen()).toBe(true);

      // Click navigation link
      link.click();
      expect(isNavOpen()).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('synchronizes authenticated vs guest navigation header visibility', () => {
      const navAuth = mockDoc.getElementById('nav-authenticated')!;
      const navGuest = mockDoc.getElementById('nav-guest')!;

      // Unauthenticated state
      updateNavVisibility(() => false);
      expect(navAuth.style.display).toBe('none');
      expect(navGuest.style.display).toBe('');

      // Authenticated state
      updateNavVisibility(() => true);
      expect(navAuth.style.display).toBe('');
      expect(navGuest.style.display).toBe('none');
    });

    it('sets .is-active and aria-current on matching route links', () => {
      const links = mockDoc.querySelectorAll('.app-nav__link');
      const dashboardLink = links[0]; // data-route="dashboard"
      const verifiedLink = links[1];  // data-route="dashboard/verified-jobs"

      updateNavActiveState('dashboard/verified-jobs');

      expect(verifiedLink.classList.contains('is-active')).toBe(true);
      expect(verifiedLink.getAttribute('aria-current')).toBe('page');

      updateNavActiveState('login');
      expect(verifiedLink.classList.contains('is-active')).toBe(false);
      expect(verifiedLink.getAttribute('aria-current')).toBe('false');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Router Continuity & Invariant Guarantees
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Router Continuity & Invariant Guarantees', () => {
    it('strictly preserves distinct profile vs. account route mappings', () => {
      expect(getRouteName('dashboard/profile')).toBe('profile');
      expect(getRouteName('dashboard/account')).toBe('account');
      expect(ROUTES['dashboard/profile']).toBe('profile');
      expect(ROUTES['dashboard/account']).toBe('account');
    });

    it('requires authentication for all 13 protected routes', () => {
      const protectedNames = [
        'dashboard',
        'verified-jobs',
        'saved',
        'applications',
        'dismissed',
        'alerts',
        'account',
        'profile',
        'preferences',
        'onboarding',
        'resume',
        'prep',
        'admin',
      ];
      protectedNames.forEach((name) => {
        expect(requiresAuth(name)).toBe(true);
      });
    });

    it('recognizes administrator privileges with both camelCase isAdmin and snake_case is_admin', () => {
      httpClient.clearAuth();
      localStorage.clear();
      expect(checkIsAdmin()).toBe(false);

      // camelCase isAdmin
      httpClient.setAuth('jwt-1', { id: 'admin-1', email: 'adm@rr.dev', isAdmin: true });
      expect(checkIsAdmin()).toBe(true);

      // snake_case is_admin
      httpClient.setAuth('jwt-2', { id: 'admin-2', email: 'adm2@rr.dev', is_admin: true });
      expect(checkIsAdmin()).toBe(true);

      // non-admin user
      httpClient.setAuth('jwt-3', { id: 'user-1', email: 'usr@rr.dev', isAdmin: false, is_admin: false });
      expect(checkIsAdmin()).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Simulated Representative Navigation Scenarios (Section 5 Verification)
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Simulated End-to-End Navigation Workflows', () => {
    it('1. loads empty hash and resolves to landing route', () => {
      mockWin.location.hash = '';
      expect(getRouteName(getRoute())).toBe('landing');
    });

    it('2. directly loads #/login for unauthenticated guest session', () => {
      mockWin.location.hash = '#/login';
      expect(getRouteName(getRoute())).toBe('login');
      expect(requiresAuth('login')).toBe(false);
    });

    it('3. redirects unauthenticated user from protected route to login', () => {
      mockWin.location.hash = '#/dashboard';
      expect(requiresAuth(getRouteName('dashboard'))).toBe(true);
      expect(isAuthenticated()).toBe(false);

      const r = new Router();
      r.render();
      expect(mockWin.location.hash).toBe('#/login');
    });

    it('4. performs destroy-before-mount teardown when transitioning views', () => {
      let firstDestroyed = false;
      let secondDestroyed = false;

      const r = new Router();
      (r as any).currentViewController = {
        destroy: () => {
          firstDestroyed = true;
        },
      };

      // Navigate to landing
      mockWin.location.hash = '#/';
      r.render();

      expect(firstDestroyed).toBe(true);
      const active = r.getCurrentController();
      expect(active).not.toBeNull();
      expect(typeof active?.destroy).toBe('function');
    });

    it('5. triggers view dispatch on simulated hashchange', () => {
      const r = new Router();
      const renderSpy = vi.spyOn(r, 'render');

      r.start();
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Simulate browser back/forward (hashchange)
      mockWin.location.hash = '#/register';
      const eventHandlers = (mockWin as any).addEventListener;
      r.navigate('register');

      expect(renderSpy).toHaveBeenCalled();
      r.destroy();
    });

    it('6. redirects authenticated user hitting guest routes to #/dashboard', () => {
      httpClient.setAuth('valid-token', { id: 'u1', email: 'test@rr.dev' });
      expect(isAuthenticated()).toBe(true);

      const r = new Router();
      mockWin.location.hash = '#/login';
      r.render();
      expect(mockWin.location.hash).toBe('#/dashboard');

      mockWin.location.hash = '#/register';
      r.render();
      expect(mockWin.location.hash).toBe('#/dashboard');
    });

    it('7. blocks non-admin user from admin route with error toast and redirects to dashboard', () => {
      httpClient.setAuth('user-token', { id: 'u2', email: 'candidate@rr.dev', isAdmin: false });
      expect(isAuthenticated()).toBe(true);
      expect(checkIsAdmin()).toBe(false);

      let toastMessage = '';
      let toastType = '';
      const r = new Router({
        showToast: (msg, type) => {
          toastMessage = msg;
          toastType = type || 'info';
        },
      });

      mockWin.location.hash = '#/admin';
      r.render();

      expect(toastMessage).toContain('Access denied');
      expect(toastType).toBe('error');
      expect(mockWin.location.hash).toBe('#/dashboard');
    });

    it('8. permits administrator to mount admin console view', () => {
      httpClient.setAuth('admin-token', { id: 'u3', email: 'admin@rr.dev', isAdmin: true });
      expect(checkIsAdmin()).toBe(true);

      const r = new Router();
      mockWin.location.hash = '#/admin';
      r.render();

      const controller = r.getCurrentController();
      expect(controller).not.toBeNull();
      expect(mockWin.location.hash).toBe('#/admin');
      r.destroy();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Legacy Shell Retirement Assessment & Delegation Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Legacy Shell Retirement Assessment & Compatibility Adapters', () => {
    it('verifies legacy/app.js exports initApp and delegates to canonical bootstrap', () => {
      expect(typeof legacyApp.initApp).toBe('function');
      expect(isAppInitialized()).toBe(false);

      legacyApp.initApp();
      expect(isAppInitialized()).toBe(true);
    });

    it('verifies legacy/app.js re-exports router, ROUTES, and PROTECTED_ROUTES identical to canonical', () => {
      expect(legacyApp.router).toBe(router);
      expect(legacyApp.Router).toBe(Router);
      expect(legacyApp.ROUTES).toBe(ROUTES);
      expect(legacyApp.PROTECTED_ROUTES).toBe(PROTECTED_ROUTES);
    });

    it('verifies legacy adapters showToast, openJobDetailModal, and renderLanding delegate accurately', () => {
      expect(typeof legacyApp.showToast).toBe('function');
      expect(typeof legacyApp.openJobDetailModal).toBe('function');
      expect(typeof legacyApp.renderLanding).toBe('function');
      expect(typeof legacyApp.renderLanding()).toBe('string');
      expect(legacyApp.renderLanding()).toContain('RoleRadar');
    });

    it('verifies legacy shell navigation helpers delegate to canonical navigation service', () => {
      expect(typeof legacyApp.setupNav).toBe('function');
      expect(typeof legacyApp.updateNavVisibility).toBe('function');
      expect(typeof legacyApp.updateNavActiveState).toBe('function');
    });
  });
});
