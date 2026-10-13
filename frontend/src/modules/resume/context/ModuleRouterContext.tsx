import React, { createContext, useContext, useState, type ReactNode } from 'react';

// type View = 'home' | 'builder' | 'preview' | 'proof';

interface ModuleRouterContextType {
    currentView: string;
    navigate: (view: string) => void;
}

const ModuleRouterContext = createContext<ModuleRouterContextType | undefined>(undefined);

export const useModuleRouter = () => {
    const context = useContext(ModuleRouterContext);
    if (!context) {
        throw new Error('useModuleRouter must be used within a ModuleRouterProvider');
    }
    return context;
};

export const ModuleRouterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentView, setCurrentView] = useState<string>('home');

    const navigate = (view: string) => {
        setCurrentView(view);
        window.scrollTo(0, 0);
    };

    return (
        <ModuleRouterContext.Provider value={{ currentView, navigate }}>
            {children}
        </ModuleRouterContext.Provider>
    );
};
