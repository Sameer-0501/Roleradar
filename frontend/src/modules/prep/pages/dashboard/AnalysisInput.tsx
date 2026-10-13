
import React, { useState } from 'react';
import { usePrepRouter } from '../../context/PrepRouterContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { generateAnalysis } from '../../utils/analysisLogic';
import { useAnalysisHistory } from '../../hooks/useAnalysisHistory';
import { Sparkles, FileText, Building, Briefcase, AlertCircle } from 'lucide-react';

export const AnalysisInput: React.FC = () => {
    const { navigate } = usePrepRouter();
    const { saveAnalysis } = useAnalysisHistory();
    const [company, setCompany] = useState('');
    const [role, setRole] = useState('');
    const [jdText, setJdText] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = () => {
        if (!jdText.trim()) return;

        // Validation
        if (jdText.length < 200) {
            setError("This JD is too short to analyze deeply. Paste full JD for better output.");
            return;
        }
        setError(null);

        setIsAnalyzing(true);
        setTimeout(() => {
            const result = generateAnalysis(company, role, jdText);
            saveAnalysis(result);
            setIsAnalyzing(false);
            navigate('results', { id: result.id });
        }, 1500); // Fake loading effect
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold font-serif text-gray-900">New Analysis</h1>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Analyze Job Description
                    </CardTitle>
                    <CardDescription>
                        Paste the JD below to get a personalized preparation plan.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Building className="h-4 w-4" /> Company Name
                            </label>
                            <input
                                type="text"
                                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                placeholder="e.g. Google, Amazon..."
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Briefcase className="h-4 w-4" /> Role
                            </label>
                            <input
                                type="text"
                                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                placeholder="e.g. Software Engineer..."
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Job Description (Required)
                        </label>
                        <textarea
                            className="w-full h-48 p-3 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                            placeholder="Paste the full job description here..."
                            value={jdText}
                            onChange={(e) => setJdText(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 text-right">
                            {jdText.length} characters
                        </p>
                    </div>

                    {error && (
                        <div className="bg-amber-50 text-amber-800 p-3 rounded-md flex items-center gap-2 text-sm border border-amber-200">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleAnalyze}
                        disabled={!jdText.trim() || isAnalyzing}
                        className={`w-full py-3 rounded-md text-white font-medium shadow-md transition-all
                            ${!jdText.trim() || isAnalyzing
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-primary hover:bg-indigo-700 hover:shadow-lg'
                            }`}
                    >
                        {isAnalyzing ? 'Analyzing...' : 'Generate Checklist & Plan'}
                    </button>
                </CardContent>
            </Card>
        </div>
    );
};
