/**
 * User Preferences API Handlers.
 *
 * Implements preference retrieval, validation, upsert, and onboarding completion.
 * Authorization is strictly bound to the authenticated user ID (req.user.id).
 */

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/middleware.js';
import { validatePreferences } from '../preferences/validator.js';
import {
  getUserPreferences,
  saveUserPreferences,
  completeOnboarding,
  migrationPreview,
} from '../preferences/preference-service.js';
import {
  STANDARD_ROLES,
  STANDARD_LOCATIONS,
  VALID_EXPERIENCE_LEVELS,
} from '../preferences/taxonomy.js';
import { CANONICAL_DOMAINS, CANONICAL_TAXONOMY } from '../matching/canonical-taxonomy.js';

export async function getPreferencesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    const prefs = await getUserPreferences(req.user.id);
    res.json({
      preferences: prefs,
      onboardingCompleted: prefs?.onboardingCompleted ?? false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user preferences.' });
  }
}

export async function savePreferencesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const validationResult = await validatePreferences(req.body ?? {});
  if (!validationResult.valid || !validationResult.data) {
    res.status(400).json({
      error: 'Invalid preferences payload.',
      details: validationResult.errors,
    });
    return;
  }

  try {
    const saved = await saveUserPreferences(req.user.id, validationResult.data, true);
    res.json({
      message: 'Preferences saved successfully.',
      preferences: saved,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save user preferences.' });
  }
}

export async function completeOnboardingHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    const success = await completeOnboarding(req.user.id);
    if (!success) {
      res.status(404).json({ error: 'User preference record not found. Please save preferences first.' });
      return;
    }

    res.json({
      message: 'Onboarding marked as completed.',
      onboardingCompleted: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete onboarding.' });
  }
}

export async function migrationPreviewHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    const result = await migrationPreview(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate migration preview.' });
  }
}

export function getTaxonomyHandler(_req: AuthenticatedRequest, res: Response): void {
  res.json({
    roles: STANDARD_ROLES,
    locations: STANDARD_LOCATIONS,
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
    experienceLevels: VALID_EXPERIENCE_LEVELS,
  });
}

export function getCanonicalTaxonomyHandler(_req: AuthenticatedRequest, res: Response): void {
  const domains = CANONICAL_DOMAINS.map((domain) => {
    const rolesForDomain = CANONICAL_TAXONOMY.filter(
      (role) => role.domainId === domain.id && role.isSelectable
    ).map((role) => ({
      id: role.id,
      displayName: role.displayName,
      domainId: role.domainId,
      isSelectable: role.isSelectable,
    }));

    return {
      id: domain.id,
      displayName: domain.displayName,
      roles: rolesForDomain,
    };
  });

  res.json({ domains });
}
