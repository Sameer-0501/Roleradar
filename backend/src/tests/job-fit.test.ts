import { describe, it, expect } from 'vitest';
import { compareProfileWithJob } from '../resume/job-fit-evaluator.js';
import type { CandidateProfileDto } from '../resume/resume-types.js';

describe('Phase 13: Job Fit Evaluator', () => {
  const sampleProfile: CandidateProfileDto = {
    id: 'test-profile-1',
    userId: 'test-user-1',
    fullName: 'Ananya Sharma',
    headline: 'Fresher Software Engineer',
    summary: 'Full stack developer proficient in React and Java',
    primaryRole: 'Software Engineer',
    targetRoles: ['Software Engineer', 'Frontend Developer'],
    experienceLevel: 'FRESHER',
    totalExperienceMonths: 4,
    completenessScore: 85,
    skills: [
      { skillName: 'Java', canonicalName: 'Java', category: 'Languages', source: 'PARSED' },
      { skillName: 'React', canonicalName: 'React', category: 'Frameworks', source: 'PARSED' },
      { skillName: 'JavaScript', canonicalName: 'JavaScript', category: 'Languages', source: 'PARSED' },
      { skillName: 'PostgreSQL', canonicalName: 'PostgreSQL', category: 'Databases', source: 'PARSED' },
    ],
    educations: [
      { institution: 'IIT Delhi', degree: 'B.Tech', fieldOfStudy: 'Computer Science', startYear: 2020, endYear: 2024 },
    ],
    projects: [
      { title: 'Portfolio Project', description: 'React & Node web app' },
    ],
    certifications: [],
    experiences: [
      { companyName: 'Startup Labs', title: 'Frontend Intern', isInternship: true, isCurrent: false },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('1. Correctly identifies matching skills and missing skills', () => {
    const job = {
      id: 'job-123',
      title: 'Graduate Software Engineer',
      companyName: 'Adyen',
      location: 'Bangalore, India',
      description: 'Looking for a fresher engineer with skills in Java, React, Docker, and AWS.',
      experienceClassification: 'FRESHER_COMPATIBLE',
    };

    const fit = compareProfileWithJob(sampleProfile, job);

    expect(fit.matchingSkills).toContain('Java');
    expect(fit.matchingSkills).toContain('React');
    expect(fit.missingSkills).toContain('Docker');
    expect(fit.missingSkills).toContain('Amazon Web Services');
    expect(fit.fitScore).toBeGreaterThanOrEqual(70);
    expect(fit.fitReasons.some((r) => r.includes('Java') || r.includes('Matches'))).toBe(true);
  });

  it('2. Never declares candidate unqualified and uses factual phrasing', () => {
    const job = {
      id: 'job-456',
      title: 'Senior DevOps Architect',
      companyName: 'Stripe',
      location: 'Remote, India',
      description: 'Requires Kubernetes, Terraform, and Go expertise.',
      experienceClassification: 'EXPERIENCED',
    };

    const fit = compareProfileWithJob(sampleProfile, job);
    expect(fit.fitScore).toBeLessThan(60);
    expect(fit.fitReasons.every((r) => !r.toLowerCase().includes('unqualified'))).toBe(true);
  });

  it('3. Generates fresher readiness insights for fresher profiles', () => {
    const job = {
      id: 'job-789',
      title: 'Associate Java Developer',
      companyName: 'Zeta',
      location: 'Bangalore',
      description: 'Java, Spring, Redis, Docker knowledge preferred.',
      experienceClassification: 'FRESHER_COMPATIBLE',
    };

    const fit = compareProfileWithJob(sampleProfile, job);
    expect(fit.fresherReadiness).toBeDefined();
    expect(fit.fresherReadiness?.isFresherEligible).toBe(true);
    expect(fit.fresherReadiness?.actionableAdvice.length).toBeGreaterThan(0);
  });
});
