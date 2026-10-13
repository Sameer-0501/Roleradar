/**
 * User Preferences Service.
 *
 * Manages retrieval, upsert, and semantic interpretation of user preferences in PostgreSQL.
 *
 * CRITICAL SEMANTIC RULE:
 * - When companyIds is empty ([]), the preference matches against ALL ACTIVE SUPPORTED COMPANY SOURCES.
 * - When companyIds is non-empty, only those specific company IDs are matched.
 */

import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';
import type { ValidatedPreferences } from './validator.js';
import type { ExperienceLevel } from './taxonomy.js';
import { TaxonomyPreferenceMigration, type MigrationResult } from './taxonomy-preference-migration.js';

export interface UserPreferencesDto {
  id: string;
  userId: string;
  roles: string[];
  canonicalRoles: string[];
  locations: string[];
  workplaceTypes: string[];
  experienceLevel: ExperienceLevel;
  companyIds: string[];
  /** Semantic scope description */
  companyScope: 'ALL_SUPPORTED_COMPANIES' | 'SPECIFIC_COMPANIES';
  keywords: string[];
  onboardingCompleted: boolean;
  emailAlertsEnabled: boolean;
  instantNotifications: boolean;
  dailyDigest: boolean;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Retrieve a user's preferences by user ID.
 * Returns null if the user has no saved preferences record yet.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferencesDto | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid) {
    return null;
  }

  const db = getDb();
  const [record] = await db
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.user_id, userId))
    .limit(1);

  if (!record) {
    return null;
  }

  const companiesList = (record.companies as string[]) ?? [];

  return {
    id: record.id,
    userId: record.user_id,
    roles: (record.roles as string[]) ?? [],
    canonicalRoles: (record.canonical_roles as string[]) ?? [],
    locations: (record.locations as string[]) ?? [],
    workplaceTypes: (record.workplace_types as string[]) ?? [],
    experienceLevel: (record.experience_level as ExperienceLevel) ?? 'FRESHER',
    companyIds: companiesList,
    companyScope: companiesList.length === 0 ? 'ALL_SUPPORTED_COMPANIES' : 'SPECIFIC_COMPANIES',
    keywords: (record.keywords as string[]) ?? [],
    onboardingCompleted: record.onboarding_completed ?? false,
    emailAlertsEnabled: record.email_alerts_enabled,
    instantNotifications: record.instant_notifications,
    dailyDigest: record.daily_digest,
    timezone: record.timezone && record.timezone !== 'UTC' ? record.timezone : 'Asia/Kolkata',
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/**
 * Upsert a user's preferences.
 * If a preference record already exists, updates it. Otherwise creates it.
 */
export async function saveUserPreferences(
  userId: string,
  preferences: ValidatedPreferences,
  markOnboardingCompleted: boolean = true
): Promise<UserPreferencesDto> {
  const db = getDb();
  const now = new Date();

  const [upserted] = await db
    .insert(schema.userPreferences)
    .values({
      user_id: userId,
      roles: preferences.roles,
      canonical_roles: preferences.canonicalRoles,
      locations: preferences.locations,
      workplace_types: preferences.workplaceTypes || [],
      experience_level: preferences.experienceLevel,
      companies: preferences.companyIds,
      keywords: preferences.keywords,
      onboarding_completed: markOnboardingCompleted,
      email_alerts_enabled: preferences.emailAlertsEnabled,
      instant_notifications: preferences.instantNotifications,
      daily_digest: preferences.dailyDigest,
      timezone: preferences.timezone,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.userPreferences.user_id,
      set: {
        roles: preferences.roles,
        canonical_roles: preferences.canonicalRoles,
        locations: preferences.locations,
        workplace_types: preferences.workplaceTypes || [],
        experience_level: preferences.experienceLevel,
        companies: preferences.companyIds,
        keywords: preferences.keywords,
        onboarding_completed: markOnboardingCompleted ? true : schema.userPreferences.onboarding_completed,
        email_alerts_enabled: preferences.emailAlertsEnabled,
        instant_notifications: preferences.instantNotifications,
        daily_digest: preferences.dailyDigest,
        timezone: preferences.timezone,
        updated_at: now,
      },
    })
    .returning();

  const companiesList = (upserted!.companies as string[]) ?? [];

  return {
    id: upserted!.id,
    userId: upserted!.user_id,
    roles: (upserted!.roles as string[]) ?? [],
    canonicalRoles: (upserted!.canonical_roles as string[]) ?? [],
    locations: (upserted!.locations as string[]) ?? [],
    workplaceTypes: (upserted!.workplace_types as string[]) ?? [],
    experienceLevel: (upserted!.experience_level as ExperienceLevel) ?? 'FRESHER',
    companyIds: companiesList,
    companyScope: companiesList.length === 0 ? 'ALL_SUPPORTED_COMPANIES' : 'SPECIFIC_COMPANIES',
    keywords: (upserted!.keywords as string[]) ?? [],
    onboardingCompleted: upserted!.onboarding_completed ?? false,
    emailAlertsEnabled: upserted!.email_alerts_enabled,
    instantNotifications: upserted!.instant_notifications,
    dailyDigest: upserted!.daily_digest,
    timezone: upserted!.timezone && upserted!.timezone !== 'UTC' ? upserted!.timezone : 'Asia/Kolkata',
    createdAt: upserted!.created_at,
    updatedAt: upserted!.updated_at,
  };
}

/**
 * Mark onboarding as completed for a user.
 */
export async function completeOnboarding(userId: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(schema.userPreferences)
    .set({
      onboarding_completed: true,
      updated_at: new Date(),
    })
    .where(eq(schema.userPreferences.user_id, userId))
    .returning({ id: schema.userPreferences.id });

  return result.length > 0;
}

/**
 * Migration Preview: reads the user's legacy roles and maps them to canonical representation
 * WITHOUT modifying the database.
 */
export async function migrationPreview(userId: string): Promise<{ roles: MigrationResult[] }> {
  const prefs = await getUserPreferences(userId);
  if (!prefs) {
    return { roles: [] };
  }

  const results: MigrationResult[] = [];
  for (const role of prefs.roles) {
    const classification = TaxonomyPreferenceMigration.evaluateLegacyRole(role);
    results.push(classification);
  }

  return { roles: results };
}
