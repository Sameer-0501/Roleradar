import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useBuildTrack } from '../context/BuildTrackContext';
import { Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react';

interface SubmissionData {
    lovableLink: string;
    githubLink: string;
    deployLink: string;
}

export const ProofPage: React.FC = () => {
    const { completedSteps, markStepComplete } = useBuildTrack();
    const [data, setData] = useState<SubmissionData>(() => {
        const saved = localStorage.getItem('rb_final_submission');
        return saved ? JSON.parse(saved) : { lovableLink: '', githubLink: '', deployLink: '' };
    });
    const [copied, setCopied] = useState(false);

    // Auto-sync progress based on app usage
    useEffect(() => {
        const resumeData = localStorage.getItem('resume-data');
        if (resumeData) {
            // If user has built a resume, they impliedly completed the build steps
            ['01-problem', '02-market', '03-architecture', '04-hld', '05-lld', '06-build', '07-test'].forEach(step => {
                markStepComplete(step);
            });

            // Mark ship if they are here
            markStepComplete('08-ship');
        }
    }, [markStepComplete]);

    const steps = [
        '01-problem', '02-market', '03-architecture', '04-hld',
        '05-lld', '06-build', '07-test', '08-ship'
    ];

    useEffect(() => {
        localStorage.setItem('rb_final_submission', JSON.stringify(data));
    }, [data]);

    const isValidUrl = (url: string) => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    };

    const allStepsComplete = steps.every(s => completedSteps.includes(s));
    const allLinksValid = isValidUrl(data.lovableLink) && isValidUrl(data.githubLink) && isValidUrl(data.deployLink);
    const isShipped = allStepsComplete && allLinksValid;

    const handleCopy = async () => {
        const text = `------------------------------------------
AI Resume Builder — Final Submission

Lovable Project: ${data.lovableLink}
GitHub Repository: ${data.githubLink}
Live Deployment: ${data.deployLink}

Core Capabilities:
- Structured resume builder
- Deterministic ATS scoring
- Template switching
- PDF export with clean formatting
- Persistence + validation checklist
------------------------------------------`;

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const progress = Math.round((completedSteps.length / steps.length) * 100);

    return (
        <div className="max-w-3xl mx-auto py-12 px-4">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-900 mb-3 block">Final Submission</h1>
                <p className="text-gray-600">Review your progress and submit your project proof.</p>
            </div>

            {/* Shipped Status Banner */}
            {isShipped && (
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl shadow-lg p-8 mb-8 text-center animate-in fade-in duration-700">
                    <div className="flex justify-center mb-4">
                        <div className="bg-green-500/20 p-3 rounded-full">
                            <ShieldCheck className="w-8 h-8 text-green-400" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Project 3 Shipped Successfully.</h2>
                    <p className="text-gray-400">Great work. Your AI Resume Builder is ready.</p>
                </div>
            )}

            {/* Step Overview */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        Build Progress
                        {progress === 100 && <Check className="w-5 h-5 text-green-500" />}
                    </h3>
                    <Badge variant={progress === 100 ? 'success' : 'outline'}>{progress}% Complete</Badge>
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
                    <div className="bg-gray-900 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {steps.map((step) => {
                        const isComplete = completedSteps.includes(step);
                        return (
                            <div key={step} className={`flex items-center gap-2 p-2 rounded border text-sm ${isComplete ? 'border-green-100 bg-green-50 text-green-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isComplete ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                <span className="capitalize truncate">{step.replace(/^\d+-/, '')}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Artifact Collection */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <h3 className="text-lg font-semibold mb-6">Artifact Collection</h3>

                <div className="space-y-5 mb-8">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Lovable Project Link <span className="text-red-500">*</span></label>
                        <input
                            type="url"
                            value={data.lovableLink}
                            onChange={(e) => setData({ ...data, lovableLink: e.target.value })}
                            placeholder="https://lovable.dev/..."
                            className={`w-full p-2.5 border rounded-lg transition-colors ${data.lovableLink && !isValidUrl(data.lovableLink) ? 'border-red-300 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GitHub Repository <span className="text-red-500">*</span></label>
                        <input
                            type="url"
                            value={data.githubLink}
                            onChange={(e) => setData({ ...data, githubLink: e.target.value })}
                            placeholder="https://github.com/..."
                            className={`w-full p-2.5 border rounded-lg transition-colors ${data.githubLink && !isValidUrl(data.githubLink) ? 'border-red-300 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deployed URL <span className="text-red-500">*</span></label>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                value={data.deployLink}
                                onChange={(e) => setData({ ...data, deployLink: e.target.value })}
                                placeholder="https://..."
                                className={`w-full p-2.5 border rounded-lg transition-colors ${data.deployLink && !isValidUrl(data.deployLink) ? 'border-red-300 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
                            />
                            {isValidUrl(data.deployLink) && (
                                <a href={data.deployLink} target="_blank" rel="noreferrer" className="flex items-center justify-center w-12 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-100 flex flex-col gap-4">
                    <Button
                        onClick={handleCopy}
                        disabled={!isShipped}
                        className={`w-full h-12 gap-2 text-base transition-all duration-300 ${isShipped
                                ? 'bg-gray-900 hover:bg-black shadow-lg shadow-blue-500/30 ring-2 ring-blue-500/50 ring-offset-2'
                                : 'opacity-70 cursor-not-allowed bg-gray-400'
                            }`}
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied to Clipboard' : 'Copy Final Submission'}
                    </Button>
                    {!isShipped && (
                        <p className="text-center text-xs text-gray-500">
                            Complete all steps and valid links to enable submission.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
