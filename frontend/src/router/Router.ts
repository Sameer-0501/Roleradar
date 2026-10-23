/**
 * RoleRadar — Typed Hash Router Module (Wave 3B).
 *
 * Dedicated, typed routing engine responsible for:
 * - Hash parsing and route normalization.
 * - Route registration and alias resolution.
 * - Public vs. protected route authentication guards.
 * - Role-based authorization for administrative surfaces.
 * - Strict view controller lifecycle orchestration (destroy-before-mount).
 * - DOM layout class toggling and application-shell navigation state synchronization.
 * - Deterministic event listener teardown on router destruction.
 */

import {
  mountVerifyEmailView,
  mountLoginView,
  mountRegisterView,
  mountPreferencesView,
  mountDashboardView,
  mountVerifiedJobsView,
  mountSavedJobsView,
  mountApplicationsView,
  mountHiddenJobsView,
  mountAlertsView,
  mountCandidateProfileView,
  mountAccountSettingsView,
  mountResumeBuilderView,
  mountPlacementPrepView,
  mountAdminConsoleView,
  mountLandingView,
} from '../views/index.js';
import { openJobDetailModal as defaultOpenJobDetailModal } from '../components/JobDetailModal.js';
import { showToast as defaultShowToast } from '../services/ui/toast.js';
import { httpClient } from '../services/api/client.js';
import {
  updateNavVisibility as defaultUpdateNavVisibility,
  updateNavActiveState as defaultUpdateNavActiveState,
} from '../services/ui/navigation.js';

export interface ViewController {
  destroy: () => void;
}

export type RouteName =
  | 'landing'
  | 'login'
  | 'register'
  | 'verify-email'
  | 'preferences'
  | 'onboarding'
  | 'dashboard'
  | 'verified-jobs'
  | 'saved'
  | 'applications'
  | 'dismissed'
  | 'alerts'
  | 'account'
  | 'profile'
  | 'resume'
  | 'prep'
  | 'admin';

export interface RouterOptions {
  containerId?: string;
  mainId?: string;
  onLogout?: () => void;
  showToast?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  openJobDetailModal?: (jobId: string, onStateChange?: any, options?: any) => Promise<void>;
  updateNavVisibility?: () => void;
  updateNavActiveState?: (path: string) => void;
}

export const ROUTES: Record<string, RouteName> = {
  '': 'landing',
  'login': 'login',
  'register': 'register',
  'preferences': 'preferences',
  'onboarding': 'onboarding', // legacy alias
  'settings': 'preferences',  // legacy alias → canonical preferences
  'verify-email': 'verify-email',
  'dashboard': 'dashboard',
  'dashboard/verified-jobs': 'verified-jobs',
  'dashboard/saved': 'saved',
  'dashboard/applications': 'applications',
  'dashboard/dismissed': 'dismissed',
  'dashboard/hidden': 'dismissed', // alias
  'dashboard/alerts': 'alerts',
  'dashboard/account': 'account',
  'dashboard/profile': 'profile',
  'dashboard/resume': 'resume',
  'dashboard/prep': 'prep',
  'admin': 'admin',
};

export const PROTECTED_ROUTES: ReadonlySet<string> = new Set([
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
]);

/**
 * Parses and returns the cleaned hash route from window.location.hash.
 */
export function getRoute(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.slice(1) || '';
  return hash.replace(/^\/?|\/?$/g, '') || '';
}

/**
 * Resolves a route path to its canonical RouteName.
 */
export function getRouteName(path: string): RouteName {
  const cleanPath = (path || '').split('?')[0].replace(/^\/?|\/?$/g, '');
  if (ROUTES[cleanPath]) return ROUTES[cleanPath];
  if (cleanPath === 'verify-email' || cleanPath.indexOf('verify-email') === 0) return 'verify-email';
  if (cleanPath === 'dashboard' || cleanPath.indexOf('dashboard') === 0) {
    if (cleanPath.indexOf('dashboard/verified-jobs') === 0) return 'verified-jobs';
    if (cleanPath.indexOf('dashboard/saved') === 0) return 'saved';
    if (cleanPath.indexOf('dashboard/applications') === 0) return 'applications';
    if (cleanPath.indexOf('dashboard/dismissed') === 0 || cleanPath.indexOf('dashboard/hidden') === 0) return 'dismissed';
    if (cleanPath.indexOf('dashboard/alerts') === 0) return 'alerts';
    if (cleanPath.indexOf('dashboard/account') === 0) return 'account';
    if (cleanPath.indexOf('dashboard/profile') === 0) return 'profile';
    if (cleanPath.indexOf('dashboard/resume') === 0) return 'resume';
    if (cleanPath.indexOf('dashboard/prep') === 0) return 'prep';
    return 'dashboard';
  }
  if (cleanPath === 'admin' || cleanPath.indexOf('admin') === 0) return 'admin';
  return 'landing';
}

/**
 * Checks whether the current session is authenticated.
 */
export function isAuthenticated(): boolean {
  return Boolean(httpClient.getToken());
}

/**
 * Determines whether a route name requires authentication.
 */
export function requiresAuth(routeName: string): boolean {
  return PROTECTED_ROUTES.has(routeName);
}

/**
 * Verifies if the authenticated user has administrator privileges.
 */
export function checkIsAdmin(): boolean {
  const user = (httpClient.getUser() as any) ?? null;
  if (user && (user.isAdmin === true || user.is_admin === true)) {
    return true;
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('roleradar_auth_user');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.isAdmin === true || parsed.is_admin === true)) {
          return true;
        }
      } catch {}
    }
  }
  return false;
}

export function updateNavVisibility(): void {
  defaultUpdateNavVisibility();
}

export function updateNavActiveState(currentPath: string): void {
  defaultUpdateNavActiveState(currentPath);
}

function defaultLogout(): void {
  httpClient.clearAuth();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('roleradar_preferences');
    localStorage.removeItem('roleradar_onboarding_completed');
  }
  defaultUpdateNavVisibility();
  if (typeof window !== 'undefined') {
    window.location.hash = '#/login';
  }
}

export function logout(): void {
  defaultLogout();
}

/**
 * Canonical Typed Router Class.
 */
export class Router {
  private currentViewController: ViewController | null = null;
  private isStarted = false;
  private hashChangeListener: (() => void) | null = null;
  private options: Required<RouterOptions>;

  constructor(options: RouterOptions = {}) {
    this.options = {
      containerId: options.containerId || 'app-page',
      mainId: options.mainId || 'app-main',
      onLogout: options.onLogout || defaultLogout,
      showToast: options.showToast || defaultShowToast,
      openJobDetailModal: options.openJobDetailModal || defaultOpenJobDetailModal,
      updateNavVisibility: options.updateNavVisibility || defaultUpdateNavVisibility,
      updateNavActiveState: options.updateNavActiveState || defaultUpdateNavActiveState,
    };
  }

  /**
   * Starts the router, attaches window hashchange listener, and triggers initial dispatch.
   */
  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    this.hashChangeListener = () => {
      this.render();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', this.hashChangeListener);
    }

    this.render();
  }

  /**
   * Destroys the router, detaches listeners, and unmounts the active view controller.
   */
  public destroy(): void {
    if (this.hashChangeListener && typeof window !== 'undefined') {
      window.removeEventListener('hashchange', this.hashChangeListener);
      this.hashChangeListener = null;
    }

    if (this.currentViewController && typeof this.currentViewController.destroy === 'function') {
      try {
        this.currentViewController.destroy();
      } catch (err) {
        console.error('[Router] Error destroying view controller on router teardown:', err);
      }
      this.currentViewController = null;
    }

    this.isStarted = false;
  }

  /**
   * Navigates to the specified route hash.
   */
  public navigate(route: string): void {
    if (typeof window === 'undefined') return;
    const targetHash = route.startsWith('#')
      ? route
      : '#/' + route.replace(/^\/?|\/?$/g, '');

    if (window.location.hash === targetHash) {
      // Force render if already on the requested hash
      this.render();
    } else {
      window.location.hash = targetHash;
    }
  }

  /**
   * Returns the currently active view controller instance.
   */
  public getCurrentController(): ViewController | null {
    return this.currentViewController;
  }

  /**
   * Returns whether the router has been started.
   */
  public isRunning(): boolean {
    return this.isStarted;
  }

  /**
   * Triggers logout via options and redirects to login route.
   */
  public logout(): void {
    this.options.onLogout();
  }

  /**
   * Core route dispatcher and lifecycle executor.
   */
  public render(): void {
    // 1. Destroy previously mounted view controller before mounting next view
    if (this.currentViewController && typeof this.currentViewController.destroy === 'function') {
      try {
        this.currentViewController.destroy();
      } catch (err) {
        console.error('[Router] Error destroying previous view controller:', err);
      }
      this.currentViewController = null;
    }

    const path = getRoute();
    const name = getRouteName(path);

    // 2. Authentication guard
    if (requiresAuth(name) && !isAuthenticated()) {
      this.navigate('login');
      return;
    }

    // 3. Authenticated user hitting public guest routes -> redirect to dashboard
    if (isAuthenticated() && (name === 'login' || name === 'register' || name === 'landing')) {
      this.navigate('dashboard');
      return;
    }

    // 4. Admin authorization role check
    if (name === 'admin' && !checkIsAdmin()) {
      this.options.showToast('Access denied. Administrator privileges required.', 'error');
      this.navigate('dashboard');
      return;
    }

    if (typeof document === 'undefined') return;

    try {
      const container = document.getElementById(this.options.containerId);
      const main = document.getElementById(this.options.mainId);
      if (!container || !main) return;

      // 5. Layout styling: Dashboard shell layout gets full-width
      const isDashboardRoute = [
        'dashboard',
        'verified-jobs',
        'saved',
        'applications',
        'dismissed',
        'alerts',
        'account',
        'profile',
        'resume',
        'prep',
        'admin',
      ].includes(name);

      if (isDashboardRoute) {
        main.classList.add('app-main--dashboard');
        container.style.maxWidth = '';
        container.style.padding = '0';
      } else {
        main.classList.remove('app-main--dashboard');
        container.style.maxWidth = '';
        container.style.padding = '';
      }

      container.dataset.route = path;
      container.className = 'app-page app-page--' + name;

      const navigateHandler = (route: string) => this.navigate(route);
      const navSuccessHandler = () => this.options.updateNavVisibility();

      // 6. View Mount Dispatcher
      switch (name) {
        case 'landing':
          this.currentViewController = mountLandingView({
            container: container,
            onNavigate: navigateHandler,
            isAuthenticated: isAuthenticated,
          });
          break;

        case 'login':
          this.currentViewController = mountLoginView({
            container: container,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onSuccess: navSuccessHandler,
          });
          break;

        case 'register':
          this.currentViewController = mountRegisterView({
            container: container,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onSuccess: navSuccessHandler,
          });
          break;

        case 'preferences':
        case 'onboarding':
          this.currentViewController = mountPreferencesView({
            container: container,
            routeName: name,
            isEditing: name !== 'onboarding',
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
          });
          break;

        case 'verify-email':
          this.currentViewController = mountVerifyEmailView({
            container: container,
            showToast: this.options.showToast,
          });
          break;

        case 'dashboard':
          this.currentViewController = mountDashboardView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
            openJobDetailModal: this.options.openJobDetailModal,
          });
          break;

        case 'verified-jobs':
          this.currentViewController = mountVerifiedJobsView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
            openJobDetailModal: this.options.openJobDetailModal,
          });
          break;

        case 'saved':
          this.currentViewController = mountSavedJobsView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
            openJobDetailModal: this.options.openJobDetailModal,
          });
          break;

        case 'applications':
          this.currentViewController = mountApplicationsView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
            openJobDetailModal: this.options.openJobDetailModal,
          });
          break;

        case 'dismissed':
          this.currentViewController = mountHiddenJobsView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
            openJobDetailModal: this.options.openJobDetailModal,
          });
          break;

        case 'alerts':
          this.currentViewController = mountAlertsView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
          });
          break;

        case 'profile':
          this.currentViewController = mountCandidateProfileView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
          });
          break;

        case 'account':
          this.currentViewController = mountAccountSettingsView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
          });
          break;

        case 'resume':
          this.currentViewController = mountResumeBuilderView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
          });
          break;

        case 'prep':
          this.currentViewController = mountPlacementPrepView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
          });
          break;

        case 'admin':
          this.currentViewController = mountAdminConsoleView({
            container: container,
            routePath: path,
            showToast: this.options.showToast,
            onNavigate: navigateHandler,
            onLogout: this.options.onLogout,
          });
          break;

        default:
          this.currentViewController = mountLandingView({
            container: container,
            onNavigate: navigateHandler,
            isAuthenticated: isAuthenticated,
          });
          break;
      }
    } catch (mountError) {
      console.error(`[Router] Failed to mount view for route "${name}":`, mountError);
      this.currentViewController = null;
    }

    // 7. Synchronize shell navigation states
    this.options.updateNavVisibility();
    this.options.updateNavActiveState(path);
  }
}

/**
 * Singleton canonical Router instance for application-wide use.
 */
export const router = new Router();
