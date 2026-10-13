import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { ResumeData } from '../types/resume';

interface ResumeContextType {
    resumeData: ResumeData;
    setResumeData: React.Dispatch<React.SetStateAction<ResumeData>>;
    updatePersonalInfo: (field: string, value: string) => void;
    addEducation: () => void;
    updateEducation: (id: string, field: string, value: string) => void;
    removeEducation: (id: string) => void;
    addExperience: () => void;
    updateExperience: (id: string, field: string, value: string) => void;
    removeExperience: (id: string) => void;
    addProject: () => void;
    updateProject: (id: string, field: string, value: string | string[]) => void;
    removeProject: (id: string) => void;
    loadSampleData: () => void;
    setTemplate: (template: 'classic' | 'modern' | 'minimal') => void;
    setColor: (color: string) => void;
}

const ResumeContext = createContext<ResumeContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useResume = () => {
    const context = useContext(ResumeContext);
    if (!context) {
        throw new Error('useResume must be used within a ResumeProvider');
    }
    return context;
};

const initialData: ResumeData = {
    selectedTemplate: 'modern',
    selectedColor: '#14b8a6', // Default Teal
    personalInfo: {
        fullName: '',
        email: '',
        phone: '',
        location: '',
    },
    summary: '',
    education: [],
    experience: [],
    projects: [],
    skills: {
        technical: [],
        soft: [],
        tools: []
    },
};

export const ResumeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [resumeData, setResumeData] = useState<ResumeData>(() => {
        const stored = localStorage.getItem('resumeBuilderData');
        try {
            const parsed = stored ? JSON.parse(stored) : initialData;
            // Migration check: if skills is string, reset to object
            if (typeof parsed.skills === 'string') {
                parsed.skills = { technical: [], soft: [], tools: [] };
            }
            return parsed;
        } catch (e) {
            return initialData;
        }
    });

    React.useEffect(() => {
        localStorage.setItem('resumeBuilderData', JSON.stringify(resumeData));
    }, [resumeData]);

    const updatePersonalInfo = (field: string, value: string) => {
        setResumeData(prev => ({
            ...prev,
            personalInfo: { ...prev.personalInfo, [field]: value }
        }));
    };

    const addEducation = () => {
        setResumeData(prev => ({
            ...prev,
            education: [...prev.education, { id: crypto.randomUUID(), school: '', degree: '', year: '' }]
        }));
    };

    const updateEducation = (id: string, field: string, value: string) => {
        setResumeData(prev => ({
            ...prev,
            education: prev.education.map(edu => edu.id === id ? { ...edu, [field]: value } : edu)
        }));
    };

    const removeEducation = (id: string) => {
        setResumeData(prev => ({
            ...prev,
            education: prev.education.filter(edu => edu.id !== id)
        }));
    };

    const addExperience = () => {
        setResumeData(prev => ({
            ...prev,
            experience: [...prev.experience, { id: crypto.randomUUID(), company: '', role: '', duration: '', description: '' }]
        }));
    };

    const updateExperience = (id: string, field: string, value: string) => {
        setResumeData(prev => ({
            ...prev,
            experience: prev.experience.map(exp => exp.id === id ? { ...exp, [field]: value } : exp)
        }));
    };

    const removeExperience = (id: string) => {
        setResumeData(prev => ({
            ...prev,
            experience: prev.experience.filter(exp => exp.id !== id)
        }));
    };

    const addProject = () => {
        setResumeData(prev => ({
            ...prev,
            projects: [...prev.projects, { id: crypto.randomUUID(), name: '', description: '', techStack: [] }]
        }));
    };

    const updateProject = (id: string, field: string, value: string | string[]) => {
        setResumeData(prev => ({
            ...prev,
            projects: prev.projects.map(proj => proj.id === id ? { ...proj, [field]: value } : proj)
        }));
    };

    const removeProject = (id: string) => {
        setResumeData(prev => ({
            ...prev,
            projects: prev.projects.filter(proj => proj.id !== id)
        }));
    };

    const loadSampleData = () => {
        setResumeData({
            selectedTemplate: 'modern',
            personalInfo: {
                fullName: 'Alex Morgan',
                email: 'alex.morgan@example.com',
                phone: '+1 (555) 0123-4567',
                location: 'San Francisco, CA',
                linkedin: 'linkedin.com/in/alexmorgan',
                github: 'github.com/alexmorgan',
                website: 'alexmorgan.dev'
            },
            summary: 'Creative and detail-oriented Frontend Developer with 4 years of experience building responsive and accessible web applications. Passionate about UI/UX design and modern web technologies.',
            education: [
                { id: '1', school: 'University of Technology', degree: 'B.S. Computer Science', year: '2018 - 2022' }
            ],
            experience: [
                { id: '1', company: 'TechNova Solutions', role: 'Frontend Developer', duration: '2022 - Present', description: 'Developed and maintained the core customer dashboard using React and TypeScript.\nImproved site performance by 30%.' },
                { id: '2', company: 'Creative Agency', role: 'Junior Web Designer', duration: '2021 - 2022', description: 'Collaborated with designers to implement pixel-perfect user interfaces.' }
            ],
            projects: [
                { id: '1', name: 'E-commerce Platform', description: 'A full-stack e-commerce solution with cart and payment integration.', techStack: ['React', 'Node.js', 'Stripe'], link: 'demo-store.com', github: 'github.com/alexmorgan/shop' }
            ],
            skills: {
                technical: ['React', 'TypeScript', 'Tailwind CSS', 'Node.js'],
                soft: ['Problem Solving', 'Communication'],
                tools: ['Git', 'Figma', 'VS Code']
            }
        });
    };

    const setTemplate = (template: 'classic' | 'modern' | 'minimal') => {
        setResumeData(prev => ({ ...prev, selectedTemplate: template }));
    };

    const setColor = (color: string) => {
        setResumeData(prev => ({ ...prev, selectedColor: color }));
    };

    return (
        <ResumeContext.Provider value={{
            resumeData,
            setResumeData,
            updatePersonalInfo,
            addEducation,
            updateEducation,
            removeEducation,
            addExperience,
            updateExperience,
            removeExperience,
            addProject,
            updateProject,
            removeProject,
            loadSampleData,
            setTemplate,
            setColor
        }}>
            {children}
        </ResumeContext.Provider>
    );
};
