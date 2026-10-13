import React from 'react';
import { Button } from '../ui/Button';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProofFooterProps {
    canProceed: boolean;
    nextStep: string | null;
}

export const ProofFooter: React.FC<ProofFooterProps> = ({ canProceed, nextStep }) => {
    const navigate = useNavigate();

    const handleNext = () => {
        if (nextStep) {
            navigate(nextStep);
        }
    };

    return (
        <footer className="h-16 border-t border-gray-200 bg-white border-b fixed bottom-0 left-0 right-0 z-10 w-full px-6 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className={`w-3 h-3 rounded-full ${canProceed ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                <span className="font-medium">{canProceed ? 'Step Complete' : 'Build in progress...'}</span>
            </div>

            <div className="flex gap-3">
                <Button
                    disabled={!canProceed || !nextStep}
                    onClick={handleNext}
                    className="gap-2"
                >
                    Next Step
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>
        </footer>
    );
};
