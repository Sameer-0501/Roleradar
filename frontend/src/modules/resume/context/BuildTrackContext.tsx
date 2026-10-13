import React, { createContext, useContext, useState, type ReactNode } from 'react';

type StepId =
    | '01-problem'
    | '02-market'
    | '03-architecture'
    | '04-hld'
    | '05-lld'
    | '06-build'
    | '07-test'
    | '08-ship'
    | 'proof';

interface BuildTrackContextType {
    currentStep: StepId;
    artifacts: Record<string, string>; // stepId -> artifact content
    completedSteps: string[];
    setArtifact: (stepId: string, content: string) => void;
    markStepComplete: (stepId: string) => void;
    canAccessStep: (stepId: string) => boolean;
}

const BuildTrackContext = createContext<BuildTrackContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useBuildTrack = () => {
    const context = useContext(BuildTrackContext);
    if (!context) {
        throw new Error('useBuildTrack must be used within a BuildTrackProvider');
    }
    return context;
};

const STEPS_ORDER = [
    '01-problem',
    '02-market',
    '03-architecture',
    '04-hld',
    '05-lld',
    '06-build',
    '07-test',
    '08-ship',
    'proof'
];

export const BuildTrackProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Lazy initialize from localStorage
    const [artifacts, setArtifacts] = useState<Record<string, string>>(() => {
        const loaded: Record<string, string> = {};
        STEPS_ORDER.forEach(step => {
            const content = localStorage.getItem(`rb_step_${step}_artifact`);
            if (content) loaded[step] = content;
        });
        return loaded;
    });

    const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
        const loaded: string[] = [];
        STEPS_ORDER.forEach(step => {
            const content = localStorage.getItem(`rb_step_${step}_artifact`);
            if (content) loaded.push(step);
        });
        return loaded;
    });

    const setArtifact = (stepId: string, content: string) => {
        const newArtifacts = { ...artifacts, [stepId]: content };
        setArtifacts(newArtifacts);

        // Store with specific key format
        localStorage.setItem(`rb_step_${stepId}_artifact`, content);

        // Automatically mark complete if artifact is present
        if (content.trim().length > 0 && !completedSteps.includes(stepId)) {
            markStepComplete(stepId);
        }
    };

    const markStepComplete = (stepId: string) => {
        if (!completedSteps.includes(stepId)) {
            const newCompleted = [...completedSteps, stepId];
            setCompletedSteps(newCompleted);
            localStorage.setItem('rb_completed_steps', JSON.stringify(newCompleted));
        }
    };

    const canAccessStep = (stepId: string) => {
        if (stepId === '01-problem') return true;
        const index = STEPS_ORDER.indexOf(stepId);
        if (index === -1) return false;
        // Step is accessible if previous step is completed
        const prevStep = STEPS_ORDER[index - 1];
        return completedSteps.includes(prevStep);
    };

    return (
        <BuildTrackContext.Provider value={{
            currentStep: '01-problem', // This will be driven by router mainly
            artifacts,
            completedSteps,
            setArtifact,
            markStepComplete,
            canAccessStep
        }}>
            {children}
        </BuildTrackContext.Provider>
    );
};
