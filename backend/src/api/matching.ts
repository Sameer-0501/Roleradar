/**
 * Matching Jobs API Handlers.
 *
 * Provides authenticated endpoints returning verified active jobs matching the
 * authenticated user's preferences, with Phase 9 relevance ranking and filter support.
 */

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/middleware.js';
import { findMatchesForUser } from '../matching/matching-service.js';
import type { SortOption } from '../matching/relevance/relevance-types.js';

export async function getMatchedJobsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const page = parseInt(String(req.query['page'] || '1'), 10);
  const limit = parseInt(String(req.query['limit'] || '20'), 10);
  const sort = req.query['sort'] as SortOption | undefined;
  const roleFilter = req.query['roleFilter'] ? String(req.query['roleFilter']) : undefined;
  const q = req.query['q'] ? String(req.query['q']) : undefined;
  const workplace = req.query['workplace'] ? String(req.query['workplace']) : undefined;
  const freshness = req.query['freshness'] ? String(req.query['freshness']) : undefined;
  const country = req.query['country'] ? String(req.query['country']) : undefined;
  const location = req.query['location'] ? String(req.query['location']) : undefined;
  const experience = req.query['experience'] ? String(req.query['experience']) : undefined;
  const companyId = req.query['companyId'] ? String(req.query['companyId']) : undefined;
  const includeDismissed = req.query['includeDismissed'] === 'true';

  try {
    const result = await findMatchesForUser(req.user.id, {
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
      onlyToday: req.query['onlyToday'] === 'true',
      sort,
      roleFilter,
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve matching jobs.' });
  }
}

export async function getTodayMatchedJobsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const page = parseInt(String(req.query['page'] || '1'), 10);
  const limit = parseInt(String(req.query['limit'] || '10000'), 10);
  const sort = req.query['sort'] as SortOption | undefined;

  try {
    const result = await findMatchesForUser(req.user.id, {
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
      onlyToday: true,
      sort,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve today\'s matching jobs.' });
  }
}
