import React, { useEffect, useState, useMemo } from 'react';
import { usePrepRouter } from '../../context/PrepRouterContext';
import { useAnalysisHistory, AnalysisResult } from '../../hooks/useAnalysisHistory';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { CheckCircle, Calendar, BookOpen, MessageSquare, ArrowLeft, Download, Check, X, ClipboardCopy, Building2, Users, Target, Clock, Lightbulb } from 'lucide-react';
import { cn } from '../../lib/utils';

// Helper to keep score within bounds
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

export const AnalysisResults: React.FC = () => {
    const { params, navigate } = usePrepRouter();
    const id = params?.id;
    const { getAnalysisById, getLatestAnalysis, updateAnalysis } = useAnalysisHistory();
    const [result, setResult] = useState<AnalysisResult | null>(null);

    // Load Data
    useEffect(() => {
        if (id) {
            const found = getAnalysisById(id);
            if (found) setResult(found);
        } else {
            const latest = getLatestAnalysis();
            if (latest) setResult(latest);
        }
    }, [id, getAnalysisById, getLatestAnalysis]);

    const handleBack = () => navigate('analyze');

    // 1. Skill Toggle Handle
    const toggleSkill = (skill: string) => {
        if (!result || !result.skillConfidenceMap) return;

        const current = result.skillConfidenceMap[skill];
        const next = current === 'know' ? 'practice' : 'know';

        const newMap = { ...result.skillConfidenceMap, [skill]: next };

        let scoreDelta = 0;
        if (current === 'practice' && next === 'know') scoreDelta = 4;
        if (current === 'know' && next === 'practice') scoreDelta = -4;

        const newScore = clamp(result.readinessScore + scoreDelta, 0, 100);

        const updatedResult = {
            ...result,
            skillConfidenceMap: newMap,
            readinessScore: newScore
        };

        setResult(updatedResult as any);
        updateAnalysis(result.id, updatedResult as any);
    };

    // 3. Export Tools
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
    };

    const downloadTxt = () => {
        if (!result) return;
        const text = `
PLACEMENT READINESS REPORT
Role: ${result.role} @ ${result.company}
Date: ${new Date(result.createdAt).toDateString()}
Score: ${result.readinessScore}/100

SKILLS:
${Object.entries(result.extractedSkills).map(([cat, skills]) => `${cat}: ${skills.join(', ')}`).join('\n')}

COMPANY INTEL:
${result.companyIntel ? `Size: ${result.companyIntel.size}\nIndustry: ${result.companyIntel.industry}\nFocus: ${result.companyIntel.focus}` : "N/A"}

ROUNDS PREDICTION:
${result.roundMapping ? result.roundMapping.map(r => `${r.round}: ${r.desc}`).join('\n') : "N/A"}

7-DAY PLAN:
${result.plan.map(d => `${d.day}: ${d.title} - ${d.desc}`).join('\n')}

CHECKLIST:
${Object.entries(result.checklist).map(([r, i]) => `${r}:\n${i.map(x => `- ${x}`).join('\n')}`).join('\n\n')}

QUESTIONS:
${result.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
        `;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `readiness-report-${result.id}.txt`;
        a.click();
    };

    // 5. Action Next (Find top 3 'practice' skills)
    const weakSkills = useMemo(() => {
        if (!result?.skillConfidenceMap) return [];
        return Object.entries(result.skillConfidenceMap)
            .filter(([_, status]) => status === 'practice')
            .map(([skill]) => skill)
            .slice(0, 3);
    }, [result]);

    if (!result) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-10">
            <button onClick={handleBack} className="flex items-center text-sm text-gray-500 hover:text-primary mb-4 transition-colors">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Analysis
            </button>

            {/* Header Section */}
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-serif text-gray-900">
                        {result.role} @ {result.company}
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Analysis generated on {new Date(result.createdAt).toLocaleDateString()}
                    </p>
                </div>

                <div className="flex items-center gap-6">
                    {/* Export Actions */}
                    <div className="flex gap-2">
                        <button onClick={downloadTxt} className="p-2 bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600" title="Download Report">
                            <Download size={20} />
                        </button>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs font-semibold text-gray-500 uppercase">Readiness Score</p>
                            <p className="text-3xl font-bold text-primary">{result.readinessScore}/100</p>
                        </div>
                        <div className="h-16 w-16 relative">
                            <svg className="h-full w-full transform -rotate-90">
                                <circle className="text-gray-100" strokeWidth="8" stroke="currentColor" fill="transparent" r="28" cx="32" cy="32" />
                                <circle
                                    className="text-primary transition-all duration-500"
                                    strokeWidth="8"
                                    strokeDasharray={2 * Math.PI * 28}
                                    strokeDashoffset={(2 * Math.PI * 28) - (result.readinessScore / 100) * (2 * Math.PI * 28)}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="28" cx="32" cy="32"
                                />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* ACTION NEXT BOX */}
            {weakSkills.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                            🚀 Action Next: Focus on {weakSkills[0]}
                        </h3>
                        <p className="text-sm text-indigo-700 mt-1">
                            You marked <strong>{weakSkills.join(', ')}</strong> as needing practice. Start Day 1 of your plan to strengthen these areas.
                        </p>
                    </div>
                    <button className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm">
                        Start Day 1 Plan
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Skills & Plan */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Detected Skills - INTERACTIVE */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-primary" />
                                Key Skills Extracted
                            </CardTitle>
                            <CardDescription>Click tags to toggle status (Know vs Practice)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {Object.entries(result.extractedSkills).map(([category, skills]) => (
                                    <div key={category}>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-2">{category}</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {skills.map((skill, i) => {
                                                const status = result.skillConfidenceMap?.[skill] || 'practice';
                                                return (
                                                    <button
                                                        key={i}
                                                        onClick={() => toggleSkill(skill)}
                                                        className={cn(
                                                            "px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 transition-all",
                                                            status === 'know'
                                                                ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                                                                : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                                        )}
                                                    >
                                                        {status === 'know' ? <Check size={12} /> : <X size={12} />}
                                                        {skill}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* 7-Day Plan */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-primary" />
                                7-Day Preparation Plan
                            </CardTitle>
                            <button onClick={() => copyToClipboard(result.plan.map(d => `${d.day}: ${d.title} - ${d.desc}`).join('\n'))} className="text-xs text-gray-500 hover:text-primary flex items-center gap-1">
                                <ClipboardCopy size={14} /> Copy
                            </button>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6 relative border-l-2 border-indigo-100 ml-3 pl-6 py-2">
                                {result.plan.map((day, i) => (
                                    <div key={i} className="relative">
                                        <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-primary border-4 border-white shadow-sm"></div>
                                        <h4 className="text-sm font-bold text-gray-900">{day.day}: {day.title}</h4>
                                        <p className="text-sm text-gray-600 mt-1">{day.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Interview Questions */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-primary" />
                                10 Likely Interview Questions
                            </CardTitle>
                            <button onClick={() => copyToClipboard(result.questions.join('\n'))} className="text-xs text-gray-500 hover:text-primary flex items-center gap-1">
                                <ClipboardCopy size={14} /> Copy
                            </button>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-3">
                                {result.questions.map((q, i) => (
                                    <li key={i} className="flex gap-3 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                                        <span className="shrink-0 font-bold text-indigo-400">{i + 1}.</span>
                                        {q}
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Intel & Checklist */}
                <div className="space-y-8">

                    {/* COMPANY INTEL */}
                    {result.companyIntel && (
                        <Card className="border-t-4 border-t-amber-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Building2 className="h-5 w-5 text-amber-600" />
                                    Company Intel
                                </CardTitle>
                                <CardDescription>Generated Insights (Demo)</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex items-start gap-3">
                                        <Users className="h-4 w-4 text-gray-400 mt-1" />
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase">Estimated Size</p>
                                            <p className="text-sm font-medium text-gray-900">{result.companyIntel.size}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Target className="h-4 w-4 text-gray-400 mt-1" />
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase">Typical Focus</p>
                                            <p className="text-sm text-gray-700">{result.companyIntel.focus}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ROUND MAPPING */}
                    {result.roundMapping && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Clock className="h-5 w-5 text-primary" />
                                    Predicted Rounds
                                </CardTitle>
                                <CardDescription>Typical interview flow</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-6 relative border-l border-indigo-100 ml-2 pl-6 py-1">
                                    {result.roundMapping.map((round, i) => (
                                        <div key={i} className="relative">
                                            <div className="absolute -left-[30px] top-1 h-3 w-3 rounded-full bg-indigo-200 border-2 border-white ring-1 ring-indigo-50"></div>
                                            <h4 className="text-sm font-bold text-gray-900">{round.round}</h4>
                                            <p className="text-xs text-gray-600 mt-1">{round.desc}</p>
                                            <div className="mt-2 bg-indigo-50 px-3 py-2 rounded-lg flex items-start gap-2">
                                                <Lightbulb className="h-3 w-3 text-indigo-500 mt-1 shrink-0" />
                                                <p className="text-xs text-indigo-700 italic">"{round.whyMatters}"</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="h-full border-t-4 border-t-primary">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <CheckCircle className="h-5 w-5 text-primary" />
                                    Checklist
                                </CardTitle>
                                <CardDescription>Round-wise prep</CardDescription>
                            </div>
                            <button onClick={() => copyToClipboard(Object.values(result.checklist).flat().join('\n'))} className="text-xs text-gray-500 hover:text-primary flex items-center gap-1">
                                <ClipboardCopy size={14} />
                            </button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {Object.entries(result.checklist).map(([round, items]) => (
                                <div key={round}>
                                    <h4 className="text-sm font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded inline-block mb-3">
                                        {round}
                                    </h4>
                                    <div className="space-y-2">
                                        {items.map((item, i) => (
                                            <label key={i} className="flex items-start gap-2 cursor-pointer group">
                                                <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                                                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{item}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="border-b border-gray-100 mt-4"></div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
};
