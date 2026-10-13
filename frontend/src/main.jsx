import './index.css';
import './legacy/design-system/index.css';
import './components/LemniscateLoader.js';
import './legacy/app.css';
import './legacy/dashboard.css';
import './modules/onboarding/onboarding.css';

// Import Legacy Scripts
// Note: These scripts (jobs.js, app.js) were originally global IIFEs or window assignments.
// Importing them here ensures they execute.
import './legacy/jobs.js';
import { initApp } from './legacy/app.js';

// Import Module Entry Points (React components)
// These files use ReactDOM.createRoot to mount themselves into specific DOM elements.
import './dashboard/resume/main-resume';
import './dashboard/prep/main-prep';
import './dashboard/admin/main-admin';

console.log('Main entry point loaded');

// LocalStorage Migration: KCarrier -> RoleRadar
(function migrateLocalStorage() {
  const keys = ['preferences', 'onboarding_completed', 'auth_token', 'auth_user'];
  keys.forEach(key => {
    const oldKey = `kcarrier_${key}`;
    const newKey = `roleradar_${key}`;
    const oldVal = localStorage.getItem(oldKey);
    const newVal = localStorage.getItem(newKey);
    if (oldVal !== null && newVal === null) {
      localStorage.setItem(newKey, oldVal);
      // Retaining old keys for rollback safety as requested
    }
  });
})();

// Initialize legacy app logic
if (document.readyState === 'complete') {
    initApp();
} else {
    window.addEventListener('load', initApp);
}
