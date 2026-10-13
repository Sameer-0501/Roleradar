export interface Education {
    id: string;
    school: string;
    degree: string;
    year: string;
}

export interface Experience {
    id: string;
    company: string;
    role: string;
    duration: string;
    description: string;
}

export interface Project {
    id: string;
    name: string;
    description: string;
    techStack: string[];
    link?: string;
    github?: string;
}

export interface SkillCategories {
    technical: string[];
    soft: string[];
    tools: string[];
}

export interface ResumeData {
    personalInfo: {
        fullName: string;
        email: string;
        phone: string;
        location: string;
        linkedin?: string;
        github?: string;
        website?: string;
    };
    summary: string;
    education: Education[];
    experience: Experience[];
    projects: Project[];
    skills: SkillCategories;
    selectedTemplate?: 'classic' | 'modern' | 'minimal';
    selectedColor?: string;
}
