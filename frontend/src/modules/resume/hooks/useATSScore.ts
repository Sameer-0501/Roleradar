import { useMemo } from 'react';
import type { ResumeData } from '../types/resume';

interface ATSAnalysis {
    score: number;
    suggestions: string[];
}

export const useATSScore = (data: ResumeData): ATSAnalysis => {
    return useMemo(() => {
        let score = 0;
        const suggestions: string[] = [];

        // 1. Name provided (+10)
        if (data.personalInfo.fullName?.trim()) {
            score += 10;
        } else {
            suggestions.push("Add your full name (+10)");
        }

        // 2. Email provided (+10)
        if (data.personalInfo.email?.trim()) {
            score += 10;
        } else {
            suggestions.push("Add a professional email (+10)");
        }

        // 3. Summary > 50 chars (+10)
        const summaryWords = data.summary.trim().split(/\s+/).filter(w => w.length > 0).length;
        if (data.summary?.trim().length > 50) {
            score += 10;
        } else {
            suggestions.push("Expand summary to > 50 characters (+10)");
        }

        // 4. At least 1 experience entry (+15)
        if (data.experience.length >= 1) {
            score += 10;
        }

        // 4. Skills list has >= 8 items (+10)
        const skillCount = data.skills.technical.length + data.skills.soft.length + data.skills.tools.length;

        if (skillCount >= 8) {
            score += 10;
        }

        // 5. GitHub or LinkedIn link exists (+10)
        if ((data.personalInfo.linkedin && data.personalInfo.linkedin.trim().length > 0) ||
            (data.personalInfo.github && data.personalInfo.github.trim().length > 0)) {
            score += 10;
        }

        // 6. Any experience/project bullet contains a number (+15)
        const hasNumbers = [
            ...data.experience.map(e => e.description),
            ...data.projects.map(p => p.description)
        ].some(desc => /\d+|%|k\b/i.test(desc)); // Simple check for digits, %, or 'k' (like 10k)

        if (hasNumbers) {
            score += 15;
        }

        // 7. Education section has complete fields (+10)
        // Check if there is at least one education and all fields in it are filled
        const hasEducation = data.education.length > 0;
        const educationComplete = hasEducation && data.education.every(edu =>
            edu.school.trim() && edu.degree.trim() && edu.year.trim()
        );

        if (educationComplete) {
            score += 10;
        }

        // --- Improvement Suggestions Logic (Strict Priority) ---
        // 1. If <2 projects → suggest adding project.
        if (data.projects.length < 2) {
            suggestions.push("Add at least 2 projects.");
        }

        // 2. If no numbers → suggest measurable impact.
        if (!hasNumbers) {
            suggestions.push("Add measurable impact (numbers, %, scale) to descriptions.");
        }

        // 3. If summary <40 words → suggest expanding.
        if (summaryWords < 40) {
            suggestions.push(`Expand summary to 40-120 words (+10)`);
        }

        // 4. If skills <8 → suggest expanding.
        if (skillCount < 8) {
            suggestions.push(`Add more skills (Target 8+, Current: ${skillCount}).`);
        }

        // 5. If no experience → suggest adding internship/project work.
        if (data.experience.length === 0) {
            suggestions.push("Add internship or work experience.");
        }

        // Cap at 100 (though max logic sum is 80, this safeguards future changes)
        score = Math.min(score, 100);

        // Return top 3 suggestions
        return {
            score,
            suggestions: suggestions.slice(0, 3)
        };
    }, [data]);
};
