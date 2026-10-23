/**
 * RoleRadar Jobs API Service.
 *
 * Encapsulates discovery queries, relevance-ranked matches, verified feeds,
 * and search suggestion lookups.
 */

import { httpClient } from './client.js';
import type {
  MatchedJobsOptions,
  MatchedJobsResponse,
  VerifiedJobsResponse,
  JobDetailsResponse,
  SearchSuggestionItem,
} from './types.js';

export const jobsService = {
  /**
   * Retrieves relevance-ranked matched jobs for the current candidate based on preferences.
   */
  async getMatchedJobs(options: MatchedJobsOptions = {}): Promise<MatchedJobsResponse> {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (options.page) params['page'] = options.page;
    if (options.limit) params['limit'] = options.limit;
    if (options.sort) params['sort'] = options.sort;
    if (options.roleFilter) params['roleFilter'] = options.roleFilter;
    if (options.q) params['q'] = options.q;
    if (options.workplace && options.workplace !== 'ANY') params['workplace'] = options.workplace;
    if (options.freshness && options.freshness !== 'ALL') params['freshness'] = options.freshness;
    if (options.country) params['country'] = options.country;
    if (options.location) params['location'] = options.location;
    if (options.experience) params['experience'] = options.experience;
    if (options.companyId) params['companyId'] = options.companyId;
    if (options.isToday) params['onlyToday'] = true;

    return httpClient.get<MatchedJobsResponse>('/jobs/matches', { params });
  },

  /**
   * Retrieves verified jobs posted or detected today.
   */
  async getTodayMatchedJobs(page = 1, limit = 20): Promise<MatchedJobsResponse> {
    return httpClient.get<MatchedJobsResponse>('/jobs/matches/today', {
      params: { page, limit },
    });
  },

  /**
   * Retrieves verified jobs with optional days-freshness filter.
   */
  async getVerifiedJobs(page = 1, limit = 20, days: number | null = null): Promise<VerifiedJobsResponse> {
    const params: Record<string, string | number | undefined> = { page, limit };
    if (days) params['days'] = days;
    return httpClient.get<VerifiedJobsResponse>('/jobs/verified', { params });
  },

  /**
   * Retrieves full details for a single job by its ID.
   */
  async getJobById(jobId: string): Promise<JobDetailsResponse> {
    return httpClient.get<JobDetailsResponse>(`/jobs/${encodeURIComponent(jobId)}`);
  },

  /**
   * Retrieves fast search auto-suggestions.
   */
  async getSearchSuggestions(query = '', limit = 8): Promise<SearchSuggestionItem[]> {
    const data = await httpClient.get<{ suggestions?: Array<string | SearchSuggestionItem> }>('/search/suggestions', {
      params: { q: query, limit },
    });
    const raw = data.suggestions || [];
    return raw.map((item) => (typeof item === 'string' ? { text: item } : item));
  },

  /**
   * Analyzes candidate search intent.
   */
  async explainSearchIntent(query: string): Promise<Record<string, unknown>> {
    return httpClient.post<Record<string, unknown>>('/search/explain', { query });
  },
};
