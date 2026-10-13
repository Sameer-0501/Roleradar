import React from 'react';

export { DashboardHome } from './DashboardHome';
export { AnalysisInput } from './AnalysisInput';
export { AnalysisResults } from './AnalysisResults';
export { AnalysisHistory } from './AnalysisHistory';

export const Practice: React.FC = () => (
    <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Practice Problems</h1>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-500">List of coding problems will appear here.</p>
        </div>
    </div>
);

export const Assessments: React.FC = () => (
    <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Assessments</h1>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-500">Scheduled and past assessments will appear here.</p>
        </div>
    </div>
);

export const Resources: React.FC = () => (
    <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Learning Resources</h1>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-500">Study materials and guides will appear here.</p>
        </div>
    </div>
);

export const Profile: React.FC = () => (
    <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">User Profile</h1>
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <p className="text-gray-500">User settings and profile information.</p>
        </div>
    </div>
);
