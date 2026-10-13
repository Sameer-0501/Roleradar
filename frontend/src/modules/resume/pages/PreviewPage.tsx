import React, { useRef, useState } from 'react';
import { AppNavigation } from '../components/Layout/AppNavigation';
import { ResumePreview } from '../components/Resume/ResumePreview';
import { Button } from '../components/ui/Button';
import { Printer, Copy, Check } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useResume } from '../context/ResumeContext';
import { generateResumeText } from '../utils/exportUtils';
import { ATSScoreMeter } from '../components/Resume/ATSScoreMeter';
import { useATSScore } from '../hooks/useATSScore';

export const PreviewPage: React.FC = () => {
    const contentRef = useRef<HTMLDivElement>(null);
    const { resumeData } = useResume();
    const [copied, setCopied] = useState(false);

    // Get Real-time ATS Score
    const analysis = useATSScore(resumeData);


    const handlePrint = useReactToPrint({
        contentRef,
        documentTitle: `Resume_${resumeData.personalInfo.fullName || 'Draft'}`,
        onAfterPrint: () => {
            // Optional: Analytics or additional tracking
        }
    });

    const handleDownload = () => {
        handlePrint();
        // Show success toast
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-8 right-8 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-3';
        toast.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <div class="font-medium">PDF export ready! Check your downloads.</div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    };

    const handleCopy = async () => {
        const text = generateResumeText(resumeData);
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans pb-20">
            <AppNavigation />

            <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col items-center">

                {/* Export Toolbar */}
                <div className="export-toolbar w-full max-w-[210mm] mb-6 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h1 className="page-title text-xl font-bold text-gray-900 mb-4 sm:mb-0">Final Preview</h1>

                        <div className="flex gap-3">
                            <Button onClick={handleCopy} variant="outline" className="gap-2 bg-white hover:bg-gray-50 text-gray-700 border-gray-300">
                                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copied!' : 'Copy Text'}
                            </Button>

                            <Button onClick={handleDownload} className="gap-2 shadow-md shadow-blue-500/20">
                                <Printer className="w-4 h-4" /> Print / Save PDF
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ATS Score Meter */}
                <ATSScoreMeter score={analysis.score} suggestions={analysis.suggestions} />

                {/* Preview Container */}

                {/* Preview Container */}
                <div className="bg-white shadow-2xl print:shadow-none print:w-full">
                    <div ref={contentRef}>
                        <ResumePreview />
                    </div>
                </div>
            </div>
        </div >
    );
};
