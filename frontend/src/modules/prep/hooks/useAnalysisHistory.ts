import { useState, useEffect } from 'react';

export interface AnalysisResult {
    id: string;
    createdAt: string;
    updatedAt: string;
    company: string;
    role: string;
    jdText: string;
    extractedSkills: Record<string, string[]>;
    plan: { day: string; title: string; desc: string }[];
    checklist: Record<string, string[]>;
    questions: string[];
    baseScore: number;
    readinessScore: number; // Current/Final Score
    skillConfidenceMap: Record<string, 'know' | 'practice'>;
    companyIntel?: {
        size: 'Startup' | 'Mid-size' | 'Enterprise';
        industry: string;
        focus: string;
    };
    roundMapping?: {
        round: string;
        desc: string;
        whyMatters: string;
    }[];
}

const STORAGE_KEY = 'placement_readiness_history';

export const useAnalysisHistory = () => {
    const [history, setHistory] = useState<AnalysisResult[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    // Filter out corrupt entries if necessary or sanitization
                    setHistory(parsed);
                } else {
                    console.error("History format invalid");
                    setLoadError("Invalid history format");
                }
            } catch (e) {
                console.error("Failed to parse history", e);
                setLoadError("Failed to load history");
            }
        }
    }, []);

    const saveAnalysis = (analysis: AnalysisResult) => {
        // Ensure strictly shaped object before saving
        const entry: AnalysisResult = {
            ...analysis,
            skillConfidenceMap: analysis.skillConfidenceMap || {},
            updatedAt: analysis.updatedAt || new Date().toISOString()
        };

        if (Object.keys(entry.skillConfidenceMap).length === 0) {
            const map: Record<string, 'know' | 'practice'> = {};
            Object.values(entry.extractedSkills).flat().forEach(skill => {
                map[skill] = 'practice';
            });
            entry.skillConfidenceMap = map;
        }

        const newHistory = [entry, ...history];
        setHistory(newHistory);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    };

    const updateAnalysis = (id: string, updates: Partial<AnalysisResult>) => {
        const newHistory = history.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    ...updates,
                    updatedAt: new Date().toISOString()
                };
            }
            return item;
        });
        setHistory(newHistory);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    };

    const getAnalysisById = (id: string) => {
        return history.find(item => item.id === id);
    };

    const getLatestAnalysis = () => {
        return history.length > 0 ? history[0] : null;
    };

    return { history, saveAnalysis, updateAnalysis, getAnalysisById, getLatestAnalysis, loadError };
};
