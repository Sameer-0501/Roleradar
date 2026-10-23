/**
 * RoleRadar Candidate Profile & Resume Intelligence API Service.
 *
 * Encapsulates candidate profile data retrieval, profile updates,
 * resume upload/parsing, resume activation and deletion, and completeness scoring.
 */

import { httpClient } from './client.js';
import type {
  CandidateProfile,
  Resume,
  ProfileCompleteness,
  ResumeUploadPayload,
} from './types.js';

export const profileService = {
  /**
   * Retrieves the candidate profile including extracted skills, education, experience, and projects.
   */
  async getCandidateProfile(): Promise<CandidateProfile | null> {
    const data = await httpClient.get<{ profile: CandidateProfile | null }>('/profile');
    return data.profile ?? null;
  },

  /**
   * Updates candidate profile fields (headline, summary, experience level, etc.).
   */
  async updateCandidateProfile(profileData: Partial<CandidateProfile>): Promise<CandidateProfile> {
    const data = await httpClient.put<{ profile: CandidateProfile }>('/profile', profileData);
    return data.profile;
  },

  /**
   * Uploads and parses a resume file (.pdf, .docx, .txt).
   */
  async uploadResume(payload: ResumeUploadPayload): Promise<any> {
    return httpClient.post<any>('/profile/resumes', payload);
  },

  /**
   * Lists all uploaded resumes for the authenticated user.
   */
  async listResumes(): Promise<Resume[]> {
    const data = await httpClient.get<{ resumes: Resume[] }>('/profile/resumes');
    return data.resumes || [];
  },

  /**
   * Sets a specific resume as the active default for job matching and applications.
   */
  async activateResume(resumeId: string): Promise<{ message: string; profile?: CandidateProfile }> {
    return httpClient.post<{ message: string; profile?: CandidateProfile }>(
      `/profile/resumes/${encodeURIComponent(resumeId)}/activate`
    );
  },

  /**
   * Deletes a specific resume.
   */
  async deleteResume(resumeId: string): Promise<{ message: string; profile?: CandidateProfile }> {
    return httpClient.delete<{ message: string; profile?: CandidateProfile }>(
      `/profile/resumes/${encodeURIComponent(resumeId)}`
    );
  },

  /**
   * Retrieves profile completeness score and actionable optimization recommendations.
   */
  async getProfileCompleteness(): Promise<ProfileCompleteness> {
    const data = await httpClient.get<{ completeness: ProfileCompleteness }>('/profile/completeness');
    return data.completeness;
  },

  /**
   * Compares candidate profile against a specific verified job posting.
   */
  async compareJobWithProfile(jobId: string): Promise<any> {
    return httpClient.post<any>(`/profile/compare-job/${encodeURIComponent(jobId)}`);
  },
};
