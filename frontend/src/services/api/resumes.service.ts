/**
 * RoleRadar Career Evidence Profile & Resume Studio 2.0 API Service — Engine 3.
 *
 * Implements client communication for:
 * - Master Career Profile & Evidence Vault
 * - Direct Candidate Profile Data Controls (Skills, Projects, Experiences)
 * - Truth-Preserving Resume Studio & Role Variant Tailoring
 * - Bullet-to-Evidence Claim Provenance Inspection
 * - Machine Extraction (ATS) Simulator
 */

import { httpClient } from './client.js';

export type EvidenceType =
  | 'PROJECT'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'CERTIFICATION'
  | 'PROFILE_SKILL'
  | 'ASSESSMENT';

export type VerifiedStatus =
  | 'SELF_REPORTED'
  | 'DOCUMENT_SUPPORTED'
  | 'PROJECT_SUPPORTED'
  | 'ASSESSMENT_SUPPORTED'
  | 'EXTERNALLY_VERIFIED'
  | 'WITHDRAWN';

export type ProvenanceState = 'PROVENANCE_BACKED' | 'UNLINKED';

export interface CareerProfile {
  id: string;
  userId: string;
  professionalHeadline: string | null;
  careerObjective: string | null;
  createdAt: string;
  updatedAt: string;
  evidenceStats: {
    totalClaims: number;
    skillsCount: number;
    projectsCount: number;
    experiencesCount: number;
    educationsCount: number;
    certificationsCount: number;
  };
}

export interface CandidateEvidence {
  id: string;
  userId: string;
  evidenceType: EvidenceType;
  referenceId: string | null;
  claimText: string;
  verifiedStatus: VerifiedStatus;
  lifecycleState?: 'ACTIVE' | 'WITHDRAWN';
  createdAt: string;
  updatedAt?: string;
}

export interface ResumeBullet {
  id: string;
  bulletText: string;
  provenanceState: ProvenanceState;
  evidenceId: string | null;
  evidenceClaimText?: string | null;
  evidenceType?: string | null;
  displayOrder: number;
}

export interface ResumeVariant {
  id: string;
  profileId: string;
  variantName: string;
  isMaster: boolean;
  truthfulnessScore?: number;
  bullets?: ResumeBullet[];
  createdAt: string;
  updatedAt: string;
}

export interface TailoredResumeResult {
  id: string;
  profileId: string;
  variantName: string;
  isMaster: boolean;
  targetJobId: string;
  truthfulnessScore: number;
  provenanceBackedCount: number;
  unlinkedCount: number;
  matchedHighlights: Array<{
    requirementText: string;
    evidenceClaim: string;
    evidenceType: string;
  }>;
  unsupportedRequirements: string[];
  bullets: ResumeBullet[];
  createdAt: string;
  updatedAt: string;
}

export interface SyncEvidenceResponse {
  message: string;
  syncedCount: number;
  updatedCount: number;
  alreadyUpToDateCount: number;
  totalActiveClaims: number;
  profile: CareerProfile;
}

export interface ATSInspectionReport {
  overallScore: number;
  parsingQuality: {
    score: number;
    status: 'EXCELLENT' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT';
    contactDetails: {
      nameDetected: string | null;
      emailDetected: string | null;
      phoneDetected: string | null;
      linksDetected: string[];
    };
    detectedSections: Array<{
      sectionName: string;
      lineIndex: number;
      standardCategory: string;
    }>;
    missingSections: string[];
    diagnostics: string[];
  };
  roleRelevance: {
    score: number;
    status: 'HIGH' | 'MODERATE' | 'LOW';
    matchedKeywords: string[];
    missingKeywords: string[];
    keywordDensityPercent: number;
    recommendations: string[];
  };
  evidenceIntegrity: {
    score: number;
    status: 'VERIFIED' | 'ACCEPTABLE_SYNTHESIS' | 'UNVERIFIED_CLAIMS_DETECTED';
    totalClaimsCount: number;
    provenanceBackedCount: number;
    unlinkedCount: number;
    unlinkedBullets: string[];
    integrityFlags: string[];
  };
}

export const resumesService = {
  // Master Profile
  async getCareerProfile(): Promise<CareerProfile> {
    const data = await httpClient.get<{ profile: CareerProfile }>('/candidate/career-profile');
    return data.profile;
  },

  async updateCareerProfile(payload: { professionalHeadline?: string; careerObjective?: string }): Promise<CareerProfile> {
    const data = await httpClient.put<{ profile: CareerProfile }>('/candidate/career-profile', payload);
    return data.profile;
  },

  // Master Evidence Vault
  async listEvidence(type?: EvidenceType, includeWithdrawn?: boolean): Promise<CandidateEvidence[]> {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (includeWithdrawn) params.append('includeWithdrawn', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await httpClient.get<{ evidence: CandidateEvidence[] }>(`/candidate/evidence${query}`);
    return data.evidence || [];
  },

  async reactivateEvidence(
    id: string,
    payload?: { newVerifiedStatus?: VerifiedStatus; referenceId?: string | null }
  ): Promise<CandidateEvidence> {
    const data = await httpClient.post<{ evidence: CandidateEvidence }>(
      `/candidate/evidence/${encodeURIComponent(id)}/reactivate`,
      payload || {}
    );
    return data.evidence;
  },

  async addEvidence(payload: {
    evidenceType: EvidenceType;
    claimText: string;
    referenceId?: string;
    verifiedStatus?: VerifiedStatus;
  }): Promise<CandidateEvidence> {
    const data = await httpClient.post<{ evidence: CandidateEvidence }>('/candidate/evidence', payload);
    return data.evidence;
  },

  async deleteEvidence(id: string): Promise<void> {
    await httpClient.delete(`/candidate/evidence/${encodeURIComponent(id)}`);
  },

  async syncEvidence(): Promise<SyncEvidenceResponse> {
    return httpClient.post<SyncEvidenceResponse>('/candidate/evidence/sync');
  },

  // Direct Candidate Controls (Skills, Projects, Experience, Education)
  async addSkill(skillName: string, category: string = 'Technical'): Promise<any> {
    return httpClient.post('/candidate/skills', { skillName, category });
  },

  async deleteSkill(skillId: string): Promise<void> {
    await httpClient.delete(`/candidate/skills/${encodeURIComponent(skillId)}`);
  },

  async addEducation(payload: {
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startYear?: number;
    endYear?: number;
  }): Promise<any> {
    return httpClient.post('/candidate/educations', payload);
  },

  async deleteEducation(educationId: string): Promise<void> {
    await httpClient.delete(`/candidate/educations/${encodeURIComponent(educationId)}`);
  },

  async addProject(payload: {
    title: string;
    description?: string;
    technologies?: string[];
    url?: string;
  }): Promise<any> {
    return httpClient.post('/candidate/projects', payload);
  },

  async deleteProject(projectId: string): Promise<void> {
    await httpClient.delete(`/candidate/projects/${encodeURIComponent(projectId)}`);
  },

  async addExperience(payload: {
    title: string;
    company: string;
    location?: string;
    isInternship?: boolean;
    description?: string;
  }): Promise<any> {
    return httpClient.post('/candidate/experiences', payload);
  },

  async deleteExperience(expId: string): Promise<void> {
    await httpClient.delete(`/candidate/experiences/${encodeURIComponent(expId)}`);
  },

  // Resume Studio & Variants
  async tailorResume(payload: { jobId: string; variantName?: string }): Promise<TailoredResumeResult> {
    const data = await httpClient.post<{ tailored: TailoredResumeResult }>('/resumes/tailor', payload);
    return data.tailored;
  },

  async listResumeVariants(): Promise<ResumeVariant[]> {
    const data = await httpClient.get<{ variants: ResumeVariant[] }>('/resumes/variants');
    return data.variants || [];
  },

  async getResumeVariant(variantId: string): Promise<ResumeVariant> {
    const data = await httpClient.get<{ variant: ResumeVariant }>(`/resumes/variants/${encodeURIComponent(variantId)}`);
    return data.variant;
  },

  async addResumeBullet(variantId: string, payload: { bulletText: string; evidenceId?: string | null }): Promise<any> {
    return httpClient.post(`/resumes/variants/${encodeURIComponent(variantId)}/bullets`, payload);
  },

  async deleteResumeBullet(variantId: string, bulletId: string): Promise<void> {
    await httpClient.delete(`/resumes/variants/${encodeURIComponent(variantId)}/bullets/${encodeURIComponent(bulletId)}`);
  },

  async deleteResumeVariant(variantId: string): Promise<void> {
    await httpClient.delete(`/resumes/variants/${encodeURIComponent(variantId)}`);
  },

  // ATS Simulator
  async inspectATSResume(payload: {
    resumeText?: string;
    resumeId?: string;
    targetJobId?: string;
    targetJobText?: string;
  }): Promise<ATSInspectionReport> {
    const data = await httpClient.post<{ inspection: ATSInspectionReport }>('/resumes/inspect-ats', payload);
    return data.inspection;
  },
};

