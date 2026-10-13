/**
 * GE Integration Test (Phase 20.5-J)
 *
 * REAL integration test against GE Aerospace, GE Vernova, and GE HealthCare on Workday.
 * Uses bounded controlled discovery (limit: 5).
 * Enforces Cross-Tenant and Source Isolation, and Notification Safety.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import 'dotenv/config';

// 1. Notification Safety: Strictly prevent any real email sends or orphan notification intents.
vi.mock('../notifications/alert-service.js', () => ({
  evaluateAndCreateInstantAlerts: vi.fn().mockResolvedValue({
    evaluatedUsers: 0,
    matchedUsers: 0,
    createdNotifications: 0,
  }),
  evaluateAndCreateRecentJobAlerts: vi.fn().mockResolvedValue({
    jobsEvaluated: 0,
    totalAlerts: 0,
    totalSkipped: 0,
  })
}));

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { seedSources } from '../pipeline/source-seeder.js';
import type { JobCandidate } from '../collectors/types.js';
import * as alertService from '../notifications/alert-service.js';

const TENANTS = [
  {
    name: 'GE Aerospace',
    config: {
      officialDomain: 'geaerospace.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'geaerospace.wd5.myworkdayjobs.com',
        tenant: 'geaerospace',
        clientSite: 'GE_ExternalSite',
      },
      sourceSystem: 'WORKDAY',
    }
  },
  {
    name: 'GE Vernova',
    config: {
      officialDomain: 'gevernova.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'gevernova.wd5.myworkdayjobs.com',
        tenant: 'gevernova',
        clientSite: 'Vernova_ExternalSite',
      },
      sourceSystem: 'WORKDAY',
    }
  },
  {
    name: 'GE HealthCare',
    config: {
      officialDomain: 'gehc.wd5.myworkdayjobs.com',
      workdayConfig: {
        host: 'gehc.wd5.myworkdayjobs.com',
        tenant: 'gehc',
        clientSite: 'GEHC_ExternalSite',
      },
      sourceSystem: 'WORKDAY',
    }
  }
];

let snapshotUnrelatedJobs: string[] = [];
const companyIds: Record<string, string> = {};

beforeAll(async () => {
  const seedMap = await seedSources();
  
  for (const t of TENANTS) {
    let cid = seedMap.get(t.name);
    if (!cid) {
      const db = getDb();
      const existing = await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(eq(schema.companies.name, t.name))
        .limit(1);
      if (existing.length > 0 && existing[0]) {
        cid = existing[0].id;
      }
    }
    if (!cid) throw new Error(`Seeding failed for ${t.name}`);
    companyIds[t.name] = cid;
  }

  // Snapshot unrelated jobs (e.g. not any GE tenant)
  const db = getDb();
  const cids = Object.values(companyIds);
  const otherJobsRes = await db
    .select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
    .from(schema.jobs)
    .where(sql`${schema.jobs.company_id} NOT IN ${cids}`)
    .limit(20);
  
  snapshotUnrelatedJobs = otherJobsRes.map(j => `${j.id}:${j.updated_at?.getTime() ?? 0}`);
}, 60_000);

afterAll(async () => {
  await closeConnection();
}, 15_000);


// Generate suites dynamically for each tenant
TENANTS.forEach(tenant => {
  describe(`Workday Integration — ${tenant.name}`, () => {
    let collector: WorkdayCollector;
    let sharedCandidates: JobCandidate[] = [];
    let insertedJobIds: string[] = [];
    let crossTenantSnapshot: Record<string, string[]> = {};

    beforeAll(async () => {
      collector = new WorkdayCollector({
        companyName: tenant.name,
        host: tenant.config.workdayConfig.host,
        tenant: tenant.config.workdayConfig.tenant,
        clientSite: tenant.config.workdayConfig.clientSite,
        officialDomain: tenant.config.officialDomain,
        timeoutMs: 30_000,
        pageSize: 5,
        maxPages: 1,
      });

      // Snapshot the other two tenants specifically for cross-tenant isolation
      const db = getDb();
      for (const otherTenant of TENANTS) {
        if (otherTenant.name === tenant.name) continue;
        const ocid = companyIds[otherTenant.name];
        const res = await db.select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
          .from(schema.jobs).where(eq(schema.jobs.company_id, ocid!));
        crossTenantSnapshot[otherTenant.name] = res.map(j => `${j.id}:${j.updated_at?.getTime() ?? 0}`);
      }
    });

    afterAll(async () => {
      if (insertedJobIds.length > 0) {
        const db = getDb();
        for (const id of insertedJobIds) {
          try {
            await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
          } catch {}
        }
      }
    });

    it('health check reports the source as healthy', async () => {
      const health = await collector.healthCheck();
      expect(health.healthy).toBe(true);
    }, 30_000);

    it('fetches controlled bounded real jobs from the live API', async () => {
      sharedCandidates = await collector.discoverJobs();
      expect(sharedCandidates.length).toBeGreaterThan(0);
      expect(sharedCandidates.length).toBeLessThanOrEqual(5);

      const first = sharedCandidates[0]!;
      expect(first.externalJobId).toBeTruthy();
      expect(first.title).toBeTruthy();
      
      const domain = tenant.config.officialDomain;
      expect(first.officialUrl.includes(domain)).toBe(true);
      expect(first.officialUrl).not.toMatch(/linkedin|indeed|naukri/i);
    }, 30_000);

    it('verifies notification intent safety via strict mocking', () => {
      expect(vi.isMockFunction(alertService.evaluateAndCreateInstantAlerts)).toBe(true);
    });

    it('persists a controlled bounded subset through the pipeline safely', async () => {
      const cid = companyIds[tenant.name]!;
      const stats = await runPipeline(sharedCandidates, cid, tenant.config);
      
      const db = getDb();
      const inserted = await db
        .select({
          id: schema.jobs.id,
          status: schema.jobs.status,
          verification_status: schema.jobs.verification_status,
          title: schema.jobs.title,
          location: schema.jobs.location
        })
        .from(schema.jobs)
        .where(eq(schema.jobs.company_id, cid));

      inserted.forEach(j => { if (!insertedJobIds.includes(j.id)) insertedJobIds.push(j.id); });

      const verifiedCount = inserted.filter(j => j.verification_status === 'VERIFIED').length;
      expect(verifiedCount).toBeGreaterThan(0);
    }, 90_000);

    it('running the pipeline a second time correctly deduplicates', async () => {
      const cid = companyIds[tenant.name]!;
      await runPipeline(sharedCandidates, cid, tenant.config);
      
      const db = getDb();
      const records = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(eq(schema.jobs.company_id, cid));

      expect(records.length).toBe(insertedJobIds.length);
    }, 90_000);
    
    it('enforces strict cross-tenant isolation and global source isolation', async () => {
      const db = getDb();
      
      // Global isolation
      if (snapshotUnrelatedJobs.length > 0) {
        const idsToQuery = snapshotUnrelatedJobs.map(val => val.split(':')[0]);
        const currentOtherJobs = await db
          .select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
          .from(schema.jobs)
          .where(sql`${schema.jobs.id} IN ${idsToQuery}`);
          
        const currentIds = currentOtherJobs.map(j => `${j.id}:${j.updated_at?.getTime() ?? 0}`);
        expect(currentIds.sort()).toEqual(snapshotUnrelatedJobs.sort());
      }

      // Cross-tenant isolation
      for (const otherTenant of TENANTS) {
        if (otherTenant.name === tenant.name) continue;
        const snap = crossTenantSnapshot[otherTenant.name]!;
        if (snap.length > 0) {
           const ocid = companyIds[otherTenant.name]!;
           const res = await db.select({ id: schema.jobs.id, updated_at: schema.jobs.updated_at })
              .from(schema.jobs).where(eq(schema.jobs.company_id, ocid));
           const currentIds = res.map(j => `${j.id}:${j.updated_at?.getTime() ?? 0}`);
           expect(currentIds.sort()).toEqual(snap.sort());
        }
      }
    });
  });
});
