/**
 * Companies API Handler.
 *
 * Provides a read-only endpoint returning all active supported companies.
 * Excludes sensitive credentials and internal source configurations.
 */

import type { Request, Response } from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';

export interface PublicCompanyDto {
  id: string;
  name: string;
  atsType: string;
  officialDomain: string;
  careersUrl: string;
  isActive: boolean;
}

export async function listCompaniesHandler(_req: Request, res: Response): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: schema.companies.id,
        name: schema.companies.name,
        atsType: schema.companies.ats_type,
        officialDomain: schema.companies.official_domain,
        careersUrl: schema.companies.careers_url,
        isActive: schema.companies.is_active,
      })
      .from(schema.companies)
      .where(eq(schema.companies.is_active, true))
      .orderBy(schema.companies.name);

    res.json({
      companies: rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve supported companies.' });
  }
}
