import { describe, it, expect } from 'vitest';
import { parseResumeText } from '../resume/resume-parser.js';
import { calculateProfileCompleteness } from '../resume/profile-service.js';

describe('Phase 13: Resume & Candidate Profile Intelligence — Parser', () => {
  const sampleFresherResume = `
Sameer Khan
sameer.khan@example.com | +91 98765 43210 | Bangalore, India

EDUCATION
B.Tech in Computer Science & Engineering
Vellore Institute of Technology (VIT), 2020 - 2024
CGPA: 8.9 / 10

SKILLS
Programming Languages: Java, Python, JavaScript, TypeScript
Frameworks & Tools: React.js, Node.js, Express, Spring Boot
Databases: PostgreSQL, MongoDB, Redis
Cloud & DevOps: Docker, AWS, Git

PROJECTS
• RoleRadar Job Engine: Built an automated career job discovery and verification engine using Node.js, TypeScript, and PostgreSQL.
• Real-Time Chat App: Implemented WebSocket chat application with React and Redis caching.

INTERNSHIPS & EXPERIENCE
• Software Engineer Intern at Acme Tech Labs (Jan 2024 - Jun 2024)
  Worked on backend REST API microservices using Java and Spring Boot.

CERTIFICATIONS
• AWS Certified Cloud Practitioner (2024)
• Oracle Certified Java SE Programmer
`;

  it('1. Parses identity and contact details from fresher resume', () => {
    const parsed = parseResumeText(sampleFresherResume);
    expect(parsed.fullName).toBe('Sameer Khan');
    expect(parsed.email).toBe('sameer.khan@example.com');
    expect(parsed.phone).toBe('98765 43210');
  });

  it('2. Extracts canonical skills with synonym normalization', () => {
    const parsed = parseResumeText(sampleFresherResume);
    const skillNames = parsed.skills.map((s) => s.canonicalName);
    expect(skillNames).toContain('Java');
    expect(skillNames).toContain('Python');
    expect(skillNames).toContain('JavaScript');
    expect(skillNames).toContain('TypeScript');
    expect(skillNames).toContain('React');
    expect(skillNames).toContain('Node.js');
    expect(skillNames).toContain('PostgreSQL');
    expect(skillNames).toContain('Amazon Web Services');
  });

  it('3. Extracts degree, field of study, and institution correctly', () => {
    const parsed = parseResumeText(sampleFresherResume);
    expect(parsed.educations.length).toBeGreaterThanOrEqual(1);
    const edu = parsed.educations[0]!;
    expect(edu.degree).toBe('B.Tech / B.E.');
    expect(edu.fieldOfStudy).toBe('Computer Science & Engineering');
    expect(edu.startYear).toBe(2020);
    expect(edu.endYear).toBe(2024);
  });

  it('4. Extracts projects with technology tags', () => {
    const parsed = parseResumeText(sampleFresherResume);
    expect(parsed.projects.length).toBeGreaterThanOrEqual(2);
    const p1 = parsed.projects.find((p) => p.title.toLowerCase().includes('roleradar'));
    expect(p1).toBeDefined();
    expect(p1?.technologies).toContain('TypeScript');
    expect(p1?.technologies).toContain('PostgreSQL');
  });

  it('5. Extracts internships without falsely marking candidate as senior', () => {
    const parsed = parseResumeText(sampleFresherResume);
    expect(parsed.experiences.length).toBeGreaterThanOrEqual(1);
    expect(parsed.experiences[0]?.isInternship).toBe(true);
    expect(parsed.experienceLevel).toBe('FRESHER');
  });

  it('6. Extracts certifications with issuer', () => {
    const parsed = parseResumeText(sampleFresherResume);
    expect(parsed.certifications.length).toBeGreaterThanOrEqual(1);
    const cert = parsed.certifications.find((c) => c.issuer?.includes('AWS'));
    expect(cert).toBeDefined();
    expect(cert?.issueYear).toBe(2024);
  });

  it('7. Maps target roles deterministically from taxonomy', () => {
    const parsed = parseResumeText(sampleFresherResume);
    expect(parsed.targetRoles).toContain('Software Engineer');
  });
});

describe('Phase 13: Profile Completeness Model', () => {
  it('calculates 100% for full candidate profile', () => {
    const breakdown = calculateProfileCompleteness({
      hasResume: true,
      skillsCount: 5,
      educationsCount: 1,
      projectsCount: 2,
      experiencesCount: 1,
      hasPreferredRoles: true,
    });
    expect(breakdown.score).toBe(100);
    expect(breakdown.actionableTips.length).toBe(0);
  });

  it('calculates partial score and actionable tips for incomplete profile', () => {
    const breakdown = calculateProfileCompleteness({
      hasResume: false,
      skillsCount: 2,
      educationsCount: 1,
      projectsCount: 0,
      experiencesCount: 0,
      hasPreferredRoles: false,
    });
    expect(breakdown.score).toBeLessThan(70);
    expect(breakdown.actionableTips.some((t) => t.toLowerCase().includes('resume'))).toBe(true);
    expect(breakdown.actionableTips.some((t) => t.toLowerCase().includes('project'))).toBe(true);
  });
});
