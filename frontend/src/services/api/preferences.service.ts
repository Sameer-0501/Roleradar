/**
 * RoleRadar Preferences & Taxonomy API Service (Wave 2C).
 *
 * Encapsulates candidate matching preferences, canonical taxonomy,
 * migration preview, and company directory operations.
 */

import { httpClient } from './client.js';
import type {
  UserPreferences,
  Company,
  CanonicalTaxonomyResponse,
  MigrationPreviewResponse,
} from './types.js';

export const preferencesService = {
  /**
   * Retrieves candidate matching preferences from backend API.
   */
  async getPreferences(): Promise<UserPreferences | null> {
    const data = await httpClient.get<{
      preferences?: UserPreferences;
      onboardingCompleted?: boolean;
    }>('/users/me/preferences');
    if (data && data.preferences) {
      return {
        ...data.preferences,
        onboardingCompleted: data.onboardingCompleted ?? data.preferences.onboardingCompleted,
      };
    }
    return (data as unknown as UserPreferences) || null;
  },

  /**
   * Saves candidate matching preferences to backend API.
   */
  async savePreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const data = await httpClient.put<{ message: string; preferences: UserPreferences }>(
      '/users/me/preferences',
      preferences
    );
    return data.preferences;
  },

  /**
   * Explicitly marks candidate onboarding completed.
   */
  async completeOnboarding(): Promise<{ message: string; onboardingCompleted: boolean }> {
    return httpClient.post<{ message: string; onboardingCompleted: boolean }>(
      '/users/me/preferences/complete'
    );
  },

  /**
   * Fetches full supported companies list.
   */
  async getCompanies(): Promise<Company[]> {
    const data = await httpClient.get<{ companies?: Company[] }>('/companies');
    return data.companies || [];
  },

  /**
   * Retrieves canonical role taxonomy hierarchy.
   */
  async getCanonicalTaxonomy(): Promise<CanonicalTaxonomyResponse> {
    return httpClient.get<CanonicalTaxonomyResponse>('/preferences/canonical-taxonomy');
  },

  /**
   * Generates migration preview for legacy roles.
   */
  async getMigrationPreview(): Promise<MigrationPreviewResponse> {
    return httpClient.get<MigrationPreviewResponse>('/users/me/preferences/migration-preview');
  },
};
