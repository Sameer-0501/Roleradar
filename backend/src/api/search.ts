/**
 * Search Intelligence API Handlers.
 *
 * Provides endpoints for natural-language search, real-time suggestions,
 * and search intent explanation.
 *
 * Endpoints:
 *   GET  /api/search             — Execute natural-language job search
 *   GET  /api/search/suggestions — Get autocomplete suggestions for query prefix
 *   POST /api/search/explain     — Parse and explain search intent
 */

import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../auth/middleware.js';
import { findMatchesForUser } from '../matching/matching-service.js';
import { parseSearchQuery } from '../search/search-parser.js';
import { getSearchSuggestions } from '../search/search-suggestions.js';
import type { SortOption } from '../matching/relevance/relevance-types.js';

/**
 * GET /api/search
 * Natural-language search with deterministic intent parsing and ranking.
 */
export async function searchJobsHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id || 'guest-search-user';

  const page = parseInt(String(req.query['page'] || '1'), 10);
  const limit = parseInt(String(req.query['limit'] || '20'), 10);
  const sort = req.query['sort'] as SortOption | undefined;
  const q = req.query['q'] ? String(req.query['q']) : undefined;
  const workplace = req.query['workplace'] ? String(req.query['workplace']) : undefined;
  const freshness = req.query['freshness'] ? String(req.query['freshness']) : undefined;
  const country = req.query['country'] ? String(req.query['country']) : undefined;
  const location = req.query['location'] ? String(req.query['location']) : undefined;
  const experience = req.query['experience'] ? String(req.query['experience']) : undefined;
  const companyId = req.query['companyId'] ? String(req.query['companyId']) : undefined;
  const includeDismissed = req.query['includeDismissed'] === 'true';

  try {
    const result = await findMatchesForUser(userId, {
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
      onlyToday: false,
      sort,
      q,
      workplace,
      freshness,
      country,
      location,
      experience,
      companyId,
      includeDismissed,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Search execution failed', details: err.message });
  }
}

/**
 * GET /api/search/suggestions
 * Real-time autocomplete suggestions for search input.
 */
export function getSuggestionsHandler(req: Request, res: Response): void {
  const q = req.query['q'] ? String(req.query['q']) : '';
  const limit = parseInt(String(req.query['limit'] || '8'), 10);

  const suggestions = getSearchSuggestions(q, isNaN(limit) ? 8 : limit);
  res.json({ suggestions });
}

/**
 * POST /api/search/explain
 * Parse and explain search intent for query debugging.
 */
export function explainSearchIntentHandler(req: Request, res: Response): void {
  const query = req.body?.query || req.query['query'] || '';
  const intent = parseSearchQuery(String(query));
  res.json({
    query,
    intent,
  });
}
