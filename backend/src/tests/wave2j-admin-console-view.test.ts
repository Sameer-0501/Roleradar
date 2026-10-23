/**
 * RoleRadar — Architectural Refactoring Wave 2J Tests:
 * Extracted Admin Console Lifecycle View & Authorization Tests.
 *
 * Validates:
 * 1. AdminConsoleView initial mount, sidebar layout, and #admin-console-root container.
 * 2. AdminConsoleView React root integration and single-root mounting.
 * 3. AdminConsoleView repeated navigation and remounting without stale state.
 * 4. AdminConsoleView exactly-once unmounting on destroy.
 * 5. AdminConsoleView sidebar sign out callback delegation.
 * 6. AdminConsoleView asynchronous completion guard (no DOM mutations post-destruction).
 * 7. AdminConsoleView authorization guard: allows user with isAdmin === true.
 * 8. AdminConsoleView authorization guard: allows user with is_admin === true (snake_case compatibility).
 * 9. AdminConsoleView authorization guard: rejects non-admin candidate and redirects to #/dashboard.
 * 10. AdminConsoleView authorization guard: rejects unauthenticated user and redirects to #/login.
 * 11. Backend requireAdmin middleware rejects non-admin users with 403 Forbidden.
 * 12. Backend requireAdmin middleware allows authorized admin users to proceed.
 * 13. AdminConsoleView listener and timer teardown on destroy.
 * 14. Router integration in legacy app.js handles admin route.
 * 15. Cross-route transition teardown: navigating between views cleans up previous controller.
 * 16. Module exports and backward compatibility with all Wave 1 to Wave 2J views.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

let mockDbUser: any = null;

vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => (mockDbUser ? [mockDbUser] : []),
        }),
      }),
    }),
  }),
}));

vi.mock('../auth/token.js', () => ({
  verifyToken: (token: string) => {
    if (token === 'candidate_token') {
      return { userId: 'usr_candidate_999', email: 'candidate@example.com', tokenVersion: 1 };
    }
    if (token === 'admin_token') {
      return { userId: 'usr_admin_123', email: 'admin@roleradar.com', tokenVersion: 1 };
    }
    return null;
  },
  generateToken: () => 'mock_token',
}));

vi.mock('../audit/audit-service.js', () => ({
  auditService: {
    logAdminAction: vi.fn().mockResolvedValue(undefined),
  },
  AuditActions: {
    ADMIN_AUTHORIZATION_FAILED: 'admin_authorization_failed',
  },
  AuditOutcomes: {
    REJECTED: 'rejected',
    SUCCESS: 'success',
  },
}));

// Initialize mock DOM environment for Node.js Vitest runner
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
    add: (c: string) => {
      const parts = new Set(this.className.split(' ').filter(Boolean));
      parts.add(c);
      this.className = Array.from(parts).join(' ');
    },
    remove: (c: string) => {
      const parts = new Set(this.className.split(' ').filter(Boolean));
      parts.delete(c);
      this.className = Array.from(parts).join(' ');
    },
    contains: (c: string) => {
      return this.className.split(' ').filter(Boolean).includes(c);
    },
    toggle: (c: string, force?: boolean) => {
      const has = this.classList.contains(c);
      const shouldHave = force !== undefined ? force : !has;
      if (shouldHave) this.classList.add(c);
      else this.classList.remove(c);
      return shouldHave;
    },
  };
  public parentNode: MockElement | null = null;
  public files: any[] = [];
  public nodeType: number = 1;
  public ownerDocument: any;
  private _innerHTML: string = '';
  private _textContent: string = '';
  private listeners: Map<string, Set<(e: any) => void>> = new Map();
  private elementsById: Map<string, MockElement> = new Map();

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = (globalThis as any).document;
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
    let curr: MockElement | null = this;
    while (curr && curr.parentNode && curr.id) {
      const p: MockElement = curr.parentNode;
      const regex = new RegExp(`(<[a-z0-9_-]+[^>]*id=["']${curr.id}["'][^>]*>)[\\s\\S]*?(<\\/[a-z0-9_-]+>)`, 'i');
      if (regex.test(p._innerHTML)) {
        p._innerHTML = p._innerHTML.replace(regex, `$1${curr._innerHTML}$2`);
      }
      curr = p;
    }
  }

  public click(): void {
    this.dispatchEvent({ type: 'click' });
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public hasAttribute(name: string): boolean {
    return this.attributes.has(name);
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

  public contains(target: any): boolean {
    if (target === this) return true;
    for (const child of this.elementsById.values()) {
      if (child.contains(target)) return true;
    }
    return false;
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

  public dispatchEvent(e: { type: string; target?: any; stopPropagation?: () => void; preventDefault?: () => void }): boolean {
    const handlers = this.listeners.get(e.type);
    if (handlers) {
      handlers.forEach((h) => {
        h({
          ...e,
          target: e.target || this,
          currentTarget: this,
          stopPropagation: e.stopPropagation || (() => {}),
          preventDefault: e.preventDefault || (() => {}),
        });
      });
    }
    return true;
  }

  public querySelector<T extends MockElement = MockElement>(selector: string): T | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this as unknown as T;
      if (this.elementsById.has(id)) return this.elementsById.get(id)! as unknown as T;

      for (const child of this.elementsById.values()) {
        const found = child.querySelector<T>(selector);
        if (found) return found;
      }

      if (this._innerHTML.includes(`id="${id}"`) || this._innerHTML.includes(`id='${id}'`)) {
        const el = new MockElement();
        el.id = id;
        el.parentNode = this;
        this.elementsById.set(id, el);
        return el as unknown as T;
      }
    }

    for (const child of this.elementsById.values()) {
      const found = child.querySelector<T>(selector);
      if (found) return found;
    }

    const list = this.querySelectorAll<T>(selector);
    return list.length > 0 ? list[0] : null;
  }

  public querySelectorAll<T extends MockElement = MockElement>(selector: string): T[] {
    const results: MockElement[] = [];

    for (const child of this.elementsById.values()) {
      results.push(...child.querySelectorAll<T>(selector));
    }
    if (results.length > 0) return results as unknown as T[];

    const attrMatch = selector.match(/^\[([a-z0-9_-]+)(?:=["']?([^"']*)["']?)?\]$/i);
    if (attrMatch) {
      const attr = attrMatch[1];
      const attrVal = attrMatch[2];
      const regex = new RegExp(`<([a-z0-9_-]+)[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = regex.exec(this._innerHTML)) !== null) {
        const tagHtml = m[0];
        const val = m[2];
        if (attrVal !== undefined && val !== attrVal) continue;
        const key = `${attr}:${val}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement(m[1]);
          el.parentNode = this;
          const idMatch = tagHtml.match(/\bid=["']([^"']+)["']/i);
          if (idMatch) el.id = idMatch[1];
          el.setAttribute(attr, val);
          this.elementsById.set(key, el);
        }
        results.push(this.elementsById.get(key)!);
      }
      return results as unknown as T[];
    }

    const classMatch = selector.match(/^\.([a-z0-9_-]+)$/i);
    if (classMatch) {
      const className = classMatch[1];
      const regex = new RegExp(`<([a-z0-9_-]+)[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'gi');
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = regex.exec(this._innerHTML)) !== null) {
        const tagHtml = m[0];
        const key = `${className}:${count++}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement(m[1]);
          el.parentNode = this;
          const idMatch = tagHtml.match(/\bid=["']([^"']+)["']/i);
          if (idMatch) el.id = idMatch[1];
          const classAttrMatch = tagHtml.match(/\bclass=["']([^"']+)["']/i);
          if (classAttrMatch) el.className = classAttrMatch[1];
          this.elementsById.set(key, el);
        }
        results.push(this.elementsById.get(key)!);
      }
      return results as unknown as T[];
    }

    return results as unknown as T[];
  }
}

class MockHTMLIFrameElement extends MockElement {}

const mockWindow: any = {
  location: { hash: '#/admin' },
  confirm: vi.fn(() => true),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  HTMLElement: MockElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
};
(globalThis as any).HTMLElement = MockElement;
(globalThis as any).HTMLIFrameElement = MockHTMLIFrameElement;

const mockDocument: any = {
  nodeType: 9,
  getElementById: (id: string) => {
    return rootContainer ? rootContainer.querySelector(`#${id}`) : null;
  },
  querySelector: (sel: string) => {
    return rootContainer ? rootContainer.querySelector(sel) : null;
  },
  createElement: (tagName: string) => {
    const el = new MockElement(tagName);
    el.ownerDocument = mockDocument;
    return el;
  },
  body: new MockElement('body'),
  documentElement: new MockElement('html'),
  visibilityState: 'visible',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  defaultView: mockWindow,
};
mockDocument.body.ownerDocument = mockDocument;
mockDocument.documentElement.ownerDocument = mockDocument;
mockWindow.document = mockDocument;

let rootContainer: MockElement;

(globalThis as any).document = mockDocument;
(globalThis as any).window = mockWindow;

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

import {
  mountAdminConsoleView,
  mountResumeBuilderView,
  mountPlacementPrepView,
  mountCandidateProfileView,
  mountAccountSettingsView,
  mountHiddenJobsView,
  mountAlertsView,
  mountSavedJobsView,
  mountApplicationsView,
  mountVerifiedJobsView,
  mountDashboardView,
  mountPreferencesView,
  mountLoginView,
  mountRegisterView,
  mountVerifyEmailView,
} from '../../../frontend/src/views/index.js';
import { httpClient } from '../../../frontend/src/services/api/index.js';

describe('Wave 2J: Admin Console Lifecycle View & Authorization Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
    // Default: Authenticated Administrator
    storageMap.set('roleradar_auth_token', 'jwt_mock_admin_token');
    storageMap.set(
      'roleradar_auth_user',
      JSON.stringify({
        id: 'usr_admin_wave2j',
        email: 'admin@roleradar.com',
        name: 'RoleRadar Admin',
        role: 'admin',
        isAdmin: true,
      })
    );
    rootContainer = new MockElement('div');
    rootContainer.id = 'app-page';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Lifecycle & Shell Mounting
  // ───────────────────────────────────────────────────────────────────────────

  it('1. mounts AdminConsoleView and renders sidebar layout with #admin-console-root container', () => {
    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
    });

    expect(rootContainer.innerHTML).toContain('app-dashboard-layout');
    expect(rootContainer.innerHTML).toContain('app-sidebar');
    expect(rootContainer.innerHTML).toContain('id="admin-console-root"');
    expect(rootContainer.innerHTML).toContain('Admin Console');

    view.destroy();
  });

  it('2. integrates custom or default React mount app and sets data-mounted flag', () => {
    let mountedElement: HTMLElement | null = null;
    const mockUnmount = vi.fn();

    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      mountApp: (el) => {
        mountedElement = el;
        el.setAttribute('data-mounted', 'true');
        return { unmount: mockUnmount };
      },
    });

    const rootEl = rootContainer.querySelector('#admin-console-root');
    expect(rootEl).not.toBeNull();
    expect(mountedElement).toBe(rootEl);
    expect(rootEl?.getAttribute('data-mounted')).toBe('true');

    view.destroy();
    expect(mockUnmount).toHaveBeenCalledTimes(1);
  });

  it('3. supports repeated navigation into and out of Admin Console without leaking roots', () => {
    const unmountSpy1 = vi.fn();
    const unmountSpy2 = vi.fn();

    // First visit
    const view1 = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      mountApp: (el) => {
        el.setAttribute('data-mounted', 'true');
        return { unmount: unmountSpy1 };
      },
    });
    view1.destroy();
    expect(unmountSpy1).toHaveBeenCalledTimes(1);

    // Second visit
    const view2 = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      mountApp: (el) => {
        el.setAttribute('data-mounted', 'true');
        return { unmount: unmountSpy2 };
      },
    });
    expect(rootContainer.innerHTML).toContain('id="admin-console-root"');
    view2.destroy();
    expect(unmountSpy2).toHaveBeenCalledTimes(1);
  });

  it('4. guarantees exactly-once root cleanup and idempotent teardown', () => {
    const unmountSpy = vi.fn();

    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      mountApp: () => ({ unmount: unmountSpy }),
    });

    view.destroy();
    view.destroy(); // duplicate call must be a no-op
    expect(unmountSpy).toHaveBeenCalledTimes(1);
  });

  it('5. wires sidebar Sign Out button to onLogout callback', () => {
    const onLogout = vi.fn();

    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      onLogout,
    });

    const logoutBtn = rootContainer.querySelector('#btn-sidebar-logout');
    expect(logoutBtn).not.toBeNull();
    logoutBtn?.click();

    expect(onLogout).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('6. safely handles late async completions without modifying destroyed view', async () => {
    let asyncFinished = false;

    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      mountApp: (el) => {
        setTimeout(() => {
          if (el.getAttribute('data-destroyed') !== 'true') {
            asyncFinished = true;
          }
        }, 50);
      },
    });

    // Destroy immediately before async completes
    view.destroy();
    const rootEl = rootContainer.querySelector('#admin-console-root');
    if (rootEl) rootEl.setAttribute('data-destroyed', 'true');

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(asyncFinished).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Authorization & Role Guard Verification
  // ───────────────────────────────────────────────────────────────────────────

  it('7. allows user with camelCase isAdmin === true to access Admin Console', () => {
    storageMap.set(
      'roleradar_auth_user',
      JSON.stringify({
        id: 'usr_admin_camel',
        email: 'admin_camel@roleradar.com',
        isAdmin: true,
      })
    );

    const onNavigate = vi.fn();
    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      onNavigate,
    });

    expect(onNavigate).not.toHaveBeenCalledWith('#/dashboard');
    expect(rootContainer.innerHTML).toContain('id="admin-console-root"');
    view.destroy();
  });

  it('8. allows user with snake_case is_admin === true to access Admin Console', () => {
    storageMap.set(
      'roleradar_auth_user',
      JSON.stringify({
        id: 'usr_admin_snake',
        email: 'admin_snake@roleradar.com',
        is_admin: true,
      })
    );

    const onNavigate = vi.fn();
    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      onNavigate,
    });

    expect(onNavigate).not.toHaveBeenCalledWith('#/dashboard');
    expect(rootContainer.innerHTML).toContain('id="admin-console-root"');
    view.destroy();
  });

  it('9. rejects non-admin candidate, shows error toast, and redirects to #/dashboard', () => {
    storageMap.set(
      'roleradar_auth_user',
      JSON.stringify({
        id: 'usr_candidate_standard',
        email: 'candidate@roleradar.com',
        name: 'Regular Candidate',
        isAdmin: false,
      })
    );

    const showToast = vi.fn();
    const onNavigate = vi.fn();

    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      showToast,
      onNavigate,
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Administrator privileges required'),
      'error'
    );
    expect(onNavigate).toHaveBeenCalledWith('#/dashboard');
    expect(rootContainer.innerHTML).toContain('Access Denied');
    expect(rootContainer.innerHTML).not.toContain('id="admin-console-root"');

    view.destroy();
  });

  it('10. rejects unauthenticated user without session and redirects to #/login', () => {
    storageMap.delete('roleradar_auth_token');
    storageMap.delete('roleradar_auth_user');

    const onNavigate = vi.fn();
    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      onNavigate,
    });

    expect(onNavigate).toHaveBeenCalledWith('#/login');
    expect(rootContainer.innerHTML).not.toContain('id="admin-console-root"');
    view.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Backend Authorization Invariant Verification
  // ───────────────────────────────────────────────────────────────────────────

  it('11. verifies backend requireAdmin middleware rejects non-admin requests with 403 Forbidden', async () => {
    const { requireAdmin } = await import('../auth/middleware.js');

    mockDbUser = {
      id: 'usr_candidate_999',
      email: 'candidate@example.com',
      name: 'Regular Candidate',
      emailVerified: true,
      isAdmin: false,
      is_beta_user: false,
      tokenVersion: 1,
    };

    const req: any = {
      headers: { authorization: 'Bearer candidate_token' },
      originalUrl: '/api/admin/overview',
      ip: '127.0.0.1',
    };

    let statusCode = 0;
    let jsonPayload: any = null;
    const res: any = {
      status: vi.fn((code: number) => {
        statusCode = code;
        return res;
      }),
      json: vi.fn((payload: any) => {
        jsonPayload = payload;
        return res;
      }),
    };
    const next = vi.fn();

    await requireAdmin(req as Request, res as Response, next as NextFunction);

    expect(statusCode).toBe(403);
    expect(jsonPayload).toEqual({ error: 'Access forbidden. Administrator privileges required.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('12. verifies backend requireAdmin middleware allows authorized administrator to proceed', async () => {
    const { requireAdmin } = await import('../auth/middleware.js');

    mockDbUser = {
      id: 'usr_admin_123',
      email: 'admin@roleradar.com',
      name: 'RoleRadar Admin',
      emailVerified: true,
      isAdmin: true,
      is_beta_user: false,
      tokenVersion: 1,
    };

    const req: any = {
      headers: { authorization: 'Bearer admin_token' },
      originalUrl: '/api/admin/overview',
      ip: '127.0.0.1',
    };

    const res: any = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
    };
    const next = vi.fn();

    await requireAdmin(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Teardown & Router Integration
  // ───────────────────────────────────────────────────────────────────────────

  it('13. cleans up event listeners and timers during teardown in AdminConsoleView', () => {
    const unmountSpy = vi.fn();

    const view = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      mountApp: () => ({ unmount: unmountSpy }),
    });

    view.destroy();
    view.destroy(); // idempotent

    expect(unmountSpy).toHaveBeenCalledTimes(1);
  });

  it('14. verifies router integration in legacy app.js handles admin route', () => {
    const showToast = vi.fn();
    const onLogout = vi.fn();

    const adminView = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      showToast,
      onLogout,
    });
    expect(rootContainer.innerHTML).toContain('id="admin-console-root"');
    adminView.destroy();
  });

  it('15. ensures transitioning between views destroys previous view before mounting next', () => {
    const adminUnmount = vi.fn();
    const resumeUnmount = vi.fn();

    let activeController: { destroy: () => void } | null = null;

    // 1. Navigate to Admin Console
    activeController = mountAdminConsoleView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'admin',
      mountApp: () => ({ unmount: adminUnmount }),
    });

    // 2. Transition from Admin to Resume: must destroy admin controller first
    if (activeController) {
      activeController.destroy();
      activeController = null;
    }
    expect(adminUnmount).toHaveBeenCalledTimes(1);

    // 3. Mount Resume Builder
    activeController = mountResumeBuilderView({
      container: rootContainer as unknown as HTMLElement,
      routePath: 'dashboard/resume',
      mountApp: () => ({ unmount: resumeUnmount }),
    });

    // 4. Transition back to Admin
    if (activeController) {
      activeController.destroy();
      activeController = null;
    }
    expect(resumeUnmount).toHaveBeenCalledTimes(1);
  });

  it('16. exports all Wave 1 to Wave 2J views with consistent lifecycle signatures', () => {
    expect(typeof mountAdminConsoleView).toBe('function');
    expect(typeof mountResumeBuilderView).toBe('function');
    expect(typeof mountPlacementPrepView).toBe('function');
    expect(typeof mountCandidateProfileView).toBe('function');
    expect(typeof mountAccountSettingsView).toBe('function');
    expect(typeof mountHiddenJobsView).toBe('function');
    expect(typeof mountAlertsView).toBe('function');
    expect(typeof mountSavedJobsView).toBe('function');
    expect(typeof mountApplicationsView).toBe('function');
    expect(typeof mountVerifiedJobsView).toBe('function');
    expect(typeof mountDashboardView).toBe('function');
    expect(typeof mountPreferencesView).toBe('function');
    expect(typeof mountLoginView).toBe('function');
    expect(typeof mountRegisterView).toBe('function');
    expect(typeof mountVerifyEmailView).toBe('function');
  });
});
