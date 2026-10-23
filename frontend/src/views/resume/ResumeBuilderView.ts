/**
 * RoleRadar Resume Builder View.
 *
 * Encapsulates the candidate resume builder (#/dashboard/resume)
 * through a lifecycle-managed wrapper around the React-based Resume Builder.
 * Ensures single-root instantiation, safe unmounting, and sidebar navigation integrity.
 */

import { renderSidebar } from '../dashboard/DashboardView.js';
import { mountResumeBuilder, unmountResumeBuilder } from '../../dashboard/resume/main-resume.js';

export interface ResumeBuilderViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
  mountApp?: (element: HTMLElement) => { unmount: () => void } | void;
  unmountApp?: () => void;
}

export interface ResumeBuilderViewController {
  destroy: () => void;
}

export function mountResumeBuilderView(options: ResumeBuilderViewOptions): ResumeBuilderViewController {
  const {
    container,
    routePath = 'dashboard/resume',
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
        '<div id="resume-builder-root" style="min-height: 80vh;"></div>' +
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

  // 3. Mount React Resume Builder into #resume-builder-root
  const rootElement = container.querySelector<HTMLElement>('#resume-builder-root');
  if (rootElement) {
    if (mountApp) {
      const res = mountApp(rootElement);
      if (res && typeof res.unmount === 'function') {
        customUnmount = res.unmount;
      }
    } else {
      const res = mountResumeBuilder(rootElement);
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
          console.warn('[ResumeBuilderView] Error during custom unmount:', e);
        }
        customUnmount = null;
      } else if (unmountApp) {
        try {
          unmountApp();
        } catch (e) {
          console.warn('[ResumeBuilderView] Error during unmountApp:', e);
        }
      } else {
        try {
          unmountResumeBuilder();
        } catch (e) {
          console.warn('[ResumeBuilderView] Error unmounting resume builder:', e);
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
