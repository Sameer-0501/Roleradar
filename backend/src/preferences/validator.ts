/**
 * Server-Side User Preferences Validator.
 *
 * Enforces all product rules and data integrity checks on preference payloads.
 *
 * Rules:
 *   1. Roles must be a non-empty array of strings.
 *   2. Locations must be a non-empty array of strings.
 *   3. Experience level must be 'FRESHER', 'EXPERIENCED', or 'ANY'.
 *   4. Companies array is OPTIONAL. An empty array [] is valid (semantically = ALL active companies).
 *   5. If company IDs are provided, they must exist in the companies table and be active.
 *   6. Sanitizes, deduplicates, and normalizes all input values.
 */

import { normalizeLocation, isValidExperienceLevel, type ExperienceLevel } from './taxonomy.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { inArray } from 'drizzle-orm';
import { CANONICAL_TAXONOMY } from '../matching/canonical-taxonomy.js';

export interface RawPreferenceInput {
  roles?: unknown;
  locations?: unknown;
  workplaceTypes?: unknown;
  workplace_types?: unknown;
  experienceLevel?: unknown;
  companyIds?: unknown;
  companies?: unknown; // alias for companyIds
  keywords?: unknown;
  emailAlertsEnabled?: unknown;
  instantNotifications?: unknown;
  dailyDigest?: unknown;
  timezone?: unknown;
  canonicalRoles?: unknown;
}

export interface ValidatedPreferences {
  roles: string[];
  locations: string[];
  workplaceTypes: string[];
  experienceLevel: ExperienceLevel;
  companyIds: string[];
  keywords: string[];
  emailAlertsEnabled: boolean;
  instantNotifications: boolean;
  dailyDigest: boolean;
  timezone: string;
  canonicalRoles: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  data?: ValidatedPreferences;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_WORKPLACE_TYPES = new Set(['ONSITE', 'HYBRID', 'REMOTE']);

export async function validatePreferences(input: RawPreferenceInput): Promise<ValidationResult> {
  const errors: string[] = [];

  // ── 1. Validate Roles ──────────────────────────────────────────────────────
  if (!Array.isArray(input.roles)) {
    errors.push('Roles must be provided as an array.');
  }

  const rawRoles = Array.isArray(input.roles) ? input.roles : [];
  const cleanedRoles = Array.from(
    new Set(
      rawRoles
        .filter((r): r is string => typeof r === 'string')
        .map((r) => r.trim())
        .filter((r) => r.length > 0)
    )
  );

  if (cleanedRoles.length === 0) {
    errors.push('At least one job role must be selected.');
  }

  // ── 1.5 Validate Canonical Roles ───────────────────────────────────────────
  let cleanedCanonicalRoles: string[] = [];
  if (input.canonicalRoles !== undefined) {
    if (!Array.isArray(input.canonicalRoles)) {
      errors.push('canonicalRoles must be provided as an array of strings.');
    } else {
      const rawCanonicalRoles = input.canonicalRoles;
      cleanedCanonicalRoles = Array.from(
        new Set(
          rawCanonicalRoles
            .filter((r): r is string => typeof r === 'string')
            .map((r) => r.trim())
            .filter((r) => r.length > 0)
        )
      );

      // Validate against the single source of truth
      const invalidCanonical = cleanedCanonicalRoles.filter(
        (id) => !CANONICAL_TAXONOMY.some((c) => c.id === id)
      );

      if (invalidCanonical.length > 0) {
        errors.push(`Invalid canonical role IDs: ${invalidCanonical.join(', ')}`);
      }
    }
  }

  // ── 2. Validate Locations ──────────────────────────────────────────────────
  if (!Array.isArray(input.locations)) {
    errors.push('Locations must be provided as an array.');
  }

  const rawLocations = Array.isArray(input.locations) ? input.locations : [];
  const cleanedLocations = Array.from(
    new Set(
      rawLocations
        .filter((l): l is string => typeof l === 'string')
        .map((l) => normalizeLocation(l))
        .filter((l) => l.length > 0)
    )
  );

  if (cleanedLocations.length === 0) {
    errors.push('At least one preferred location must be selected.');
  }

  // ── 2.5 Validate Workplace Types (Optional) ────────────────────────────────
  const rawWorkplace = input.workplaceTypes ?? input.workplace_types ?? [];
  let cleanedWorkplaceTypes: string[] = [];
  if (Array.isArray(rawWorkplace)) {
    cleanedWorkplaceTypes = Array.from(
      new Set(
        rawWorkplace
          .filter((w): w is string => typeof w === 'string')
          .map((w) => w.toUpperCase().trim())
          .filter((w) => VALID_WORKPLACE_TYPES.has(w))
      )
    );
  }

  // ── 3. Validate Experience Level ───────────────────────────────────────────
  let experienceLevel: ExperienceLevel = 'FRESHER';
  if (typeof input.experienceLevel === 'string') {
    const upper = input.experienceLevel.trim().toUpperCase();
    if (isValidExperienceLevel(upper)) {
      experienceLevel = upper;
    } else {
      errors.push(`Invalid experience level "${input.experienceLevel}". Allowed values: FRESHER, EXPERIENCED.`);
    }
  } else if (input.experienceLevel !== undefined && input.experienceLevel !== null) {
    errors.push('Experience level must be a string (FRESHER or EXPERIENCED).');
  }

  // ── 4. Validate Companies (Optional) ───────────────────────────────────────
  const rawCompanies = input.companyIds ?? input.companies ?? [];
  if (rawCompanies !== undefined && !Array.isArray(rawCompanies)) {
    errors.push('Companies must be an array of company IDs.');
  }

  const inputCompanyList = Array.isArray(rawCompanies) ? rawCompanies : [];
  const cleanedCompanyIds = Array.from(
    new Set(
      inputCompanyList
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    )
  );

  // If company IDs are provided, verify they are valid UUIDs and exist as active companies
  if (cleanedCompanyIds.length > 0) {
    const invalidUuids = cleanedCompanyIds.filter((id) => !UUID_REGEX.test(id));
    if (invalidUuids.length > 0) {
      errors.push(`Invalid company UUID format: ${invalidUuids.join(', ')}`);
    } else {
      try {
        const db = getDb();
        const existingActive = await db
          .select({ id: schema.companies.id })
          .from(schema.companies)
          .where(inArray(schema.companies.id, cleanedCompanyIds));

        const existingIds = new Set(existingActive.map((c) => c.id));
        const missingIds = cleanedCompanyIds.filter((id) => !existingIds.has(id));

        if (missingIds.length > 0) {
          errors.push(`One or more selected companies are invalid or inactive: ${missingIds.join(', ')}`);
        }
      } catch (err) {
        errors.push('Unable to verify selected companies.');
      }
    }
  }

  // ── 5. Validate Keywords (Optional) ────────────────────────────────────────
  const rawKeywords = Array.isArray(input.keywords) ? input.keywords : [];
  const cleanedKeywords = Array.from(
    new Set(
      rawKeywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    )
  );

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const timezoneStr =
    typeof input.timezone === 'string' && input.timezone.trim().length > 0 && input.timezone.trim() !== 'UTC'
      ? input.timezone.trim().slice(0, 100)
      : 'Asia/Kolkata';

  return {
    valid: true,
    data: {
      roles: cleanedRoles,
      locations: cleanedLocations,
      workplaceTypes: cleanedWorkplaceTypes,
      experienceLevel,
      companyIds: cleanedCompanyIds,
      keywords: cleanedKeywords,
      emailAlertsEnabled: input.emailAlertsEnabled !== false,
      instantNotifications: input.instantNotifications !== false,
      dailyDigest: input.dailyDigest === true,
      timezone: timezoneStr,
      canonicalRoles: cleanedCanonicalRoles,
    },
  };
}
