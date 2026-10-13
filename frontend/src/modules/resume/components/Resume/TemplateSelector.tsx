import React from 'react';
import { useResume } from '../../context/ResumeContext';
import { Minus } from 'lucide-react';

export const TemplateSelector: React.FC = () => {
    const { resumeData, setTemplate, setColor } = useResume();
    const currentTemplate = resumeData.selectedTemplate || 'modern';
    const currentColor = resumeData.selectedColor || '#14b8a6';

    const templates = [
        { id: 'modern', name: 'Modern', color: 'bg-blue-100' },
        { id: 'classic', name: 'Classic', color: 'bg-gray-100' },
        { id: 'minimal', name: 'Minimal', color: 'bg-white border' },
    ] as const;

    const colors = [
        { name: 'Teal', value: '#14b8a6', class: 'bg-teal-700' },
        { name: 'Navy', value: '#1e3a8a', class: 'bg-blue-900' },
        { name: 'Burgundy', value: '#881337', class: 'bg-rose-900' },
        { name: 'Forest', value: '#14532d', class: 'bg-green-900' },
        { name: 'Charcoal', value: '#374151', class: 'bg-gray-800' },
    ];

    return (
        <div className="mb-8 space-y-6">
            {/* Template Thumbnails */}
            <div className="grid grid-cols-3 gap-4">
                {templates.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTemplate(t.id)}
                        className={`relative group flex flex-col items-center gap-2 transition-all p-2 rounded-lg border-2 ${currentTemplate === t.id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-gray-50'
                            }`}
                    >
                        <div className={`w-full aspect-[210/297] rounded shadow-sm overflow-hidden ${t.color} relative`}>
                            {/* Sketchy representation of layout */}
                            {t.id === 'modern' && (
                                <div className="flex h-full">
                                    <div className="w-[30%] bg-gray-300 h-full"></div>
                                    <div className="w-[70%] bg-white h-full"></div>
                                </div>
                            )}
                            {t.id === 'classic' && (
                                <div className="p-2 flex flex-col items-center">
                                    <div className="w-1/2 h-2 bg-gray-800 mb-2"></div>
                                    <div className="w-full h-[1px] bg-gray-300 mb-2"></div>
                                    <div className="w-full h-full bg-white"></div>
                                </div>
                            )}
                            {t.id === 'minimal' && (
                                <div className="p-2">
                                    <div className="w-1/3 h-2 bg-gray-800 mb-4"></div>
                                    <div className="w-full h-full bg-white"></div>
                                </div>
                            )}
                        </div>
                        <span className={`text-xs font-semibold ${currentTemplate === t.id ? 'text-blue-700' : 'text-gray-500'}`}>
                            {t.name}
                        </span>
                        {currentTemplate === t.id && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                                <Minus className="w-2 h-2 text-white" />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            {/* Color Picker */}
            <div className="flex justify-center gap-4 py-2">
                {colors.map((c) => (
                    <button
                        key={c.name}
                        onClick={() => setColor(c.value)}
                        className={`w-8 h-8 rounded-full shadow-sm transition-transform hover:scale-110 ring-2 ring-offset-2 ${c.class} ${currentColor === c.value ? 'ring-blue-500 scale-110' : 'ring-transparent'
                            }`}
                        title={c.name}
                    />
                ))}
            </div>
        </div>
    );
};
