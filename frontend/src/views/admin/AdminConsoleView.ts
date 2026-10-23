/**
 * RoleRadar Admin Console View.
 *
 * Encapsulates the administrative dashboard (#/admin)
 * through a lifecycle-managed wrapper around the React-based Admin Console.
 * Enforces frontend role-guards (admin privilege required), single-root instantiation,
 * safe unmounting, and sidebar navigation integrity.
 */

import { renderSidebar } from '../dashboard/DashboardView.js';
import { httpClient } from '../../services/api/index.js';
import { mountAdminConsole, unmountAdminConsole } from '../../dashboard/admin/main-admin.js';

export interface AdminConsoleViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
  mountApp?: (element: HTMLElement) => { unmount: () => void } | void;
  unmountApp?: () => void;
}

export interface AdminConsoleViewController {
  destroy: () => void;
}

function checkIsAdmin(): boolean {
  const user = (httpClient.getUser() as any) ?? null;
  if (user && (user.isAdmin === true || user.is_admin === true)) {
    return true;
  }
  if (typeof localStorage !== 'undefined') {
    const userJson = localStorage.getItem('roleradar_auth_user');
    if (userJson) {
      try {
        const parsed = JSON.parse(userJson);
        if (parsed && (parsed.isAdmin === true || parsed.is_admin === true)) {
          return true;
        }
      } catch {}
    }
  }
  return false;
}

export function mountAdminConsoleView(options: AdminConsoleViewOptions): AdminConsoleViewController {
  const {
    container,
    routePath = 'admin',
    showToast = (msg: string) => { console.log(msg); },
    onNavigate = (route: string) => { if (typeof window !== 'undefined') window.location.hash = route; },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
    mountApp,
    unmountApp,
  } = options;

  let isDestroyed = false;
  let customUnmount: (() => void) | null = null;
  const boundListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = [];

  function addTrackedListener(target: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(event, handler);
    boundListeners.push({ target, event, handler });
  }

  // 1. Authentication Guard: Must have valid session
  const token = httpClient.getToken();
  if (!token) {
    onNavigate('#/login');
    return {
      destroy: () => {},
    };
  }

  // 2. Authorization Guard: Must have administrator role
  const isAdmin = checkIsAdmin();
  if (!isAdmin) {
    showToast('Access denied: Administrator privileges required.', 'error');
    onNavigate('#/dashboard');

    container.innerHTML = (
      '<div class="app-dashboard-layout">' +
        renderSidebar(routePath) +
        '<div class="app-dashboard-main">' +
          '<div class="kn-card kn-p-4 kn-text-center" style="max-width: 500px; margin: 40px auto;">' +
            '<h2 class="kn-heading-2 kn-mb-2">⚠️ Access Denied</h2>' +
            '<p class="kn-mb-3">Administrator privileges are required to access the RoleRadar Admin Console.</p>' +
            '<a href="#/dashboard" class="kn-btn kn-btn--primary">Return to Dashboard</a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    const sidebarLogoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
    if (sidebarLogoutBtn) {
      addTrackedListener(sidebarLogoutBtn, 'click', () => {
        onLogout();
      });
    }

    return {
      destroy: () => {
        if (isDestroyed) return;
        isDestroyed = true;
        boundListeners.forEach(({ target, event, handler }) => {
          target.removeEventListener(event, handler);
        });
        boundListeners.length = 0;
      },
    };
  }

  // 3. Render Dashboard Shell (Sidebar + React Container)
  container.innerHTML = (
    '<div class="app-dashboard-layout">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
        '<div id="admin-console-root" style="min-height: 80vh;"></div>' +
      '</div>' +
    '</div>'
  );

  // 4. Wire up sidebar Sign Out button
  const sidebarLogoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
  if (sidebarLogoutBtn) {
    addTrackedListener(sidebarLogoutBtn, 'click', () => {
      onLogout();
    });
  }

  // 5. Mount React Admin Console into #admin-console-root
  const rootElement = container.querySelector<HTMLElement>('#admin-console-root');
  if (rootElement) {
    if (mountApp) {
      const res = mountApp(rootElement);
      if (res && typeof res.unmount === 'function') {
        customUnmount = res.unmount;
      }
    } else {
      const res = mountAdminConsole(rootElement);
      if (res && typeof res.unmount === 'function') {
        customUnmount = res.unmount;
      }
    }
  }

  // 6. Teardown & Lifecycle Controller
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

      // Clean up React root exactly once
      if (customUnmount) {
        try {
          customUnmount();
        } catch (e) {
          console.warn('[AdminConsoleView] Error during custom unmount:', e);
        }
        customUnmount = null;
      } else if (unmountApp) {
        try {
          unmountApp();
        } catch (e) {
          console.warn('[AdminConsoleView] Error during unmountApp:', e);
        }
      } else {
        try {
          unmountAdminConsole();
        } catch (e) {
          console.warn('[AdminConsoleView] Error unmounting admin console:', e);
        }
      }

      // Clean up DOM listeners
      boundListeners.forEach(({ target, event, handler }) => {
        target.removeEventListener(event, handler);
      });
      boundListeners.length = 0;
    },
  };
}
