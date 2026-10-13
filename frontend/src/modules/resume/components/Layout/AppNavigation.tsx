import React from 'react';
import { useModuleRouter } from '../../context/ModuleRouterContext';

export const AppNavigation: React.FC = () => {
    const { currentView, navigate } = useModuleRouter();

    const linkClass = (view: string) =>
        `text-sm font-medium transition-colors cursor-pointer ${currentView === view ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`;

    return (
        <nav className="h-16 border-b border-gray-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
            <div className="flex items-center gap-8">
                <div onClick={() => navigate('home')} className="text-xl font-bold text-gray-900 tracking-tight cursor-pointer">
                    ResumeAI
                </div>

                <div className="hidden md:flex items-center gap-6">
                    <div onClick={() => navigate('builder')} className={linkClass('builder')}>Builder</div>
                    <div onClick={() => navigate('preview')} className={linkClass('preview')}>Preview</div>
                    <div onClick={() => navigate('proof')} className={linkClass('proof')}>Proof</div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* External link or placeholder */}
                <span className="text-xs text-gray-400">
                    Module Mode
                </span>
            </div>
        </nav>
    );
};
