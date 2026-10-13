import React from 'react';
import { Check, X, AlertCircle } from 'lucide-react';

interface ATSScoreMeterProps {
    score: number;
    suggestions: string[];
}

export const ATSScoreMeter: React.FC<ATSScoreMeterProps> = ({ score, suggestions }) => {
    // Color Logic
    let color = 'text-red-500';
    let pathColor = 'stroke-red-500';
    let label = 'Needs Work';

    if (score > 70) {
        color = 'text-green-500';
        pathColor = 'stroke-green-500';
        label = 'Strong Resume';
    } else if (score > 40) {
        color = 'text-yellow-500';
        pathColor = 'stroke-yellow-500';
        label = 'Getting There';
    }

    // Circular Progress Math
    const radius = 35;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 mb-8 w-full max-w-[210mm] mx-auto print:hidden">
            <div className="flex flex-col md:flex-row items-center gap-8">
                {/* Circular Progress */}
                <div className="relative w-32 h-32 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="64"
                            cy="64"
                            r={radius}
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="transparent"
                            className="text-gray-100"
                        />
                        <circle
                            cx="64"
                            cy="64"
                            r={radius}
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            className={`${pathColor} transition-all duration-1000 ease-out`}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-bold ${color}`}>{score}</span>
                        <span className="text-xs text-gray-500 font-medium">/ 100</span>
                    </div>
                </div>

                {/* Score Details */}
                <div className="flex-1 w-full text-center md:text-left">
                    <h2 className={`text-xl font-bold mb-1 ${color}`}>{label}</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        {score === 100 ? "Perfect! Your resume is ready for applications." : "Improve your score to pass ATS filters."}
                    </p>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4 text-left">
                            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                Improvements Needed
                            </h3>
                            <div className="space-y-2">
                                {suggestions.map((suggestion, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                        <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                        <span>{suggestion}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {suggestions.length === 0 && score === 100 && (
                        <div className="flex items-center gap-2 text-sm text-green-600 font-medium justify-center md:justify-start">
                            <Check className="w-5 h-5" />
                            All ATS criteria met!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
