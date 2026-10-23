/**
 * RoleRadar — Canonical Application Bootstrap & Entry-Point Coordinator (Wave 4A).
 *
 * Dedicated, typed module responsible for:
 * - Deterministic, single-owner application startup.
 * - Idempotency guard: prevents duplicate initializations, listener attachments, or router starts.
 * - LocalStorage state migration (kcarrier_* -> roleradar_*).
 * - Shell navigation event binding and visibility synchronization.
 * - Starting the canonical Router instance exactly once.
 * - Safe reset utility for testing environments.
 */

import { router, Router, type ViewController } from './router/Router.js';
import {
  setupNav,
  updateNavVisibility,
  updateNavActiveState,
  resetNavForTesting,
} from './services/ui/navigation.js';

export interface BootstrapResult {
  router: Router;
  currentViewController: ViewController | null;
  isStarted: boolean;
  alreadyInitialized: boolean;
}

export interface BootstrapOptions {
  customRouter?: Router;
  skipStorageMigration?: boolean;
}

let appInitialized = false;
let activeRouter: Router = router;

/**
 * Migrates historical localStorage keys from kcarrier_* prefix to roleradar_* prefix.
 * Preserves backward compatibility and user session continuity.
 */
export function migrateLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;

  const keys = ['preferences', 'onboarding_completed', 'auth_token', 'auth_user'];
  keys.forEach((key) => {
    const oldKey = `kcarrier_${key}`;
    const newKey = `roleradar_${key}`;
    try {
      const oldVal = localStorage.getItem(oldKey);
      const newVal = localStorage.getItem(newKey);
      if (oldVal !== null && newVal === null) {
        localStorage.setItem(newKey, oldVal);
      }
    } catch {
      // Storage access may be restricted in sandboxed iframes
    }
  });
}

/**
 * Returns whether the application has already been initialized.
 */
export function isAppInitialized(): boolean {
  return appInitialized;
}

/**
 * Primary Application Initialization Entry Point.
 *
 * Initializes the application shell and starts routing.
 * Guaranteed to execute exactly once; subsequent invocations return the active state safely.
 */
export function initApp(options: BootstrapOptions = {}): BootstrapResult {
  if (appInitialized) {
    return {
      router: activeRouter,
      currentViewController: activeRouter.getCurrentController(),
      isStarted: activeRouter.isRunning(),
      alreadyInitialized: true,
    };
  }

  appInitialized = true;
  activeRouter = options.customRouter || router;

  // 1. Perform storage migration
  if (!options.skipStorageMigration) {
    migrateLocalStorage();
  }

  // 2. Synchronize initial header navigation state
  updateNavVisibility();

  // 3. Attach responsive shell navigation events
  setupNav();

  // 4. Start canonical router (attaches hashchange and renders initial view)
  activeRouter.start();

  return {
    router: activeRouter,
    currentViewController: activeRouter.getCurrentController(),
    isStarted: activeRouter.isRunning(),
    alreadyInitialized: false,
  };
}

/**
 * Resets bootstrap state, navigation listeners, and router execution for testing isolation.
 */
export function resetBootstrapForTesting(): void {
  if (activeRouter && activeRouter.isRunning()) {
    activeRouter.destroy();
  }
  resetNavForTesting();
  appInitialized = false;
  activeRouter = router;
}

export {
  setupNav,
  updateNavVisibility,
  updateNavActiveState,
};
