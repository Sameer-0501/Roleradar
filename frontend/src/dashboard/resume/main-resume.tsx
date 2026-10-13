import React from 'react';
import ReactDOM from 'react-dom/client';
import ResumePage from '../../modules/resume/ResumePage';
import '../../modules/resume/index.css';

// Function to mount the app
const mountResumeBuilder = () => {
    console.log('[Resume] Attempting to mount...');
    const rootElement = document.getElementById('resume-builder-root');
    if (rootElement) {
        if (!rootElement.hasAttribute('data-mounted')) {
            console.log('[Resume] Mounting Resume Builder React App');
            const root = ReactDOM.createRoot(rootElement);
            root.render(
                <React.StrictMode>
                    <ResumePage />
                </React.StrictMode>
            );
            rootElement.setAttribute('data-mounted', 'true');
        } else {
            console.log('[Resume] Already mounted');
        }
    } else {
        console.log('[Resume] Root element not found');
    }
};

// Observer to watch for the container injection
const observer = new MutationObserver((_mutations) => {
    if (document.getElementById('resume-builder-root')) {
        mountResumeBuilder();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial check
mountResumeBuilder();
