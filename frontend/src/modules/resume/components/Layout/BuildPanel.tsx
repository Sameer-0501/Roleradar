import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';

interface BuildPanelProps {
    stepId: string;
    onArtifactUpload: (content: string) => void;
    isUnlocked: boolean;
}

export const BuildPanel: React.FC<BuildPanelProps> = ({ stepId, onArtifactUpload }) => {
    const [copied, setCopied] = useState(false);
    const [artifactContent, setArtifactContent] = useState('');

    const handleCopy = () => {
        navigator.clipboard.writeText(`Build step ${stepId}: Please implement...`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUpload = () => {
        if (artifactContent.trim()) {
            onArtifactUpload(artifactContent);
            setArtifactContent(''); // Clear after upload
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 border-l border-gray-200 p-6">
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wide">Build Instructions</h3>
                <p className="text-sm text-gray-500 mb-4">
                    Copy the prompt below and paste it into Lovable to generate the code for this step.
                </p>
            </div>

            <div className="flex-1 flex flex-col gap-4">
                <div className="relative">
                    <textarea
                        className="w-full h-48 p-3 text-sm border border-gray-300 rounded-md font-mono bg-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        readOnly
                        value={`<!-- Prompt for step ${stepId} -->\n\nBuild the features for ${stepId}...`}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        className="absolute top-2 right-2 bg-white"
                        onClick={handleCopy}
                        type="button"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                </div>

                <a
                    href="https://lovable.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full"
                >
                    <Button className="w-full gap-2 transition-transform active:scale-95" type="button">
                        <ExternalLink className="w-4 h-4" />
                        Build in Lovable
                    </Button>
                </a>

                <div className="mt-8 border-t border-gray-200 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wide">Validation</h3>
                    <p className="text-xs text-gray-500 mb-2">Paste the resulting artifact or a success message here to proceed.</p>

                    <textarea
                        className="w-full h-32 p-3 text-sm border border-gray-300 rounded-md mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Paste artifact or build output..."
                        value={artifactContent}
                        onChange={(e) => setArtifactContent(e.target.value)}
                    />

                    <div className="flex gap-2">
                        <Button
                            className="flex-1"
                            onClick={handleUpload}
                            disabled={!artifactContent.trim()}
                        >
                            It Worked!
                        </Button>
                        <Button variant="outline" className="flex-1 text-red-600 hover:bg-red-50 border-red-200">
                            Error
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
