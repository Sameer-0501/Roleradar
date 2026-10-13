import React, { useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import { Button } from '../ui/Button';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { TagInput } from '../ui/TagInput';

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border border-gray-200 rounded-lg bg-white mb-4 overflow-hidden">
            <button
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="font-semibold text-gray-700">{title}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>
            {isOpen && <div className="p-4 border-t border-gray-200 space-y-4">{children}</div>}
        </div>
    );
};

const analyzeBullet = (text: string) => {
    if (!text) return null;
    const issues: string[] = [];

    // Split by newlines to handle multiple bullets
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    let needsVerb = false;
    let needsMetric = false;

    // Check for action verbs
    const actionVerbs = /^(Built|Developed|Designed|Implemented|Led|Improved|Created|Optimized|Automated|Managed|Orchestrated|Engineered)\b/i;

    lines.forEach(line => {
        // Strip common bullet characters and whitespace
        const cleanLine = line.replace(/^[\s\-\u2022*]+/, '');

        if (cleanLine.length > 0) {
            if (!actionVerbs.test(cleanLine)) needsVerb = true;
            if (!/\d+|%|k\b/i.test(cleanLine)) needsMetric = true;
        }
    });

    if (needsVerb) {
        issues.push("Start bullets with a strong action verb (e.g. Built, Led, Optimized).");
    }
    // Only suggest metrics if *all* lines are missing them? Or if *any*? 
    // Requirement: "For each bullet... If bullet has no numeric indicator... Show suggestion"
    // So if any bullet is missing a metric, we should probably suggest it. 
    // However, showing it if ANY bullet is missing might be noisy. 
    // Let's stick to strict requirement: checks per bullet.
    if (needsMetric) {
        issues.push("Add measurable impact (numbers, %, scale) to your bullets.");
    }

    return issues.length > 0 ? issues : null;
};

const GuidanceMessage: React.FC<{ text: string }> = ({ text }) => {
    const issues = analyzeBullet(text);
    if (!issues) return null;

    return (
        <div className="mt-1 text-xs text-amber-600 bg-amber-50 p-2 rounded flex flex-col gap-1">
            {issues.map((issue, idx) => (
                <span key={idx}>💡 {issue}</span>
            ))}
        </div>
    );
};

export const ResumeForm: React.FC = () => {
    const {
        resumeData, updatePersonalInfo,
        addEducation, updateEducation, removeEducation,
        addExperience, updateExperience, removeExperience,
        addProject, updateProject, removeProject,
        setResumeData, loadSampleData
    } = useResume();

    return (
        <div className="space-y-6 pb-20">
            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={loadSampleData}>Load Sample Data</Button>
            </div>

            <FormSection title="Personal Information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                        placeholder="Full Name"
                        className="p-2 border rounded-md w-full"
                        value={resumeData.personalInfo.fullName}
                        onChange={(e) => updatePersonalInfo('fullName', e.target.value)}
                    />
                    <input
                        placeholder="Email"
                        className="p-2 border rounded-md w-full"
                        value={resumeData.personalInfo.email}
                        onChange={(e) => updatePersonalInfo('email', e.target.value)}
                    />
                    <input
                        placeholder="Phone"
                        className="p-2 border rounded-md w-full"
                        value={resumeData.personalInfo.phone}
                        onChange={(e) => updatePersonalInfo('phone', e.target.value)}
                    />
                    <input
                        placeholder="Location"
                        className="p-2 border rounded-md w-full"
                        value={resumeData.personalInfo.location}
                        onChange={(e) => updatePersonalInfo('location', e.target.value)}
                    />
                    <input
                        placeholder="LinkedIn URL"
                        className="p-2 border rounded-md w-full"
                        value={resumeData.personalInfo.linkedin || ''}
                        onChange={(e) => updatePersonalInfo('linkedin', e.target.value)}
                    />
                    <input
                        placeholder="GitHub URL"
                        className="p-2 border rounded-md w-full"
                        value={resumeData.personalInfo.github || ''}
                        onChange={(e) => updatePersonalInfo('github', e.target.value)}
                    />
                </div>
            </FormSection>

            <FormSection title="Summary">
                <textarea
                    placeholder="Professional Summary"
                    className="w-full p-2 border rounded-md h-32 resize-none"
                    value={resumeData.summary}
                    onChange={(e) => setResumeData(prev => ({ ...prev, summary: e.target.value }))}
                />
            </FormSection>

            <FormSection title="Education">
                {resumeData.education.map((edu) => (
                    <div key={edu.id} className="p-3 border border-gray-100 rounded-md bg-gray-50 space-y-3 relative">
                        <button onClick={() => removeEducation(edu.id)} className="absolute top-2 right-2 text-red-500 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <input
                            placeholder="School / University" className="w-full p-2 border rounded bg-white"
                            value={edu.school} onChange={(e) => updateEducation(edu.id, 'school', e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                placeholder="Degree" className="w-full p-2 border rounded bg-white"
                                value={edu.degree} onChange={(e) => updateEducation(edu.id, 'degree', e.target.value)}
                            />
                            <input
                                placeholder="Year (e.g. 2020-2024)" className="w-full p-2 border rounded bg-white"
                                value={edu.year} onChange={(e) => updateEducation(edu.id, 'year', e.target.value)}
                            />
                        </div>
                    </div>
                ))}
                <Button variant="outline" size="sm" onClick={addEducation} className="w-full gap-2 border-dashed">
                    <Plus className="w-4 h-4" /> Add Education
                </Button>
            </FormSection>

            <FormSection title="Experience">
                {resumeData.experience.map((exp) => (
                    <div key={exp.id} className="p-3 border border-gray-100 rounded-md bg-gray-50 space-y-3 relative">
                        <button onClick={() => removeExperience(exp.id)} className="absolute top-2 right-2 text-red-500 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <input
                            placeholder="Company Name" className="w-full p-2 border rounded bg-white"
                            value={exp.company} onChange={(e) => updateExperience(exp.id, 'company', e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                placeholder="Role" className="w-full p-2 border rounded bg-white"
                                value={exp.role} onChange={(e) => updateExperience(exp.id, 'role', e.target.value)}
                            />
                            <input
                                placeholder="Duration" className="w-full p-2 border rounded bg-white"
                                value={exp.duration} onChange={(e) => updateExperience(exp.id, 'duration', e.target.value)}
                            />
                        </div>
                        <textarea
                            placeholder="Description" className="w-full p-2 border rounded bg-white h-24"
                            value={exp.description} onChange={(e) => updateExperience(exp.id, 'description', e.target.value)}
                        />
                        <GuidanceMessage text={exp.description} />
                    </div>
                ))}
                <Button variant="outline" size="sm" onClick={addExperience} className="w-full gap-2 border-dashed">
                    <Plus className="w-4 h-4" /> Add Experience
                </Button>
            </FormSection>

            <FormSection title="Projects">
                {resumeData.projects.map((proj) => (
                    <div key={proj.id} className="p-4 border border-gray-100 rounded-md bg-gray-50 space-y-3 relative group">
                        <button onClick={() => removeProject(proj.id)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                        </button>

                        <input
                            placeholder="Project Title" className="w-full p-2 border rounded bg-white font-medium"
                            value={proj.name} onChange={(e) => updateProject(proj.id, 'name', e.target.value)}
                        />

                        <div className="relative">
                            <textarea
                                placeholder="Description (Max 200 chars)"
                                className="w-full p-2 border rounded bg-white h-20 resize-none text-sm"
                                maxLength={200}
                                value={proj.description}
                                onChange={(e) => updateProject(proj.id, 'description', e.target.value)}
                            />
                            <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                                {proj.description.length}/200
                            </div>
                        </div>
                        <GuidanceMessage text={proj.description} />

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Tech Stack</label>
                            <TagInput
                                placeholder="Add technologies..."
                                tags={proj.techStack || []}
                                onTagsChange={(tags) => updateProject(proj.id, 'techStack', tags)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <input
                                placeholder="Live Link (optional)" className="w-full p-2 border rounded bg-white text-sm"
                                value={proj.link || ''} onChange={(e) => updateProject(proj.id, 'link', e.target.value)}
                            />
                            <input
                                placeholder="GitHub URL (optional)" className="w-full p-2 border rounded bg-white text-sm"
                                value={proj.github || ''} onChange={(e) => updateProject(proj.id, 'github', e.target.value)}
                            />
                        </div>
                    </div>
                ))}
                <Button variant="outline" size="sm" onClick={addProject} className="w-full gap-2 border-dashed">
                    <Plus className="w-4 h-4" /> Add Project
                </Button>
            </FormSection>

            <FormSection title="Skills">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-500">Categorize your skills for better impact.</p>
                        <SkillsSuggestionButton
                            onSuggest={() => {
                                setResumeData(prev => ({
                                    ...prev,
                                    skills: {
                                        technical: [...prev.skills.technical, "TypeScript", "React", "Node.js", "PostgreSQL", "GraphQL"],
                                        soft: [...prev.skills.soft, "Team Leadership", "Problem Solving"],
                                        tools: [...prev.skills.tools, "Git", "Docker", "AWS"]
                                    }
                                }));
                            }}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Technical Skills ({resumeData.skills.technical.length})
                        </label>
                        <TagInput
                            placeholder="e.g. React, Python, Java"
                            tags={resumeData.skills.technical}
                            onTagsChange={(tags) => setResumeData(prev => ({ ...prev, skills: { ...prev.skills, technical: tags } }))}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Soft Skills ({resumeData.skills.soft.length})
                        </label>
                        <TagInput
                            placeholder="e.g. Leadership, Communication"
                            tags={resumeData.skills.soft}
                            onTagsChange={(tags) => setResumeData(prev => ({ ...prev, skills: { ...prev.skills, soft: tags } }))}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tools & Technologies ({resumeData.skills.tools.length})
                        </label>
                        <TagInput
                            placeholder="e.g. VS Code, Git, Jira"
                            tags={resumeData.skills.tools}
                            onTagsChange={(tags) => setResumeData(prev => ({ ...prev, skills: { ...prev.skills, tools: tags } }))}
                        />
                    </div>
                </div>
            </FormSection>
        </div>
    );
};

const SkillsSuggestionButton: React.FC<{ onSuggest: () => void }> = ({ onSuggest }) => {
    const [loading, setLoading] = useState(false);

    const handleClick = () => {
        setLoading(true);
        setTimeout(() => {
            onSuggest();
            setLoading(false);
        }, 1000);
    };

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
        >
            {loading ? 'Generating...' : '✨ Suggest Skills'}
        </button>
    );
};
