import type { ResumeData } from '../types/resume';

export const generateResumeText = (data: ResumeData): string => {
    const { personalInfo, summary, education, experience, projects, skills } = data;
    const lines: string[] = [];

    // Header
    if (personalInfo.fullName) lines.push(personalInfo.fullName.toUpperCase());

    const contactInfo = [
        personalInfo.email,
        personalInfo.phone,
        personalInfo.location,
        personalInfo.linkedin,
        personalInfo.github,
        personalInfo.website
    ].filter(Boolean).join(' | ');

    if (contactInfo) lines.push(contactInfo);
    lines.push('\n');

    // Summary
    if (summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push('-------------------');
        lines.push(summary);
        lines.push('\n');
    }

    // Experience
    if (experience.length > 0) {
        lines.push('EXPERIENCE');
        lines.push('----------');
        experience.forEach(exp => {
            lines.push(`${exp.role} | ${exp.company}`);
            lines.push(exp.duration);
            if (exp.description) lines.push(exp.description);
            lines.push('');
        });
    }

    // Projects
    if (projects.length > 0) {
        lines.push('PROJECTS');
        lines.push('--------');
        projects.forEach(proj => {
            lines.push(proj.name);
            if (proj.link) lines.push(`Link: ${proj.link}`);
            if (proj.github) lines.push(`GitHub: ${proj.github}`);
            if (proj.description) lines.push(proj.description);
            if (proj.techStack && proj.techStack.length > 0) lines.push(`Tech Stack: ${proj.techStack.join(', ')}`);
            lines.push('');
        });
    }

    // Education
    if (education.length > 0) {
        lines.push('EDUCATION');
        lines.push('---------');
        education.forEach(edu => {
            lines.push(`${edu.school} | ${edu.degree}`);
            lines.push(edu.year);
            lines.push('');
        });
    }

    // Skills
    if (skills) {
        lines.push('SKILLS');
        lines.push('------');
        if (typeof skills === 'string') {
            lines.push(skills);
        } else {
            if (skills.technical.length > 0) lines.push(`Technical: ${skills.technical.join(', ')}`);
            if (skills.soft.length > 0) lines.push(`Soft Skills: ${skills.soft.join(', ')}`);
            if (skills.tools.length > 0) lines.push(`Tools: ${skills.tools.join(', ')}`);
        }
    }

    return lines.join('\n');
};
