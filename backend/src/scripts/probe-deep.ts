import 'dotenv/config';

interface Candidate {
  ats: 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'WORKABLE' | 'SMARTRECRUITERS';
  slug: string;
  name: string;
}

const isIndiaLoc = (loc: string): boolean => {
  const l = loc.toLowerCase();
  return (
    l.includes('india') ||
    l.includes('bengaluru') ||
    l.includes('bangalore') ||
    l.includes('hyderabad') ||
    l.includes('pune') ||
    l.includes('chennai') ||
    l.includes('mumbai') ||
    l.includes('gurgaon') ||
    l.includes('gurugram') ||
    l.includes('noida') ||
    l.includes('delhi') ||
    l.includes('remote, in') ||
    l.includes('remote (india') ||
    l.includes('india (remote') ||
    l.includes('remote - india')
  );
};

const isFresherTitle = (title: string): boolean => {
  const t = title.toLowerCase();
  if (
    t.includes('senior') ||
    t.includes('lead') ||
    t.includes('principal') ||
    t.includes('staff') ||
    t.includes('manager') ||
    t.includes('director') ||
    t.includes('vp') ||
    t.includes('head')
  ) {
    return false;
  }
  return (
    t.includes('intern') ||
    t.includes('graduate') ||
    t.includes('trainee') ||
    t.includes('entry') ||
    t.includes('associate') ||
    t.includes('junior') ||
    t.includes('sde 1') ||
    t.includes('sde i') ||
    t.includes('sde-1') ||
    t.includes('sde-i') ||
    t.includes('sde - 1') ||
    t.includes('sde - i') ||
    t.includes('engineer 1') ||
    t.includes('engineer i') ||
    t.includes('engineer - 1') ||
    t.includes('engineer - i') ||
    t.includes('developer 1') ||
    t.includes('developer i') ||
    t.includes('software engineer 1') ||
    t.includes('software engineer i') ||
    t.includes('analyst 1') ||
    t.includes('analyst i') ||
    t.includes('associate software') ||
    t.includes('graduate engineer') ||
    t.includes('campus') ||
    t.includes('early career')
  );
};

async function testCandidate(c: Candidate) {
  try {
    if (c.ats === 'GREENHOUSE') {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      const jobs = data.jobs || [];
      const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.location?.name || '') || isIndiaLoc(j.title || ''));
      const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.title || ''));
      return { ...c, total: jobs.length, indiaTotal: indiaJobs.length, fresherTotal: fresherJobs.length, samples: fresherJobs.slice(0, 3).map((j: any) => `${j.title} (${j.location?.name || ''})`) };
    }
    if (c.ats === 'LEVER') {
      const res = await fetch(`https://api.lever.co/v0/postings/${c.slug}?mode=json`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const jobs: any[] = await res.json();
      if (!Array.isArray(jobs)) return null;
      const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.categories?.location || '') || isIndiaLoc(j.text || ''));
      const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.text || ''));
      return { ...c, total: jobs.length, indiaTotal: indiaJobs.length, fresherTotal: fresherJobs.length, samples: fresherJobs.slice(0, 3).map((j: any) => `${j.text} (${j.categories?.location || ''})`) };
    }
    if (c.ats === 'ASHBY') {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      const jobs = data.jobs || [];
      const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.location || '') || isIndiaLoc(j.secondaryLocations?.map((l: any) => l.location).join(', ') || ''));
      const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.title || ''));
      return { ...c, total: jobs.length, indiaTotal: indiaJobs.length, fresherTotal: fresherJobs.length, samples: fresherJobs.slice(0, 3).map((j: any) => `${j.title} (${j.location || ''})`) };
    }
    if (c.ats === 'WORKABLE') {
      const res = await fetch(`https://apply.workable.com/api/v3/accounts/${c.slug}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      const jobs = data.results || [];
      const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.city || '') || isIndiaLoc(j.country || '') || isIndiaLoc(j.locations?.map((l: any) => `${l.city}, ${l.country}`).join('; ') || ''));
      const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.title || ''));
      return { ...c, total: jobs.length, indiaTotal: indiaJobs.length, fresherTotal: fresherJobs.length, samples: fresherJobs.slice(0, 3).map((j: any) => `${j.title} (${j.city || ''})`) };
    }
    if (c.ats === 'SMARTRECRUITERS') {
      const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      const jobs = data.content || [];
      const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.location?.city || '') || isIndiaLoc(j.location?.country || '') || isIndiaLoc(j.name || ''));
      const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.name || ''));
      return { ...c, total: jobs.length, indiaTotal: indiaJobs.length, fresherTotal: fresherJobs.length, samples: fresherJobs.slice(0, 3).map((j: any) => `${j.name} (${j.location?.city || ''})`) };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const candidates: Candidate[] = [
    // Greenhouse tech & startups with Indian presence
    { ats: 'GREENHOUSE', slug: 'samsara', name: 'Samsara' },
    { ats: 'GREENHOUSE', slug: 'grab', name: 'Grab India' },
    { ats: 'GREENHOUSE', slug: 'toast', name: 'Toast' },
    { ats: 'GREENHOUSE', slug: 'thoughtworks', name: 'Thoughtworks' },
    { ats: 'GREENHOUSE', slug: 'uniphore', name: 'Uniphore' },
    { ats: 'GREENHOUSE', slug: 'couchbase', name: 'Couchbase' },
    { ats: 'GREENHOUSE', slug: 'appdynamics', name: 'AppDynamics' },
    { ats: 'GREENHOUSE', slug: 'confluent', name: 'Confluent' },
    { ats: 'GREENHOUSE', slug: 'paloaltonetworks', name: 'Palo Alto Networks' },
    { ats: 'GREENHOUSE', slug: 'servicenow', name: 'ServiceNow' },
    { ats: 'GREENHOUSE', slug: 'cloudera', name: 'Cloudera' },
    { ats: 'GREENHOUSE', slug: 'snowflake', name: 'Snowflake' },
    { ats: 'GREENHOUSE', slug: 'roblox', name: 'Roblox' },
    { ats: 'GREENHOUSE', slug: 'nutanix', name: 'Nutanix' },
    { ats: 'GREENHOUSE', slug: 'opentext', name: 'OpenText' },
    { ats: 'GREENHOUSE', slug: 'infor', name: 'Infor' },
    { ats: 'GREENHOUSE', slug: 'zendesk', name: 'Zendesk' },
    { ats: 'GREENHOUSE', slug: 'box', name: 'Box' },
    { ats: 'GREENHOUSE', slug: 'splunk', name: 'Splunk' },
    { ats: 'GREENHOUSE', slug: 'cisco', name: 'Cisco' },
    { ats: 'GREENHOUSE', slug: 'ciscospark', name: 'Cisco Webex' },
    { ats: 'GREENHOUSE', slug: 'hashicorp', name: 'HashiCorp' },
    { ats: 'GREENHOUSE', slug: 'tripadvisor', name: 'TripAdvisor' },
    { ats: 'GREENHOUSE', slug: 'wayfair', name: 'Wayfair' },
    { ats: 'GREENHOUSE', slug: 'zynga', name: 'Zynga' },
    { ats: 'GREENHOUSE', slug: 'unity3d', name: 'Unity' },
    { ats: 'GREENHOUSE', slug: 'ea', name: 'Electronic Arts' },
    { ats: 'GREENHOUSE', slug: 'airtel', name: 'Airtel Digital' },
    { ats: 'GREENHOUSE', slug: 'airtelxlabs', name: 'Airtel X Labs' },
    { ats: 'GREENHOUSE', slug: 'dreamplugtechnologies', name: 'CRED' },

    // Lever
    { ats: 'LEVER', slug: 'gupshup', name: 'Gupshup' },
    { ats: 'LEVER', slug: 'medianet', name: 'Media.net' },
    { ats: 'LEVER', slug: 'flock', name: 'Flock' },
    { ats: 'LEVER', slug: 'zeta', name: 'Zeta' },
    { ats: 'LEVER', slug: 'zetasuite', name: 'Zeta Suite' },
    { ats: 'LEVER', slug: 'directi', name: 'Directi' },
    { ats: 'LEVER', slug: 'unacademy', name: 'Unacademy' },
    { ats: 'LEVER', slug: 'makemytrip', name: 'MakeMyTrip' },
    { ats: 'LEVER', slug: 'goibibo', name: 'Goibibo' },
    { ats: 'LEVER', slug: 'housing', name: 'Housing.com' },
    { ats: 'LEVER', slug: 'clevertap', name: 'CleverTap' },
    { ats: 'LEVER', slug: 'kissflow', name: 'Kissflow' },
    { ats: 'LEVER', slug: 'quikr', name: 'Quikr' },
    { ats: 'LEVER', slug: 'vedantu', name: 'Vedantu' },
    { ats: 'LEVER', slug: 'byjus', name: 'BYJUS' },
    { ats: 'LEVER', slug: 'delhivery', name: 'Delhivery' },
    { ats: 'LEVER', slug: 'urbanpiper', name: 'UrbanPiper' },
    { ats: 'LEVER', slug: 'hasura', name: 'Hasura' },
    { ats: 'LEVER', slug: 'yellowmessenger', name: 'Yellow.ai' },
    { ats: 'LEVER', slug: 'headout', name: 'Headout' },

    // Ashby
    { ats: 'ASHBY', slug: 'turing', name: 'Turing' },
    { ats: 'ASHBY', slug: 'devrev', name: 'DevRev' },
    { ats: 'ASHBY', slug: 'dhiwise', name: 'DhiWise' },
    { ats: 'ASHBY', slug: 'toplyne', name: 'Toplyne' },
    { ats: 'ASHBY', slug: 'hasura', name: 'Hasura' },
    { ats: 'ASHBY', slug: 'sprinto', name: 'Sprinto' },
    { ats: 'ASHBY', slug: 'mercury', name: 'Mercury' },
    { ats: 'ASHBY', slug: 'quince', name: 'Quince' },
    { ats: 'ASHBY', slug: 'vymo', name: 'Vymo' },
    { ats: 'ASHBY', slug: 'airtel', name: 'Airtel' },

    // SmartRecruiters
    { ats: 'SMARTRECRUITERS', slug: 'servicenow', name: 'ServiceNow' },
    { ats: 'SMARTRECRUITERS', slug: 'paloaltonetworks', name: 'Palo Alto Networks' },
    { ats: 'SMARTRECRUITERS', slug: 'publicissapient', name: 'Publicis Sapient' },
    { ats: 'SMARTRECRUITERS', slug: 'infor', name: 'Infor' },
    { ats: 'SMARTRECRUITERS', slug: 'wolterskluwer', name: 'Wolters Kluwer' },
    { ats: 'SMARTRECRUITERS', slug: 'here', name: 'HERE Technologies' },
    { ats: 'SMARTRECRUITERS', slug: 'experian', name: 'Experian' },
    { ats: 'SMARTRECRUITERS', slug: 'dxc', name: 'DXC Technology' },
    { ats: 'SMARTRECRUITERS', slug: 'atos', name: 'Atos' },
    { ats: 'SMARTRECRUITERS', slug: 'capgemini', name: 'Capgemini' },

    // Workable
    { ats: 'WORKABLE', slug: 'clevertap', name: 'CleverTap' },
    { ats: 'WORKABLE', slug: 'wingify', name: 'Wingify' },
    { ats: 'WORKABLE', slug: 'vwo', name: 'VWO' },
    { ats: 'WORKABLE', slug: 'chargebee', name: 'Chargebee' },
    { ats: 'WORKABLE', slug: 'whatfix', name: 'Whatfix' },
    { ats: 'WORKABLE', slug: 'browserstack', name: 'BrowserStack' },
    { ats: 'WORKABLE', slug: 'leadsquared', name: 'LeadSquared' },
    { ats: 'WORKABLE', slug: 'infracloud', name: 'InfraCloud Technologies' },
  ];

  console.log(`Starting deep probe of ${candidates.length} candidates in parallel chunks...`);

  const results: any[] = [];
  const chunkSize = 10;
  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(testCandidate));
    for (const r of chunkResults) {
      if (r && r.indiaTotal > 0) {
        results.push(r);
        console.log(`? [${r.ats}] ${r.name} (${r.slug}): Total=${r.total}, India=${r.indiaTotal}, Freshers=${r.fresherTotal}`);
        if (r.samples.length > 0) {
          console.log(`   Samples:`, r.samples);
        }
      }
    }
  }

  console.log('\n-----------------------------------------------------------');
  console.log(`DEEP PROBE FINISHED: ${results.length} active Indian sources found.`);
  console.log('-----------------------------------------------------------\n');
  const sorted = [...results].sort((a, b) => b.fresherTotal - a.fresherTotal);
  for (const r of sorted) {
    console.log(`• ${r.name} [${r.ats}]: ${r.fresherTotal} freshers / ${r.indiaTotal} India jobs (${r.total} total) - slug: '${r.slug}'`);
  }
}

main().catch(console.error);
