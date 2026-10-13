import React from 'react';
import { TopBar } from './TopBar';
import { BuildPanel } from './BuildPanel';
import { ProofFooter } from './ProofFooter';
import { MainWorkspace } from './MainWorkspace';
import { useBuildTrack } from '../../context/BuildTrackContext';
import { useLocation } from 'react-router-dom';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { canAccessStep, setArtifact, completedSteps } = useBuildTrack();
    const location = useLocation();

    // Determine current step ID from URL simplistically
    const path = location.pathname;
    const stepId = path.split('/').pop() || '01-problem';

    // Calculate next step
    const steps = [
        '01-problem', '02-market', '03-architecture', '04-hld',
        '05-lld', '06-build', '07-test', '08-ship', 'proof'
    ];
    const currentIndex = steps.indexOf(stepId);
    const nextStep = currentIndex < steps.length - 1 ? `/rb/${steps[currentIndex + 1]}` : null;

    const isUnlocked = canAccessStep(stepId);
    const isComplete = completedSteps.includes(stepId);

    // If proof page, layout might differ slightly, but we keep consistent for now
    if (stepId === 'proof') {
        return (
            <div className="h-screen flex flex-col bg-gray-50">
                <TopBar />
                <div className="flex-1 mt-14 mb-16 overflow-hidden">
                    <MainWorkspace>{children}</MainWorkspace>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            <TopBar />

            <div className="flex-1 flex mt-14 mb-16 overflow-hidden">
                {/* Main Workspace - 70% */}
                <div className="w-[70%] h-full flex flex-col border-r border-gray-200">
                    <MainWorkspace>{children}</MainWorkspace>
                </div>

                {/* Build Panel - 30% */}
                <div className="w-[30%] h-full bg-white z-10 shadow-sm">
                    <BuildPanel
                        stepId={stepId}
                        onArtifactUpload={(content) => setArtifact(stepId, content)}
                        isUnlocked={isUnlocked}
                    />
                </div>
            </div>

            <ProofFooter canProceed={isComplete} nextStep={nextStep} />
        </div>
    );
};
