import React from 'react';
import { AppNavigation } from '../components/Layout/AppNavigation';
import { ProofPage as ProofContent } from './ProofPage';

export const ResumeProofPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <AppNavigation />
            <ProofContent />
        </div>
    );
};
