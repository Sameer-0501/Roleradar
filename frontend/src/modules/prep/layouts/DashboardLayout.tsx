import React from 'react';
import { LayoutDashboard, Code, ClipboardCheck, BookOpen, User, Sparkles, History } from 'lucide-react';
import { usePrepRouter, PrepView } from '../context/PrepRouterContext';
import { DashboardHome, Practice, Assessments, Resources, Profile, AnalysisInput, AnalysisResults, AnalysisHistory } from '../pages/dashboard';
import { TestChecklist } from '../pages/prp/TestChecklist';
import { ShipPage } from '../pages/prp/ShipPage';
import { ProofPage } from '../pages/prp/ProofPage';

const DashboardLayout: React.FC = () => {
    const { currentView } = usePrepRouter();

    // Render the active view content
    const renderContent = () => {
        switch (currentView) {
            case 'dashboard': return <DashboardHome />;
            case 'analyze': return <AnalysisInput />;
            case 'history': return <AnalysisHistory />;
            case 'practice': return <Practice />;
            case 'assessments': return <Assessments />;
            case 'resources': return <Resources />;
            case 'profile': return <Profile />;
            // Add case for results if needed, though it might need params
            case 'results': return <AnalysisResults />;
            // PRP Workflow Routes
            case 'prp/07-test': return <TestChecklist />;
            case 'prp/08-ship': return <ShipPage />;
            case 'prp/proof': return <ProofPage />;
            default: return <DashboardHome />;
        }
    };

    return (
        <div className="w-full font-sans bg-gray-50 min-h-screen">
            {/* Module Navigation Tabs */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-4 overflow-x-auto py-3 scrollbar-hide">
                        <NavItem view="dashboard" icon={<LayoutDashboard size={18} />} label="Overview" />
                        <NavItem view="analyze" icon={<Sparkles size={18} />} label="New Analysis" />
                        <NavItem view="history" icon={<History size={18} />} label="History" />
                        <NavItem view="practice" icon={<Code size={18} />} label="Practice" />
                        <NavItem view="assessments" icon={<ClipboardCheck size={18} />} label="Assessments" />
                        <NavItem view="resources" icon={<BookOpen size={18} />} label="Resources" />
                        <NavItem view="profile" icon={<User size={18} />} label="Profile" />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {renderContent()}
            </div>
        </div>
    );
};

interface NavItemProps {
    view: PrepView;
    icon: React.ReactNode;
    label: string;
}

const NavItem: React.FC<NavItemProps> = ({ view, icon, label }) => {
    const { currentView, navigate } = usePrepRouter();
    const isActive = currentView === view;

    return (
        <button
            onClick={() => navigate(view)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${isActive
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
        >
            {icon}
            {label}
        </button>
    );
};

export default DashboardLayout;
