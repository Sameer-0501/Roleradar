import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminPage from './AdminPage';
import './admin.css';

const mountAdminConsole = () => {
    const rootElement = document.getElementById('admin-console-root');
    if (rootElement) {
        if (!rootElement.hasAttribute('data-mounted')) {
            const root = ReactDOM.createRoot(rootElement);
            root.render(
                <React.StrictMode>
                    <AdminPage />
                </React.StrictMode>
            );
            rootElement.setAttribute('data-mounted', 'true');
        }
    }
};

const observer = new MutationObserver((_mutations) => {
    if (document.getElementById('admin-console-root')) {
        mountAdminConsole();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

mountAdminConsole();
