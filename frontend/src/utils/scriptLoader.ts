/**
 * RoleRadar Deferred Script Loader (Performance Optimization)
 *
 * Implements recommendation: "load third-party scripts after the page"
 * - Defers non-critical third-party scripts until after First Contentful Paint / DOMContentLoaded.
 * - Utilizes window.requestIdleCallback with fallback to setTimeout.
 * - Ensures zero render-blocking on the main execution thread.
 */

export interface ScriptLoadOptions {
  async?: boolean;
  defer?: boolean;
  timeout?: number;
  attributes?: Record<string, string>;
}

/**
 * Loads a third-party script non-blockingly during idle browser cycles.
 */
export function loadScriptAfterPage(
  src: string,
  options: ScriptLoadOptions = {}
): Promise<HTMLScriptElement> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('Document not available'));
    }

    // Check if script is already present
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset['loaded'] === 'true') {
        return resolve(existing);
      }
      existing.addEventListener('load', () => resolve(existing), { once: true });
      existing.addEventListener('error', (err) => reject(err), { once: true });
      return;
    }

    const scheduleLoad = () => {
      const script = document.createElement('script');
      script.src = src;
      script.async = options.async ?? true;
      script.defer = options.defer ?? true;

      if (options.attributes) {
        for (const [key, value] of Object.entries(options.attributes)) {
          script.setAttribute(key, value);
        }
      }

      script.addEventListener('load', () => {
        script.dataset['loaded'] = 'true';
        resolve(script);
      }, { once: true });

      script.addEventListener('error', (err) => {
        reject(new Error(`Failed to load script: ${src}`));
      }, { once: true });

      document.body.appendChild(script);
    };

    // Defer until browser idle, avoiding thread contention during critical hydration
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(scheduleLoad, { timeout: options.timeout ?? 2000 });
    } else if (typeof window !== 'undefined') {
      setTimeout(scheduleLoad, options.timeout ?? 100);
    } else {
      scheduleLoad();
    }
  });
}

