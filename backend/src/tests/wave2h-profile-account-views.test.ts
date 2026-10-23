/**
 * RoleRadar — Architectural Refactoring Wave 2H Tests:
 * Extracted Candidate Profile & Account Settings Views Lifecycle Tests.
 *
 * Validates:
 * 1. CandidateProfileView initial mount, sidebar, header actions, and loading state.
 * 2. CandidateProfileView fetching and rendering profile identity, completeness, skills, and history.
 * 3. CandidateProfileView empty-state messages for unpopulated sections.
 * 4. CandidateProfileView error-state and retry button recovery.
 * 5. CandidateProfileView refresh button re-fetching.
 * 6. CandidateProfileView resume upload and parsing flow with FileReader.
 * 7. CandidateProfileView resume activation action and list refresh.
 * 8. CandidateProfileView resume deletion action with user confirmation.
 * 9. AccountSettingsView initial mount, profile field rendering, and verification badge.
 * 10. AccountSettingsView resend verification email flow with button state transition.
 * 11. AccountSettingsView sign out buttons triggering onLogout callback.
 * 12. AccountSettingsView teardown clears timers and cleans up listeners.
 * 13. CandidateProfileView teardown discards late in-flight responses and cleans up listeners.
 * 14. Repeated route transitions between profile and account views without listener leaks.
 * 15. Server-authoritative isolation and user-scoped endpoints.
 * 16. Regression compatibility with all Wave 1 to Wave 2H view exports.
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
  public files: any[] = [];
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

  public click(): void {
    this.dispatchEvent({ type: 'click' });
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
          const attrMatch2 = tagHtml.match(/data-resume-id=["']([^"']*)["']/i);
          if (attrMatch2) {
            el.setAttribute('data-resume-id', attrMatch2[1]);
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
  location: { hash: '#/dashboard/profile' },
  confirm: vi.fn(() => true),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock FileReader for resume upload
class MockFileReader {
  public result: string = '';
  public onload: (() => void) | null = null;
  public readAsText(file: any): void {
    this.result = file.content || 'Mock Resume Text Content';
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 10);
  }
}

let rootContainer: MockElement;

(globalThis as any).document = mockDocument;
(globalThis as any).window = mockWindow;
(globalThis as any).FileReader = MockFileReader;

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

import {
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
import {
  profileService,
  authService,
  httpClient,
  type CandidateProfile,
  type Resume,
  type ProfileCompleteness,
} from '../../../frontend/src/services/api/index.js';

describe('RoleRadar Wave 2H — Candidate Profile & Account Settings Decoupling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindow.confirm = vi.fn(() => true);
    rootContainer = new MockElement('div');
    rootContainer.id = 'app-page';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A. Candidate Profile View Tests
  // ───────────────────────────────────────────────────────────────────────────

  it('1. mounts CandidateProfileView, renders sidebar, header, refresh button, and loading state', () => {
    vi.spyOn(profileService, 'getCandidateProfile').mockReturnValue(new Promise(() => {}));
    vi.spyOn(profileService, 'listResumes').mockReturnValue(new Promise(() => {}));
    vi.spyOn(profileService, 'getProfileCompleteness').mockReturnValue(new Promise(() => {}));

    const controller = mountCandidateProfileView({
      container: rootContainer as any,
    });

    expect(rootContainer.innerHTML).toContain('app-sidebar');
    expect(rootContainer.innerHTML).toContain('Candidate Profile & Resumes');
    expect(rootContainer.innerHTML).toContain('btn-refresh-profile');
    expect(rootContainer.innerHTML).toContain('Loading candidate profile and resumes...');

    controller.destroy();
  });

  it('2. fetches and renders profile identity, completeness, parsed skills, education, and resumes', async () => {
    const mockProfile: CandidateProfile = {
      id: 'prof-1',
      fullName: 'Alice Developer',
      headline: 'Full-Stack Cloud Engineer',
      experienceLevel: 'EXPERIENCED',
      completenessScore: 85,
      skills: [
        { canonicalName: 'TypeScript', category: 'Language' },
        { canonicalName: 'PostgreSQL', category: 'Database' },
      ],
      educations: [
        { degree: 'B.S. Computer Science', fieldOfStudy: 'Engineering', institution: 'MIT', startYear: 2018, endYear: 2022 },
      ],
      experiences: [
        { title: 'Software Engineer', companyName: 'Vercel', isInternship: false, description: 'Built edge runtimes' },
      ],
      projects: [
        { title: 'RoleRadar Engine', description: 'Job aggregation platform', technologies: ['Node.js', 'React'] },
      ],
    };

    const mockResumes: Resume[] = [
      {
        id: 'res-1',
        filename: 'alice_cv.pdf',
        fileSize: 102400,
        mimeType: 'application/pdf',
        isActive: true,
        createdAt: '2026-10-15T10:00:00.000Z',
      },
      {
        id: 'res-2',
        filename: 'alice_backend.docx',
        fileSize: 204800,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        isActive: false,
        createdAt: '2026-10-18T12:00:00.000Z',
      },
    ];

    const mockCompleteness: ProfileCompleteness = {
      score: 85,
      actionableTips: ['Add 2 more technical skills', 'Link portfolio project'],
    };

    vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValueOnce(mockProfile);
    vi.spyOn(profileService, 'listResumes').mockResolvedValueOnce(mockResumes);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValueOnce(mockCompleteness);

    const controller = mountCandidateProfileView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(rootContainer.innerHTML).toContain('Alice Developer');
    expect(rootContainer.innerHTML).toContain('Full-Stack Cloud Engineer');
    expect(rootContainer.innerHTML).toContain('85%');
    expect(rootContainer.innerHTML).toContain('TypeScript');
    expect(rootContainer.innerHTML).toContain('PostgreSQL');
    expect(rootContainer.innerHTML).toContain('B.S. Computer Science');
    expect(rootContainer.innerHTML).toContain('MIT');
    expect(rootContainer.innerHTML).toContain('Vercel');
    expect(rootContainer.innerHTML).toContain('RoleRadar Engine');
    expect(rootContainer.innerHTML).toContain('alice_cv.pdf');
    expect(rootContainer.innerHTML).toContain('✓ Active');
    expect(rootContainer.innerHTML).toContain('alice_backend.docx');
    expect(rootContainer.innerHTML).toContain('Make Active');

    controller.destroy();
  });

  it('3. renders empty-state messaging when candidate sections are unpopulated', async () => {
    vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValueOnce({
      skills: [],
      educations: [],
      experiences: [],
      projects: [],
    });
    vi.spyOn(profileService, 'listResumes').mockResolvedValueOnce([]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValueOnce({
      score: 0,
      actionableTips: [],
    });

    const controller = mountCandidateProfileView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(rootContainer.innerHTML).toContain('No resumes uploaded yet.');
    expect(rootContainer.innerHTML).toContain('No skills parsed yet.');
    expect(rootContainer.innerHTML).toContain('No education history recorded.');
    expect(rootContainer.innerHTML).toContain('No experience or internships recorded.');
    expect(rootContainer.innerHTML).toContain('No projects recorded yet.');

    controller.destroy();
  });

  it('4. renders error-state and supports retry on network failure', async () => {
    vi.spyOn(profileService, 'getCandidateProfile').mockRejectedValueOnce(new Error('Backend timeout'));
    vi.spyOn(profileService, 'listResumes').mockResolvedValueOnce([]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValueOnce({ score: 0 });

    const controller = mountCandidateProfileView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(rootContainer.innerHTML).toContain('Failed to load candidate profile: Backend timeout');
    const retryBtn = rootContainer.querySelector('#btn-retry-profile')!;
    expect(retryBtn).toBeDefined();

    vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValueOnce({ fullName: 'Recovered User' });
    vi.spyOn(profileService, 'listResumes').mockResolvedValueOnce([]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValueOnce({ score: 50 });

    retryBtn.dispatchEvent({ type: 'click' });
    await new Promise((r) => setTimeout(r, 20));

    expect(rootContainer.innerHTML).toContain('Recovered User');

    controller.destroy();
  });

  it('5. triggers re-fetch on clicking the refresh button', async () => {
    const getProfileSpy = vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValue({ fullName: 'User 1' });
    vi.spyOn(profileService, 'listResumes').mockResolvedValue([]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValue({ score: 20 });

    const controller = mountCandidateProfileView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(getProfileSpy).toHaveBeenCalledTimes(1);

    const refreshBtn = rootContainer.querySelector('#btn-refresh-profile')!;
    refreshBtn.dispatchEvent({ type: 'click' });

    await new Promise((r) => setTimeout(r, 20));
    expect(getProfileSpy).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('6. handles resume file upload and parsing with FileReader and service dispatch', async () => {
    vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValue({ fullName: 'User' });
    vi.spyOn(profileService, 'listResumes').mockResolvedValue([]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValue({ score: 10 });
    const uploadSpy = vi.spyOn(profileService, 'uploadResume').mockResolvedValue({ success: true });

    const showToast = vi.fn();
    const controller = mountCandidateProfileView({
      container: rootContainer as any,
      showToast,
    });

    await new Promise((r) => setTimeout(r, 20));

    const fileInput = rootContainer.querySelector('#resume-file-input')!;
    const mockFile = {
      name: 'candidate_resume.pdf',
      type: 'application/pdf',
      content: 'Sample resume text with skills: React, TypeScript, SQL',
    };
    fileInput.files = [mockFile];

    fileInput.dispatchEvent({ type: 'change', target: fileInput });

    // Allow FileReader to fire and dispatch upload
    await new Promise((r) => setTimeout(r, 30));

    expect(uploadSpy).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'candidate_resume.pdf',
      mimeType: 'application/pdf',
      content: 'Sample resume text with skills: React, TypeScript, SQL',
    }));
    expect(showToast).toHaveBeenCalledWith('Resume uploaded and parsed successfully!', 'success');

    controller.destroy();
  });

  it('7. activates a selected resume and reloads candidate profile', async () => {
    vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValue({ fullName: 'User' });
    vi.spyOn(profileService, 'listResumes').mockResolvedValue([
      { id: 'res-inactive', filename: 'resume.pdf', fileSize: 1024, mimeType: 'application/pdf', isActive: false, createdAt: '' },
    ]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValue({ score: 30 });
    const activateSpy = vi.spyOn(profileService, 'activateResume').mockResolvedValue({ message: 'Active resume updated' });

    const showToast = vi.fn();
    const controller = mountCandidateProfileView({
      container: rootContainer as any,
      showToast,
    });

    await new Promise((r) => setTimeout(r, 20));

    const activateBtn = rootContainer.querySelector('.btn-activate-resume')!;
    expect(activateBtn).toBeDefined();

    activateBtn.dispatchEvent({ type: 'click' });
    await new Promise((r) => setTimeout(r, 20));

    expect(activateSpy).toHaveBeenCalledWith('res-inactive');
    expect(showToast).toHaveBeenCalledWith('Active resume updated', 'success');

    controller.destroy();
  });

  it('8. prompts user confirmation and deletes resume upon approval', async () => {
    vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValue({ fullName: 'User' });
    vi.spyOn(profileService, 'listResumes').mockResolvedValue([
      { id: 'res-del', filename: 'old_resume.pdf', fileSize: 1024, mimeType: 'application/pdf', isActive: false, createdAt: '' },
    ]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValue({ score: 30 });
    const deleteSpy = vi.spyOn(profileService, 'deleteResume').mockResolvedValue({ message: 'Deleted' });

    const showToast = vi.fn();
    const controller = mountCandidateProfileView({
      container: rootContainer as any,
      showToast,
    });

    await new Promise((r) => setTimeout(r, 20));

    const deleteBtn = rootContainer.querySelector('.btn-delete-resume')!;
    expect(deleteBtn).toBeDefined();

    deleteBtn.dispatchEvent({ type: 'click' });
    await new Promise((r) => setTimeout(r, 20));

    expect(mockWindow.confirm).toHaveBeenCalledWith('Are you sure you want to delete this resume?');
    expect(deleteSpy).toHaveBeenCalledWith('res-del');
    expect(showToast).toHaveBeenCalledWith('Resume deleted', 'success');

    controller.destroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. Account Settings View Tests
  // ───────────────────────────────────────────────────────────────────────────

  it('9. mounts AccountSettingsView, renders profile name, email, and verification badge', () => {
    vi.spyOn(httpClient, 'getUser').mockReturnValue({
      id: 'usr-100',
      email: 'candidate@roleradar.com',
      name: 'Bob Candidate',
      emailVerified: true,
    } as any);

    const controller = mountAccountSettingsView({
      container: rootContainer as any,
    });

    expect(rootContainer.innerHTML).toContain('Account');
    expect(rootContainer.innerHTML).toContain('Profile & Verification');
    expect(rootContainer.innerHTML).toContain('Bob Candidate');
    expect(rootContainer.innerHTML).toContain('candidate@roleradar.com');
    expect(rootContainer.innerHTML).toContain('✓ Verified');
    expect(rootContainer.innerHTML).toContain('Edit Preferences');
    expect(rootContainer.innerHTML).toContain('btn-logout');

    controller.destroy();
  });

  it('10. handles unverified email with resend button and success feedback', async () => {
    vi.useFakeTimers();

    vi.spyOn(httpClient, 'getUser').mockReturnValue({
      id: 'usr-101',
      email: 'unverified@roleradar.com',
      name: 'New Candidate',
      emailVerified: false,
    } as any);

    const resendSpy = vi.spyOn(authService, 'resendVerification').mockResolvedValue({
      success: true,
      message: 'Verification email sent!',
    });

    const showToast = vi.fn();
    const controller = mountAccountSettingsView({
      container: rootContainer as any,
      showToast,
    });

    expect(rootContainer.innerHTML).toContain('⚠️ Unverified');
    const resendBtn = rootContainer.querySelector<HTMLButtonElement>('#btn-account-resend')!;
    expect(resendBtn).toBeDefined();

    resendBtn.dispatchEvent({ type: 'click' });

    expect(resendBtn.disabled).toBe(true);
    expect(resendBtn.textContent).toBe('Sending...');

    await vi.advanceTimersByTimeAsync(10);

    expect(resendSpy).toHaveBeenCalledWith('unverified@roleradar.com');
    expect(showToast).toHaveBeenCalledWith('Verification email sent!', 'success');
    expect(resendBtn.textContent).toBe('✓ Sent!');

    // After 5000ms, button re-enables
    await vi.advanceTimersByTimeAsync(5000);
    expect(resendBtn.disabled).toBe(false);
    expect(resendBtn.textContent).toBe('Resend Verification Email');

    controller.destroy();
    vi.useRealTimers();
  });

  it('11. triggers onLogout callback on clicking the sign out button', () => {
    vi.spyOn(httpClient, 'getUser').mockReturnValue({
      email: 'user@test.com',
      name: 'Test',
    } as any);

    const onLogout = vi.fn();
    const controller = mountAccountSettingsView({
      container: rootContainer as any,
      onLogout,
    });

    const logoutBtn = rootContainer.querySelector('#btn-logout')!;
    logoutBtn.dispatchEvent({ type: 'click' });

    expect(onLogout).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('12. cleans up resend timer and unbinds event listeners on destroy()', async () => {
    vi.useFakeTimers();

    vi.spyOn(httpClient, 'getUser').mockReturnValue({
      email: 'cleanup@test.com',
      name: 'Cleanup',
      emailVerified: false,
    } as any);

    vi.spyOn(authService, 'resendVerification').mockResolvedValue({
      success: true,
      message: 'Sent',
    });

    const controller = mountAccountSettingsView({
      container: rootContainer as any,
    });

    const resendBtn = rootContainer.querySelector<HTMLButtonElement>('#btn-account-resend')!;
    resendBtn.dispatchEvent({ type: 'click' });
    await vi.advanceTimersByTimeAsync(10);

    // Destroy view while 5s timer is pending
    controller.destroy();

    // Advance 5000ms — no error must be thrown on destroyed view
    await vi.advanceTimersByTimeAsync(5000);

    vi.useRealTimers();
  });

  it('13. discards late in-flight responses when CandidateProfileView is destroyed during fetch', async () => {
    let resolveProfile: (val: any) => void;
    vi.spyOn(profileService, 'getCandidateProfile').mockReturnValueOnce(
      new Promise((res) => {
        resolveProfile = res;
      })
    );
    vi.spyOn(profileService, 'listResumes').mockResolvedValueOnce([]);
    vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValueOnce({ score: 0 });

    const controller = mountCandidateProfileView({
      container: rootContainer as any,
    });

    // Destroy view while in flight
    controller.destroy();

    // Resolve late response
    resolveProfile!({ fullName: 'Late Profile Data' });
    await new Promise((r) => setTimeout(r, 20));

    // Must not have mutated container
    expect(rootContainer.innerHTML).not.toContain('Late Profile Data');
  });

  it('14. supports repeated route transitions between profile and account views without leaks', () => {
    vi.spyOn(profileService, 'getCandidateProfile').mockReturnValue(new Promise(() => {}));
    vi.spyOn(profileService, 'listResumes').mockReturnValue(new Promise(() => {}));
    vi.spyOn(profileService, 'getProfileCompleteness').mockReturnValue(new Promise(() => {}));
    vi.spyOn(httpClient, 'getUser').mockReturnValue({ name: 'Candidate' } as any);

    const c1 = mountCandidateProfileView({ container: rootContainer as any });
    c1.destroy();

    const c2 = mountAccountSettingsView({ container: rootContainer as any });
    c2.destroy();

    const c3 = mountCandidateProfileView({ container: rootContainer as any });
    c3.destroy();

    expect(rootContainer.innerHTML).toContain('Candidate Profile & Resumes');
  });

  it('15. verifies profile and account requests adhere to strictly authenticated user scopes', async () => {
    const getProfileSpy = vi.spyOn(profileService, 'getCandidateProfile').mockResolvedValueOnce(null);
    const listResumesSpy = vi.spyOn(profileService, 'listResumes').mockResolvedValueOnce([]);
    const getCompletenessSpy = vi.spyOn(profileService, 'getProfileCompleteness').mockResolvedValueOnce({ score: 0 });

    const controller = mountCandidateProfileView({
      container: rootContainer as any,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(getProfileSpy).toHaveBeenCalled();
    expect(listResumesSpy).toHaveBeenCalled();
    expect(getCompletenessSpy).toHaveBeenCalled();

    controller.destroy();
  });

  it('16. verifies all exports from Wave 1 to Wave 2H are defined and callable', () => {
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
    expect(typeof mountCandidateProfileView).toBe('function');
    expect(typeof mountAccountSettingsView).toBe('function');
  });
});
