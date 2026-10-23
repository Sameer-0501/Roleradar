/**
 * RoleRadar — Architectural Refactoring Wave 4B Test Suite
 *
 * Evidence-Based CSS Deduplication & Stylesheet Consolidation
 *
 * Verifies:
 * 1. Stylesheet Import Inventory & Cascade Precedence:
 *    - main.jsx imports stylesheets in correct cascading order.
 *    - dashboard.css is imported after app.css to preserve layout precedence.
 * 2. Batch A — Duplicate Declarations & Sidebar Consolidation:
 *    - app-sidebar rules are canonically consolidated into dashboard.css.
 *    - .app-sidebar__icon, .app-sidebar__section-label, .app-sidebar__logout-btn exist in dashboard.css.
 *    - Duplicate partial sidebar rules and duplicate app-main redeclaration are removed from app.css.
 *    - Duplicate .vjp__total declaration in app.css is removed in favor of canonical dashboard.css.
 * 3. Batch B — Proven Dead Legacy Selectors Elimination:
 *    - Obsolete prototype forms (.app-settings__*) are absent.
 *    - Obsolete prototype filter bar (.app-filters__*) is absent.
 *    - Obsolete prototype job cards (.app-job-card*) are absent.
 *    - Obsolete prototype modal (.app-modal__box, etc.) is absent.
 *    - Obsolete prototype digest (.app-digest__*) is absent.
 *    - Obsolete prototype test/proof checklist (.app-test-*, .app-proof-*) is absent.
 *    - Obsolete spinner (.app-state__spinner, @keyframes kc-spin) is absent.
 *    - Obsolete placeholder alerts (.app-alerts__coming-soon*) are absent.
 * 4. Active Styles Preservation & Invariants:
 *    - Shell navigation (.app-nav, .app-nav__toggle, .app-nav__link, .is-active, .is-open) preserved.
 *    - 768px mobile breakpoint for hamburger toggle and responsive sidebar preserved.
 *    - Dynamically constructed page containers (.app-page--dashboard, .app-page--saved) preserved.
 *    - Canonical job cards (.vjc, .vjc__header, .vjc__badge, .vjc__view-btn) preserved.
 *    - Canonical job modal (.app-modal-backdrop, .app-modal-dialog) preserved.
 *    - Dynamically constructed fit score tiers (.modal-fit-score--strong_match, etc.) preserved.
 *    - Canonical toast notification service styles (.app-toast, .is-visible) preserved.
 *    - Workspace toolbar and stats grid (.workspace-stats-grid, .workspace-toolbar) preserved.
 *    - Email ownership banner (.app-verification-banner) retained as UNCERTAIN_RETAIN.
 * 5. Tailwind and Design System Integrity:
 *    - index.css retains Tailwind directives.
 *    - Kinetix design tokens and utility stylesheets remain intact.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../..');
const frontendDir = path.join(projectRoot, 'frontend');
const appCssPath = path.join(frontendDir, 'src/legacy/app.css');
const dashboardCssPath = path.join(frontendDir, 'src/legacy/dashboard.css');
const mainJsxPath = path.join(frontendDir, 'src/main.jsx');
const indexCssPath = path.join(frontendDir, 'src/index.css');
const designSystemIndexCssPath = path.join(frontendDir, 'src/legacy/design-system/index.css');

describe('Wave 4B: Evidence-Based CSS Deduplication & Consolidation', () => {
  const appCss = fs.readFileSync(appCssPath, 'utf-8');
  const dashboardCss = fs.readFileSync(dashboardCssPath, 'utf-8');
  const mainJsx = fs.readFileSync(mainJsxPath, 'utf-8');
  const indexCss = fs.readFileSync(indexCssPath, 'utf-8');
  const designSystemCss = fs.readFileSync(designSystemIndexCssPath, 'utf-8');

  describe('1. Stylesheet Import Inventory & Cascade Precedence', () => {
    it('imports index.css, design-system, app.css, dashboard.css, and onboarding.css in main.jsx', () => {
      expect(mainJsx).toContain("import './index.css';");
      expect(mainJsx).toContain("import './legacy/design-system/index.css';");
      expect(mainJsx).toContain("import './legacy/app.css';");
      expect(mainJsx).toContain("import './legacy/dashboard.css';");
      expect(mainJsx).toContain("import './modules/onboarding/onboarding.css';");
    });

    it('ensures dashboard.css is imported strictly AFTER app.css for cascade precedence', () => {
      const appIndex = mainJsx.indexOf("import './legacy/app.css';");
      const dashIndex = mainJsx.indexOf("import './legacy/dashboard.css';");
      expect(appIndex).toBeGreaterThan(-1);
      expect(dashIndex).toBeGreaterThan(-1);
      expect(dashIndex).toBeGreaterThan(appIndex);
    });

    it('ensures Tailwind directives remain intact in frontend/src/index.css', () => {
      expect(indexCss).toContain('@import "tailwindcss";');
    });

    it('ensures Kinetix design tokens index remains intact', () => {
      expect(designSystemCss).toContain("@import './main.css';");
    });
  });

  describe('2. Batch A — Duplicate Consolidation & Sidebar Ownership', () => {
    it('defines authoritative .app-sidebar in dashboard.css with fixed layout and z-index', () => {
      expect(dashboardCss).toContain('.app-sidebar {');
      expect(dashboardCss).toMatch(/\.app-sidebar\s*\{[^}]*position:\s*fixed;/);
      expect(dashboardCss).toMatch(/\.app-sidebar\s*\{[^}]*width:\s*260px;/);
      expect(dashboardCss).toMatch(/\.app-sidebar\s*\{[^}]*z-index:\s*100;/);
    });

    it('defines canonical sidebar elements in dashboard.css (.app-sidebar__icon, section-label, logout-btn)', () => {
      expect(dashboardCss).toContain('.app-sidebar__icon {');
      expect(dashboardCss).toMatch(/\.app-sidebar__icon\s*\{[^}]*width:\s*20px;/);
      expect(dashboardCss).toContain('.app-sidebar__section-label {');
      expect(dashboardCss).toContain('.app-sidebar__logout-btn {');
    });

    it('defines brand container with padding and subtle separator in dashboard.css', () => {
      expect(dashboardCss).toContain('.app-sidebar__brand {');
      expect(dashboardCss).toMatch(/\.app-sidebar__brand\s*\{[^}]*border-bottom:\s*1px solid/);
      expect(dashboardCss).toMatch(/\.app-sidebar__brand\s*\{[^}]*font-family:\s*var\(--kn-heading-font\);/);
    });

    it('defines responsive mobile sidebar behavior at 768px in dashboard.css', () => {
      expect(dashboardCss).toContain('@media (max-width: 768px)');
      expect(dashboardCss).toContain('.app-dashboard-layout {');
      expect(dashboardCss).toContain('.app-dashboard-main {');
    });

    it('confirms redundant duplicate .app-sidebar rules have been removed from app.css', () => {
      expect(appCss).not.toContain('.app-sidebar {');
      expect(appCss).not.toContain('.app-sidebar__nav {');
      expect(appCss).not.toContain('.app-sidebar__link--active {');
      expect(appCss).not.toContain('.app-sidebar.is-open {');
      expect(appCss).not.toContain('.app-sidebar__logout-btn {');
      expect(appCss).not.toContain('.app-sidebar__section-label {');
    });

    it('confirms redundant .vjp__total is removed from app.css and canonically present in dashboard.css', () => {
      expect(appCss).not.toContain('.vjp__total {');
      expect(dashboardCss).toContain('.vjp__total {');
      expect(dashboardCss).toMatch(/\.vjp__total\s*\{[^}]*font-weight:\s*600;/);
    });

    it('confirms obsolete .app-layout is removed from app.css', () => {
      expect(appCss).not.toContain('.app-layout {');
    });
  });

  describe('3. Batch B — Proven Dead Legacy Selectors Elimination', () => {
    it('eliminates dead prototype form styles (.app-settings__*) from app.css', () => {
      expect(appCss).not.toContain('.app-settings__title');
      expect(appCss).not.toContain('.app-settings__form');
      expect(appCss).not.toContain('.app-settings__label');
      expect(appCss).not.toContain('.app-settings__mode');
      expect(appCss).not.toContain('.app-settings__radio');
      expect(appCss).not.toContain('.app-settings__checkbox-label');
      expect(appCss).not.toContain('.app-settings__slider');
    });

    it('eliminates dead prototype filter bar styles (.app-filters__*) from app.css', () => {
      expect(appCss).not.toContain('.app-filters {');
      expect(appCss).not.toContain('.app-filters__keyword');
      expect(appCss).not.toContain('.app-filters__select');
      expect(appCss).not.toContain('.app-filters__toggle');
      expect(appCss).not.toContain('.app-filters__checkbox');
      expect(appCss).not.toContain('.app-filters__toggle-label');
    });

    it('eliminates dead prototype job card styles (.app-job-card*) from app.css', () => {
      expect(appCss).not.toContain('.app-job-card {');
      expect(appCss).not.toContain('.app-job-card__header');
      expect(appCss).not.toContain('.app-job-card__match');
      expect(appCss).not.toContain('.app-job-card__match--high');
      expect(appCss).not.toContain('.app-job-card__source');
      expect(appCss).not.toContain('.app-job-card__actions');
      expect(appCss).not.toContain('.app-job-card__save--saved');
      expect(appCss).not.toContain('.app-job-card--applied');
      expect(appCss).not.toContain('.app-job-card--rejected');
      expect(appCss).not.toContain('.app-job-card--selected');
    });

    it('eliminates dead prototype modal styles (.app-modal__box, etc.) from app.css', () => {
      expect(appCss).not.toContain('.app-modal {');
      expect(appCss).not.toContain('.app-modal__backdrop');
      expect(appCss).not.toContain('.app-modal__box');
      expect(appCss).not.toContain('.app-modal__title');
      expect(appCss).not.toContain('.app-modal__description');
      expect(appCss).not.toContain('.app-modal__skills');
      expect(appCss).not.toContain('body.app-modal-open');
    });

    it('eliminates dead prototype digest styles (.app-digest__*) from app.css', () => {
      expect(appCss).not.toContain('.app-digest__empty-state');
      expect(appCss).not.toContain('.app-digest__container');
      expect(appCss).not.toContain('.app-digest__card');
      expect(appCss).not.toContain('.app-digest__match-score');
      expect(appCss).not.toContain('.app-digest__actions-bar');
    });

    it('eliminates dead prototype test checklist and proof styles from app.css', () => {
      expect(appCss).not.toContain('.app-test-summary');
      expect(appCss).not.toContain('.app-test-score');
      expect(appCss).not.toContain('.app-test-checklist');
      expect(appCss).not.toContain('.app-test-item');
      expect(appCss).not.toContain('.app-proof-card');
      expect(appCss).not.toContain('.app-proof-header');
      expect(appCss).not.toContain('.app-proof-inputs');
      expect(appCss).not.toContain('.app-step-list');
    });

    it('eliminates superseded spinner (.app-state__spinner, @keyframes kc-spin) from app.css', () => {
      expect(appCss).not.toContain('.app-state__spinner');
      expect(appCss).not.toContain('@keyframes kc-spin');
    });

    it('eliminates obsolete placeholder alerts (.app-alerts__coming-soon*) from app.css', () => {
      expect(appCss).not.toContain('.app-alerts__coming-soon');
      expect(appCss).not.toContain('.app-alerts__detail');
      expect(appCss).not.toContain('.app-alerts__status-badge');
    });
  });

  describe('4. Active Styles Preservation & Invariants', () => {
    it('preserves top shell navigation styles and 768px hamburger toggle in app.css', () => {
      expect(appCss).toContain('.app-nav {');
      expect(appCss).toContain('.app-nav__toggle {');
      expect(appCss).toContain('.app-nav__links {');
      expect(appCss).toContain('.app-nav__link {');
      expect(appCss).toContain('.app-nav.is-open .app-nav__links {');
      expect(appCss).toContain('.app-nav__link.is-active');
    });

    it('preserves dynamically constructed page container rules (.app-page--dashboard, .app-page--saved)', () => {
      expect(appCss).toContain('.app-page {');
      expect(appCss).toContain('.app-page--dashboard,');
      expect(appCss).toContain('.app-page--saved {');
      expect(appCss).toMatch(/\.app-page--dashboard,\s*\.app-page--saved\s*\{[^}]*max-width:\s*100%;/);
    });

    it('preserves canonical job cards (.vjc) and related elements in app.css', () => {
      expect(appCss).toContain('.vjc {');
      expect(appCss).toContain('.vjc__header {');
      expect(appCss).toContain('.vjc__title {');
      expect(appCss).toContain('.vjc__company {');
      expect(appCss).toContain('.vjc__view-btn {');
      expect(appCss).toContain('.vjc--closed {');
    });

    it('preserves canonical JobDetailModal styles in dashboard.css', () => {
      expect(dashboardCss).toContain('.app-modal-backdrop {');
      expect(dashboardCss).toContain('.app-modal-dialog {');
      expect(dashboardCss).toContain('.app-modal-header {');
      expect(dashboardCss).toContain('.app-modal-title {');
      expect(dashboardCss).toContain('.app-modal-close {');
      expect(dashboardCss).toContain('.official-apply-banner {');
    });

    it('preserves dynamically constructed fit score tiers in dashboard.css', () => {
      expect(dashboardCss).toContain('.modal-fit-score-badge {');
      expect(dashboardCss).toContain('.modal-fit-score--strong_match {');
      expect(dashboardCss).toContain('.modal-fit-score--moderate_match {');
      expect(dashboardCss).toContain('.modal-fit-score--potential_fit,');
      expect(dashboardCss).toContain('.modal-fit-score--exploratory {');
    });

    it('preserves canonical toast notification service styles in app.css', () => {
      expect(appCss).toContain('.app-toast {');
      expect(appCss).toContain('.app-toast.is-visible {');
      expect(appCss).toMatch(/\.app-toast\s*\{[^}]*position:\s*fixed;/);
    });

    it('preserves canonical Phase 6 alerts and notification card styles in app.css', () => {
      expect(appCss).toContain('.app-alerts {');
      expect(appCss).toMatch(/\.app-alerts\s*\{[^}]*max-width:\s*840px;/);
      expect(appCss).toContain('.notif-card {');
      expect(appCss).toContain('.notif-card--unread {');
      expect(appCss).toContain('.notif-badge {');
      expect(appCss).toContain('.notif-badge--sent {');
    });

    it('preserves candidate profile, preferences, and account settings view styles in app.css', () => {
      expect(appCss).toContain('.app-auth {');
      expect(appCss).toContain('.app-auth__box {');
      expect(appCss).toContain('.app-account {');
      expect(appCss).toContain('.app-account__profile {');
      expect(appCss).toContain('.app-account__field {');
      expect(appCss).toContain('.app-preferences-container {');
    });

    it('retains email ownership banner (.app-verification-banner) as UNCERTAIN_RETAIN', () => {
      expect(appCss).toContain('.app-verification-banner {');
      expect(appCss).toContain('.app-verification-banner code {');
    });
  });

  describe('5. Quantitative CSS Reduction Metrics (Informational)', () => {
    it('verifies app.css line count has been significantly reduced without regressions', () => {
      const lineCount = appCss.split('\n').length;
      // Baseline was 2,241 lines; post-cleanup should be under 1,600 lines
      expect(lineCount).toBeLessThan(1600);
      expect(lineCount).toBeGreaterThan(1200);
    });

    it('verifies dashboard.css remains lean and self-contained', () => {
      const lineCount = dashboardCss.split('\n').length;
      expect(lineCount).toBeLessThan(1200);
      expect(lineCount).toBeGreaterThan(1000);
    });
  });
});
