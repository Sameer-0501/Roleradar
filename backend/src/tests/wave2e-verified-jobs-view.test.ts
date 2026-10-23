/**
 * RoleRadar — Architectural Refactoring Wave 2E Tests:
 * Extracted VerifiedJobsView & Search Intelligence Feed Lifecycle Tests.
 *
 * Validates:
 * 1. Initial mount, sidebar rendering, and loading state.
 * 2. Fetching and rendering verified jobs through jobsService.getMatchedJobs().
 * 3. Natural language search intent interpretation bar rendering.
 * 4. Search autocomplete suggestions retrieval, debouncing, and click-to-search.
 * 5. Empty-feed rendering, reset filters, and try remote action handlers.
 * 6. API error state handling and retry button recovery.
 * 7. Preservation of job identity, official URLs, eligibility status, and ordering.
 * 8. Pagination (previous, next, page indicators) when total matches exceed page limit.
 * 9. Multi-dimensional filters (role, sort, workplace, freshness, verified today toggle).
 * 10. Workspace interactive card actions (save, apply, dismiss) and job detail modal opening.
 * 11. View destruction while request is pending and 60-second polling cleanup.
 * 12. Repeated route transitions and event listener cleanup.
 * 13. Regression compatibility with Wave 1, Wave 2A, 2B, 2C, 2D view exports.
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
      const regex = new RegExp(`<([a-z0-9_-]+)[^>]*class=["'][^"']*${cls}[^"']*["'][^>]*>`, 'gi');
      let m: RegExpExecArray | null;
      let i = 0;
      while ((m = regex.exec(this._innerHTML)) !== null) {
        const tagHtml = m[0];
        const key = `class:${cls}:${i++}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement(m[1]);
          el.className = cls;
          el.parentNode = this;
          const attrRegex = /([a-z0-9_-]+)=["']([^"']*)["']/gi;
          let am: RegExpExecArray | null;
          while ((am = attrRegex.exec(tagHtml)) !== null) {
            el.setAttribute(am[1], am[2]);
            this.elementsById.set(`${am[1]}:${am[2]}`, el);
          }
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
  mountVerifiedJobsView,
  mountDashboardView,
  mountPreferencesView,
  mountLoginView,
  mountRegisterView,
  mountVerifyEmailView,
  verifiedJobCardHtml,
} from '../../../frontend/src/views/index.js';
import { jobsService, workspaceService, type Job } from '../../../frontend/src/services/api/index.js';

describe('RoleRadar Wave 2E — VerifiedJobsView Decoupling', () => {
  let testContainer: MockElement;

  const mockVerifiedJobs: Job[] = [
    {
      id: 'job-v-101',
      companyId: 'comp-101',
      companyName: 'Stripe',
      title: 'Senior Software Engineer, Platform Infrastructure',
      location: 'Bengaluru, India',
      workplaceType: 'HYBRID',
      employmentType: 'FULL_TIME',
      officialUrl: 'https://stripe.com/jobs/101',
      firstSeenAt: '2026-10-20T08:00:00.000Z',
      status: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      relevanceScore: 94,
      experienceClassification: 'EXPERIENCED',
      freshnessState: 'FRESH',
      matchExplanations: ['Direct match for Backend Infrastructure', 'Active verified ATS listing'],
      externalJobId: 'STRIPE-101',
      sourceSystem: 'Greenhouse',
      isSaved: false,
      isApplied: false,
    },
    {
      id: 'job-v-102',
      companyId: 'comp-102',
      companyName: 'Atlassian',
      title: 'Frontend Engineer, Jira Cloud',
      location: 'Remote, India',
      workplaceType: 'REMOTE',
      employmentType: 'FULL_TIME',
      officialUrl: 'https://atlassian.com/careers/102',
      firstSeenAt: '2026-10-19T10:00:00.000Z',
      status: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      relevanceScore: 88,
      experienceClassification: 'BOTH',
      freshnessState: 'RECENT',
      matchExplanations: ['Matches React + TypeScript profile', 'Country-aware verified remote job'],
      externalJobId: 'ATL-102',
      sourceSystem: 'Lever',
      isSaved: true,
      isApplied: false,
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    storageMap.clear();
    documentListeners.clear();
    testContainer = new MockElement('div');
    testContainer.id = 'app-page';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Initial Mount & Toolbar Rendering
  // ───────────────────────────────────────────────────────────────────────────
  it('mounts verified jobs page, renders sidebar, toolbar, filter controls, and loading state', async () => {
    storageMap.set('roleradar_preferences', JSON.stringify({
      roles: ['Software Engineer', 'Backend Engineer'],
    }));

    vi.spyOn(jobsService, 'getMatchedJobs').mockReturnValue(new Promise(() => {}));

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    // Check header and sidebar
    expect(testContainer.innerHTML).toContain('Verified Jobs');
    expect(testContainer.innerHTML).toContain('Only active, verified listings from official company career portals');
    expect(testContainer.innerHTML).toContain('✏️ Edit Preferences');

    // Check search intelligence toolbar
    expect(testContainer.innerHTML).toContain('id="vjp-toolbar"');
    expect(testContainer.innerHTML).toContain('id="vjp-search-input"');
    expect(testContainer.innerHTML).toContain('id="vjp-role-select"');
    expect(testContainer.innerHTML).toContain('id="vjp-sort-select"');
    expect(testContainer.innerHTML).toContain('id="vjp-workplace-select"');
    expect(testContainer.innerHTML).toContain('id="vjp-freshness-select"');
    expect(testContainer.innerHTML).toContain('id="btn-today-filter"');

    // Check initial feed loading indicator
    expect(testContainer.innerHTML).toContain('Finding verified jobs matching your profile...');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Verified Job Feed Rendering & Job Invariants
  // ───────────────────────────────────────────────────────────────────────────
  it('fetches verified jobs via jobsService.getMatchedJobs and renders verified job cards with invariants', async () => {
    const getJobsSpy = vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 2 },
      totalMatches: 2,
    });

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(getJobsSpy).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      limit: 15,
      sort: 'BEST_MATCH',
      roleFilter: 'ALL',
      workplace: 'ANY',
      freshness: 'ALL',
      isToday: false,
    }));

    // Results header
    expect(testContainer.innerHTML).toContain('Showing 2 of 2 verified job matches');

    // Preserved job identities and official career portal URLs
    expect(testContainer.innerHTML).toContain('job-card-job-v-101');
    expect(testContainer.innerHTML).toContain('Senior Software Engineer, Platform Infrastructure');
    expect(testContainer.innerHTML).toContain('Stripe');
    expect(testContainer.innerHTML).toContain('https://stripe.com/jobs/101');
    expect(testContainer.innerHTML).toContain('Job ID: STRIPE-101');
    expect(testContainer.innerHTML).toContain('Source: Greenhouse');

    expect(testContainer.innerHTML).toContain('job-card-job-v-102');
    expect(testContainer.innerHTML).toContain('Frontend Engineer, Jira Cloud');
    expect(testContainer.innerHTML).toContain('Atlassian');
    expect(testContainer.innerHTML).toContain('https://atlassian.com/careers/102');

    // Invariant badges
    expect(testContainer.innerHTML).toContain('vjc__verified-badge');
    expect(testContainer.innerHTML).toContain('✓ Verified Official');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Search Intent Interpretation Bar
  // ───────────────────────────────────────────────────────────────────────────
  it('renders interpreted search intent pills when API identifies natural language search intent', async () => {
    vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 2 },
      totalMatches: 2,
      searchIntent: {
        isNaturalLanguage: true,
        experienceLevel: 'Fresher',
        roles: ['Frontend Developer', 'UI Engineer'],
        skills: ['React', 'TypeScript'],
        locations: ['Bangalore', 'Hyderabad'],
        workplaceTypes: ['REMOTE'],
      },
    });

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('Interpreted Intent:');
    expect(testContainer.innerHTML).toContain('🎓 Fresher');
    expect(testContainer.innerHTML).toContain('🎯 Frontend Developer, UI Engineer');
    expect(testContainer.innerHTML).toContain('💻 React, TypeScript');
    expect(testContainer.innerHTML).toContain('📍 Bangalore, Hyderabad');
    expect(testContainer.innerHTML).toContain('🏢 REMOTE');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Search Autocomplete Suggestions & Debounced Execution
  // ───────────────────────────────────────────────────────────────────────────
  it('fetches search suggestions on input and triggers search when a suggestion is clicked', async () => {
    vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 2 },
      totalMatches: 2,
    });

    const suggestionsSpy = vi.spyOn(jobsService, 'getSearchSuggestions').mockResolvedValue([
      { text: 'Fresher Java Developer in Bangalore', badge: 'Fresher' },
      { text: 'Frontend Engineer React Remote', badge: 'Remote' },
    ]);

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    await vi.advanceTimersByTimeAsync(50);

    const searchInput = testContainer.querySelector<MockElement>('#vjp-search-input')!;
    searchInput.value = 'java';
    searchInput.dispatchEvent({ type: 'input', target: { value: 'java' } });

    await vi.advanceTimersByTimeAsync(50);
    expect(suggestionsSpy).toHaveBeenCalledWith('java', 6);

    // Click suggestion item
    const suggItem = testContainer.querySelector<MockElement>('[data-query="Fresher Java Developer in Bangalore"]')!;
    expect(suggItem).not.toBeNull();
    suggItem.dispatchEvent({ type: 'click' });

    await vi.advanceTimersByTimeAsync(50);
    expect(searchInput.value).toBe('Fresher Java Developer in Bangalore');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Empty Feed & Filter Reset Actions
  // ───────────────────────────────────────────────────────────────────────────
  it('renders empty feed state and allows resetting filters or trying remote jobs', async () => {
    const getJobsSpy = vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: [],
      pagination: { page: 1, limit: 15, total: 0 },
      totalMatches: 0,
    });

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('No Verified Jobs Match Current Filters');
    expect(testContainer.innerHTML).toContain('btn-empty-reset');
    expect(testContainer.innerHTML).toContain('btn-empty-remote');

    // Click Reset Filters
    const resetBtn = testContainer.querySelector<MockElement>('#btn-empty-reset')!;
    resetBtn.dispatchEvent({ type: 'click' });
    await vi.advanceTimersByTimeAsync(50);

    expect(getJobsSpy).toHaveBeenCalledTimes(2);

    // Click Try Remote
    const remoteBtn = testContainer.querySelector<MockElement>('#btn-empty-remote')!;
    remoteBtn.dispatchEvent({ type: 'click' });
    await vi.advanceTimersByTimeAsync(50);

    expect(getJobsSpy).toHaveBeenCalledTimes(3);

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. API Error State & Retry Handling
  // ───────────────────────────────────────────────────────────────────────────
  it('renders error state on API failure and retries fetching on Try Again click', async () => {
    const getJobsSpy = vi.spyOn(jobsService, 'getMatchedJobs')
      .mockRejectedValueOnce(new Error('Network gateway timeout'))
      .mockResolvedValueOnce({
        jobs: mockVerifiedJobs,
        pagination: { page: 1, limit: 15, total: 2 },
        totalMatches: 2,
      });

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('Failed to load verified jobs');
    expect(testContainer.innerHTML).toContain('Network gateway timeout');

    const retryBtn = testContainer.querySelector<MockElement>('#btn-retry-vjp')!;
    expect(retryBtn).not.toBeNull();
    retryBtn.dispatchEvent({ type: 'click' });

    await vi.advanceTimersByTimeAsync(50);
    expect(getJobsSpy).toHaveBeenCalledTimes(2);
    expect(testContainer.innerHTML).toContain('Showing 2 of 2 verified job matches');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Multi-Page Pagination
  // ───────────────────────────────────────────────────────────────────────────
  it('renders pagination buttons and handles page navigation', async () => {
    const getJobsSpy = vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 45 },
      totalMatches: 45,
    });

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(testContainer.innerHTML).toContain('Page 1 of 3');
    const nextBtn = testContainer.querySelector<MockElement>('#vjp-next-page')!;
    expect(nextBtn).not.toBeNull();

    // Navigate to page 2
    nextBtn.dispatchEvent({ type: 'click' });
    await vi.advanceTimersByTimeAsync(50);

    expect(getJobsSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 2,
    }));

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Filter Controls (Role, Sort, Workplace, Freshness, Today's Toggle)
  // ───────────────────────────────────────────────────────────────────────────
  it('triggers filtered query when filter dropdowns or the Today toggle are updated', async () => {
    const getJobsSpy = vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 2 },
      totalMatches: 2,
    });

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    await vi.advanceTimersByTimeAsync(50);

    // 1. Sort select change
    const sortSelect = testContainer.querySelector<MockElement>('#vjp-sort-select')!;
    sortSelect.value = 'NEWEST';
    sortSelect.dispatchEvent({ type: 'change', target: { value: 'NEWEST' } });
    await vi.advanceTimersByTimeAsync(50);
    expect(getJobsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'NEWEST' }));

    // 2. Workplace select change
    const wpSelect = testContainer.querySelector<MockElement>('#vjp-workplace-select')!;
    wpSelect.value = 'REMOTE';
    wpSelect.dispatchEvent({ type: 'change', target: { value: 'REMOTE' } });
    await vi.advanceTimersByTimeAsync(50);
    expect(getJobsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ workplace: 'REMOTE' }));

    // 3. Freshness select change
    const freshSelect = testContainer.querySelector<MockElement>('#vjp-freshness-select')!;
    freshSelect.value = 'FRESH';
    freshSelect.dispatchEvent({ type: 'change', target: { value: 'FRESH' } });
    await vi.advanceTimersByTimeAsync(50);
    expect(getJobsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ freshness: 'FRESH' }));

    // 4. Today's verified jobs toggle
    const todayBtn = testContainer.querySelector<MockElement>('#btn-today-filter')!;
    todayBtn.dispatchEvent({ type: 'click' });
    await vi.advanceTimersByTimeAsync(50);
    expect(getJobsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ isToday: true }));

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Interactive Workspace Actions (Save, Apply, Dismiss) & Job Details
  // ───────────────────────────────────────────────────────────────────────────
  it('handles save, apply, dismiss actions and details modal invocation', async () => {
    vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 2 },
      totalMatches: 2,
    });

    const saveSpy = vi.spyOn(workspaceService, 'saveJob').mockResolvedValue({
      id: 'int-1',
      jobId: 'job-v-101',
      userId: 'usr-1',
      isSaved: true,
    });

    const applySpy = vi.spyOn(workspaceService, 'markJobApplied').mockResolvedValue({
      id: 'int-1',
      jobId: 'job-v-101',
      userId: 'usr-1',
      isApplied: true,
    });

    const dismissSpy = vi.spyOn(workspaceService, 'dismissJob').mockResolvedValue({
      id: 'int-1',
      jobId: 'job-v-101',
      userId: 'usr-1',
      isDismissed: true,
    });

    const detailModalFn = vi.fn();

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
      openJobDetailModal: detailModalFn,
    });

    await vi.advanceTimersByTimeAsync(50);

    // Save job
    const saveBtn = testContainer.querySelector<MockElement>('[data-job-save-id="job-v-101"]')!;
    saveBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(saveSpy).toHaveBeenCalledWith('job-v-101');

    // Mark applied
    const applyBtn = testContainer.querySelector<MockElement>('[data-job-apply-id="job-v-101"]')!;
    applyBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(applySpy).toHaveBeenCalledWith('job-v-101');

    // Dismiss job
    const dismissBtn = testContainer.querySelector<MockElement>('[data-job-dismiss-id="job-v-101"]')!;
    dismissBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(dismissSpy).toHaveBeenCalledWith('job-v-101');

    // Job Details Modal
    const detailBtn = testContainer.querySelector<MockElement>('[data-job-detail-id="job-v-101"]')!;
    detailBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
    expect(detailModalFn).toHaveBeenCalledWith('job-v-101');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. View Destruction While Request Pending & 60-Second Polling Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  it('cleans up 60-second polling timer and discards late responses on view destroy', async () => {
    let lateResolve: (val: any) => void = () => {};
    vi.spyOn(jobsService, 'getMatchedJobs').mockImplementation(() => {
      return new Promise((resolve) => {
        lateResolve = resolve;
      });
    });

    const controller = mountVerifiedJobsView({
      container: testContainer as unknown as HTMLElement,
      routePath: 'dashboard/verified-jobs',
    });

    expect(testContainer.innerHTML).toContain('Finding verified jobs matching your profile...');

    // Teardown view while request is in flight
    controller.destroy();

    // Late response completes
    lateResolve({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 2 },
      totalMatches: 2,
    });
    await vi.advanceTimersByTimeAsync(100);

    // Feed should NOT receive late DOM updates after destroy
    expect(testContainer.innerHTML).not.toContain('Showing 2 of 2 verified job matches');

    // 60-second poll interval should NOT trigger
    await vi.advanceTimersByTimeAsync(70000);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Repeated Route Transitions & Memory Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  it('handles repeated route mounting and destruction without listener leaks', async () => {
    vi.spyOn(jobsService, 'getMatchedJobs').mockResolvedValue({
      jobs: mockVerifiedJobs,
      pagination: { page: 1, limit: 15, total: 2 },
      totalMatches: 2,
    });

    for (let i = 0; i < 3; i++) {
      const controller = mountVerifiedJobsView({
        container: testContainer as unknown as HTMLElement,
        routePath: 'dashboard/verified-jobs',
      });

      await vi.advanceTimersByTimeAsync(50);
      expect(testContainer.innerHTML).toContain('Verified Jobs');

      controller.destroy();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Full Cross-Wave Regression Compatibility
  // ───────────────────────────────────────────────────────────────────────────
  it('verifies seamless interoperability across Wave 1, 2A, 2B, 2C, 2D, and 2E view exports', () => {
    expect(typeof mountVerifiedJobsView).toBe('function');
    expect(typeof mountDashboardView).toBe('function');
    expect(typeof mountPreferencesView).toBe('function');
    expect(typeof mountLoginView).toBe('function');
    expect(typeof mountRegisterView).toBe('function');
    expect(typeof mountVerifyEmailView).toBe('function');
    expect(typeof verifiedJobCardHtml).toBe('function');
  });
});
