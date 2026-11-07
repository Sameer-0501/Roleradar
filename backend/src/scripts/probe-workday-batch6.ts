/**
 * Workday Batch 6 Discovery and Probe Script
 *
 * Probes the 6 candidate employers for Phase 20.5 Workday Batch 6:
 * 1. Haleon
 * 2. Nasdaq
 * 3. TransUnion (probes specified wd1 endpoint, verifies 422, then verifies live wd5 / TransUnion endpoint)
 * 4. Broadridge (probes specified Broadridge_Careers site, verifies 404, then verifies live Careers site)
 * 5. U.S. Bank
 * 6. Pfizer (probes specified Pfizer_Careers site, verifies 404, then verifies live PfizerCareers site)
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
  // 1. Haleon
  {
    name: 'Haleon',
    host: 'gsknch.wd3.myworkdayjobs.com',
    tenant: 'gsknch',
    clientSite: 'GSKCareers',
    notes: 'Specified candidate endpoint',
  },
  // 2. Nasdaq
  {
    name: 'Nasdaq',
    host: 'nasdaq.wd1.myworkdayjobs.com',
    tenant: 'nasdaq',
    clientSite: 'Global_External_Site',
    notes: 'Specified candidate endpoint',
  },
  // 3a. TransUnion Specified
  {
    name: 'TransUnion (Specified - wd1)',
    host: 'transunion.wd1.myworkdayjobs.com',
    tenant: 'transunion',
    clientSite: 'transunion_external',
    isInitialSpecified: true,
    notes: 'Specified candidate endpoint (expected 422 Unprocessable Entity)',
  },
  // 3b. TransUnion Reconciled
  {
    name: 'TransUnion (Reconciled - wd5)',
    host: 'transunion.wd5.myworkdayjobs.com',
    tenant: 'transunion',
    clientSite: 'TransUnion',
    notes: 'Authoritative live endpoint discovered via Workday career portal',
  },
  // 4a. Broadridge Specified
  {
    name: 'Broadridge (Specified)',
    host: 'broadridge.wd5.myworkdayjobs.com',
    tenant: 'broadridge',
    clientSite: 'Broadridge_Careers',
    isInitialSpecified: true,
    notes: 'Specified candidate endpoint (expected 404 Site not found)',
  },
  // 4b. Broadridge Reconciled
  {
    name: 'Broadridge (Reconciled)',
    host: 'broadridge.wd5.myworkdayjobs.com',
    tenant: 'broadridge',
    clientSite: 'Careers',
    notes: 'Authoritative live endpoint discovered via Workday career portal',
  },
  // 5. U.S. Bank
  {
    name: 'U.S. Bank',
    host: 'usbank.wd1.myworkdayjobs.com',
    tenant: 'usbank',
    clientSite: 'US_Bank_Careers',
    notes: 'Specified candidate endpoint',
  },
  // 6a. Pfizer Specified
  {
    name: 'Pfizer (Specified)',
    host: 'pfizer.wd1.myworkdayjobs.com',
    tenant: 'pfizer',
    clientSite: 'Pfizer_Careers',
    isInitialSpecified: true,
    notes: 'Specified candidate endpoint (expected 404 Site not found)',
  },
  // 6b. Pfizer Reconciled
  {
    name: 'Pfizer (Reconciled)',
    host: 'pfizer.wd1.myworkdayjobs.com',
    tenant: 'pfizer',
    clientSite: 'PfizerCareers',
    notes: 'Authoritative live endpoint discovered via Workday career portal',
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
  console.log('   ROLEDADAR — WORKDAY BATCH 6 CONTROLLED PROBE & AUDIT     ');
  console.log('============================================================\n');

  for (const t of targets) {
    await probeTarget(t);
  }
}

main().catch(console.error);
