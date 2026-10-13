
import React, { useState, useEffect } from 'react';
import { ClipboardCopy, CheckCircle, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";

const STEPS = [
    { id: 1, label: "Project Initialization" },
    { id: 2, label: "Design System Implementation" },
    { id: 3, label: "Core Layout Architecture" },
    { id: 4, label: "Analysis Logic Engine" },
    { id: 5, label: "Results & Visualization" },
    { id: 6, label: "Company Intel Layer" },
    { id: 7, label: "Test Checklist & Validation" },
    { id: 8, label: "Final Proof & Shipping" }
];

export const ProofPage: React.FC = () => {
    const [links, setLinks] = useState({
        lovable: '',
        github: '',
        deployed: ''
    });
    const [isShipped, setIsShipped] = useState(false);

    useEffect(() => {
        // Load saved links
        const saved = localStorage.getItem('prp_final_submission');
        if (saved) {
            setLinks(JSON.parse(saved));
        }

        // Check if previously shipped
        const shipped = localStorage.getItem('prp_shipped_status');
        if (shipped === 'true') {
            setIsShipped(true);
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLinks(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const isValidUrl = (url: string) => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    };

    const allValid = isValidUrl(links.lovable) && isValidUrl(links.github) && isValidUrl(links.deployed);

    const handleSave = () => {
        if (!allValid) {
            alert("Please enter valid URLs for all fields.");
            return;
        }
        localStorage.setItem('prp_final_submission', JSON.stringify(links));
        localStorage.setItem('prp_shipped_status', 'true');
        setIsShipped(true);
        window.location.reload(); // Force refresh to update badges if needed
    };

    const handleCopy = () => {
        const text = `
------------------------------------------
Placement Readiness Platform — Final Submission

Lovable Project: ${links.lovable}
GitHub Repository: ${links.github}
Live Deployment: ${links.deployed}

Core Capabilities:
- JD skill extraction (deterministic)
- Round mapping engine
- 7-day prep plan
- Interactive readiness scoring
- History persistence
------------------------------------------
        `;
        navigator.clipboard.writeText(text);
        alert("Submission copied to clipboard!");
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold font-serif text-gray-900">Proof of Work</h1>
                        <p className="text-gray-500 mt-1">Final validation and submission artifact.</p>
                    </div>
                    <div className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 ${isShipped ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        <Award size={18} />
                        Status: {isShipped ? 'SHIPPED' : 'In Progress'}
                    </div>
                </div>

                {/* Completion Message */}
                {isShipped && (
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-8 text-white text-center shadow-lg transform transition-all hover:scale-[1.01]">
                        <h2 className="text-3xl font-bold mb-4">You built a real product.</h2>
                        <p className="text-xl text-indigo-100 max-w-2xl mx-auto leading-relaxed">
                            Not a tutorial. Not a clone.<br />
                            A structured tool that solves a real problem.<br /><br />
                            This is your proof of work.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* Steps Overview */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Build Roadmap</CardTitle>
                            <CardDescription>8-Step Execution Log</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {STEPS.map(step => (
                                <div key={step.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <span className="font-medium text-gray-700">{step.id}. {step.label}</span>
                                    <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded">
                                        <CheckCircle size={12} /> Completed
                                    </span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Artifact Inputs */}
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Submission Artifacts</CardTitle>
                            <CardDescription>Required for Shipped status</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Lovable Project URL</label>
                                <input
                                    name="lovable"
                                    value={links.lovable}
                                    onChange={handleChange}
                                    placeholder="https://lovable.dev/..."
                                    className="w-full p-2 border rounded focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">GitHub Repository URL</label>
                                <input
                                    name="github"
                                    value={links.github}
                                    onChange={handleChange}
                                    placeholder="https://github.com/..."
                                    className="w-full p-2 border rounded focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">Deployed Application URL</label>
                                <input
                                    name="deployed"
                                    value={links.deployed}
                                    onChange={handleChange}
                                    placeholder="https://vercel.app/..."
                                    className="w-full p-2 border rounded focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={isShipped || !allValid}
                                className={`w-full py-3 rounded font-bold shadow-sm transition-all ${isShipped
                                    ? 'bg-green-100 text-green-700 cursor-default'
                                    : allValid
                                        ? 'bg-primary text-white hover:bg-indigo-700'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                {isShipped ? 'Submission Locked' : 'Mark as Shipped'}
                            </button>

                            {isShipped && (
                                <button
                                    onClick={handleCopy}
                                    className="w-full py-3 rounded font-bold border-2 border-primary text-primary hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    <ClipboardCopy size={18} /> Copy Final Submission
                                </button>
                            )}
                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    );
};
