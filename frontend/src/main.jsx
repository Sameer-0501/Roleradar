import './index.css';
import './legacy/design-system/index.css';
import './components/LemniscateLoader.js';
import './legacy/app.css';
import './legacy/dashboard.css';
import './modules/onboarding/onboarding.css';

// Import Legacy Data Seeds
import './legacy/jobs.js';

// Import Canonical Application Bootstrap (Wave 4A)
import { initApp } from './bootstrap.js';

// Note: Module Entry Points (Resume, Prep, Admin) are dynamically loaded
// on-demand when visiting their respective routes to optimize initial bundle size.

console.log('Main entry point loaded');

// Initialize canonical application bootstrap once DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initApp());
  } else {
    initApp();
  }
}

