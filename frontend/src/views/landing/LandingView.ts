/**
 * RoleRadar Public Landing Page View.
 *
 * Renders the public marketing overview with direct actions for registration
 * and authentication. Automatically redirects authenticated visitors to the dashboard.
 */

import { httpClient } from '../../services/api/index.js';

export interface LandingViewOptions {
  container?: HTMLElement;
  onNavigate?: (route: string) => void;
  isAuthenticated?: () => boolean;
}

export interface LandingViewController {
  destroy(): void;
}

/**
 * Returns the canonical HTML string for the public marketing landing page.
 */
export function renderLandingHtml(): string {
  return (
    '<div class="app-landing">' +
    '<div class="app-landing__content">' +
    '<h1 class="app-landing__headline kn-heading-1">Find Jobs That Are Actually Real.</h1>' +
    '<p class="app-landing__subtext">RoleRadar monitors official company career portals, verifies job listings directly from the source, and alerts you when a match is found — no aggregators, no fakes.</p>' +
    '<div class="app-landing__features">' +
    '<div class="app-landing__feature"><span class="app-landing__feature-icon">✓</span><span>Only verified, official job listings</span></div>' +
    '<div class="app-landing__feature"><span class="app-landing__feature-icon">✓</span><span>Matched to your exact preferences</span></div>' +
    '<div class="app-landing__feature"><span class="app-landing__feature-icon">✓</span><span>Direct links to official job pages</span></div>' +
    '</div>' +
    '<div class="app-landing__actions">' +
    '<a href="#/register" class="kn-btn kn-btn--primary app-landing__cta">Get Started — It\'s Free</a>' +
    '<a href="#/login" class="kn-btn kn-btn--secondary">Sign In</a>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

/**
 * Mounts the public Landing Page view into the specified container.
 *
 * @param options Configuration options including target container and navigation callbacks.
 * @returns A lifecycle controller with a destroy() method.
 */
export function mountLandingView(options: LandingViewOptions = {}): LandingViewController {
  const container = options.container || document.getElementById('app-page') || document.body;
  const isAuth = options.isAuthenticated !== undefined
    ? (typeof options.isAuthenticated === 'function' ? options.isAuthenticated() : Boolean(options.isAuthenticated))
    : Boolean(httpClient.getToken());

  let redirectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isDestroyed = false;

  if (isAuth) {
    container.innerHTML = '<div class="app-state app-state--loading"><p>Redirecting...</p></div>';
    redirectTimeoutId = setTimeout(() => {
      if (isDestroyed) return;
      if (options.onNavigate) {
        options.onNavigate('#/dashboard');
      } else if (typeof window !== 'undefined') {
        window.location.hash = '#/dashboard';
      }
    }, 0);
  } else {
    container.innerHTML = renderLandingHtml();
  }

  return {
    destroy(): void {
      isDestroyed = true;
      if (redirectTimeoutId !== null) {
        clearTimeout(redirectTimeoutId);
        redirectTimeoutId = null;
      }
    },
  };
}
