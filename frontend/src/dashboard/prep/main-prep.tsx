import React from 'react';
import ReactDOM from 'react-dom/client';
import PrepPage from '../../modules/prep/PrepPage';

let activePrepRoot: ReactDOM.Root | null = null;

export const unmountPrep = () => {
    if (activePrepRoot) {
        console.log('[Prep] Unmounting Prep React App');
        try {
            activePrepRoot.unmount();
        } catch (e) {
            console.warn('[Prep] Error unmounting root', e);
        }
        activePrepRoot = null;
    }
    const rootElement = typeof document !== 'undefined' ? document.getElementById('prep-root') : null;
    if (rootElement) {
        rootElement.removeAttribute('data-mounted');
    }
};

// Function to mount the app
export const mountPrep = (targetElement?: HTMLElement | null): { unmount: () => void } | null => {
    console.log('[Prep] Attempting to mount...');
    const rootElement = targetElement || (typeof document !== 'undefined' ? document.getElementById('prep-root') : null);
    if (rootElement) {
        if (!rootElement.hasAttribute('data-mounted')) {
            if (activePrepRoot) {
                try {
                    activePrepRoot.unmount();
                } catch (e) {
                    // ignore
                }
                activePrepRoot = null;
            }
            console.log('[Prep] Mounting Prep React App');
            const root = ReactDOM.createRoot(rootElement);
            activePrepRoot = root;
            root.render(
                <React.StrictMode>
                    <PrepPage />
                </React.StrictMode>
            );
            rootElement.setAttribute('data-mounted', 'true');
            return {
                unmount: unmountPrep,
            };
        } else {
            console.log('[Prep] Already mounted');
            return {
                unmount: unmountPrep,
            };
        }
    } else {
        console.log('[Prep] Root element not found');
        return null;
    }
};

// Immediate mount if target exists in DOM
if (typeof document !== 'undefined') {
    const el = document.getElementById('prep-root');
    if (el && !el.hasAttribute('data-mounted')) {
        mountPrep(el);
    }
}

