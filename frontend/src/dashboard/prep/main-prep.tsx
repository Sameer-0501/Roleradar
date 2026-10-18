import React from 'react';
import ReactDOM from 'react-dom/client';
import PrepPage from '../../modules/prep/PrepPage';

// Function to mount the app
export const mountPrep = () => {
    console.log('[Prep] Attempting to mount...');
    const rootElement = document.getElementById('prep-root');
    if (rootElement) {
        if (!rootElement.hasAttribute('data-mounted')) {
            console.log('[Prep] Mounting Prep React App');
            const root = ReactDOM.createRoot(rootElement);
            root.render(
                <React.StrictMode>
                    <PrepPage />
                </React.StrictMode>
            );
            rootElement.setAttribute('data-mounted', 'true');
        } else {
            console.log('[Prep] Already mounted');
        }
    } else {
        console.log('[Prep] Root element not found');
    }
};

// Immediate mount if target exists in DOM
if (typeof document !== 'undefined' && document.getElementById('prep-root')) {
    mountPrep();
}

