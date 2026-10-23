/**
 * RoleRadar — Shell Navigation Service (Wave 4A).
 *
 * Dedicated, typed module responsible for:
 * - Shell header navigation visibility synchronization (guest vs authenticated links).
 * - Active navigation link state indication (`.is-active`, `aria-current="page"`).
 * - Responsive mobile navigation toggle (`.app-nav__toggle` <-> `.app-nav.is-open`).
 * - Auto-close behavior upon mobile link interaction.
 * - Idempotent listener registration to prevent duplicate event bindings.
 */

import { httpClient } from '../api/client.js';

let navSetup = false;
let toggleClickListener: ((e: Event) => void) | null = null;
let linkClickListeners: Array<{ element: Element; listener: (e: Event) => void }> = [];

export interface SetupNavOptions {
  navSelector?: string;
  toggleSelector?: string;
  linkSelector?: string;
  mobileBreakpoint?: number;
}

/**
 * Checks whether the current user is authenticated.
 */
export function isUserAuthenticated(): boolean {
  return Boolean(httpClient.getToken());
}

/**
 * Updates authenticated vs. guest navigation header link visibility.
 */
export function updateNavVisibility(customIsAuth?: () => boolean): void {
  if (typeof document === 'undefined') return;

  const navAuth = document.getElementById('nav-authenticated');
  const navGuest = document.getElementById('nav-guest');
  if (!navAuth || !navGuest) return;

  const auth = customIsAuth ? customIsAuth() : isUserAuthenticated();
  navAuth.style.display = auth ? '' : 'none';
  navGuest.style.display = auth ? 'none' : '';
}

/**
 * Synchronizes active route indicator classes on navigation links.
 */
export function updateNavActiveState(currentPath: string): void {
  if (typeof document === 'undefined') return;

  document.querySelectorAll('.app-nav__link[data-route]').forEach((link) => {
    const route = link.getAttribute('data-route');
    const isActive =
      route &&
      (currentPath === route || (route !== '' && currentPath.indexOf(route) === 0));
    link.classList.toggle('is-active', Boolean(isActive));
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

/**
 * Initializes shell navigation events and responsive mobile hamburger menu.
 * Idempotent: repeated calls safely no-op without duplicating event listeners.
 */
export function setupNav(options: SetupNavOptions = {}): { cleanup: () => void } {
  if (typeof document === 'undefined') {
    return { cleanup: () => {} };
  }

  if (navSetup) {
    return { cleanup: resetNavForTesting };
  }
  navSetup = true;

  const navSelector = options.navSelector || '.app-nav';
  const toggleSelector = options.toggleSelector || '.app-nav__toggle';
  const linkSelector = options.linkSelector || '.app-nav__link';
  const mobileBreakpoint = options.mobileBreakpoint || 768;

  const toggle = document.querySelector(toggleSelector);
  const nav = document.querySelector(navSelector);

  if (toggle && nav) {
    toggleClickListener = () => {
      const expanded = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', toggleClickListener);
  }

  // Close mobile menu when a navigation link is clicked on small viewports
  linkClickListeners = [];
  document.querySelectorAll(linkSelector).forEach((link) => {
    const listener = () => {
      let isMobile = false;
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        isMobile = window.matchMedia(`(max-width: ${mobileBreakpoint}px)`).matches;
      } else if (typeof window !== 'undefined' && window.innerWidth) {
        isMobile = window.innerWidth <= mobileBreakpoint;
      }

      if (isMobile && nav) {
        nav.classList.remove('is-open');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'Open menu');
        }
      }
    };

    link.addEventListener('click', listener);
    linkClickListeners.push({ element: link, listener });
  });

  return { cleanup: resetNavForTesting };
}

/**
 * Returns whether the mobile navigation overlay is currently expanded.
 */
export function isNavOpen(): boolean {
  if (typeof document === 'undefined') return false;
  const nav = document.querySelector('.app-nav');
  return Boolean(nav && nav.classList.contains('is-open'));
}

/**
 * Programmatically closes the mobile navigation menu if open.
 */
export function closeNav(): void {
  if (typeof document === 'undefined') return;
  const nav = document.querySelector('.app-nav');
  const toggle = document.querySelector('.app-nav__toggle');
  if (nav) {
    nav.classList.remove('is-open');
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }
}

/**
 * Cleans up navigation listeners and resets the setup flag (for testing isolation).
 */
export function resetNavForTesting(): void {
  if (typeof document === 'undefined') {
    navSetup = false;
    return;
  }

  const toggle = document.querySelector('.app-nav__toggle');
  if (toggle && toggleClickListener) {
    toggle.removeEventListener('click', toggleClickListener);
    toggleClickListener = null;
  }

  linkClickListeners.forEach(({ element, listener }) => {
    element.removeEventListener('click', listener);
  });
  linkClickListeners = [];

  navSetup = false;
}
