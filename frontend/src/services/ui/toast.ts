/**
 * RoleRadar Shared UI: Toast Notification Service.
 *
 * Provides the canonical implementation for user-facing transient notifications.
 * Preserves the established visual styling (.app-toast), animation timings,
 * and compatibility contracts while eliminating duplicate timer and DOM leaks.
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ActiveToastRecord {
  element: HTMLElement;
  showTimeoutId: ReturnType<typeof setTimeout> | null;
  hideTimeoutId: ReturnType<typeof setTimeout> | null;
  removeTimeoutId: ReturnType<typeof setTimeout> | null;
}

const activeToasts = new Set<ActiveToastRecord>();

function dismissRecord(record: ActiveToastRecord): void {
  if (record.showTimeoutId) {
    clearTimeout(record.showTimeoutId);
    record.showTimeoutId = null;
  }
  if (record.hideTimeoutId) {
    clearTimeout(record.hideTimeoutId);
    record.hideTimeoutId = null;
  }
  record.element.classList.remove('is-visible');
  if (!record.removeTimeoutId) {
    record.removeTimeoutId = setTimeout(() => {
      if (record.element.parentNode) {
        record.element.parentNode.removeChild(record.element);
      }
      activeToasts.delete(record);
    }, 300);
  }
}

/**
 * Displays a transient visual notification at the bottom center of the viewport.
 *
 * @param message The text message to display.
 * @param type The notification style tier ('info' | 'success' | 'warning' | 'error'). Defaults to 'info'.
 * @param duration Display duration in milliseconds before fade out begins. Defaults to 3000ms.
 * @returns The created toast HTMLElement.
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration = 3000
): HTMLElement {
  if (typeof document === 'undefined') {
    // Headless / non-DOM environment fallback
    return {} as HTMLElement;
  }

  const toast = document.createElement('div');
  toast.className = `app-toast app-toast--${type}`;
  toast.textContent = message;

  // Accessibility semantics
  if (typeof toast.setAttribute === 'function') {
    if (type === 'error') {
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
    } else {
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
    }
  }

  const record: ActiveToastRecord = {
    element: toast,
    showTimeoutId: null,
    hideTimeoutId: null,
    removeTimeoutId: null,
  };
  activeToasts.add(record);

  // Click to dismiss immediately
  if (typeof toast.addEventListener === 'function') {
    toast.addEventListener('click', () => {
      dismissRecord(record);
    });
  }

  document.body.appendChild(toast);

  // Trigger entrance transition
  record.showTimeoutId = setTimeout(() => {
    toast.classList.add('is-visible');
  }, 10);

  // Trigger exit transition after duration
  record.hideTimeoutId = setTimeout(() => {
    dismissRecord(record);
  }, duration);

  return toast;
}

/**
 * Dismisses all active toasts immediately, clearing timers and removing DOM nodes.
 */
export function clearAllToasts(): void {
  for (const record of activeToasts) {
    if (record.showTimeoutId) clearTimeout(record.showTimeoutId);
    if (record.hideTimeoutId) clearTimeout(record.hideTimeoutId);
    if (record.removeTimeoutId) clearTimeout(record.removeTimeoutId);

    if (record.element.parentNode) {
      record.element.parentNode.removeChild(record.element);
    }
  }
  activeToasts.clear();
}

/**
 * Returns an array of all currently active toast elements in the DOM.
 */
export function getActiveToasts(): HTMLElement[] {
  return Array.from(activeToasts).map((r) => r.element);
}
