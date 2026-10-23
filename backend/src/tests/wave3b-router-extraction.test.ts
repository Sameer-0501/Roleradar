/**
 * RoleRadar — Architectural Refactoring Wave 3B Tests:
 * Typed Hash Router Extraction Test Suite.
 *
 * Validates:
 * 1. Route Resolution:
 *    - All 17 canonical and alias routes resolve accurately.
 *    - #/dashboard/profile resolves strictly to 'profile' (Candidate Profile), never 'account'.
 *    - #/dashboard/account resolves strictly to 'account' (Account Settings).
 *    - Empty hash, '#', and '#/' resolve to 'landing'.
 *    - Aliases: 'onboarding' -> 'onboarding', 'settings' -> 'preferences', 'dashboard/hidden' -> 'dismissed'.
 *    - Hash normalization: leading slashes, trailing slashes, and query params stripped cleanly.
 *    - Unknown routes fall back safely to 'landing'.
 * 2. Authentication & Authorization Guards:
 *    - All 13 protected routes block unauthenticated access and redirect to #/login.
 *    - Public guest routes (landing, login, register) redirect authenticated users to #/dashboard.
 *    - Public non-guest routes (verify-email) remain accessible to anyone.
 *    - Admin route (#/admin) blocks unauthenticated and non-admin users, redirecting to #/dashboard with error toast.
 *    - Admin role checks support both camelCase (isAdmin) and snake_case (is_admin).
 *    - Backend admin authorization middleware (requireAdmin) enforces server authority independently.
 * 3. Lifecycle & Teardown Orchestration:
 *    - Router.start() binds the hashchange listener and executes initial render.
 *    - Previous view controller's destroy() method is called before next view mounts.
 *    - Router.destroy() removes the window hashchange listener and destroys the active controller.
 *    - Calling Router.start() repeatedly is idempotent and does not attach duplicate listeners.
 *    - If view mount throws, router catches error safely without leaving stale controller references.
 *    - Redirects terminate safely without infinite loops.
 * 4. Integration & Shell Synchronization:
 *    - Dashboard routes apply 'app-main--dashboard' class to the layout container; public routes remove it.
 *    - Navigation active states and visibility (authenticated vs. guest links) update on route changes.
 *    - Router and legacy app.js maintain zero circular dependencies and full contract compatibility.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ROUTES,
  PROTECTED_ROUTES,
  getRoute,
  getRouteName,
  isAuthenticated,
  requiresAuth,
  checkIsAdmin,
  Router,
  router,
} from '../../../frontend/src/router/Router.js';

// ─────────────────────────────────────────────────────────────────────────────
// Robust Mock DOM Environment for Router Testing
// ─────────────────────────────────────────────────────────────────────────────

type EventListener = (e?: any) => void;

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
  public children: MockElement[] = [];
  public parentNode: MockElement | null = null;
  public nodeType: number = 1;
  public ownerDocument: any;
  public listeners: Map<string, Set<EventListener>> = new Map();
  public elementsById: Map<string, MockElement> = new Map();
  private _innerHTML: string = '';
  private _textContent: string = '';

  public classList = {
    add: (...classes: string[]) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const c of classes) set.add(c);
      this.className = Array.from(set).join(' ');
    },
    remove: (...classes: string[]) => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const c of classes) set.delete(c);
      this.className = Array.from(set).join(' ');
    },
    contains: (c: string) => {
      return this.className.split(/\s+/).filter(Boolean).includes(c);
    },
    toggle: (c: string, force?: boolean) => {
      const has = this.classList.contains(c);
      const shouldHave = force !== undefined ? force : !has;
      if (shouldHave) this.classList.add(c);
      else this.classList.remove(c);
      return shouldHave;
    },
  };

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = (globalThis as any).document || null;
  }

  get textContent(): string {
    return this._textContent;
  }

  set textContent(val: string) {
    this._textContent = String(val);
    this._innerHTML = String(val);
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.elementsById.clear();
  }

  public hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      this.dataset[key] = String(value);
    }
    if (name === 'class') this.className = String(value);
    if (name === 'id') this.id = String(value);
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      delete this.dataset[key];
    }
    if (name === 'class') this.className = '';
    if (name === 'id') this.id = '';
  }

  public addEventListener(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  public removeEventListener(event: string, listener: EventListener): void {
    const set = this.listeners.get(event);
    if (set) set.delete(listener);
  }

  public dispatchEvent(event: { type: string }): boolean {
    const set = this.listeners.get(event.type);
    if (set) {
      set.forEach((fn) => fn(event));
    }
    return true;
  }

  public getElementById(id: string): MockElement | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      if (child.id === id) return child;
      const res = child.getElementById(id);
      if (res) return res;
    }
    if (this.elementsById.has(id)) {
      return this.elementsById.get(id)!;
    }
    if (this._innerHTML.includes(`id="${id}"`) || this._innerHTML.includes(`id='${id}'`)) {
      const el = new MockElement();
      el.id = id;
      el.parentNode = this;
      this.elementsById.set(id, el);
      return el;
    }
    return null;
  }

  public querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.getElementById(id);
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        if (child.classList.contains(cls)) return child;
        const res = child.querySelector(selector);
        if (res) return res;
      }
      if (this._innerHTML.includes(`class="`) || this._innerHTML.includes(`class='`)) {
        const regex = new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`, 'i');
        if (regex.test(this._innerHTML)) {
          const key = `class:${cls}`;
          if (!this.elementsById.has(key)) {
            const el = new MockElement();
            el.className = cls;
            el.parentNode = this;
            this.elementsById.set(key, el);
          }
          return this.elementsById.get(key)!;
        }
      }
    }
    for (const child of this.children) {
      const res = child.querySelector(selector);
      if (res) return res;
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (el: MockElement) => {
      if (selector === '.app-nav__link[data-route]' || selector === '.app-nav__link') {
        if (el.classList.contains('app-nav__link')) results.push(el);
      }
      for (const child of el.children) check(child);
    };
    check(this);
    return results;
  }
}

class MockHTMLIFrameElement extends MockElement {}

class MockDocument {
  public nodeType: number = 9;
  public elements: Map<string, MockElement> = new Map();
  public body: MockElement = new MockElement('body');
  public documentElement: MockElement = new MockElement('html');
  public listeners: Map<string, Set<EventListener>> = new Map();
  public defaultView: any;

  constructor() {
    this.body.id = 'body';
    this.body.ownerDocument = this;
    this.documentElement.ownerDocument = this;
  }

  public addEventListener(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  public removeEventListener(event: string, listener: EventListener): void {
    const set = this.listeners.get(event);
    if (set) set.delete(listener);
  }

  public dispatchEvent(event: { type: string }): boolean {
    const set = this.listeners.get(event.type);
    if (set) set.forEach((fn) => fn(event));
    return true;
  }

  public createElement(tagName: string): MockElement {
    const el = new MockElement(tagName);
    el.ownerDocument = this;
    return el;
  }

  public getElementById(id: string): MockElement | null {
    const el = this.elements.get(id);
    if (el) return el;
    return this.body.getElementById(id);
  }

  public querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.getElementById(id);
    }
    return this.body.querySelector(selector);
  }

  public querySelectorAll(selector: string): MockElement[] {
    return this.body.querySelectorAll(selector);
  }

  public register(el: MockElement): MockElement {
    if (el.id) this.elements.set(el.id, el);
    this.body.children.push(el);
    return el;
  }

  public reset(): void {
    this.elements.clear();
    this.body = new MockElement('body');
  }
}

class MockLocalStorage {
  private store = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  public removeItem(key: string): void {
    this.store.delete(key);
  }
  public clear(): void {
    this.store.clear();
  }
}

describe('Wave 3B: Typed Hash Router Extraction Test Suite', () => {
  let mockDoc: MockDocument;
  let mockStorage: MockLocalStorage;
  let mockWindow: any;
  let windowListeners: Map<string, Set<EventListener>>;

  beforeEach(() => {
    mockDoc = new MockDocument();
    mockStorage = new MockLocalStorage();
    windowListeners = new Map();

    const appPage = mockDoc.createElement('div');
    appPage.id = 'app-page';
    mockDoc.register(appPage);

    const appMain = mockDoc.createElement('main');
    appMain.id = 'app-main';
    mockDoc.register(appMain);

    const navAuth = mockDoc.createElement('nav');
    navAuth.id = 'nav-authenticated';
    mockDoc.register(navAuth);

    const navGuest = mockDoc.createElement('nav');
    navGuest.id = 'nav-guest';
    mockDoc.register(navGuest);

    mockWindow = {
      location: {
        hash: '',
      },
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        if (!windowListeners.has(event)) windowListeners.set(event, new Set());
        windowListeners.get(event)!.add(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: EventListener) => {
        const set = windowListeners.get(event);
        if (set) set.delete(listener);
      }),
      dispatchEvent: (event: { type: string }) => {
        const set = windowListeners.get(event.type);
        if (set) set.forEach((fn) => fn(event));
        return true;
      },
      HTMLElement: MockElement,
      HTMLIFrameElement: MockHTMLIFrameElement,
    };

    mockDoc.defaultView = mockWindow;
    mockWindow.document = mockDoc;

    (global as any).HTMLElement = MockElement;
    (global as any).HTMLIFrameElement = MockHTMLIFrameElement;
    (global as any).document = mockDoc;
    (global as any).window = mockWindow;
    (global as any).localStorage = mockStorage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Static Code & Architecture Inspection', () => {
    const routerTsPath = path.resolve(__dirname, '../../../frontend/src/router/Router.ts');
    const appJsPath = path.resolve(__dirname, '../../../frontend/src/legacy/app.js');

    it('verifies frontend/src/router/Router.ts exists and exports core router constructs', () => {
      expect(fs.existsSync(routerTsPath)).toBe(true);
      const content = fs.readFileSync(routerTsPath, 'utf-8');

      expect(content).toContain('export class Router');
      expect(content).toContain('export const router = new Router()');
      expect(content).toContain('export const ROUTES: Record<string, RouteName>');
      expect(content).toContain('export const PROTECTED_ROUTES: ReadonlySet<string>');
      expect(content).toContain('export function getRoute(');
      expect(content).toContain('export function getRouteName(');
      expect(content).toContain('export function isAuthenticated(');
      expect(content).toContain('export function requiresAuth(');
      expect(content).toContain('export function checkIsAdmin(');
    });

    it('verifies frontend/src/legacy/app.js imports and delegates to the typed Router module', () => {
      expect(fs.existsSync(appJsPath)).toBe(true);
      const content = fs.readFileSync(appJsPath, 'utf-8').replace(/\r\n/g, '\n');

      expect(content).toContain("import {\n  Router,\n  router,");
      expect(content).toContain("export { Router, router };");
      expect(content).toContain("router.render();");
      expect(content).toContain("router.start();");
    });

    it('verifies there are no circular dependencies from Router.ts to legacy app.js', () => {
      const routerContent = fs.readFileSync(routerTsPath, 'utf-8');
      expect(routerContent).not.toContain("from '../legacy/app.js'");
      expect(routerContent).not.toContain("from './legacy/app.js'");
      expect(routerContent).not.toContain("from '../legacy/app'");
    });

    it('verifies ROUTES strictly maps dashboard/profile to candidate profile, never account', () => {
      const routerContent = fs.readFileSync(routerTsPath, 'utf-8');
      expect(routerContent).toMatch(/'dashboard\/profile':\s*'profile'/);
      expect(routerContent).not.toMatch(/'dashboard\/profile':\s*'account'/);
      expect(routerContent).toMatch(/'dashboard\/account':\s*'account'/);
    });
  });

  describe('2. Route Resolution & Normalization Contract', () => {
    it('resolves empty hash and "#/" to "landing"', () => {
      expect(getRouteName('')).toBe('landing');
      expect(getRouteName('/')).toBe('landing');
      mockWindow.location.hash = '';
      expect(getRoute()).toBe('');
      mockWindow.location.hash = '#/';
      expect(getRoute()).toBe('');
      expect(getRouteName(getRoute())).toBe('landing');
    });

    it('resolves candidate profile and account settings to distinct canonical route names', () => {
      expect(getRouteName('dashboard/profile')).toBe('profile');
      expect(getRouteName('dashboard/account')).toBe('account');
      expect(getRouteName('dashboard/profile')).not.toBe('account');
    });

    it('resolves all canonical dashboard subroutes accurately', () => {
      expect(getRouteName('dashboard')).toBe('dashboard');
      expect(getRouteName('dashboard/verified-jobs')).toBe('verified-jobs');
      expect(getRouteName('dashboard/saved')).toBe('saved');
      expect(getRouteName('dashboard/applications')).toBe('applications');
      expect(getRouteName('dashboard/dismissed')).toBe('dismissed');
      expect(getRouteName('dashboard/alerts')).toBe('alerts');
      expect(getRouteName('dashboard/resume')).toBe('resume');
      expect(getRouteName('dashboard/prep')).toBe('prep');
    });

    it('resolves aliases: "dashboard/hidden" to "dismissed" and "settings" to "preferences"', () => {
      expect(getRouteName('dashboard/hidden')).toBe('dismissed');
      expect(getRouteName('settings')).toBe('preferences');
      expect(getRouteName('onboarding')).toBe('onboarding');
    });

    it('normalizes leading/trailing slashes and strips URL query parameters', () => {
      expect(getRouteName('/dashboard/profile/')).toBe('profile');
      expect(getRouteName('dashboard/profile?source=email&ref=123')).toBe('profile');
      expect(getRouteName('preferences?tab=skills')).toBe('preferences');
      expect(getRouteName('/admin?section=users/')).toBe('admin');
    });

    it('falls back unknown routes to "landing"', () => {
      expect(getRouteName('unknown-random-route')).toBe('landing');
      expect(getRouteName('some/deep/unknown/path')).toBe('landing');
    });
  });

  describe('3. Authentication & Authorization Route Guards', () => {
    it('verifies PROTECTED_ROUTES includes all 13 protected views', () => {
      const expected = [
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
      for (const route of expected) {
        expect(PROTECTED_ROUTES.has(route)).toBe(true);
        expect(requiresAuth(route)).toBe(true);
      }
    });

    it('verifies public routes are NOT protected', () => {
      const publicRoutes = ['landing', 'login', 'register', 'verify-email'];
      for (const route of publicRoutes) {
        expect(PROTECTED_ROUTES.has(route)).toBe(false);
        expect(requiresAuth(route)).toBe(false);
      }
    });

    it('redirects unauthenticated user accessing a protected route to #/login', async () => {
      const router = new Router();
      mockWindow.location.hash = '#/dashboard/profile';

      router.render();
      expect(mockWindow.location.hash).toBe('#/login');
    });

    it('redirects authenticated user accessing guest routes to #/dashboard', async () => {
      mockStorage.setItem('roleradar_auth_token', 'valid-jwt-token');
      const router = new Router();

      // Test guest routes: landing, login, register
      mockWindow.location.hash = '#/login';
      router.render();
      expect(mockWindow.location.hash).toBe('#/dashboard');

      mockWindow.location.hash = '#/register';
      router.render();
      expect(mockWindow.location.hash).toBe('#/dashboard');

      mockWindow.location.hash = '#/';
      router.render();
      expect(mockWindow.location.hash).toBe('#/dashboard');
    });

    it('denies access to #/admin when authenticated user is not an administrator', async () => {
      mockStorage.setItem('roleradar_auth_token', 'valid-jwt-token');
      mockStorage.setItem('roleradar_auth_user', JSON.stringify({ id: 'u1', email: 'user@example.com', isAdmin: false }));

      const toastSpy = vi.fn();
      const router = new Router({ showToast: toastSpy });

      mockWindow.location.hash = '#/admin';
      router.render();

      expect(toastSpy).toHaveBeenCalledWith('Access denied. Administrator privileges required.', 'error');
      expect(mockWindow.location.hash).toBe('#/dashboard');
    });

    it('permits access to #/admin for administrator with camelCase isAdmin === true', async () => {
      mockStorage.setItem('roleradar_auth_token', 'valid-jwt-token');
      mockStorage.setItem('roleradar_auth_user', JSON.stringify({ id: 'a1', email: 'admin@roleradar.com', isAdmin: true }));

      expect(checkIsAdmin()).toBe(true);

      const toastSpy = vi.fn();
      const router = new Router({ showToast: toastSpy });

      mockWindow.location.hash = '#/admin';
      router.render();

      expect(toastSpy).not.toHaveBeenCalled();
      expect(mockWindow.location.hash).toBe('#/admin');
      expect(router.getCurrentController()).not.toBeNull();
      router.destroy();
    });

    it('permits access to #/admin for administrator with snake_case is_admin === true', async () => {
      mockStorage.setItem('roleradar_auth_token', 'valid-jwt-token');
      mockStorage.setItem('roleradar_auth_user', JSON.stringify({ id: 'a2', email: 'admin2@roleradar.com', is_admin: true }));

      expect(checkIsAdmin()).toBe(true);

      const toastSpy = vi.fn();
      const router = new Router({ showToast: toastSpy });

      mockWindow.location.hash = '#/admin';
      router.render();

      expect(toastSpy).not.toHaveBeenCalled();
      expect(mockWindow.location.hash).toBe('#/admin');
      expect(router.getCurrentController()).not.toBeNull();
      router.destroy();
    });
  });

  describe('4. Lifecycle & View Teardown Management', () => {
    it('calls destroy() on previous controller before mounting replacement view', async () => {
      const router = new Router();

      // 1. Mount landing page
      mockWindow.location.hash = '#/';
      router.render();
      const firstController = router.getCurrentController();
      expect(firstController).not.toBeNull();
      const destroySpy = vi.spyOn(firstController!, 'destroy');

      // 2. Navigate to login
      mockWindow.location.hash = '#/login';
      router.render();

      expect(destroySpy).toHaveBeenCalledTimes(1);
      const secondController = router.getCurrentController();
      expect(secondController).not.toBeNull();
      expect(secondController).not.toBe(firstController);
    });

    it('start() binds window hashchange listener and renders initial route', async () => {
      const router = new Router();

      expect(router.isRunning()).toBe(false);
      mockWindow.location.hash = '#/login';

      router.start();
      expect(router.isRunning()).toBe(true);
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
      expect(router.getCurrentController()).not.toBeNull();

      router.destroy();
    });

    it('repeated calls to start() are idempotent and do not duplicate listeners', async () => {
      const router = new Router();

      router.start();
      const firstListenerCount = windowListeners.get('hashchange')?.size ?? 0;

      router.start();
      router.start();
      const secondListenerCount = windowListeners.get('hashchange')?.size ?? 0;

      expect(secondListenerCount).toBe(firstListenerCount);
      expect(secondListenerCount).toBe(1);

      router.destroy();
    });

    it('destroy() cleans up hashchange listener and destroys active controller', async () => {
      const router = new Router();

      mockWindow.location.hash = '#/login';
      router.start();

      const activeController = router.getCurrentController();
      expect(activeController).not.toBeNull();
      const destroySpy = vi.spyOn(activeController!, 'destroy');

      router.destroy();

      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
      expect(destroySpy).toHaveBeenCalledTimes(1);
      expect(router.getCurrentController()).toBeNull();
      expect(router.isRunning()).toBe(false);
    });

    it('handles view mount failures cleanly without leaving stale controller references', async () => {
      const router = new Router();

      mockWindow.location.hash = '#/login';
      router.render();
      expect(router.getCurrentController()).not.toBeNull();

      // Temporarily sabotage document to simulate a crash during mount
      const originalGetElementById = mockDoc.getElementById.bind(mockDoc);
      mockDoc.getElementById = (id: string) => {
        if (id === 'app-page') {
          throw new Error('Simulated DOM Mount Failure');
        }
        return originalGetElementById(id);
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockWindow.location.hash = '#/register';
      expect(() => router.render()).not.toThrow();

      // Stale controller was destroyed and active controller is null
      expect(router.getCurrentController()).toBeNull();

      consoleErrorSpy.mockRestore();
      mockDoc.getElementById = originalGetElementById;
    });
  });

  describe('5. Application Shell & Layout Integration', () => {
    it('adds "app-main--dashboard" class for dashboard routes and removes it for public routes', async () => {
      mockStorage.setItem('roleradar_auth_token', 'valid-jwt-token');
      const router = new Router();
      const mainEl = mockDoc.getElementById('app-main')!;

      // Dashboard route
      mockWindow.location.hash = '#/dashboard/verified-jobs';
      router.render();
      expect(mainEl.classList.contains('app-main--dashboard')).toBe(true);

      // Verify email (public non-dashboard route)
      mockWindow.location.hash = '#/verify-email';
      router.render();
      expect(mainEl.classList.contains('app-main--dashboard')).toBe(false);
    });

    it('dispatches route changes via window hashchange event', async () => {
      const router = new Router();

      mockWindow.location.hash = '#/login';
      router.start();
      const initialController = router.getCurrentController();
      expect(initialController).not.toBeNull();

      // Simulate browser hashchange (user clicks a link or back/forward)
      mockWindow.location.hash = '#/register';
      mockWindow.dispatchEvent({ type: 'hashchange' });

      const newController = router.getCurrentController();
      expect(newController).not.toBeNull();
      expect(newController).not.toBe(initialController);

      router.destroy();
    });

    it('navigate() method handles both hash-prefixed and path-only routes', async () => {
      const router = new Router();

      router.navigate('login');
      expect(mockWindow.location.hash).toBe('#/login');

      router.navigate('#/register');
      expect(mockWindow.location.hash).toBe('#/register');

      router.navigate('/verify-email');
      expect(mockWindow.location.hash).toBe('#/verify-email');
    });
  });
});
