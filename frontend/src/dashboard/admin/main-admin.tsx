import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminPage from './AdminPage';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import './admin.css';

let activeAdminRoot: ReactDOM.Root | null = null;

export const unmountAdminConsole = () => {
    if (activeAdminRoot) {
        console.log('[Admin] Unmounting Admin Console React App');
        try {
            activeAdminRoot.unmount();
        } catch (e) {
            console.warn('[Admin] Error unmounting root', e);
        }
        activeAdminRoot = null;
    }
    const rootElement = typeof document !== 'undefined' ? document.getElementById('admin-console-root') : null;
    if (rootElement) {
        rootElement.removeAttribute('data-mounted');
    }
};

// Function to mount the app
export const mountAdminConsole = (targetElement?: HTMLElement | null): { unmount: () => void } | null => {
    console.log('[Admin] Attempting to mount...');
    const rootElement = targetElement || (typeof document !== 'undefined' ? document.getElementById('admin-console-root') : null);
    if (rootElement) {
        if (!rootElement.hasAttribute('data-mounted')) {
            if (activeAdminRoot) {
                try {
                    activeAdminRoot.unmount();
                } catch (e) {
                    // ignore
                }
                activeAdminRoot = null;
            }
            console.log('[Admin] Mounting Admin Console React App');
            const root = ReactDOM.createRoot(rootElement);
            activeAdminRoot = root;
            root.render(
                <React.StrictMode>
                    <ErrorBoundary>
                        <AdminPage />
                    </ErrorBoundary>
                </React.StrictMode>
            );
            rootElement.setAttribute('data-mounted', 'true');
            return {
                unmount: unmountAdminConsole,
            };
        } else {
            console.log('[Admin] Already mounted');
            return {
                unmount: unmountAdminConsole,
            };
        }
    } else {
        console.log('[Admin] Root element not found');
        return null;
    }
};

// Immediate mount if target exists in DOM
if (typeof document !== 'undefined') {
    const el = document.getElementById('admin-console-root');
    if (el && !el.hasAttribute('data-mounted')) {
        mountAdminConsole(el);
    }
}

