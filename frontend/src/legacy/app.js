/**
 * RoleRadar — Application Shell & Backward-Compatibility Shim (Wave 4A).
 *
 * Application bootstrap ownership and shell navigation have been migrated
 * to canonical typed modules:
 * - Bootstrap: frontend/src/bootstrap.ts (owned by frontend/src/main.jsx)
 * - Navigation: frontend/src/services/ui/navigation.ts
 * - Router: frontend/src/router/Router.ts
 * - Shared UI: frontend/src/components/JobDetailModal.ts, frontend/src/services/ui/toast.ts
 * - Views: frontend/src/views/index.ts
 *
 * This module is retained strictly as a backward-compatibility delegation shim:
 * - Backward-compatible delegating exports (`Router`, `router`, `ROUTES`, `PROTECTED_ROUTES`).
 * - Backward-compatible delegating adapters for legacy callers (`showToast`, `openJobDetailModal`, `renderLanding`, `onLogout`).
 * - Delegating bridge for `initApp()`, `setupNav()`, `updateNavVisibility()`, `updateNavActiveState()`, `render()`.
 */

import {
  mountLandingView,
  renderLandingHtml,
} from '../views/index.js';
import { openJobDetailModal as canonicalOpenJobDetailModal } from '../components/JobDetailModal.js';
import { showToast as canonicalShowToast } from '../services/ui/toast.js';
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
} from '../router/Router.js';
import {
  setupNav as canonicalSetupNav,
  updateNavVisibility as canonicalUpdateNavVisibility,
  updateNavActiveState as canonicalUpdateNavActiveState,
} from '../services/ui/navigation.js';
import { initApp as canonicalInitApp } from '../bootstrap.js';

export { Router, router };
export {
  ROUTES,
  PROTECTED_ROUTES,
  getRoute,
  getRouteName,
  isAuthenticated,
  requiresAuth,
  checkIsAdmin,
  logout,
};

let currentViewController = null;

// ─────────────────────────────────────────────────────────────────────────────
// Backward-Compatible Delegating Adapters
// ─────────────────────────────────────────────────────────────────────────────

export function showToast(message, type) {
  return canonicalShowToast(message, type);
}

export async function openJobDetailModal(jobId, onStateChange, options) {
  return canonicalOpenJobDetailModal(jobId, onStateChange, options);
}

export function renderLanding() {
  return renderLandingHtml();
}

export function onLogout() {
  logout();
}

export function updateNavVisibility() {
  return canonicalUpdateNavVisibility();
}

export function updateNavActiveState(currentPath) {
  return canonicalUpdateNavActiveState(currentPath);
}

export function setupNav() {
  return canonicalSetupNav();
}

// ─────────────────────────────────────────────────────────────────────────────
// Router Integration & Render Bridge
// ─────────────────────────────────────────────────────────────────────────────

export function render() {
  if (currentViewController && typeof currentViewController.destroy === 'function') {
    currentViewController.destroy();
    currentViewController = null;
  }

  router.render();
  currentViewController = router.getCurrentController();
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Bootstrap Entry Point (Delegates to canonical bootstrap)
// ─────────────────────────────────────────────────────────────────────────────

let appInitialized = false;

export function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  canonicalInitApp();
  router.start();
  currentViewController = router.getCurrentController();
}

// Auto-init fallback
if (typeof window !== 'undefined' && !window.initApp) {
  window.initApp = initApp;
}
