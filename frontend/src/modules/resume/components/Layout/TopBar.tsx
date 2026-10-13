import React from 'react';
import { Badge } from '../ui/Badge';
import { useLocation } from 'react-router-dom';

export const TopBar: React.FC = () => {
    const location = useLocation();

    // Extract step number from path (e.g., /rb/01-problem -> Step 1)
    const getStepInfo = () => {
        const path = location.pathname;
        if (path.includes('proof')) return "Final Proof";
        const match = path.match(/\/rb\/0?(\d+)-/);
        if (match) {
            return `Step ${match[1]} of 8`;
        }
        return "Overview";
    };

    return (
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 fixed top-0 left-0 right-0 z-10 w-full">
            <div className="flex items-center gap-4">
                <h1 className="font-semibold text-gray-900 text-lg">AI Resume Builder</h1>
                <div className="h-4 w-px bg-gray-300 mx-2"></div>
                <span className="text-gray-500 text-sm font-medium">Project 3 — {getStepInfo()}</span>
            </div>

            <div className="flex items-center gap-3">
                <Badge variant="success" className="animate-pulse">Active Build</Badge>
            </div>
        </header>
    );
};
