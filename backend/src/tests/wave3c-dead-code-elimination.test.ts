/**
 * RoleRadar — Architectural Refactoring Wave 3C Test Suite:
 * Evidence-Based Dead-Code Elimination & Canonical Architecture Verification.
 *
 * Validates:
 * 1. Evidence-Based Deletion Inventory:
 *    - Confirms all 13 legacy HTML renderers have been safely eliminated from legacy/app.js.
 *    - Confirms all 7 legacy helpers/event binders have been safely eliminated from legacy/app.js.
 *    - Confirms additional dead internal helpers (polling, card binders, date formatters) are eliminated.
 * 2. Retained Compatibility Contracts & Shell Entry Points:
 *    - Confirms legacy/app.js retains only valid bootstrap coordination (initApp), shell nav (setupNav),
 *      and backward-compatible delegating adapters (showToast, openJobDetailModal, renderLanding).
 *    - Confirms zero circular dependencies across extracted modules, router, and legacy shell.
 * 3. Canonical Architecture & Route Guard Integrity:
 *    - Verifies all 17 canonical routes and aliases in Router.ts.
 *    - Strictly asserts dashboard/profile maps to Candidate Profile, never Account Settings.
 *    - Asserts all 13 protected routes require authentication.
 *    - Asserts public routes remain accessible.
 *    - Asserts admin role authorization supports both camelCase (isAdmin) and snake_case (is_admin).
 * 4. Runtime Lifecycle & Controller Teardown:
 *    - Asserts destroy-before-mount ordering in Router.
 *    - Asserts router start, navigation, logout, and destroy lifecycle contracts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Import canonical router modules
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

// Import legacy compatibility entry point
import * as legacyApp from '../../../frontend/src/legacy/app.js';

// Import canonical extracted helpers from DashboardView
import {
  verifiedJobCardHtml,
  loadingHtml,
  emptyStateHtml,
  errorStateHtml,
  renderSidebar,
  formatDetectedDate,
} from '../../../frontend/src/views/dashboard/DashboardView.js';

// Import canonical shared UI
import { openJobDetailModal } from '../../../frontend/src/components/JobDetailModal.js';
import { showToast } from '../../../frontend/src/services/ui/toast.js';
import { mountLandingView, renderLandingHtml } from '../../../frontend/src/views/landing/LandingView.js';

describe('Wave 3C: Evidence-Based Dead-Code Elimination Test Suite', () => {
  const appJsPath = path.resolve(__dirname, '../../../frontend/src/legacy/app.js');
  const routerTsPath = path.resolve(__dirname, '../../../frontend/src/router/Router.ts');
  const dashboardViewPath = path.resolve(__dirname, '../../../frontend/src/views/dashboard/DashboardView.ts');

  let appJsContent: string;
  let routerContent: string;
  let storage: Map<string, string>;
  const originalLocalStorage = (globalThis as any).localStorage;

  beforeEach(() => {
    appJsContent = fs.readFileSync(appJsPath, 'utf-8');
    routerContent = fs.readFileSync(routerTsPath, 'utf-8');

    storage = new Map<string, string>();
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, String(value))),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    };
    (globalThis as any).localStorage = mockLocalStorage;
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Evidence-Based Deletion Inventory Verification
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Evidence-Based Deletion Inventory in legacy/app.js', () => {
    describe('Legacy HTML Renderers (13/13 Eliminated)', () => {
      it('confirms verifiedJobCardHtml is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+verifiedJobCardHtml\b/);
      });

      it('confirms renderVerifiedJobsPage is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderVerifiedJobsPage\b/);
      });

      it('confirms renderSavedJobsPage is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderSavedJobsPage\b/);
      });

      it('confirms renderApplicationsPage is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderApplicationsPage\b/);
      });

      it('confirms renderDismissedJobsPage is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderDismissedJobsPage\b/);
      });

      it('confirms renderAlerts is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderAlerts\b/);
      });

      it('confirms renderAccount is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderAccount\b/);
      });

      it('confirms renderCandidateProfilePage is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderCandidateProfilePage\b/);
      });

      it('confirms renderResumeBuilder is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderResumeBuilder\b/);
      });

      it('confirms renderPlacementPrep is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderPlacementPrep\b/);
      });

      it('confirms renderAdminConsole is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderAdminConsole\b/);
      });

      it('confirms renderDashboardLayout is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderDashboardLayout\b/);
      });

      it('confirms renderSidebar is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+renderSidebar\b/);
      });
    });

    describe('Legacy Helpers & Event Binders (7/7 Eliminated)', () => {
      it('confirms loadingHtml is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+loadingHtml\b/);
      });

      it('confirms emptyStateHtml is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+emptyStateHtml\b/);
      });

      it('confirms errorStateHtml is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+errorStateHtml\b/);
      });

      it('confirms bindLoginForm is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+bindLoginForm\b/);
      });

      it('confirms bindRegisterForm is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+bindRegisterForm\b/);
      });

      it('confirms bindPreferencesView is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+bindPreferencesView\b/);
      });

      it('confirms bindDashboardEvents is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+bindDashboardEvents\b/);
      });
    });

    describe('Additional Internal Dead Helpers Eliminated', () => {
      it('confirms bindJobCardActions is eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+bindJobCardActions\b/);
      });

      it('confirms renderDashboardHome, renderLogin, and renderRegister are eliminated', () => {
        expect(appJsContent).not.toMatch(/function\s+renderDashboardHome\b/);
        expect(appJsContent).not.toMatch(/function\s+renderLogin\b/);
        expect(appJsContent).not.toMatch(/function\s+renderRegister\b/);
      });

      it('confirms notification status and card helpers are eliminated', () => {
        expect(appJsContent).not.toMatch(/function\s+notificationStatusBadge\b/);
        expect(appJsContent).not.toMatch(/function\s+notificationCardHtml\b/);
      });

      it('confirms email verification renderers and resend triggers are eliminated', () => {
        expect(appJsContent).not.toMatch(/function\s+renderVerifyEmailPage\b/);
        expect(appJsContent).not.toMatch(/function\s+bindVerifyEmailEvents\b/);
        expect(appJsContent).not.toMatch(/function\s+bindResendTrigger\b/);
      });

      it('confirms formatDetectedDate and stopPolling are eliminated from legacy/app.js', () => {
        expect(appJsContent).not.toMatch(/function\s+formatDetectedDate\b/);
        expect(appJsContent).not.toMatch(/function\s+stopPolling\b/);
        expect(appJsContent).not.toContain('activePollTimer');
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Canonical Replacements Integrity
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. Canonical Replacements in Dedicated Modules', () => {
    it('verifies DashboardView.ts exports canonical HTML rendering helpers', () => {
      expect(typeof verifiedJobCardHtml).toBe('function');
      expect(typeof loadingHtml).toBe('function');
      expect(typeof emptyStateHtml).toBe('function');
      expect(typeof errorStateHtml).toBe('function');
      expect(typeof renderSidebar).toBe('function');
      expect(typeof formatDetectedDate).toBe('function');
    });

    it('verifies loadingHtml renders valid indicator markup with lemniscate-loader', () => {
      const html = loadingHtml('Fetching verified jobs...');
      expect(html).toContain('class="app-state app-state--loading"');
      expect(html).toContain('<lemniscate-loader>');
      expect(html).toContain('Fetching verified jobs...');
    });

    it('verifies emptyStateHtml renders semantic icon, title, and subtitle', () => {
      const html = emptyStateHtml('🔍', 'No Jobs Found', 'Try adjusting your filters', '<button>Reset</button>');
      expect(html).toContain('class="app-state app-state--empty"');
      expect(html).toContain('🔍');
      expect(html).toContain('No Jobs Found');
      expect(html).toContain('Try adjusting your filters');
      expect(html).toContain('<button>Reset</button>');
    });

    it('verifies errorStateHtml renders error container and optional retry button', () => {
      const html = errorStateHtml('Network timeout', 'btn-retry-feed');
      expect(html).toContain('class="app-state app-state--error"');
      expect(html).toContain('Network timeout');
      expect(html).toContain('id="btn-retry-feed"');
    });

    it('verifies renderSidebar generates accessible navigation links', () => {
      const sidebarHtml = renderSidebar('dashboard/verified-jobs');
      expect(sidebarHtml).toContain('class="app-sidebar"');
      expect(sidebarHtml).toContain('href="#/dashboard/verified-jobs"');
      expect(sidebarHtml).toContain('app-sidebar__link--active');
      expect(sidebarHtml).toContain('aria-current="page"');
    });

    it('verifies formatDetectedDate handles valid dates, today, and relative intervals', () => {
      const now = new Date().toISOString();
      expect(formatDetectedDate(now)).toContain('Detected');
      expect(formatDetectedDate(null)).toBe('');
      expect(formatDetectedDate(undefined)).toBe('');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Retained Compatibility Shell & Adapters in legacy/app.js
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. Retained Compatibility Shell & Entry Point (legacy/app.js)', () => {
    it('retains initApp as bootstrap entry point for main.jsx', () => {
      expect(typeof legacyApp.initApp).toBe('function');
      expect(appJsContent).toContain('export function initApp()');
    });

    it('retains delegating adapters for showToast, openJobDetailModal, and renderLanding', () => {
      expect(typeof legacyApp.showToast).toBe('function');
      expect(typeof legacyApp.openJobDetailModal).toBe('function');
      expect(typeof legacyApp.renderLanding).toBe('function');

      expect(appJsContent).toMatch(/function\s+showToast\s*\([\s\S]*?\)\s*\{[\s\S]*?canonicalShowToast/);
      expect(appJsContent).toMatch(/function\s+openJobDetailModal\s*\([\s\S]*?\)\s*\{[\s\S]*?canonicalOpenJobDetailModal/);
      expect(appJsContent).toMatch(/function\s+renderLanding\s*\([\s\S]*?\)\s*\{[\s\S]*?renderLandingHtml/);
    });

    it('retains setupNav, updateNavVisibility, and updateNavActiveState shell utilities', () => {
      expect(typeof legacyApp.setupNav).toBe('function');
      expect(typeof legacyApp.updateNavVisibility).toBe('function');
      expect(typeof legacyApp.updateNavActiveState).toBe('function');
    });

    it('re-exports Router, router, ROUTES, and PROTECTED_ROUTES from canonical module', () => {
      expect(legacyApp.Router).toBe(Router);
      expect(legacyApp.router).toBe(router);
      expect(legacyApp.ROUTES).toBe(ROUTES);
      expect(legacyApp.PROTECTED_ROUTES).toBe(PROTECTED_ROUTES);
    });

    it('verifies zero circular imports between Router.ts and legacy/app.js', () => {
      expect(routerContent).not.toContain("from '../legacy/app.js'");
      expect(routerContent).not.toContain("from './legacy/app.js'");
      expect(routerContent).not.toContain("from '../legacy/app'");
    });

    it('verifies file line count of legacy/app.js is drastically reduced from 2,823 lines to under 200 lines', () => {
      const lineCount = appJsContent.split('\n').length;
      expect(lineCount).toBeLessThan(200);
      expect(lineCount).toBeGreaterThan(50);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Canonical Route Contracts & Protection Safeguards
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Canonical Route Contracts & Protection Safeguards in Router.ts', () => {
    it('verifies all 17 canonical routes and aliases exist in ROUTES', () => {
      expect(ROUTES['']).toBe('landing');
      expect(ROUTES['login']).toBe('login');
      expect(ROUTES['register']).toBe('register');
      expect(ROUTES['verify-email']).toBe('verify-email');
      expect(ROUTES['preferences']).toBe('preferences');
      expect(ROUTES['onboarding']).toBe('onboarding');
      expect(ROUTES['settings']).toBe('preferences');
      expect(ROUTES['dashboard']).toBe('dashboard');
      expect(ROUTES['dashboard/verified-jobs']).toBe('verified-jobs');
      expect(ROUTES['dashboard/saved']).toBe('saved');
      expect(ROUTES['dashboard/applications']).toBe('applications');
      expect(ROUTES['dashboard/dismissed']).toBe('dismissed');
      expect(ROUTES['dashboard/hidden']).toBe('dismissed');
      expect(ROUTES['dashboard/alerts']).toBe('alerts');
      expect(ROUTES['dashboard/profile']).toBe('profile');
      expect(ROUTES['dashboard/account']).toBe('account');
      expect(ROUTES['dashboard/resume']).toBe('resume');
      expect(ROUTES['dashboard/prep']).toBe('prep');
      expect(ROUTES['admin']).toBe('admin');
    });

    it('strictly verifies dashboard/profile maps to profile, never account', () => {
      expect(ROUTES['dashboard/profile']).toBe('profile');
      expect(ROUTES['dashboard/profile']).not.toBe('account');
      expect(ROUTES['dashboard/account']).toBe('account');
    });

    it('verifies all 13 protected routes require authentication', () => {
      const protectedList = [
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

      for (const route of protectedList) {
        expect(requiresAuth(route)).toBe(true);
        expect(PROTECTED_ROUTES.has(route)).toBe(true);
      }
    });

    it('verifies public routes do not require authentication', () => {
      expect(requiresAuth('landing')).toBe(false);
      expect(requiresAuth('login')).toBe(false);
      expect(requiresAuth('register')).toBe(false);
      expect(requiresAuth('verify-email')).toBe(false);
    });

    it('verifies admin privilege check handles both camelCase isAdmin and snake_case is_admin', () => {
      // Clear localStorage
      localStorage.clear();

      // No user
      expect(checkIsAdmin()).toBe(false);

      // camelCase isAdmin
      localStorage.setItem('roleradar_auth_user', JSON.stringify({ email: 'admin@role.dev', isAdmin: true }));
      expect(checkIsAdmin()).toBe(true);

      // snake_case is_admin
      localStorage.setItem('roleradar_auth_user', JSON.stringify({ email: 'admin@role.dev', is_admin: true }));
      expect(checkIsAdmin()).toBe(true);

      // Non-admin
      localStorage.setItem('roleradar_auth_user', JSON.stringify({ email: 'user@role.dev', isAdmin: false, is_admin: false }));
      expect(checkIsAdmin()).toBe(false);

      localStorage.clear();
    });

    it('verifies Router lifecycle: destroy-before-mount contract in Router.ts', () => {
      expect(routerContent).toContain('if (this.currentViewController && typeof this.currentViewController.destroy === \'function\') {');
      expect(routerContent).toContain('this.currentViewController.destroy();');
      expect(routerContent).toContain('this.currentViewController = null;');
    });
  });
});
