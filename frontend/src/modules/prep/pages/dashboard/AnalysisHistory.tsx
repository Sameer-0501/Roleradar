import React from 'react';
import { usePrepRouter } from '../../context/PrepRouterContext';
import { useAnalysisHistory } from '../../hooks/useAnalysisHistory';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Clock, ChevronRight } from 'lucide-react';

export const AnalysisHistory: React.FC = () => {
    const { history } = useAnalysisHistory();
    const { navigate } = usePrepRouter();

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold font-serif text-gray-900">Analysis History</h1>

            {history.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-500 mb-4">No analysis history found.</p>
                    <button
                        onClick={() => navigate('analyze')}
                        className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 transition"
                    >
                        Create your first analysis
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {history.map((item) => (
                        <Card
                            key={item.id}
                            className="cursor-pointer hover:shadow-md transition-shadow group border-l-4 border-l-transparent hover:border-l-primary"
                            onClick={() => navigate('results', { id: item.id })}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg group-hover:text-primary transition-colors">
                                            {item.role || "General Role"}
                                        </CardTitle>
                                        <p className="text-sm font-medium text-gray-600">{item.company || "Unknown Company"}</p>
                                    </div>
                                    <div className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2 py-1 rounded">
                                        Score: {item.readinessScore}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-gray-400 mb-4">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {new Date(item.createdAt).toLocaleDateString()} at {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="flex flex-wrap gap-1 mb-4">
                                    {Object.keys(item.extractedSkills).slice(0, 3).map(cat => (
                                        <span key={cat} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                            {cat}
                                        </span>
                                    ))}
                                    {Object.keys(item.extractedSkills).length > 3 && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                            +{Object.keys(item.extractedSkills).length - 3}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center text-primary text-sm font-medium group-hover:underline">
                                    View Report <ChevronRight className="h-4 w-4 ml-1" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
