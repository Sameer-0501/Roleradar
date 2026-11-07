/**
 * Workday Batch 8 Discovery and Probe Script
 *
 * Probes candidate employers for Phase 20.5 Workday Batch 8:
 * 1. Salesforce (External_Career_Site and Futureforce_NewGradRoles)
 * 2. Workday Corporate (Workday)
 * 3. Teladoc Health (teladochealth_is_hiring on wd503, plus wd1 for empirical validation)
 */

import 'dotenv/config';

interface ProbeTarget {
  name: string;
  host: string;
  tenant: string;
  clientSite: string;
  isAlternative?: boolean;
  notes?: string;
}

const targets: ProbeTarget[] = [
  // 1a. Salesforce - External_Career_Site
  {
    name: 'Salesforce (External_Career_Site)',
    host: 'salesforce.wd12.myworkdayjobs.com',
    tenant: 'salesforce',
    clientSite: 'External_Career_Site',
    notes: 'Primary candidate endpoint for experienced / professional roles',
  },
  // 1b. Salesforce - Futureforce_NewGradRoles
  {
    name: 'Salesforce (Futureforce_NewGradRoles)',
    host: 'salesforce.wd12.myworkdayjobs.com',
    tenant: 'salesforce',
    clientSite: 'Futureforce_NewGradRoles',
    isAlternative: true,
    notes: 'Candidate endpoint for early career / new grad roles',
  },
  // 2. Workday (Corporate)
  {
    name: 'Workday (Workday Corporate)',
    host: 'workday.wd5.myworkdayjobs.com',
    tenant: 'workday',
    clientSite: 'Workday',
    notes: 'Workday corporate direct career portal',
  },
  // 3a. Teladoc Health (wd1 preliminary probe)
  {
    name: 'Teladoc Health (wd1 Preliminary)',
    host: 'teladoc.wd1.myworkdayjobs.com',
    tenant: 'teladoc',
    clientSite: 'teladochealth_is_hiring',
    isAlternative: true,
    notes: 'Testing preliminary wd1 host cluster',
  },
  // 3b. Teladoc Health (wd503 reconciled)
  {
    name: 'Teladoc Health (wd503 Reconciled)',
    host: 'teladoc.wd503.myworkdayjobs.com',
    tenant: 'teladoc',
    clientSite: 'teladochealth_is_hiring',
    notes: 'Target reconciled wd503 host cluster',
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
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'RoleRadar-Probe/2.0 (discovery-audit)',
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: 5,
        offset: 0,
        searchText: '',
      }),
    });

    console.log(`  HTTP Status: ${res.status} ${res.statusText}`);
    console.log(`  Content-Type: ${res.headers.get('content-type')}`);

    if (res.ok) {
      const data = (await res.json()) as any;
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
    } else {
      const errText = await res.text();
      console.log(`  Response Error: ${errText.slice(0, 300)}`);
    }
  } catch (err: any) {
    console.error(`  Fetch Failed: ${err.message}`);
  }
  console.log('\n------------------------------------------------------------\n');
}

async function run() {
  console.log('============================================================');
  console.log('   ROLERADAR — WORKDAY BATCH 8 CONTROLLED PROBE & AUDIT     ');
  console.log('============================================================\n');

  for (const t of targets) {
    await probeTarget(t);
  }
}

run();
