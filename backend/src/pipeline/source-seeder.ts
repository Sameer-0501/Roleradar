/**
 * Source Seeder.
 *
 * Idempotently ensures that all configured companies in the declarative
 * SOURCE_CATALOG exist in the `companies` database table.
 *
 * Principles:
 *   - Idempotent: safe to run repeatedly on startup
 *   - Matches on company name
 *   - Updates existing records if configuration changed
 *   - Returns a Map of companyName -> companyId
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { SOURCE_CATALOG, type SourceDefinition } from '../sources/catalog.js';

const log = createLogger('source-seeder');

export interface SeededCompany {
  id: string;
  name: string;
}

/**
 * Ensure a single company record exists in the database.
 */
async function ensureCompany(source: SourceDefinition): Promise<string> {
  const db = getDb();

  const existing = await db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      isActive: schema.companies.is_active,
    })
    .from(schema.companies)
    .where(eq(schema.companies.name, source.companyName))
    .limit(1);

  if (existing.length > 0) {
    const id = existing[0]!.id;
    // Update active status and domains if needed
    await db
      .update(schema.companies)
      .set({
        official_domain: source.officialDomain,
        careers_url: source.careersUrl,
        ats_type: (source.atsType === 'ASHBY' || source.atsType === 'WORKABLE') ? 'CUSTOM' : source.atsType,
        is_active: source.isActive,
        source_config: source.config,
        updated_at: new Date(),
      })
      .where(eq(schema.companies.id, id));

    log.debug({ id, company: source.companyName }, 'SOURCE_SEEDER company updated/verified');
    return id;
  }

  const [inserted] = await db
    .insert(schema.companies)
    .values({
      name: source.companyName,
      official_domain: source.officialDomain,
      careers_url: source.careersUrl,
      ats_type: (source.atsType === 'ASHBY' || source.atsType === 'WORKABLE') ? 'CUSTOM' : source.atsType,
      is_active: source.isActive,
      source_config: source.config,
    })
    .returning({ id: schema.companies.id });

  const id = inserted!.id;
  log.info({ id, company: source.companyName }, 'SOURCE_SEEDER new company seeded');
  return id;
}

/**
 * Seed all official sources from SOURCE_CATALOG.
 * Returns a Map of company name → company ID.
 */
export async function seedSources(): Promise<Map<string, string>> {
  const companyIds = new Map<string, string>();
  log.info({ totalSources: SOURCE_CATALOG.length }, 'SOURCE_SEEDER starting catalog seeding');

  for (const source of SOURCE_CATALOG) {
    try {
      const id = await ensureCompany(source);
      companyIds.set(source.companyName, id);
    } catch (err) {
      log.error(
        { company: source.companyName, err: err instanceof Error ? err.message : String(err) },
        'SOURCE_SEEDER failed to seed company'
      );
    }
  }

  log.info({ seededCount: companyIds.size }, 'SOURCE_SEEDER completed successfully');
  return companyIds;
}
