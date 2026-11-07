/**
 * Workday Batch 7 Discovery and Probe Script
 *
 * Probes the candidate employers for Phase 20.5 Workday Batch 7:
 * 1. Santander
 * 2. The LEGO Group
 * 3. Humana
 * 4. GoTo
 * 5. Sysco (probes specified Sysco_Careers -> 404, then reconciled syscocareers -> 200)
 * 6. Teleperformance (probes specified wd3/Teleperformance_Careers -> 422, then reconciled wd1/Teleperformance -> 200)
 */

import 'dotenv/config';

interface ProbeTarget {
  name: string;
  host: string;
  tenant: string;
  clientSite: string;
  isInitialSpecified?: boolean;
  notes?: string;
}

const targets: ProbeTarget[] = [
  // 1. Santander
  {
    name: 'Santander',
    host: 'santander.wd3.myworkdayjobs.com',
    tenant: 'santander',
    clientSite: 'SantanderCareers',
    notes: 'Specified candidate endpoint',
  },
  // 2. The LEGO Group
  {
    name: 'The LEGO Group',
    host: 'lego.wd103.myworkdayjobs.com',
    tenant: 'lego',
    clientSite: 'LEGO_External',
    notes: 'Specified candidate endpoint',
  },
  // 3. Humana
  {
    name: 'Humana',
    host: 'humana.wd5.myworkdayjobs.com',
    tenant: 'humana',
    clientSite: 'Humana_External_Career_Site',
    notes: 'Specified candidate endpoint',
  },
  // 4. GoTo
  {
    name: 'GoTo',
    host: 'goto.wd5.myworkdayjobs.com',
    tenant: 'goto',
    clientSite: 'GoToCareers',
    notes: 'Specified candidate endpoint',
  },
  // 5a. Sysco Specified
  {
    name: 'Sysco (Specified)',
    host: 'sysco.wd5.myworkdayjobs.com',
    tenant: 'sysco',
    clientSite: 'Sysco_Careers',
    isInitialSpecified: true,
    notes: 'Specified candidate endpoint (expected 404 Site not found)',
  },
  // 5b. Sysco Reconciled
  {
    name: 'Sysco (Reconciled)',
    host: 'sysco.wd5.myworkdayjobs.com',
    tenant: 'sysco',
    clientSite: 'syscocareers',
    notes: 'Authoritative live endpoint discovered via Workday career portal',
  },
  // 6a. Teleperformance Specified
  {
    name: 'Teleperformance (Specified - wd3)',
    host: 'teleperformance.wd3.myworkdayjobs.com',
    tenant: 'teleperformance',
    clientSite: 'Teleperformance_Careers',
    isInitialSpecified: true,
    notes: 'Specified candidate endpoint (expected 422 Unprocessable Entity)',
  },
  // 6b. Teleperformance Reconciled
  {
    name: 'Teleperformance (Reconciled - wd1)',
    host: 'teleperformance.wd1.myworkdayjobs.com',
    tenant: 'teleperformance',
    clientSite: 'Teleperformance',
    notes: 'Authoritative live endpoint on wd1 cluster discovered via Workday career portal',
  },
];

async function probeTarget(t: ProbeTarget) {
  const url = `https://${t.host}/wday/cxs/${t.tenant}/${t.clientSite}/jobs`;
  console.log(`[PROBING] ${t.name} -> ${url}`);
  if (t.notes) console.log(`  Context: ${t.notes}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'RoleRadar-JobEngine/2.0 (job-verification-system)',
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: 5,
        offset: 0,
        searchText: '',
      }),
      signal: AbortSignal.timeout(15000),
    });

    console.log(`  HTTP Status: ${res.status} ${res.statusText}`);
    console.log(`  Content-Type: ${res.headers.get('content-type')}`);

    if (!res.ok) {
      const errText = await res.text();
      console.log(`  Response Error: ${errText.slice(0, 200)}`);
      return;
    }

    const data: any = await res.json();
    console.log(`  Upstream Total Postings: ${data.total}`);
    console.log(`  Returned Jobs Count: ${data.jobPostings?.length ?? 0}`);

    if (data.jobPostings && data.jobPostings.length > 0) {
      const sample = data.jobPostings[0];
      console.log(`  Sample Posting:`);
      console.log(`    Title: ${sample.title}`);
      console.log(`    ExternalPath: ${sample.externalPath}`);
      console.log(`    LocationsText: ${sample.locationsText}`);
      console.log(`    PostedOn: ${sample.postedOn}`);
      console.log(`    BulletFields: ${JSON.stringify(sample.bulletFields)}`);
    }

    if (data.facets) {
      console.log(`  Facets: ${data.facets.map((f: any) => f.facetParameter).join(', ')}`);
    }
  } catch (err) {
    console.error(`  Probe ERROR:`, err instanceof Error ? err.message : err);
  }
  console.log('\n------------------------------------------------------------\n');
}

async function main() {
  console.log('============================================================');
  console.log('   ROLEDADAR — WORKDAY BATCH 7 CONTROLLED PROBE & AUDIT     ');
  console.log('============================================================\n');

  for (const t of targets) {
    await probeTarget(t);
  }
}

main().catch(console.error);
