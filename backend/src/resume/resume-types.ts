/**
 * Resume and Candidate Profile Intelligence Data Contracts.
 *
 * Types for resume management, deterministic parsing, candidate profiles,
 * completeness scoring, and job-fit evaluation.
 */

export interface ResumeMetadataDto {
  id: string;
  userId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateSkillDto {
  id?: string;
  skillName: string;
  canonicalName: string;
  category: string;
  source: 'PARSED' | 'MANUAL';
}

export interface CandidateEducationDto {
  id?: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  grade?: string | null;
}

export interface CandidateProjectDto {
  id?: string;
  title: string;
  description?: string | null;
  technologies?: string[] | null;
  url?: string | null;
}

export interface CandidateCertificationDto {
  id?: string;
  name: string;
  issuer?: string | null;
  issueYear?: number | null;
  url?: string | null;
}

export interface CandidateExperienceDto {
  id?: string;
  companyName: string;
  title: string;
  location?: string | null;
  isInternship: boolean;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent: boolean;
  description?: string | null;
}

export interface CandidateProfileDto {
  id: string;
  userId: string;
  fullName?: string | null;
  headline?: string | null;
  summary?: string | null;
  primaryRole?: string | null;
  targetRoles: string[];
  experienceLevel: 'FRESHER' | 'EXPERIENCED';
  totalExperienceMonths: number;
  completenessScore: number;
  activeResume?: ResumeMetadataDto | null;
  skills: CandidateSkillDto[];
  educations: CandidateEducationDto[];
  projects: CandidateProjectDto[];
  certifications: CandidateCertificationDto[];
  experiences: CandidateExperienceDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ParsedResumeData {
  fullName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  summary?: string;
  primaryRole?: string;
  targetRoles: string[];
  experienceLevel: 'FRESHER' | 'EXPERIENCED';
  totalExperienceMonths: number;
  skills: CandidateSkillDto[];
  educations: CandidateEducationDto[];
  projects: CandidateProjectDto[];
  certifications: CandidateCertificationDto[];
  experiences: CandidateExperienceDto[];
}

export interface ProfileCompletenessBreakdown {
  score: number; // 0 to 100
  hasResume: boolean;
  hasSkills: boolean;
  skillsCount: number;
  hasEducation: boolean;
  hasProjects: boolean;
  hasExperienceOrInternship: boolean;
  hasPreferredRoles: boolean;
  actionableTips: string[];
}

export interface JobFitComparisonResult {
  jobId: string;
  jobTitle: string;
  companyName: string;
  matchingSkills: string[];
  missingSkills: string[];
  fitScore: number; // 0 to 100
  fitTier: 'STRONG_MATCH' | 'MODERATE_MATCH' | 'POTENTIAL_FIT' | 'EXPLORATORY';
  fitReasons: string[];
  fresherReadiness?: {
    isFresherEligible: boolean;
    missingEvidence: string[];
    actionableAdvice: string[];
  };
}
