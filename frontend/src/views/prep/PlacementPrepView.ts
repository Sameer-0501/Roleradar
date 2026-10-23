/**
 * RoleRadar Placement Prep View.
 *
 * Encapsulates the candidate placement preparation workspace (#/dashboard/prep)
 * through a lifecycle-managed wrapper around the React-based Placement Prep app.
 * Ensures single-root instantiation, safe unmounting, and sidebar navigation integrity.
 */

import { renderSidebar } from '../dashboard/DashboardView.js';
import { mountPrep, unmountPrep } from '../../dashboard/prep/main-prep.js';

export interface PlacementPrepViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
  mountApp?: (element: HTMLElement) => { unmount: () => void } | void;
  unmountApp?: () => void;
}

export interface PlacementPrepViewController {
  destroy: () => void;
}

export function mountPlacementPrepView(options: PlacementPrepViewOptions): PlacementPrepViewController {
  const {
    container,
    routePath = 'dashboard/prep',
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

  // 1. Render Dashboard Shell (Sidebar + React Container)
  container.innerHTML = (
    '<div class="app-dashboard-layout">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
        '<div id="prep-root" style="min-height: 80vh;"></div>' +
      '</div>' +
    '</div>'
  );

  // 2. Wire up sidebar Sign Out button
  const sidebarLogoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
  if (sidebarLogoutBtn) {
    addTrackedListener(sidebarLogoutBtn, 'click', () => {
      onLogout();
    });
  }

  // 3. Mount React Placement Prep into #prep-root
  const rootElement = container.querySelector<HTMLElement>('#prep-root');
  if (rootElement) {
    if (mountApp) {
      const res = mountApp(rootElement);
      if (res && typeof res.unmount === 'function') {
        customUnmount = res.unmount;
      }
    } else {
      const res = mountPrep(rootElement);
      if (res && typeof res.unmount === 'function') {
        customUnmount = res.unmount;
      }
    }
  }

  // 4. Teardown & Lifecycle Controller
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

      // Clean up React root exactly once
      if (customUnmount) {
        try {
          customUnmount();
        } catch (e) {
          console.warn('[PlacementPrepView] Error during custom unmount:', e);
        }
        customUnmount = null;
      } else if (unmountApp) {
        try {
          unmountApp();
        } catch (e) {
          console.warn('[PlacementPrepView] Error during unmountApp:', e);
        }
      } else {
        try {
          unmountPrep();
        } catch (e) {
          console.warn('[PlacementPrepView] Error unmounting prep:', e);
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
