import React, { useState, useEffect } from 'react';
import { usePrepRouter } from '../../context/PrepRouterContext';
import { Check, AlertTriangle, Lock } from 'lucide-react';

const TESTS = [
    { id: 1, label: "JD required validation works", hint: "Try analyzing with empty JD" },
    { id: 2, label: "Short JD warning shows for <200 chars", hint: "Enter 10 chars and check alert" },
    { id: 3, label: "Skills extraction groups correctly", hint: "Check Results page for proper categories" },
    { id: 4, label: "Round mapping changes based on company + skills", hint: "Try Amazon vs Startup" },
    { id: 5, label: "Score calculation is deterministic", hint: "Same input = same score" },
    { id: 6, label: "Skill toggles update score live", hint: "Click skills on Results page" },
    { id: 7, label: "Changes persist after refresh", hint: "Refresh Results page" },
    { id: 8, label: "History saves and loads correctly", hint: "Check History tab" },
    { id: 9, label: "Export buttons copy the correct content", hint: "Try 'Copy' buttons" },
    { id: 10, label: "No console errors on core pages", hint: "Check DevTools Console" }
];

export const TestChecklist: React.FC = () => {
    const { navigate } = usePrepRouter();
    const [checked, setChecked] = useState<Record<number, boolean>>(() => {
        const saved = localStorage.getItem('prp_test_checklist');
        return saved ? JSON.parse(saved) : {};
    });

    useEffect(() => {
        localStorage.setItem('prp_test_checklist', JSON.stringify(checked));
    }, [checked]);

    const passedCount = TESTS.filter(t => checked[t.id]).length;
    const allPassed = passedCount === TESTS.length;

    const handleCheck = (id: number) => {
        setChecked(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleShip = () => {
        if (allPassed) {
            navigate('prp/08-ship');
        } else {
            alert("Please complete all tests before shipping!");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Platform Pre-Ship Checklist</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Verify functionality before release.
                        </p>
                    </div>
                    <div className={`px-4 py-2 rounded-lg font-bold text-sm ${allPassed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        Testing: {passedCount} / {TESTS.length}
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {!allPassed && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md flex items-center gap-3 text-sm">
                            <AlertTriangle className="h-5 w-5 shrink-0" />
                            Fix issues before shipping. Check all items to unlock the Ship page.
                        </div>
                    )}

                    <div className="grid gap-3">
                        {TESTS.map(test => (
                            <label key={test.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors group">
                                <div className="relative flex items-center mt-0.5">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 text-primary border-gray-300 rounded focus:ring-primary"
                                        checked={!!checked[test.id]}
                                        onChange={() => handleCheck(test.id)}
                                    />
                                </div>
                                <div>
                                    <div className={`font-medium text-gray-900 ${checked[test.id] ? 'line-through text-gray-400' : ''}`}>
                                        {test.label}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">Hint</span>
                                        {test.hint}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="mt-8 pt-4 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleShip}
                            disabled={!allPassed}
                            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all ${allPassed
                                ? 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {allPassed ? (
                                <>
                                    <Check className="h-5 w-5" /> Proceed to Ship
                                </>
                            ) : (
                                <>
                                    <Lock className="h-5 w-5" /> Locked
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
