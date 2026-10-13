import { PrepRouterProvider } from './context/PrepRouterContext';
import DashboardLayout from './layouts/DashboardLayout';

// Global specific overrides
import './index.css';

export default function PrepPage() {
    return (
        <PrepRouterProvider>
            <DashboardLayout />
        </PrepRouterProvider>
    );
}
