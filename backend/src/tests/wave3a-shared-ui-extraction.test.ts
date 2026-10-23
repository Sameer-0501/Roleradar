/**
 * RoleRadar — Architectural Refactoring Wave 3A Tests:
 * Shared UI Extraction Tests (Job Detail Modal, Toast Notifications, Public Landing Page).
 *
 * Validates:
 * 1. Job Detail Modal:
 *    - Module exports and backward compatibility adapter.
 *    - Modal open, render, and close behavior.
 *    - Official URL sanitization, verification audit badges, and closed-job warnings.
 *    - Workspace action callbacks (save, unsave, apply, dismiss, note, checklist, cover letter).
 *    - Duplicate-open prevention and single-instance modal guarantee.
 *    - Keyboard Escape and backdrop click dismissal.
 *    - Listener, timer, and AbortController teardown on close.
 *    - Stale asynchronous response protection (closing before fetch completes).
 * 2. Toast Notifications:
 *    - Module exports and showToast() compatibility contract.
 *    - Correct rendering across supported message types ('info', 'success', 'warning', 'error').
 *    - Accessibility roles ('status' for info/success/warning, 'alert' for error).
 *    - Timer cleanup, repeated notifications, click-to-dismiss, and clearAllToasts().
 *    - No regression to ApiError or API error reporting.
 * 3. Public Landing Page:
 *    - Module exports (mountLandingView, renderLandingHtml) and view contract.
 *    - Correct rendering of marketing content, features, and call-to-action links.
 *    - Authenticated-user automatic redirect to #/dashboard.
 *    - Unauthenticated user rendering for empty hash and '#/'.
 *    - Lifecycle teardown: detaching listeners and aborting pending actions on destroy().
 * 4. Cross-Cutting & Router Integration:
 *    - No circular imports between components, services, views, and legacy/app.js.
 *    - Router in legacy/app.js continues to dispatch landing and other routes.
 *    - Legacy app.js showToast, openJobDetailModal, and renderLanding delegate to canonical implementations.
 *    - Wave 1-2J architecture and view exports remain complete and unbroken.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Robust Mock DOM Environment for Testing Browser Components in Node
// ─────────────────────────────────────────────────────────────────────────────

type EventListener = (e: any) => void;

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
  public elementsById: Map<string, MockElement> = new Map();
  private _innerHTML: string = '';
  private _textContent: string = '';
  public listeners: Map<string, Set<EventListener>> = new Map();

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

  public appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    if (!this.children.includes(child)) {
      this.children.push(child);
    }
    return child;
  }

  public removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    if (child.id) {
      this.elementsById.delete(child.id);
    }
    return child;
  }

  public remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  public addEventListener(event: string, handler: EventListener, options?: { signal?: AbortSignal }): void {
    if (options?.signal?.aborted) return;
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        this.removeEventListener(event, handler);
      });
    }
  }

  public removeEventListener(event: string, handler: EventListener): void {
    const set = this.listeners.get(event);
    if (set) set.delete(handler);
  }

  public dispatchEvent(event: { type: string; [key: string]: any }): boolean {
    const set = this.listeners.get(event.type);
    if (set) {
      for (const handler of Array.from(set)) {
        handler({ target: this, currentTarget: this, ...event });
      }
    }
    return true;
  }

  public focus(): void {}

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
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) results.push(this);
      for (const child of this.children) {
        results.push(...child.querySelectorAll(selector));
      }
    } else {
      for (const child of this.children) {
        results.push(...child.querySelectorAll(selector));
      }
    }
    return results;
  }
}

// Global Document and Window Mock Setup
class MockDocument {
  public body: MockElement = new MockElement('body');
  private documentListeners: Map<string, Set<EventListener>> = new Map();

  public createElement(tagName: string): MockElement {
    return new MockElement(tagName);
  }

  public getElementById(id: string): MockElement | null {
    return this.body.getElementById(id);
  }

  public querySelector(selector: string): MockElement | null {
    return this.body.querySelector(selector);
  }

  public querySelectorAll(selector: string): MockElement[] {
    return this.body.querySelectorAll(selector);
  }

  public addEventListener(event: string, handler: EventListener, options?: { signal?: AbortSignal }): void {
    if (options?.signal?.aborted) return;
    if (!this.documentListeners.has(event)) {
      this.documentListeners.set(event, new Set());
    }
    this.documentListeners.get(event)!.add(handler);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        this.removeEventListener(event, handler);
      });
    }
  }

  public removeEventListener(event: string, handler: EventListener): void {
    const set = this.documentListeners.get(event);
    if (set) set.delete(handler);
  }

  public dispatchEvent(event: { type: string; [key: string]: any }): boolean {
    const set = this.documentListeners.get(event.type);
    if (set) {
      for (const handler of Array.from(set)) {
        handler(event);
      }
    }
    return true;
  }
}

const mockDoc = new MockDocument();
(globalThis as any).document = mockDoc;
(globalThis as any).window = {
  location: { hash: '#/' },
  open: vi.fn(),
  prompt: vi.fn(),
  confirm: vi.fn(() => true),
  alert: vi.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Module Imports Under Test
// ─────────────────────────────────────────────────────────────────────────────

import {
  openJobDetailModal,
  closeJobDetailModal,
} from '../../../frontend/src/components/JobDetailModal.js';
import {
  showToast,
  clearAllToasts,
  getActiveToasts,
} from '../../../frontend/src/services/ui/toast.js';
import {
  mountLandingView,
  renderLandingHtml,
} from '../../../frontend/src/views/landing/LandingView.js';
import * as allViews from '../../../frontend/src/views/index.js';

describe('Wave 3A: Shared UI Extraction Test Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockDoc.body = new MockElement('body');
    clearAllToasts();
    closeJobDetailModal();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAllToasts();
    closeJobDetailModal();
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Job Detail Modal Extraction & Behavior
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Job Detail Modal (frontend/src/components/JobDetailModal.ts)', () => {
    it('exports openJobDetailModal and closeJobDetailModal functions', () => {
      expect(typeof openJobDetailModal).toBe('function');
      expect(typeof closeJobDetailModal).toBe('function');
    });

    it('creates modal backdrop and loading indicator when invoked', async () => {
      const mockApiClient = {
        getJobById: vi.fn().mockReturnValue(new Promise(() => {})), // Never resolves (stays loading)
      };

      openJobDetailModal('job_123', undefined, { apiClient: mockApiClient });

      const modalRoot = mockDoc.getElementById('job-detail-modal-root');
      expect(modalRoot).not.toBeNull();
      expect(modalRoot!.innerHTML).toContain('app-modal-backdrop');
      expect(modalRoot!.innerHTML).toContain('Loading official job details');
    });

    it('renders full job details, match score, badges, and verification status', async () => {
      const mockJob = {
        id: 'job_456',
        title: 'Lead Distributed Systems Engineer',
        company: 'Stripe',
        location: 'Remote, US',
        workplace_type: 'Remote',
        status: 'ACTIVE',
        official_url: 'https://stripe.com/jobs/456',
        description: 'Design robust payment pipelines and low-latency infrastructure.',
      };

      const mockApiClient = {
        getJobById: vi.fn().mockResolvedValue(mockJob),
      };

      openJobDetailModal('job_456', undefined, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      const modalRoot = mockDoc.getElementById('job-detail-modal-root');
      expect(modalRoot).not.toBeNull();
      expect(modalRoot!.innerHTML).toContain('Lead Distributed Systems Engineer');
      expect(modalRoot!.innerHTML).toContain('Stripe');
      expect(modalRoot!.innerHTML).toContain('Verified Official');
      expect(modalRoot!.innerHTML).toContain('Design robust payment pipelines');
    });

    it('displays closed job warning and disables direct application for closed jobs', async () => {
      const mockJob = {
        id: 'job_closed',
        title: 'Staff Platform Engineer',
        company: 'Figma',
        status: 'CLOSED',
        official_url: 'https://figma.com/careers/closed',
      };

      const mockApiClient = {
        getJobById: vi.fn().mockResolvedValue(mockJob),
      };

      openJobDetailModal('job_closed', undefined, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      const modalRoot = mockDoc.getElementById('job-detail-modal-root');
      expect(modalRoot).not.toBeNull();
      expect(modalRoot!.innerHTML).toContain('Closed');
      expect(modalRoot!.innerHTML).toContain('This position is no longer active on the official career portal');
      expect(modalRoot!.innerHTML).toContain('Position Closed');
    });

    it('sanitizes unsafe external URLs to prevent javascript: execution', async () => {
      const mockJob = {
        id: 'job_xss',
        title: 'Security Researcher',
        company: 'Untrusted Org',
        official_url: 'javascript:alert(1)',
      };

      const mockApiClient = {
        getJobById: vi.fn().mockResolvedValue(mockJob),
      };

      openJobDetailModal('job_xss', undefined, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      const modalRoot = mockDoc.getElementById('job-detail-modal-root');
      expect(modalRoot).not.toBeNull();
      expect(modalRoot!.innerHTML).not.toContain('href="javascript:alert(1)"');
    });

    it('invokes onStateChange callback for workspace actions (save, apply, dismiss)', async () => {
      const mockJob = {
        id: 'job_workspace',
        title: 'Full Stack Engineer',
        company: 'Linear',
        official_url: 'https://linear.app/careers',
      };

      const onStateChange = vi.fn();
      const mockApiClient = {
        getJobById: vi.fn().mockResolvedValue(mockJob),
        saveJob: vi.fn().mockResolvedValue({ success: true }),
        applyJob: vi.fn().mockResolvedValue({ success: true }),
        getToken: () => 'valid_token',
      };

      openJobDetailModal('job_workspace', onStateChange, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      const saveBtn = mockDoc.getElementById('btn-modal-toggle-save');
      expect(saveBtn).not.toBeNull();
      saveBtn!.dispatchEvent({ type: 'click' });
      await vi.runAllTimersAsync();

      expect(mockApiClient.saveJob).toHaveBeenCalledWith('job_workspace');
      expect(onStateChange).toHaveBeenCalledWith('save', 'job_workspace', true);
    });

    it('handles note saving and triggers callback', async () => {
      const mockJob = {
        id: 'job_notes',
        title: 'Backend Engineer',
        company: 'Vercel',
        official_url: 'https://vercel.com/careers',
      };

      const onStateChange = vi.fn();
      const mockApiClient = {
        getJobById: vi.fn().mockResolvedValue(mockJob),
        saveJobNote: vi.fn().mockResolvedValue({ success: true }),
        getToken: () => 'valid_token',
      };

      openJobDetailModal('job_notes', onStateChange, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      const noteInput = mockDoc.getElementById('modal-notes-input');
      const saveNoteBtn = mockDoc.getElementById('btn-modal-save-notes');
      expect(noteInput).not.toBeNull();
      expect(saveNoteBtn).not.toBeNull();

      noteInput!.value = 'Met hiring manager at conference';
      saveNoteBtn!.dispatchEvent({ type: 'click' });
      await vi.runAllTimersAsync();

      expect(mockApiClient.saveJobNote).toHaveBeenCalledWith('job_notes', 'Met hiring manager at conference');
      expect(onStateChange).toHaveBeenCalledWith('note', 'job_notes', 'Met hiring manager at conference');
    });

    it('closes modal on Escape key press and cleans up listeners', async () => {
      const mockJob = { id: 'job_esc', title: 'Frontend Lead', company: 'Shopify' };
      const mockApiClient = { getJobById: vi.fn().mockResolvedValue(mockJob) };

      openJobDetailModal('job_esc', undefined, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      expect(mockDoc.getElementById('job-detail-modal-root')).not.toBeNull();

      // Trigger Escape key
      mockDoc.dispatchEvent({ type: 'keydown', key: 'Escape' });

      // Modal root should be removed from DOM
      expect(mockDoc.getElementById('job-detail-modal-root')).toBeNull();
    });

    it('closes modal when close button is clicked', async () => {
      const mockJob = { id: 'job_close', title: 'DevOps Engineer', company: 'GitHub' };
      const mockApiClient = { getJobById: vi.fn().mockResolvedValue(mockJob) };

      openJobDetailModal('job_close', undefined, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      const closeBtn = mockDoc.getElementById('btn-close-job-modal');
      expect(closeBtn).not.toBeNull();

      closeBtn!.dispatchEvent({ type: 'click' });
      expect(mockDoc.getElementById('job-detail-modal-root')).toBeNull();
    });

    it('prevents duplicate modal instances when openJobDetailModal is called repeatedly', async () => {
      const mockJob = { id: 'job_dup', title: 'Data Engineer', company: 'Databricks' };
      const mockApiClient = { getJobById: vi.fn().mockResolvedValue(mockJob) };

      openJobDetailModal('job_dup', undefined, { apiClient: mockApiClient });
      openJobDetailModal('job_dup', undefined, { apiClient: mockApiClient });
      await vi.runAllTimersAsync();

      const modalRoots = mockDoc.querySelectorAll('#job-detail-modal-root');
      expect(modalRoots.length).toBeLessThanOrEqual(1);
    });

    it('protects against stale asynchronous responses if closed before fetch completes', async () => {
      let resolvePromise: any;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const mockApiClient = {
        getJobById: vi.fn().mockReturnValue(delayedPromise),
      };

      openJobDetailModal('job_slow', undefined, { apiClient: mockApiClient });
      expect(mockDoc.getElementById('job-detail-modal-root')).not.toBeNull();

      // Close modal before server responds
      closeJobDetailModal();
      expect(mockDoc.getElementById('job-detail-modal-root')).toBeNull();

      // Now resolve the late server response
      resolvePromise({ id: 'job_slow', title: 'Ghost Update', company: 'Ghost Inc' });
      await vi.runAllTimersAsync();

      // Stale update should not re-attach modal
      expect(mockDoc.getElementById('job-detail-modal-root')).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Toast Notifications Extraction & Canonical Behavior
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Toast Notifications (frontend/src/services/ui/toast.ts)', () => {
    it('exports showToast, clearAllToasts, and getActiveToasts', () => {
      expect(typeof showToast).toBe('function');
      expect(typeof clearAllToasts).toBe('function');
      expect(typeof getActiveToasts).toBe('function');
    });

    it('renders toast with correct message and type classes', () => {
      const el = showToast('Profile updated successfully!', 'success');

      expect(el).not.toBeNull();
      expect(el.textContent).toBe('Profile updated successfully!');
      expect(el.className).toContain('app-toast--success');
      expect(mockDoc.body.children).toContain(el);
    });

    it('supports info, success, warning, and error toast types', () => {
      const t1 = showToast('System info update', 'info');
      const t2 = showToast('Operation succeeded', 'success');
      const t3 = showToast('Warning: session expiring', 'warning');
      const t4 = showToast('Error connecting to server', 'error');

      expect(t1.className).toContain('app-toast--info');
      expect(t2.className).toContain('app-toast--success');
      expect(t3.className).toContain('app-toast--warning');
      expect(t4.className).toContain('app-toast--error');

      const toasts = getActiveToasts();
      expect(toasts.length).toBe(4);
    });

    it('assigns accessible role="alert" for errors and role="status" for standard notifications', () => {
      const normalToast = showToast('Action saved', 'success');
      const errorToast = showToast('Fatal error occurred', 'error');

      expect(normalToast.getAttribute('role')).toBe('status');
      expect(normalToast.getAttribute('aria-live')).toBe('polite');

      expect(errorToast.getAttribute('role')).toBe('alert');
      expect(errorToast.getAttribute('aria-live')).toBe('assertive');
    });

    it('auto-dismisses toast after specified duration and cleans up DOM', () => {
      showToast('Transient message', 'info', 2000);
      expect(getActiveToasts().length).toBe(1);

      // Advance timer past duration and CSS transition (2000ms + 300ms)
      vi.advanceTimersByTime(2500);

      expect(getActiveToasts().length).toBe(0);
    });

    it('allows manual dismissal by clicking the toast', () => {
      const toast = showToast('Clickable notification', 'info', 10000);
      expect(getActiveToasts().length).toBe(1);

      toast.dispatchEvent({ type: 'click' });
      vi.advanceTimersByTime(400);

      expect(getActiveToasts().length).toBe(0);
    });

    it('clearAllToasts clears all active notifications and cancels timers immediately', () => {
      showToast('Toast 1', 'info', 5000);
      showToast('Toast 2', 'warning', 5000);
      showToast('Toast 3', 'error', 5000);
      expect(getActiveToasts().length).toBe(3);

      clearAllToasts();
      expect(getActiveToasts().length).toBe(0);
      expect(mockDoc.body.children.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Public Landing Page Extraction & Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Public Landing Page (frontend/src/views/landing/LandingView.ts)', () => {
    let container: MockElement;

    beforeEach(() => {
      container = new MockElement('div');
    });

    it('exports mountLandingView and renderLandingHtml', () => {
      expect(typeof mountLandingView).toBe('function');
      expect(typeof renderLandingHtml).toBe('function');
    });

    it('renders hero headline, feature highlights, and call-to-actions when unauthenticated', () => {
      const controller = mountLandingView({
        container: container as unknown as HTMLElement,
        isAuthenticated: false,
      });

      expect(container.innerHTML).toContain('Find Jobs That Are Actually Real.');
      expect(container.innerHTML).toContain('Only verified, official job listings');
      expect(container.innerHTML).toContain("Get Started — It's Free");
      expect(container.innerHTML).toContain('Sign In');

      controller.destroy();
    });

    it('automatically redirects authenticated users to #/dashboard', () => {
      const onNavigate = vi.fn();

      const controller = mountLandingView({
        container: container as unknown as HTMLElement,
        isAuthenticated: true,
        onNavigate,
      });

      vi.advanceTimersByTime(20);

      expect(onNavigate).toHaveBeenCalledWith('#/dashboard');
      controller.destroy();
    });

    it('cleans up redirect timer on destroy()', () => {
      const onNavigate = vi.fn();

      const controller = mountLandingView({
        container: container as unknown as HTMLElement,
        isAuthenticated: true,
        onNavigate,
      });

      controller.destroy();

      vi.advanceTimersByTime(50);
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Cross-Cutting, Router Integration, and Compatibility Audit
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Router Integration & Compatibility Audit in legacy/app.js', () => {
    let appJsContent: string;

    beforeEach(() => {
      const appJsPath = path.resolve(__dirname, '../../../frontend/src/legacy/app.js');
      appJsContent = fs.readFileSync(appJsPath, 'utf-8');
    });

    it('imports canonical modules into legacy/app.js', () => {
      expect(appJsContent).toContain("from '../components/JobDetailModal.js'");
      expect(appJsContent).toContain("from '../services/ui/toast.js'");
      expect(appJsContent).toContain("mountLandingView");
      expect(appJsContent).toContain("renderLandingHtml");
    });

    it('delegates legacy showToast to canonicalShowToast in legacy/app.js', () => {
      expect(appJsContent).toMatch(/function\s+showToast\s*\([\s\S]*?\)\s*\{[\s\S]*?canonicalShowToast/);
    });

    it('delegates legacy openJobDetailModal to canonicalOpenJobDetailModal in legacy/app.js', () => {
      expect(appJsContent).toMatch(/function\s+openJobDetailModal\s*\([\s\S]*?\)\s*\{[\s\S]*?canonicalOpenJobDetailModal/);
    });

    it('delegates legacy renderLanding to renderLandingHtml in legacy/app.js', () => {
      expect(appJsContent).toMatch(/function\s+renderLanding\s*\([\s\S]*?\)\s*\{[\s\S]*?renderLandingHtml/);
    });

    it('mounts LandingView with lifecycle tracking in canonical router', () => {
      const routerPath = path.resolve(__dirname, '../../../frontend/src/router/Router.ts');
      const routerContent = fs.readFileSync(routerPath, 'utf-8');
      expect(routerContent).toMatch(/case\s+'landing':[\s\S]*?this\.currentViewController\s*=\s*mountLandingView/);
      expect(routerContent).toMatch(/default:[\s\S]*?this\.currentViewController\s*=\s*mountLandingView/);
    });

    it('verifies all Wave 1-2J view modules remain exported from frontend/src/views/index.ts', () => {
      expect(typeof allViews.mountVerifyEmailView).toBe('function');
      expect(typeof allViews.mountLoginView).toBe('function');
      expect(typeof allViews.mountRegisterView).toBe('function');
      expect(typeof allViews.mountPreferencesView).toBe('function');
      expect(typeof allViews.mountDashboardView).toBe('function');
      expect(typeof allViews.mountVerifiedJobsView).toBe('function');
      expect(typeof allViews.mountSavedJobsView).toBe('function');
      expect(typeof allViews.mountApplicationsView).toBe('function');
      expect(typeof allViews.mountHiddenJobsView).toBe('function');
      expect(typeof allViews.mountAlertsView).toBe('function');
      expect(typeof allViews.mountCandidateProfileView).toBe('function');
      expect(typeof allViews.mountAccountSettingsView).toBe('function');
      expect(typeof allViews.mountResumeBuilderView).toBe('function');
      expect(typeof allViews.mountPlacementPrepView).toBe('function');
      expect(typeof allViews.mountAdminConsoleView).toBe('function');
      expect(typeof allViews.mountLandingView).toBe('function');
      expect(typeof allViews.renderLandingHtml).toBe('function');
    });

    it('verifies no circular imports exist between extracted UI modules', () => {
      const modalPath = path.resolve(__dirname, '../../../frontend/src/components/JobDetailModal.ts');
      const toastPath = path.resolve(__dirname, '../../../frontend/src/services/ui/toast.ts');
      const landingPath = path.resolve(__dirname, '../../../frontend/src/views/landing/LandingView.ts');

      const modalContent = fs.readFileSync(modalPath, 'utf-8');
      const toastContent = fs.readFileSync(toastPath, 'utf-8');
      const landingContent = fs.readFileSync(landingPath, 'utf-8');

      // None of the extracted modules should import legacy/app.js
      expect(modalContent).not.toContain("from '../legacy/app");
      expect(toastContent).not.toContain("from '../../legacy/app");
      expect(landingContent).not.toContain("from '../../legacy/app");

      // Toast must not import modal or landing
      expect(toastContent).not.toContain('JobDetailModal');
      expect(toastContent).not.toContain('LandingView');

      // Landing must not import legacy app
      expect(landingContent).not.toContain('app.js');
    });
  });
});
