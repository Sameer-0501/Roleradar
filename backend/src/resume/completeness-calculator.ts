/**
 * Candidate Profile Completeness Calculator.
 *
 * Deterministic formula based on verified candidate profile data presence (0-100%).
 * Standalone module to prevent circular dependencies between profile and evidence services.
 */

import type { ProfileCompletenessBreakdown } from './resume-types.js';

export function calculateProfileCompleteness(params: {
  hasResume: boolean;
  skillsCount: number;
  educationsCount: number;
  projectsCount: number;
  experiencesCount: number;
  hasPreferredRoles: boolean;
}): ProfileCompletenessBreakdown {
  let score = 0;
  const actionableTips: string[] = [];

  // 1. Resume uploaded (+15 pts)
  if (params.hasResume) {
    score += 15;
  } else {
    actionableTips.push('Upload a PDF or DOCX resume for automated parsing (+15%)');
  }

  // 2. Verified Skills (+25 pts for >= 3 skills, +15 pts for 1-2 skills)
  if (params.skillsCount >= 3) {
    score += 25;
  } else if (params.skillsCount >= 1) {
    score += 15;
    actionableTips.push('Add at least 3 core technical or domain skills (+10%)');
  } else {
    actionableTips.push('Add your key skills to boost matching accuracy (+25%)');
  }

  // 3. Education history (+20 pts)
  if (params.educationsCount >= 1) {
    score += 20;
  } else {
    actionableTips.push('Add your degree or highest education details (+20%)');
  }

  // 4. Projects (+15 pts)
  if (params.projectsCount >= 1) {
    score += 15;
  } else {
    actionableTips.push('Add at least 1 key academic or portfolio project (+15%)');
  }

  // 5. Experience or Internships (+15 pts)
  if (params.experiencesCount >= 1) {
    score += 15;
  } else {
    actionableTips.push('Add your work or internship experience (+15%)');
  }

  // 6. Preferred Roles & Headline (+10 pts)
  if (params.hasPreferredRoles) {
    score += 10;
  } else {
    actionableTips.push('Define your target role or professional headline (+10%)');
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    hasResume: params.hasResume,
    hasSkills: params.skillsCount > 0,
    skillsCount: params.skillsCount,
    hasEducation: params.educationsCount > 0,
    hasProjects: params.projectsCount > 0,
    hasExperienceOrInternship: params.experiencesCount > 0,
    hasPreferredRoles: params.hasPreferredRoles,
    actionableTips,
  };
}

