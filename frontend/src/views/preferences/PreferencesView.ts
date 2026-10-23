/**
 * RoleRadar — Preferences & Onboarding View Module (Wave 2C).
 *
 * Extracted from legacy/app.js into a standalone, typed view component.
 * Handles the complete candidate matching preferences & onboarding lifecycle:
 * - Target job role selection (canonical hierarchy & custom roles)
 * - Preferred location selection & normalization
 * - Workplace type selection (On-site, Hybrid, Remote)
 * - Experience level selector (Fresher vs Experienced)
 * - Company directory scope selection (All Companies vs Specific)
 * - Notification and alert frequency preferences
 * - Clean disposal, cancellation guards, and event listener detachment
 */

import { preferencesService } from '../../services/api/preferences.service.js';
import { renderOnboardingView } from '../../modules/onboarding/onboarding-ui.js';
import type { UserPreferences } from '../../services/api/types.js';
import { showToast as defaultToast } from '../../services/ui/toast.js';

export interface PreferencesViewOptions {
  /** The container DOM element where the view should be mounted */
  container: HTMLElement;
  /** Whether the view is in editing mode (true) vs initial onboarding mode (false) */
  isEditing?: boolean;
  /** Current route name (e.g. 'preferences' vs 'onboarding') */
  routeName?: string;
  /** Optional initial preferences override (e.g. for testing or preloaded state) */
  initialPreferences?: UserPreferences | null;
  /** Toast notification callback */
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  /** Route navigation handler (defaults to window.location.hash) */
  onNavigate?: (route: string) => void;
  /** Optional callback invoked on successful preference save before navigation */
  onComplete?: (savedPreferences: UserPreferences) => void;
  /** Optional callback invoked on cancel */
  onCancel?: () => void;
}

export interface PreferencesViewController {
  /** Unmounts the view, detaches event listeners, and cancels pending async callbacks */
  destroy: () => void;
}

export function mountPreferencesView(options: PreferencesViewOptions): PreferencesViewController {
  const {
    container,
    isEditing: explicitEditing,
    routeName = 'preferences',
    initialPreferences: initialPrefsOverride,
    showToast = defaultToast,
    onNavigate = (route: string) => {
      if (typeof window !== 'undefined') window.location.hash = route;
    },
    onComplete,
    onCancel,
  } = options;

  let isDestroyed = false;
  let onboardingController: { destroy: () => void } | null = null;

  // Determine whether this is an initial first-time onboarding flow or preference editing
  const onboardingDone = typeof localStorage !== 'undefined'
    ? localStorage.getItem('roleradar_onboarding_completed')
    : null;

  const editing = explicitEditing !== undefined
    ? explicitEditing
    : (routeName === 'onboarding' ? !!onboardingDone : (!!onboardingDone || routeName === 'preferences'));

  // Render initial root container matching legacy structure with loading indicator
  container.innerHTML = `
    <div id="preferences-root" class="app-preferences-container">
      <div class="state-container" style="padding: 40px 20px; text-align: center;">
        <div class="state-icon">⏳</div>
        <h2 class="kn-heading-2">${editing ? 'Loading Preferences...' : 'Preparing Onboarding...'}</h2>
        <p class="state-message">Loading verified company profiles and taxonomy.</p>
      </div>
    </div>
  `;
  const root = container.querySelector<HTMLElement>('#preferences-root');

  if (!root) {
    return {
      destroy: () => {
        isDestroyed = true;
      },
    };
  }

  // Asynchronously initialize preferences and render onboarding UI
  (async () => {
    let existingPrefs: UserPreferences | null = initialPrefsOverride || null;

    if (!existingPrefs && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('roleradar_preferences');
        if (raw) existingPrefs = JSON.parse(raw);
      } catch (e) {
        // Ignore parse error and proceed to API fetch
      }
    }

    // If editing and no explicit override was provided, fetch fresh preferences directly from API
    if (editing && !initialPrefsOverride) {
      try {
        const fetched = await preferencesService.getPreferences();
        if (isDestroyed) return;
        if (fetched && (fetched.roles || fetched.canonicalRoles)) {
          existingPrefs = fetched;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('roleradar_preferences', JSON.stringify(fetched));
          }
        }
      } catch (e) {
        // Fall back to existing cached preferences
      }
    }

    if (isDestroyed || !root) return;

    try {
      const controller = await renderOnboardingView(root, {
        isEditing: editing,
        currentPreferences: existingPrefs,
        onComplete: (saved: UserPreferences) => {
          if (isDestroyed) return;
          if (saved && typeof localStorage !== 'undefined') {
            localStorage.setItem('roleradar_preferences', JSON.stringify(saved));
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('roleradar_onboarding_completed', 'true');
          }
          showToast('Preferences saved!', 'success');
          onComplete?.(saved);
          onNavigate('#/dashboard');
        },
        onCancel: () => {
          if (isDestroyed) return;
          onCancel?.();
          onNavigate('#/dashboard');
        },
      });

      if (isDestroyed) {
        controller?.destroy();
      } else {
        onboardingController = controller || null;
      }
    } catch (err) {
      if (isDestroyed || !root) return;
      root.innerHTML = `
        <div class="state-container" style="padding: 40px 20px; text-align: center;">
          <div class="state-icon" style="color: #dc2626;">⚠️</div>
          <h2 class="kn-heading-2">Failed to Load Preferences</h2>
          <p class="state-message">${err instanceof Error ? err.message : 'An error occurred while loading preferences.'}</p>
          <div class="kn-mt-3">
            <button type="button" id="btn-retry-prefs" class="kn-btn kn-btn--primary">Retry</button>
            <a href="#/dashboard" class="kn-btn kn-btn--secondary" style="margin-left: 8px;">Dashboard</a>
          </div>
        </div>
      `;
      const retryBtn = root.querySelector('#btn-retry-prefs');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          if (!isDestroyed) {
            mountPreferencesView(options);
          }
        });
      }
    }
  })();

  return {
    destroy: () => {
      isDestroyed = true;
      if (onboardingController) {
        onboardingController.destroy();
        onboardingController = null;
      }
    },
  };
}
