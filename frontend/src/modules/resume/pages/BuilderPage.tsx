import React from 'react';
import { AppNavigation } from '../components/Layout/AppNavigation';
import { ResumeForm } from '../components/Resume/ResumeForm';
import { ResumePreview } from '../components/Resume/ResumePreview';
import { ATSScoreMeter } from '../components/Resume/ATSScoreMeter';
import { TemplateSelector } from '../components/Resume/TemplateSelector';

import { useResume } from '../context/ResumeContext';
import { useATSScore } from '../hooks/useATSScore';

export const BuilderPage: React.FC = () => {
    const { resumeData } = useResume();
    const analysis = useATSScore(resumeData);

    return (
        <div className="h-screen flex flex-col bg-gray-50 font-sans overflow-hidden">
            <AppNavigation />

            <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full">
                {/* Left: Form - 45% */}
                <div className="w-[45%] bg-white border-r border-gray-200 h-full overflow-y-auto p-6 scrollbar-thin">
                    <div className="max-w-xl mx-auto pb-20">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Resume Details</h2>
                            <p className="text-gray-500">Fill in your information below.</p>
                        </div>

                        <TemplateSelector />
                        <ATSScoreMeter score={analysis.score} suggestions={analysis.suggestions} />

                        <ResumeForm />
                    </div>
                </div>

                {/* Right: Preview - 55% */}
                <div className="flex-1 bg-gray-100 p-8 h-full overflow-y-auto flex justify-center items-start">
                    <div className="sticky top-8">
                        <ResumePreview />
                    </div>
                </div>
            </div>
        </div>
    );
};
