import React from 'react';
import ReactDOM from 'react-dom/client';
import ResumePage from '../../modules/resume/ResumePage';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import '../../modules/resume/index.css';

let activeResumeRoot: ReactDOM.Root | null = null;

export const unmountResumeBuilder = () => {
    if (activeResumeRoot) {
        console.log('[Resume] Unmounting Resume Builder React App');
        try {
            activeResumeRoot.unmount();
        } catch (e) {
            console.warn('[Resume] Error unmounting root', e);
        }
        activeResumeRoot = null;
    }
    const rootElement = typeof document !== 'undefined' ? document.getElementById('resume-builder-root') : null;
    if (rootElement) {
        rootElement.removeAttribute('data-mounted');
    }
};

// Function to mount the app
export const mountResumeBuilder = (targetElement?: HTMLElement | null): { unmount: () => void } | null => {
    console.log('[Resume] Attempting to mount...');
    const rootElement = targetElement || (typeof document !== 'undefined' ? document.getElementById('resume-builder-root') : null);
    if (rootElement) {
        if (!rootElement.hasAttribute('data-mounted')) {
            if (activeResumeRoot) {
                try {
                    activeResumeRoot.unmount();
                } catch (e) {
                    // ignore
                }
                activeResumeRoot = null;
            }
            console.log('[Resume] Mounting Resume Builder React App');
            const root = ReactDOM.createRoot(rootElement);
            activeResumeRoot = root;
            root.render(
                <React.StrictMode>
                    <ErrorBoundary>
                        <ResumePage />
                    </ErrorBoundary>
                </React.StrictMode>
            );
            rootElement.setAttribute('data-mounted', 'true');
            return {
                unmount: unmountResumeBuilder,
            };
        } else {
            console.log('[Resume] Already mounted');
            return {
                unmount: unmountResumeBuilder,
            };
        }
    } else {
        console.log('[Resume] Root element not found');
        return null;
    }
};

// Immediate mount if target exists in DOM
if (typeof document !== 'undefined') {
    const el = document.getElementById('resume-builder-root');
    if (el && !el.hasAttribute('data-mounted')) {
        mountResumeBuilder(el);
    }
}

