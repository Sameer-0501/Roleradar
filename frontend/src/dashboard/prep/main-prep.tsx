import React from 'react';
import ReactDOM from 'react-dom/client';
import PrepPage from '../../modules/prep/PrepPage';

// Function to mount the app
const mountPrep = () => {
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

// Observer to watch for the container injection
const observer = new MutationObserver((_mutations) => {
    if (document.getElementById('prep-root')) {
        mountPrep();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial check
mountPrep();
