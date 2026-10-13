import React from 'react';
import { ResumeProvider } from './context/ResumeContext';
import { ModuleRouterProvider, useModuleRouter } from './context/ModuleRouterContext';
import { HomePage } from './pages/HomePage';
import { BuilderPage } from './pages/BuilderPage';
import { PreviewPage } from './pages/PreviewPage';
import { ResumeProofPage } from './pages/ResumeProofPage';

const ResumeContent: React.FC = () => {
    const { currentView } = useModuleRouter();

    switch (currentView) {
        case 'home':
            return <HomePage />;
        case 'builder':
            return <BuilderPage />;
        case 'preview':
            return <PreviewPage />;
        case 'proof':
            return <ResumeProofPage />;
        default:
            return <HomePage />;
    }
};

export default function ResumePage() {
    return (
        <ModuleRouterProvider>
            <ResumeProvider>
                <ResumeContent />
            </ResumeProvider>
        </ModuleRouterProvider>
    );
}
