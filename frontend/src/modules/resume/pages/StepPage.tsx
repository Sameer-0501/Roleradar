import React from 'react';

export const StepPage: React.FC = () => {
    // Content map for demo purposes
    const contentMap: Record<string, { title: string, content: string }> = {
        '01-problem': { title: 'Problem Statement', content: 'Define the core problem your AI Resume Builder solves.' },
        '02-market': { title: 'Market Analysis', content: 'Who is the target audience? What is the competition?' },
        '03-architecture': { title: 'System Architecture', content: 'High-level diagram of the system components.' },
        '04-hld': { title: 'High Level Design', content: 'Detailed component interactions and data flow.' },
        '05-lld': { title: 'Low Level Design', content: 'Class diagrams, API specifications, and database schema.' },
        '06-build': { title: 'Implementation', content: 'Core coding phase. Implement the features.' },
        '07-test': { title: 'Testing Strategy', content: 'Unit tests, integration tests, and user acceptance testing.' },
        '08-ship': { title: 'Deployment', content: 'Prepare for launch. CI/CD pipelines and hosting.' },
    };

    // We get stepId from the path since useParams might need specific route config
    const pathStepId = location.pathname.split('/').pop() || '01-problem';
    const data = contentMap[pathStepId] || { title: 'Unknown Step', content: 'No content available.' };

    return (
        <div className="space-y-6">
            <div className="border-b border-gray-100 pb-4">
                <h2 className="text-3xl font-bold text-gray-900">{data.title}</h2>
                <p className="text-gray-500 mt-2 text-lg">Step {pathStepId.split('-')[0]}</p>
            </div>

            <div className="prose prose-blue max-w-none">
                <p className="text-gray-700 leading-relaxed">{data.content}</p>

                <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-100">
                    <h4 className="text-blue-900 font-semibold mb-2">Instructions</h4>
                    <ul className="list-disc list-inside text-blue-800 space-y-2">
                        <li>Review the objectives for this step.</li>
                        <li>Use the build panel on the right to generate code.</li>
                        <li>Paste the output to verify and unlock the next step.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
