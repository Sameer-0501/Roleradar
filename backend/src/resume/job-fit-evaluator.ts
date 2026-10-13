/**
 * Deterministic Resume ↔ Job Fit Evaluator.
 *
 * Compares a candidate's structured profile against a verified job listing
 * to produce:
 * - Matching Skills (present in both)
 * - Missing Skills (required by job, not found in profile)
 * - Factual Fit Signals
 * - Fresher Readiness Insights
 *
 * INVARIANTS:
 * - Never states a candidate is unqualified.
 * - Always uses factual wording: "Not found in your current profile".
 * - Deterministic scoring, zero hallucination.
 */

import { SKILL_SYNONYMS } from '../search/search-parser.js';
import type { CandidateProfileDto, JobFitComparisonResult } from './resume-types.js';

export interface JobComparisonInput {
  id: string;
  title: string;
  companyName: string;
  location?: string | null;
  workplaceType?: string | null;
  description?: string | null;
  requirements?: string | null;
  experienceClassification?: string | null;
}

/**
 * Compare a candidate profile with a verified job.
 */
export function compareProfileWithJob(
  profile: CandidateProfileDto,
  job: JobComparisonInput
): JobFitComparisonResult {
  const jobText = `${job.title} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();

  // 1. Extract all canonical skills mentioned in the job listing
  const jobSkills: string[] = [];
  for (const [key, canonical] of Object.entries(SKILL_SYNONYMS)) {
    if (key === 'go') {
      if (/\b(golang|go\s+developer|go\s+engineer|go\s+backend)\b/i.test(jobText)) {
        if (!jobSkills.includes('Go')) jobSkills.push('Go');
      }
      continue;
    }

    const skillRegex = new RegExp(`\\b${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (skillRegex.test(jobText)) {
      if (!jobSkills.includes(canonical)) {
        jobSkills.push(canonical);
      }
    }
  }

  // 2. Identify Matching vs Missing Skills
  const candidateSkillsList = profile.skills || [];
  const candidateSkillNames = new Set(
    candidateSkillsList.map((s) => s.canonicalName.toLowerCase())
  );

  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of jobSkills) {
    if (candidateSkillNames.has(skill.toLowerCase())) {
      matchingSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  // 3. Compute Deterministic Fit Score (0 to 100)
  let fitScore = 0;
  const fitReasons: string[] = [];

  // Skill alignment (0 to 45 pts)
  if (jobSkills.length > 0) {
    const skillRatio = matchingSkills.length / jobSkills.length;
    const skillPoints = Math.round(skillRatio * 45);
    fitScore += skillPoints;
    if (matchingSkills.length > 0) {
      fitReasons.push(`⚡ Matches ${matchingSkills.length} listed skill${matchingSkills.length > 1 ? 's' : ''}: ${matchingSkills.slice(0, 3).join(', ')}`);
    }
  } else {
    // If job has no explicit skills listed, give baseline general skill points
    fitScore += 30;
  }

  // Role alignment (0 to 30 pts)
  const cleanTitle = job.title.toLowerCase();
  const targetRoles = profile.targetRoles || [];
  const matchedRole = targetRoles.find((r) => cleanTitle.includes(r.toLowerCase())) || profile.primaryRole;
  if (matchedRole && cleanTitle.includes(matchedRole.toLowerCase())) {
    fitScore += 30;
    fitReasons.push(`🎯 Matches your target role: ${matchedRole}`);
  } else if (targetRoles.length > 0) {
    fitScore += 15;
  }

  // Experience alignment (0 to 15 pts)
  const isFresherJob = job.experienceClassification === 'FRESHER_COMPATIBLE' || job.experienceClassification === 'BOTH';
  if (profile.experienceLevel === 'FRESHER' && isFresherJob) {
    fitScore += 15;
    fitReasons.push(`🎓 Aligns with your Fresher experience tier`);
  } else if (profile.experienceLevel === 'EXPERIENCED' && !isFresherJob) {
    fitScore += 15;
    fitReasons.push(`💼 Suitable for your experienced background`);
  } else if (isFresherJob) {
    fitScore += 10;
  }

  // Location / Workplace alignment (0 to 10 pts)
  if (job.location) {
    fitScore += 10;
    fitReasons.push(`📍 Located in ${job.location}`);
  }

  // Bound fit score
  const finalScore = Math.min(100, Math.max(10, fitScore));

  // Determine Fit Tier
  let fitTier: JobFitComparisonResult['fitTier'] = 'EXPLORATORY';
  if (finalScore >= 80) fitTier = 'STRONG_MATCH';
  else if (finalScore >= 60) fitTier = 'MODERATE_MATCH';
  else if (finalScore >= 40) fitTier = 'POTENTIAL_FIT';

  // 4. Fresher Readiness Insights
  let fresherReadiness: JobFitComparisonResult['fresherReadiness'] | undefined;
  if (profile.experienceLevel === 'FRESHER') {
    const missingEvidence: string[] = [];
    const actionableAdvice: string[] = [];

    if (missingSkills.length > 0) {
      missingEvidence.push(...missingSkills.slice(0, 3).map((s) => `Demonstrated evidence in ${s}`));
      actionableAdvice.push(`Consider adding a project or coursework covering ${missingSkills.slice(0, 2).join(' and ')} to improve alignment.`);
    }

    const projectsList = profile.projects || [];
    if (projectsList.length === 0) {
      missingEvidence.push('Academic or personal portfolio projects');
      actionableAdvice.push('Adding at least one GitHub/portfolio project will strongly enhance fresher credibility.');
    }

    fresherReadiness = {
      isFresherEligible: isFresherJob,
      missingEvidence,
      actionableAdvice,
    };
  }

  return {
    jobId: job.id,
    jobTitle: job.title,
    companyName: job.companyName,
    matchingSkills,
    missingSkills,
    fitScore: finalScore,
    fitTier,
    fitReasons,
    fresherReadiness,
  };
}
