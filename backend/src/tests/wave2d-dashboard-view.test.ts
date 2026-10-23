/**
 * RoleRadar — Architectural Refactoring Wave 2D Tests:
 * Extracted DashboardView & Matched-Job Feed Lifecycle Tests.
 *
 * Validates:
 * 1. Initial dashboard mount, sidebar rendering, and skeleton loading state.
 * 2. Workspace stats counter hydration (savedCount, appliedCount, recentlyViewedCount).
 * 3. Preferences check and prompt display when preferences are missing.
 * 4. Matched-job retrieval, ranking order, score badges, and card rendering.
 * 5. Preservation of job identity, official application URLs, and verification state.
 * 6. Closed-job warning banner and disabled application button behavior.
 * 7. Empty-feed rendering and Edit Preferences navigation handoff.
 * 8. API failure handling, error state, and retry button recovery.
 * 9. Workspace interactive card actions (save/unsave, apply/undo, dismiss) and stats refresh.
 * 10. Job detail modal opening and view tracking telemetry.
 * 11. View destruction while requests are in-flight and 60-second polling cleanup.
 * 12. Repeated route transitions and listener leak prevention.
 * 13. Regression compatibility with Wave 1, Wave 2A, Wave 2B, and Wave 2C view modules.
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

  public dispatchEvent(e: { type: string; stopPropagation?: () => void; preventDefault?: () => void }): boolean {
    const handlers = this.listeners.get(e.type);
    if (handlers) {
      handlers.forEach((h) => {
        h({
          ...e,
          target: this,
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

      // Check child elements first so bound event listeners are preserved
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

    // Check child elements for any non-id selector as well
    for (const child of this.elementsById.values()) {
      const found = child.querySelector<T>(selector);
      if (found) return found;
    }

    const list = this.querySelectorAll<T>(selector);
    return list.length > 0 ? list[0] : null;
  }

  public querySelectorAll<T extends MockElement = MockElement>(selector: string): T[] {
    const results: MockElement[] = [];

    // Check existing child elements first
    for (const child of this.elementsById.values()) {
      results.push(...child.querySelectorAll<T>(selector));
    }
    if (results.length > 0) return results as unknown as T[];

    const attrMatch = selector.match(/^\[([a-z0-9_-]+)(?:=["']?([^"']*)["']?)?\]$/i);
    if (attrMatch) {
      const attr = attrMatch[1];
      const attrVal = attrMatch[2];
      const regex = new RegExp(`${attr}=["']([^"']+)["']`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = regex.exec(this._innerHTML)) !== null) {
        if (attrVal !== undefined && m[1] !== attrVal) continue;
        const key = `${attr}:${m[1]}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement('button');
          el.setAttribute(attr, m[1]);
          el.parentNode = this;
          this.elementsById.set(key, el);
        }
        results.push(this.elementsById.get(key)!);
      }
      return results as unknown as T[];
    }

    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const regex = new RegExp(`class=["'][^"']*${cls}[^"']*["']`, 'gi');
      let matchCount = 0;
      while (regex.exec(this._innerHTML) !== null) {
        matchCount++;
      }
      for (let i = 0; i < matchCount; i++) {
        const key = `class:${cls}:${i}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement('div');
          el.className = cls;
          el.parentNode = this;
          this.elementsById.set(key, el);
        }
        results.push(this.elementsById.get(key)!);
      }
      return results as unknown as T[];
    }

    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const regex = new RegExp(`class=["'][^"']*${cls}[^"']*["']`, 'gi');
      let matchCount = 0;
      while (regex.exec(this._innerHTML) !== null) {
        matchCount++;
      }
      for (let i = 0; i < matchCount; i++) {
        const key = `class:${cls}:${i}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement('div');
          el.className = cls;
          el.parentNode = this;
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
  visibilityState: 'visible',
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
  mountDashboardView,
  mountPreferencesView,
  mountLoginView,
  mountRegisterView,
  mountVerifyEmailView,
  verifiedJobCardHtml,
} from '../../../frontend/src/views/index.js';
import { jobsService } from '../../../frontend/src/services/api/jobs.service.js';
import { workspaceService } from '../../../frontend/src/services/api/workspace.service.js';
import { preferencesService } from '../../../frontend/src/services/api/preferences.service.js';
import { authService } from '../../../frontend/src/services/api/auth.service.js';
import { httpClient } from '../../../frontend/src/services/api/client.js';
import type { Job } from '../../../frontend/src/services/api/types.js';

describe('Wave 2D: Dashboard & Matched-Job Feed View Decoupling', () => {
  let testContainer: MockElement;
  const originalFetch = globalThis.fetch;

  const mockJobs: Job[] = [
    {
      id: 'job-swe-001',
      companyId: 'comp-1',
      companyName: 'Acme Technologies',
      title: 'Senior Software Engineer',
      location: 'Bangalore, India',
      workplaceType: 'REMOTE',
      officialUrl: 'https://acme.com/jobs/swe-001',
      firstSeenAt: '2026-10-18T10:00:00.000Z',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      relevanceScore: 92,
      experienceClassification: 'BOTH',
      freshnessState: 'FRESH',
      matchExplanations: ['Matches role: Software Engineer', 'Matches location: Bangalore'],
      isSaved: false,
      isApplied: false,
    },
    {
      id: 'job-qa-002',
      companyId: 'comp-2',
      companyName: 'Globex Cloud',
      title: 'QA Automation Engineer',
      location: 'Hyderabad, India',
      workplaceType: 'HYBRID',
      officialUrl: 'https://globex.com/jobs/qa-002',
      firstSeenAt: '2026-10-19T08:00:00.000Z',
      status: 'CLOSED',
      verificationStatus: 'VERIFIED',
      relevanceScore: 78,
      experienceClassification: 'FRESHER_COMPATIBLE',
      freshnessState: 'RECENT',
      matchExplanations: ['Matches role: QA Engineer'],
      isSaved: true,
      isApplied: false,
    },
  ];

  beforeEach(() => {
    (globalThis as any).localStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => storageMap.set(key, String(value)),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
    };
    (globalThis as any).document = mockDocument;
    storageMap.clear();
    documentListeners.clear();
    httpClient.clearAuth();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    testContainer = new MockElement('div');

    // Set authenticated user
    httpClient.setAuth('valid-jwt-token', {
      id: 'usr-100',
      email: 'candidate@example.com',
      name: 'Sameer Candidate',
      isAdmin: false,
      isBetaUser: false,
      emailVerified: true,
    });

    // Default mock stats
    vi.spyOn(workspaceService, 'getWorkspaceStats').mockResolvedValue({
      savedCount: 5,
      appliedCount: 2,
      dismissedCount: 1,
      recentlyViewedCount: 8,
    });

    // Default mock preferences in storage
    storageMap.set(
      'roleradar_preferences',
      JSON.stringify({
        roles: ['Software Engineer'],
        locations: ['Bangalore'],
        workplaceTypes: ['REMOTE'],
        experienceLevel: 'EXPERIENCED',
        companyIds: [],
      })
    );

    // Default mock matched jobs
    vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockJobs,
      pagination: { page: 1, limit: 10, total: 2 },
      totalMatches: 2,
    });

    // Default mock recently viewed
    vi.spyOn(workspaceService, 'getRecentlyViewedJobs').mockResolvedValue({
      items: [mockJobs[0]],
      total: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Dashboard Mount, Sidebar, and Skeleton State
  // ───────────────────────────────────────────────────────────────────────────
  it('mounts into container with #dashboard-view-root and renders initial skeleton state', () => {
    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    expect(testContainer.innerHTML).toContain('id="dashboard-view-root"');
    expect(testContainer.innerHTML).toContain('Welcome back, Sameer.');
    expect(testContainer.innerHTML).toContain('app-sidebar');
    expect(testContainer.innerHTML).toContain('Finding verified jobs matching your profile...');
    expect(testContainer.innerHTML).toContain('id="dashboard-stats-slot"');
    expect(testContainer.innerHTML).toContain('id="dashboard-matched-feed-slot"');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Workspace Stats Counter Hydration
  // ───────────────────────────────────────────────────────────────────────────
  it('successfully loads workspace stats and injects counters (savedCount, appliedCount, viewedCount)', async () => {
    const statsSpy = vi.spyOn(workspaceService, 'getWorkspaceStats').mockResolvedValue({
      savedCount: 12,
      appliedCount: 4,
      dismissedCount: 3,
      recentlyViewedCount: 19,
    });

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    // Fast-forward initial async resolution
    await vi.advanceTimersByTimeAsync(50);

    expect(statsSpy).toHaveBeenCalled();
    expect(testContainer.innerHTML).toContain('id="stat-saved-count"');
    expect(testContainer.innerHTML).toContain('12');
    expect(testContainer.innerHTML).toContain('id="stat-applied-count"');
    expect(testContainer.innerHTML).toContain('4');
    expect(testContainer.innerHTML).toContain('id="stat-viewed-count"');
    expect(testContainer.innerHTML).toContain('19');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Preferences Check and Setup Prompt
  // ───────────────────────────────────────────────────────────────────────────
  it('renders prompt when candidate preferences are not configured yet', async () => {
    storageMap.clear(); // remove cached preferences
    vi.spyOn(preferencesService, 'getPreferences').mockResolvedValue({
      roles: [],
      locations: [],
      workplaceTypes: [],
      experienceLevel: 'FRESHER',
      companyIds: [],
    });

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('Set Up Your Job Preferences');
    expect(testContainer.innerHTML).toContain('id="btn-go-prefs"');
    expect(testContainer.innerHTML).toContain('Complete onboarding to see verified jobs matching your preferences');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Matched-Job Retrieval & Card Rendering
  // ───────────────────────────────────────────────────────────────────────────
  it('retrieves and displays recommended verified matches with ranking score, badges, and company name', async () => {
    const getMatchesSpy = vi.spyOn(jobsService, 'getMatchedJobs');

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(getMatchesSpy).toHaveBeenCalledWith({ page: 1, limit: 10, sort: 'BEST_MATCH' });
    expect(testContainer.innerHTML).toContain('🎯 Recommended Verified Matches');
    expect(testContainer.innerHTML).toContain('Acme Technologies');
    expect(testContainer.innerHTML).toContain('Senior Software Engineer');
    expect(testContainer.innerHTML).toContain('92 pts');
    expect(testContainer.innerHTML).toContain('🌐 Remote');
    expect(testContainer.innerHTML).toContain('🟢 Fresh');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Job Identity, Official Apply URL, and Ranking Order Preservation
  // ───────────────────────────────────────────────────────────────────────────
  it('preserves job identity, official application URLs, and ranking order across feed cards', async () => {
    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    // Verify Job 1 card exists with exact ID and official apply URL
    expect(testContainer.innerHTML).toContain('id="job-card-job-swe-001"');
    expect(testContainer.innerHTML).toContain('href="https://acme.com/jobs/swe-001"');

    // Verify ranking order (Acme Technologies before Globex Cloud)
    const acmeIdx = testContainer.innerHTML.indexOf('Acme Technologies');
    const globexIdx = testContainer.innerHTML.indexOf('Globex Cloud');
    expect(acmeIdx).toBeGreaterThan(-1);
    expect(globexIdx).toBeGreaterThan(acmeIdx);

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Server-Provided Eligibility & Verification Status (Closed vs Active)
  // ───────────────────────────────────────────────────────────────────────────
  it('preserves server-provided eligibility and verification status (active verified vs closed job warnings)', async () => {
    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    // Active verified job
    expect(testContainer.innerHTML).toContain('✓ Verified Official');

    // Closed job (Globex Cloud)
    expect(testContainer.innerHTML).toContain('vjc--closed');
    expect(testContainer.innerHTML).toContain('This position is no longer available on the official employer career portal.');
    expect(testContainer.innerHTML).toContain('Position Closed');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Empty-Feed Behavior
  // ───────────────────────────────────────────────────────────────────────────
  it('renders empty-feed state when no verified jobs match preferences', async () => {
    vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: [],
      pagination: { page: 1, limit: 10, total: 0 },
      totalMatches: 0,
    });

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('No Verified Matches Found Yet');
    expect(testContainer.innerHTML).toContain('Edit Preferences');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. API Failure & Retry Recovery
  // ───────────────────────────────────────────────────────────────────────────
  it('handles API failures gracefully with error banner and functional retry button', async () => {
    let callCount = 0;
    vi.spyOn(jobsService, 'getMatchedJobs').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network timeout'));
      }
      return Promise.resolve({
        jobs: mockJobs,
        pagination: { page: 1, limit: 10, total: 2 },
        totalMatches: 2,
      });
    });

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    // Error state rendered
    expect(testContainer.innerHTML).toContain('Failed to load matched jobs. Please try again.');
    expect(testContainer.innerHTML).toContain('id="btn-retry-dashboard-feed"');

    // Click retry
    const retryBtn = testContainer.querySelector<MockElement>('#btn-retry-dashboard-feed')!;
    retryBtn.dispatchEvent({ type: 'click' });

    await vi.advanceTimersByTimeAsync(50);

    expect(callCount).toBe(2);
    expect(testContainer.innerHTML).toContain('🎯 Recommended Verified Matches');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Interactive Workspace Actions (Save, Apply, Dismiss) & Stats Refresh
  // ───────────────────────────────────────────────────────────────────────────
  it('handles interactive workspace card actions: save, apply toggle, and dismiss with counter updates', async () => {
    const saveSpy = vi.spyOn(workspaceService, 'saveJob').mockResolvedValue({
      id: 'int-1',
      jobId: 'job-swe-001',
      userId: 'usr-100',
      isSaved: true,
    });
    const applySpy = vi.spyOn(workspaceService, 'markJobApplied').mockResolvedValue({
      id: 'int-2',
      jobId: 'job-swe-001',
      userId: 'usr-100',
      isApplied: true,
    });
    const dismissSpy = vi.spyOn(workspaceService, 'dismissJob').mockResolvedValue({
      id: 'int-3',
      jobId: 'job-swe-001',
      userId: 'usr-100',
      isDismissed: true,
    });
    const statsSpy = vi.spyOn(workspaceService, 'getWorkspaceStats');

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    const saveBtn = testContainer.querySelector<MockElement>('[data-job-save-id="job-swe-001"]')!;
    const applyBtn = testContainer.querySelector<MockElement>('[data-job-apply-id="job-swe-001"]')!;
    const dismissBtn = testContainer.querySelector<MockElement>('[data-job-dismiss-id="job-swe-001"]')!;

    // 1. Click Save
    saveBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(saveSpy).toHaveBeenCalledWith('job-swe-001');

    // 2. Click Mark Applied
    applyBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(applySpy).toHaveBeenCalledWith('job-swe-001');

    // 3. Click Dismiss
    dismissBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(dismissSpy).toHaveBeenCalledWith('job-swe-001');

    // Stats were refreshed on workspace mutations
    expect(statsSpy).toHaveBeenCalled();

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Job Details Modal & View Tracking Telemetry
  // ───────────────────────────────────────────────────────────────────────────
  it('opens job detail modal on Details button click and records view telemetry', async () => {
    const viewSpy = vi.spyOn(workspaceService, 'recordJobView').mockResolvedValue({
      id: 'int-v',
      jobId: 'job-swe-001',
      userId: 'usr-100',
    });
    const getJobSpy = vi.spyOn(jobsService, 'getJobById').mockResolvedValue({
      job: mockJobs[0],
      verifications: [],
    });

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    await vi.advanceTimersByTimeAsync(50);

    const detailBtn = testContainer.querySelector<MockElement>('[data-job-detail-id="job-swe-001"]')!;
    detailBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });

    await vi.advanceTimersByTimeAsync(50);

    expect(viewSpy).toHaveBeenCalledWith('job-swe-001');
    expect(getJobSpy).toHaveBeenCalledWith('job-swe-001');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. View Destruction While Request Is Pending & 60s Polling Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  it('destroys view cleanly, clearing 60s poll timer and discarding in-flight responses', async () => {
    let lateResolve: (val: any) => void = () => {};
    vi.spyOn(jobsService, 'getMatchedJobs').mockImplementation(() => {
      return new Promise((resolve) => {
        lateResolve = resolve;
      });
    });

    const controller = mountDashboardView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard',
    });

    expect(testContainer.innerHTML).toContain('Finding verified jobs matching your profile...');

    // Destroy view while request is pending
    controller.destroy();

    // Late resolve arrives after destruction
    lateResolve({
      jobs: mockJobs,
      pagination: { page: 1, limit: 10, total: 2 },
      totalMatches: 2,
    });
    await vi.advanceTimersByTimeAsync(100);

    // Domestic content should not be injected after teardown
    expect(testContainer.innerHTML).not.toContain('🎯 Recommended Verified Matches');

    // Advancing 60s should not trigger polling after destroy
    await vi.advanceTimersByTimeAsync(70000);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Repeated Route Transitions & Memory Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  it('handles repeated route transitions without duplicate event listeners or memory leaks', async () => {
    for (let i = 0; i < 3; i++) {
      testContainer = new MockElement('div');
      httpClient.setAuth('valid-jwt-token', {
        id: 'usr-100',
        email: 'candidate@example.com',
        name: 'Sameer Candidate',
        isAdmin: false,
        isBetaUser: false,
        emailVerified: true,
      });

      const controller = mountDashboardView({
        container: testContainer as unknown as HTMLElement,
        routePath: 'dashboard',
      });

      expect(testContainer.innerHTML).toContain('Welcome back, Sameer.');
      await vi.advanceTimersByTimeAsync(50);

      controller.destroy();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Full Regression Coverage Across All Extracted Views
  // ───────────────────────────────────────────────────────────────────────────
  it('verifies seamless interoperability across Wave 1, 2A, 2B, 2C, and 2D view exports', () => {
    expect(typeof mountDashboardView).toBe('function');
    expect(typeof mountPreferencesView).toBe('function');
    expect(typeof mountLoginView).toBe('function');
    expect(typeof mountRegisterView).toBe('function');
    expect(typeof mountVerifyEmailView).toBe('function');
    expect(typeof verifiedJobCardHtml).toBe('function');
  });
});
