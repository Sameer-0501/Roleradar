import React, { useEffect, useState } from 'react';
import { usePrepRouter } from '../../context/PrepRouterContext';
import { Rocket, RefreshCw, FileCheck } from 'lucide-react';

export const ShipPage: React.FC = () => {
    const { navigate } = usePrepRouter();
    const [isAllowed, setIsAllowed] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('prp_test_checklist');
        if (saved) {
            const checked = JSON.parse(saved);
            const count = Object.values(checked).filter(Boolean).length;
            if (count >= 10) {
                setIsAllowed(true);
            } else {
                navigate('prp/07-test'); // Redirect if not passed
            }
        } else {
            navigate('prp/07-test');
        }
    }, [navigate]);

    const handleReset = () => {
        if (confirm("Reset checklist and re-lock shipping?")) {
            localStorage.removeItem('prp_test_checklist');
            localStorage.removeItem('prp_shipped_status'); // Reset shipped status too
            navigate('prp/07-test');
        }
    };

    if (!isAllowed) return null;

    return (
        <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white p-6 text-center">

            <div className="animate-bounce mb-8">
                <Rocket size={64} className="text-yellow-400" />
            </div>

            <h1 className="text-5xl font-bold mb-4 font-serif">Ready to Ship! 🚀</h1>
            <p className="text-xl text-indigo-200 max-w-lg mx-auto mb-10">
                All tests passed. The Placement Readiness Platform is robust, validated, and ready for deployment.
            </p>

            <div className="bg-white/10 backdrop-blur-sm p-8 rounded-2xl border border-white/20 max-w-md w-full">
                <h3 className="text-lg font-semibold mb-4 border-b border-white/10 pb-2">Status Report</h3>
                <div className="space-y-3 text-left">
                    <div className="flex justify-between">
                        <span className="text-indigo-200">Tests Passed</span>
                        <span className="font-bold text-green-400">10/10</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-indigo-200">Validation</span>
                        <span className="font-bold text-green-400">Verified</span>
                    </div>
                </div>

                <button
                    onClick={() => navigate('prp/proof')}
                    className="w-full mt-6 bg-white text-indigo-900 font-bold py-3 rounded-lg hover:bg-gray-100 transition shadow-lg flex items-center justify-center gap-2"
                >
                    <FileCheck size={20} /> Generate Proof of Work
                </button>
            </div>

            <button
                onClick={handleReset}
                className="mt-12 text-sm text-indigo-300 hover:text-white flex items-center gap-2 transition-colors opacity-60 hover:opacity-100"
            >
                <RefreshCw size={14} /> Reset Checklist
            </button>

        </div>
    );
};
