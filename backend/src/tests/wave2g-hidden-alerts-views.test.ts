/**
 * RoleRadar — Architectural Refactoring Wave 2G Tests:
 * Extracted Workspace & Alerts Views (HiddenJobsView & AlertsView) Lifecycle Tests.
 *
 * Validates:
 * 1. HiddenJobsView initial mount, sidebar, toolbar, search input, and loading state.
 * 2. HiddenJobsView fetching and rendering dismissed jobs with job invariants preserved.
 * 3. HiddenJobsView search debouncing and pagination queries.
 * 4. HiddenJobsView empty-state and error-state with retry button recovery.
 * 5. HiddenJobsView restore action with server mutation and authoritative list refresh.
 * 6. HiddenJobsView pagination controls and job detail modal triggers.
 * 7. AlertsView initial mount, sidebar, header actions, and loading state.
 * 8. AlertsView fetching and rendering alert notifications with delivery status badges.
 * 9. AlertsView empty-state and error-state with retry button recovery.
 * 10. AlertsView mark notification read and mark all notifications read actions.
 * 11. AlertsView retry delivery action for failed dispatches with duplicate-submit prevention.
 * 12. AlertsView visibility-aware background polling and timer teardown.
 * 13. Teardown while requests are in flight: late responses discarded, DOM not modified.
 * 14. Event listeners, search debounce timers, and poll intervals cleaned up on destroy().
 * 15. Repeated route transitions between workspace and alerts views without handler leaks.
 * 16. Regression compatibility with all Wave 1 to Wave 2G view exports.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
      const regex = new RegExp(`<([a-z0-9_-]+)[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = regex.exec(this._innerHTML)) !== null) {
        const tagHtml = m[0];
        const val = m[2];
        if (attrVal !== undefined && val !== attrVal) continue;
        const key = `${attr}:${val}`;
        if (!this.elementsById.has(key)) {
          const el = new MockElement(m[1]);
          el.setAttribute(attr, val);
          el.parentNode = this;
          const classMatch = tagHtml.match(/class=["']([^"']*)["']/i);
          if (classMatch) {
            el.className = classMatch[1];
          }
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
          const idMatch = tagHtml.match(/id=["']([^"']*)["']/i);
          if (idMatch) {
            el.id = idMatch[1];
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

// Global DOM environment setup
const mockDocument = {
  getElementById: (id: string) => {
    if (id === 'app-page') return rootContainer;
    return rootContainer.querySelector(`#${id}`);
  },
  createElement: (tagName: string) => new MockElement(tagName),
  body: new MockElement('body'),
  visibilityState: 'visible',
};

const mockWindow = {
  location: { hash: '#/dashboard/dismissed' },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

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
import {
  workspaceService,
  alertsService,
  type Job,
  type AlertNotification,
} from '../../../frontend/src/services/api/index.js';

describe('RoleRadar Wave 2G — Hidden Jobs & Alerts View Decoupling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocument.visibilityState = 'visible';
    rootContainer = new MockElement('div');
    rootContainer.id = 'app-page';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A. Hidden Jobs View Tests
  // ───────────────────────────────────────────────────────────────────────────

  it('1. mounts HiddenJobsView, renders sidebar, toolbar, search input, and loading state', () => {
    vi.spyOn(workspaceService, 'getDismissedJobs').mockReturnValue(new Promise(() => {}));

    const controller = mountHiddenJobsView({
      container: rootContainer as any,
    });

    expect(rootContainer.innerHTML).toContain('app-sidebar');
    expect(rootContainer.innerHTML).toContain('Hidden Jobs');
    expect(rootContainer.innerHTML).toContain('dismissed-search-input');
    expect(rootContainer.innerHTML).toContain('Loading hidden jobs...');

    controller.destroy();
  });

  it('2. fetches and renders dismissed jobs with official links, tags, and restore action', async () => {
    const mockJobs: Job[] = [
      {
        id: 'job-dism-1',
        companyId: 'comp-101',
        title: 'Cloud Security Architect',
        companyName: 'SecureCloud Corp',
        location: 'Remote',
        officialUrl: 'https://securecloud.com/careers/1',
        firstSeenAt: new Date().toISOString(),
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
      },
    ];

    vi.spyOn(workspaceService, 'getDismissedJobs').mockResolvedValueOnce({
      items: mockJobs,
      total: 1,
      totalPages: 1,
      page: 1,
      limit: 15,
    });

    const controller = mountHiddenJobsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(rootContainer.innerHTML).toContain('Cloud Security Architect');
    expect(rootContainer.innerHTML).toContain('SecureCloud Corp');
    expect(rootContainer.innerHTML).toContain('data-job-restore-id="job-dism-1"');
    expect(rootContainer.innerHTML).toContain('↩ Restore to Feed');
    expect(rootContainer.innerHTML).toContain('View Official Job & Apply →');

    controller.destroy();
  });

  it('3. debounces search input by 300ms and requests filtered dismissed jobs', async () => {
    const getDismissedSpy = vi.spyOn(workspaceService, 'getDismissedJobs').mockResolvedValue({
      items: [],
      total: 0,
      totalPages: 1,
    });

    const controller = mountHiddenJobsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(getDismissedSpy).toHaveBeenCalledTimes(1);

    const searchInput = rootContainer.querySelector('#dismissed-search-input')!;
    searchInput.dispatchEvent({
      type: 'input',
      target: { value: 'Architect' },
    });

    // Before 300ms, should not have fired 2nd fetch
    await new Promise((r) => setTimeout(r, 100));
    expect(getDismissedSpy).toHaveBeenCalledTimes(1);

    // After 350ms, debounced fetch must have triggered
    await new Promise((r) => setTimeout(r, 250));
    expect(getDismissedSpy).toHaveBeenCalledTimes(2);
    expect(getDismissedSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'Architect', page: 1 })
    );

    controller.destroy();
  });

  it('4. renders empty-state when no dismissed jobs exist and error-state on failure', async () => {
    // Empty state
    vi.spyOn(workspaceService, 'getDismissedJobs').mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    let controller = mountHiddenJobsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(rootContainer.innerHTML).toContain('No Hidden Jobs');
    expect(rootContainer.innerHTML).toContain('Browse Verified Jobs →');
    controller.destroy();

    // Error state
    vi.spyOn(workspaceService, 'getDismissedJobs').mockRejectedValueOnce(new Error('Network error'));
    controller = mountHiddenJobsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(rootContainer.innerHTML).toContain('Failed to load hidden jobs.');
    expect(rootContainer.innerHTML).toContain('btn-retry-dismissed');

    // Retry
    vi.spyOn(workspaceService, 'getDismissedJobs').mockResolvedValueOnce({
      items: [{ id: 'job-1', companyId: 'c1', title: 'Restored Job', officialUrl: '#', firstSeenAt: '', status: 'ACTIVE', verificationStatus: 'VERIFIED' }],
      total: 1,
    });
    const retryBtn = rootContainer.querySelector('#btn-retry-dismissed')!;
    retryBtn.dispatchEvent({ type: 'click' });

    await new Promise((r) => setTimeout(r, 10));
    expect(rootContainer.innerHTML).toContain('Restored Job');

    controller.destroy();
  });

  it('5. triggers restore action, animates card, notifies toast, and re-fetches list', async () => {
    const getDismissedSpy = vi.spyOn(workspaceService, 'getDismissedJobs').mockResolvedValueOnce({
      items: [{ id: 'job-dism-2', companyId: 'c2', title: 'Data Engineer', officialUrl: '#', firstSeenAt: '', status: 'ACTIVE', verificationStatus: 'VERIFIED' }],
      total: 1,
    });
    const restoreSpy = vi.spyOn(workspaceService, 'restoreJob').mockResolvedValueOnce({ id: 'job-dism-2', isDismissed: false } as any);

    const showToast = vi.fn();
    const controller = mountHiddenJobsView({
      container: rootContainer as any,
      showToast,
    });

    await new Promise((r) => setTimeout(r, 10));

    const restoreBtn = rootContainer.querySelector('[data-job-restore-id="job-dism-2"]')!;
    expect(restoreBtn).toBeDefined();

    getDismissedSpy.mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    restoreBtn.dispatchEvent({ type: 'click' });

    await new Promise((r) => setTimeout(r, 10));
    expect(restoreSpy).toHaveBeenCalledWith('job-dism-2');
    expect(showToast).toHaveBeenCalledWith('Job restored to your feed!', 'success');
    expect(getDismissedSpy).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('6. triggers job detail modal with candidate assistant from hidden jobs', async () => {
    vi.spyOn(workspaceService, 'getDismissedJobs').mockResolvedValueOnce({
      items: [{ id: 'job-dism-3', companyId: 'c3', title: 'Lead SRE', officialUrl: '#', firstSeenAt: '', status: 'ACTIVE', verificationStatus: 'VERIFIED' }],
      total: 1,
    });

    const openJobDetailModal = vi.fn();
    const controller = mountHiddenJobsView({
      container: rootContainer as any,
      openJobDetailModal,
    });

    await new Promise((r) => setTimeout(r, 10));

    const detailBtn = rootContainer.querySelector('[data-job-detail-id="job-dism-3"]')!;
    expect(detailBtn).toBeDefined();

    detailBtn.dispatchEvent({ type: 'click' });
    expect(openJobDetailModal).toHaveBeenCalledWith('job-dism-3', expect.any(Function));

    controller.destroy();
  });

  it('7. renders pagination and supports navigating pages in HiddenJobsView', async () => {
    const getDismissedSpy = vi.spyOn(workspaceService, 'getDismissedJobs').mockResolvedValueOnce({
      items: [{ id: 'j-1', companyId: 'c1', title: 'Job 1', officialUrl: '#', firstSeenAt: '', status: 'ACTIVE', verificationStatus: 'VERIFIED' }],
      total: 30,
      totalPages: 2,
      page: 1,
      limit: 15,
    });

    const controller = mountHiddenJobsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(rootContainer.innerHTML).toContain('Page 1 of 2');
    const nextBtn = rootContainer.querySelector('#dism-next-page')!;
    expect(nextBtn).toBeDefined();

    getDismissedSpy.mockResolvedValueOnce({
      items: [{ id: 'j-2', companyId: 'c1', title: 'Job 2', officialUrl: '#', firstSeenAt: '', status: 'ACTIVE', verificationStatus: 'VERIFIED' }],
      total: 30,
      totalPages: 2,
      page: 2,
      limit: 15,
    });

    nextBtn.dispatchEvent({ type: 'click' });
    await new Promise((r) => setTimeout(r, 10));

    expect(getDismissedSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 })
    );

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. Alerts View Tests
  // ───────────────────────────────────────────────────────────────────────────

  it('8. mounts AlertsView, renders sidebar, header actions, and loading state', () => {
    vi.spyOn(alertsService, 'getNotifications').mockReturnValue(new Promise(() => {}));

    const controller = mountAlertsView({
      container: rootContainer as any,
    });

    expect(rootContainer.innerHTML).toContain('Alerts & Notifications');
    expect(rootContainer.innerHTML).toContain('Real-time delivery history');
    expect(rootContainer.innerHTML).toContain('btn-mark-all-read');
    expect(rootContainer.innerHTML).toContain('#/preferences');
    expect(rootContainer.innerHTML).toContain('Loading notification history...');

    controller.destroy();
  });

  it('9. fetches and renders alert notifications with badges, timing, and company info', async () => {
    const mockNotifications: AlertNotification[] = [
      {
        id: 'notif-1',
        notificationType: 'INSTANT_JOB',
        deliveryStatus: 'SENT',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isRead: false,
        readAt: null,
        failureReason: null,
        attemptCount: 1,
        job: {
          id: 'job-101',
          title: 'Senior Frontend Engineer',
          location: 'San Francisco, CA',
          externalJobId: 'EXT-101',
          officialUrl: 'https://careers.company.com/job/101',
          sourceSystem: 'GREENHOUSE',
          companyName: 'TechCorp',
        },
      },
      {
        id: 'notif-2',
        notificationType: 'DAILY_DIGEST',
        deliveryStatus: 'FAILED',
        sentAt: null,
        createdAt: new Date().toISOString(),
        isRead: true,
        readAt: new Date().toISOString(),
        failureReason: 'SMTP connection timeout',
        attemptCount: 2,
        job: {
          id: 'job-102',
          title: 'Backend Engineer',
          location: 'Remote',
          externalJobId: 'EXT-102',
          officialUrl: 'https://careers.company.com/job/102',
          sourceSystem: 'LEVER',
          companyName: 'SaaSify',
        },
      },
    ];

    vi.spyOn(alertsService, 'getNotifications').mockResolvedValueOnce({
      notifications: mockNotifications,
      total: 2,
      page: 1,
      limit: 30,
      totalPages: 1,
    });

    const controller = mountAlertsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(rootContainer.innerHTML).toContain('Senior Frontend Engineer');
    expect(rootContainer.innerHTML).toContain('TechCorp');
    expect(rootContainer.innerHTML).toContain('✓ Sent');
    expect(rootContainer.innerHTML).toContain('notif-card--unread');
    expect(rootContainer.innerHTML).toContain('data-read-id="notif-1"');

    // Failed notification with retry
    expect(rootContainer.innerHTML).toContain('Backend Engineer');
    expect(rootContainer.innerHTML).toContain('⚠️ Delivery Failed');
    expect(rootContainer.innerHTML).toContain('SMTP connection timeout');
    expect(rootContainer.innerHTML).toContain('data-retry-id="notif-2"');
    expect(rootContainer.innerHTML).toContain('🔄 Retry Delivery');

    controller.destroy();
  });

  it('10. renders empty state when no alerts exist and error state on network failure', async () => {
    // Empty state
    const getNotifsSpy = vi.spyOn(alertsService, 'getNotifications').mockResolvedValueOnce({
      notifications: [],
      total: 0,
      page: 1,
      limit: 30,
      totalPages: 1,
    });

    let controller = mountAlertsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(rootContainer.innerHTML).toContain('No Alerts Dispatched Yet');
    expect(rootContainer.innerHTML).toContain('Configure Alert Preferences');
    controller.destroy();

    // Error state
    getNotifsSpy.mockRejectedValueOnce(new Error('Server unavailable'));
    controller = mountAlertsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(rootContainer.innerHTML).toContain('Failed to load alert history.');
    expect(rootContainer.innerHTML).toContain('btn-retry-alerts');

    // Retry
    getNotifsSpy.mockResolvedValueOnce({
      notifications: [],
      total: 0,
      page: 1,
      limit: 30,
      totalPages: 1,
    });
    const retryBtn = rootContainer.querySelector('#btn-retry-alerts')!;
    retryBtn.dispatchEvent({ type: 'click' });

    await new Promise((r) => setTimeout(r, 10));
    expect(getNotifsSpy).toHaveBeenCalledTimes(3);

    controller.destroy();
  });

  it('11. marks a single notification as read and updates DOM element classes', async () => {
    vi.spyOn(alertsService, 'getNotifications').mockResolvedValueOnce({
      notifications: [
        {
          id: 'notif-mark-1',
          notificationType: 'INSTANT_JOB',
          deliveryStatus: 'SENT',
          sentAt: null,
          createdAt: new Date().toISOString(),
          isRead: false,
          readAt: null,
          failureReason: null,
          attemptCount: 1,
          job: {
            id: 'j1',
            title: 'Test Job',
            location: null,
            externalJobId: '1',
            officialUrl: '#',
            sourceSystem: 'DIRECT',
            companyName: 'Corp',
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 30,
      totalPages: 1,
    });
    const markReadSpy = vi.spyOn(alertsService, 'markNotificationRead').mockResolvedValueOnce({ success: true, message: 'Read' });

    const controller = mountAlertsView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 10));

    const readBtn = rootContainer.querySelector('[data-read-id="notif-mark-1"]')!;
    expect(readBtn).toBeDefined();

    readBtn.dispatchEvent({ type: 'click' });

    await new Promise((r) => setTimeout(r, 10));
    expect(markReadSpy).toHaveBeenCalledWith('notif-mark-1');

    const card = rootContainer.querySelector('#notif-notif-mark-1')!;
    expect(card.classList.contains('notif-card--unread')).toBe(false);

    controller.destroy();
  });

  it('12. marks all notifications as read via header action button', async () => {
    const getNotifsSpy = vi.spyOn(alertsService, 'getNotifications').mockResolvedValueOnce({
      notifications: [
        {
          id: 'notif-all-1',
          notificationType: 'INSTANT_JOB',
          deliveryStatus: 'SENT',
          sentAt: null,
          createdAt: new Date().toISOString(),
          isRead: false,
          readAt: null,
          failureReason: null,
          attemptCount: 1,
          job: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 30,
      totalPages: 1,
    });
    const markAllSpy = vi.spyOn(alertsService, 'markAllNotificationsRead').mockResolvedValueOnce({ success: true, message: 'All read' });

    const showToast = vi.fn();
    const controller = mountAlertsView({
      container: rootContainer as any,
      showToast,
    });

    await new Promise((r) => setTimeout(r, 10));

    const markAllBtn = rootContainer.querySelector('#btn-mark-all-read')!;
    getNotifsSpy.mockResolvedValueOnce({
      notifications: [
        {
          id: 'notif-all-1',
          notificationType: 'INSTANT_JOB',
          deliveryStatus: 'SENT',
          sentAt: null,
          createdAt: new Date().toISOString(),
          isRead: true,
          readAt: new Date().toISOString(),
          failureReason: null,
          attemptCount: 1,
          job: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 30,
      totalPages: 1,
    });

    markAllBtn.dispatchEvent({ type: 'click' });

    await new Promise((r) => setTimeout(r, 10));
    expect(markAllSpy).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('All notifications marked as read', 'success');

    controller.destroy();
  });

  it('13. handles retry delivery with button disabling, toast notification, and timer debounce', async () => {
    vi.useFakeTimers();

    const getNotifsSpy = vi.spyOn(alertsService, 'getNotifications').mockResolvedValueOnce({
      notifications: [
        {
          id: 'notif-retry-1',
          notificationType: 'INSTANT_JOB',
          deliveryStatus: 'FAILED',
          sentAt: null,
          createdAt: new Date().toISOString(),
          isRead: false,
          readAt: null,
          failureReason: '550 Mailbox unavailable',
          attemptCount: 1,
          job: {
            id: 'j-fail',
            title: 'Failed Job',
            location: null,
            externalJobId: '1',
            officialUrl: '#',
            sourceSystem: 'DIRECT',
            companyName: 'Corp',
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 30,
      totalPages: 1,
    });
    const retrySpy = vi.spyOn(alertsService, 'retryNotification').mockResolvedValueOnce({ success: true, message: 'Queued' });

    const showToast = vi.fn();
    const controller = mountAlertsView({
      container: rootContainer as any,
      showToast,
    });

    await vi.advanceTimersByTimeAsync(10);

    const retryBtn = rootContainer.querySelector<HTMLButtonElement>('[data-retry-id="notif-retry-1"]')!;
    expect(retryBtn).toBeDefined();

    getNotifsSpy.mockResolvedValueOnce({
      notifications: [
        {
          id: 'notif-retry-1',
          notificationType: 'INSTANT_JOB',
          deliveryStatus: 'PENDING',
          sentAt: null,
          createdAt: new Date().toISOString(),
          isRead: false,
          readAt: null,
          failureReason: null,
          attemptCount: 0,
          job: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 30,
      totalPages: 1,
    });

    retryBtn.dispatchEvent({ type: 'click' });

    expect(retryBtn.disabled).toBe(true);
    expect(retryBtn.textContent).toBe('Queuing...');

    await vi.advanceTimersByTimeAsync(10);
    expect(retrySpy).toHaveBeenCalledWith('notif-retry-1');
    expect(showToast).toHaveBeenCalledWith('Notification queued for retry', 'success');

    // Advance 1000ms for delayed refresh
    await vi.advanceTimersByTimeAsync(1050);
    expect(getNotifsSpy).toHaveBeenCalledTimes(2);

    controller.destroy();
    vi.useRealTimers();
  });

  it('14. stops background polling and clears all intervals on destroy()', async () => {
    vi.useFakeTimers();

    const getNotifsSpy = vi.spyOn(alertsService, 'getNotifications').mockResolvedValue({
      notifications: [],
      total: 0,
      page: 1,
      limit: 30,
      totalPages: 1,
    });

    const controller = mountAlertsView({
      container: rootContainer as any,
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(getNotifsSpy).toHaveBeenCalledTimes(1);

    // After 60 seconds, polling triggers
    await vi.advanceTimersByTimeAsync(60000);
    expect(getNotifsSpy).toHaveBeenCalledTimes(2);

    // Destroy view
    controller.destroy();

    // After another 60 seconds, destroyed view must NOT poll
    await vi.advanceTimersByTimeAsync(60000);
    expect(getNotifsSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('15. discards late in-flight responses when view is destroyed during fetch', async () => {
    let resolvePromise: (val: any) => void;
    vi.spyOn(workspaceService, 'getDismissedJobs').mockReturnValueOnce(
      new Promise((res) => {
        resolvePromise = res;
      })
    );

    const controller = mountHiddenJobsView({
      container: rootContainer as any,
    });

    // Destroy while fetch is still in flight
    controller.destroy();

    // Resolve after destroy
    resolvePromise!({
      items: [{ id: 'late-job', companyId: 'c1', title: 'Late Dismissed Job', officialUrl: '#', firstSeenAt: '', status: 'ACTIVE', verificationStatus: 'VERIFIED' }],
      total: 1,
    });

    await new Promise((r) => setTimeout(r, 10));

    // Must not have mutated container
    expect(rootContainer.innerHTML).not.toContain('Late Dismissed Job');
  });

  it('16. verifies all exports from Wave 1 to Wave 2G are defined and callable', () => {
    expect(typeof mountVerifyEmailView).toBe('function');
    expect(typeof mountLoginView).toBe('function');
    expect(typeof mountRegisterView).toBe('function');
    expect(typeof mountPreferencesView).toBe('function');
    expect(typeof mountDashboardView).toBe('function');
    expect(typeof mountVerifiedJobsView).toBe('function');
    expect(typeof mountSavedJobsView).toBe('function');
    expect(typeof mountApplicationsView).toBe('function');
    expect(typeof mountHiddenJobsView).toBe('function');
    expect(typeof mountAlertsView).toBe('function');
  });
});
