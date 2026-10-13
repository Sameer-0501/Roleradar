import React, { createContext, useContext, useState, type ReactNode } from 'react';

// Define available views based on the original routes
export type PrepView =
    | 'dashboard'
    | 'analyze'
    | 'results'
    | 'history'
    | 'practice'
    | 'assessments'
    | 'resources'
    | 'profile'
    // PRP Workflow
    | 'prp/07-test'
    | 'prp/08-ship'
    | 'prp/proof';

interface PrepRouterContextType {
    currentView: PrepView;
    navigate: (view: PrepView, params?: any) => void;
    params: any;
}

const PrepRouterContext = createContext<PrepRouterContextType | undefined>(undefined);

export const usePrepRouter = () => {
    const context = useContext(PrepRouterContext);
    if (!context) {
        throw new Error('usePrepRouter must be used within a PrepRouterProvider');
    }
    return context;
};

export const PrepRouterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentView, setCurrentView] = useState<PrepView>('dashboard');
    const [params, setParams] = useState<any>({});

    const navigate = (view: PrepView, newParams?: any) => {
        setCurrentView(view);
        if (newParams) {
            setParams(newParams);
        }
        window.scrollTo(0, 0);
    };

    return (
        <PrepRouterContext.Provider value={{ currentView, navigate, params }}>
            {children}
        </PrepRouterContext.Provider>
    );
};
