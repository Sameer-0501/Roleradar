import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminPage from './AdminPage';
import './admin.css';

export const mountAdminConsole = () => {
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

// Immediate mount if target exists in DOM
if (typeof document !== 'undefined' && document.getElementById('admin-console-root')) {
    mountAdminConsole();
}

