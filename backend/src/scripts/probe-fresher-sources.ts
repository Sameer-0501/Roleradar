import 'dotenv/config';

interface ProbeResult {
  ats: string;
  slug: string;
  companyName: string;
  total: number;
  indiaTotal: number;
  fresherTotal: number;
  sampleFreshers: string[];
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
    l.includes('india (remote')
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

async function probeGreenhouse(slug: string, name: string): Promise<ProbeResult | null> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    if (!res.ok) return null;
    const data: any = await res.json();
    const jobs = data.jobs || [];
    const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.location?.name || ''));
    const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.title || ''));
    return {
      ats: 'GREENHOUSE',
      slug,
      companyName: name,
      total: jobs.length,
      indiaTotal: indiaJobs.length,
      fresherTotal: fresherJobs.length,
      sampleFreshers: fresherJobs.slice(0, 4).map((j: any) => `${j.title} (${j.location?.name || ''})`),
    };
  } catch {
    return null;
  }
}

async function probeLever(slug: string, name: string): Promise<ProbeResult | null> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!res.ok) return null;
    const jobs: any[] = await res.json();
    if (!Array.isArray(jobs)) return null;
    const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.categories?.location || '') || isIndiaLoc(j.text || ''));
    const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.text || ''));
    return {
      ats: 'LEVER',
      slug,
      companyName: name,
      total: jobs.length,
      indiaTotal: indiaJobs.length,
      fresherTotal: fresherJobs.length,
      sampleFreshers: fresherJobs.slice(0, 4).map((j: any) => `${j.text} (${j.categories?.location || ''})`),
    };
  } catch {
    return null;
  }
}

async function probeAshby(slug: string, name: string): Promise<ProbeResult | null> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (!res.ok) return null;
    const data: any = await res.json();
    const jobs = data.jobs || [];
    const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.location || '') || isIndiaLoc(j.secondaryLocations?.map((l: any) => l.location).join(', ') || ''));
    const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.title || ''));
    return {
      ats: 'ASHBY',
      slug,
      companyName: name,
      total: jobs.length,
      indiaTotal: indiaJobs.length,
      fresherTotal: fresherJobs.length,
      sampleFreshers: fresherJobs.slice(0, 4).map((j: any) => `${j.title} (${j.location || ''})`),
    };
  } catch {
    return null;
  }
}

async function probeWorkable(slug: string, name: string): Promise<ProbeResult | null> {
  try {
    const res = await fetch(`https://apply.workable.com/api/v3/accounts/${slug}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const jobs = data.results || [];
    const indiaJobs = jobs.filter((j: any) => isIndiaLoc(j.city || '') || isIndiaLoc(j.country || '') || isIndiaLoc(j.locations?.map((l: any) => `${l.city}, ${l.country}`).join('; ') || ''));
    const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.title || ''));
    return {
      ats: 'WORKABLE',
      slug,
      companyName: name,
      total: jobs.length,
      indiaTotal: indiaJobs.length,
      fresherTotal: fresherJobs.length,
      sampleFreshers: fresherJobs.slice(0, 4).map((j: any) => `${j.title} (${j.city || ''})`),
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log('-----------------------------------------------------------');
  console.log('         PROBING INDIAN FRESHER SOURCE CANDIDATES           ');
  console.log('-----------------------------------------------------------\n');

  const candidates: Array<{ ats: string; slug: string; name: string }> = [
    // Greenhouse
    { ats: 'gh', slug: 'phonepe', name: 'PhonePe' },
    { ats: 'gh', slug: 'darwinbox', name: 'Darwinbox' },
    { ats: 'gh', slug: 'chargebee', name: 'Chargebee' },
    { ats: 'gh', slug: 'hasura', name: 'Hasura' },
    { ats: 'gh', slug: 'harness', name: 'Harness' },
    { ats: 'gh', slug: 'thoughtspot', name: 'ThoughtSpot' },
    { ats: 'gh', slug: 'rubrik', name: 'Rubrik' },
    { ats: 'gh', slug: 'cohesity', name: 'Cohesity' },
    { ats: 'gh', slug: 'tekion', name: 'Tekion' },
    { ats: 'gh', slug: 'tekioncorp', name: 'Tekion Corp' },
    { ats: 'gh', slug: 'whatfix', name: 'Whatfix' },
    { ats: 'gh', slug: 'leadsquared', name: 'LeadSquared' },
    { ats: 'gh', slug: 'yellowai', name: 'Yellow.ai' },
    { ats: 'gh', slug: 'slice', name: 'Slice' },
    { ats: 'gh', slug: 'sliceit', name: 'Slice' },
    { ats: 'gh', slug: 'clevertap', name: 'CleverTap' },
    { ats: 'gh', slug: 'moengage', name: 'MoEngage' },
    { ats: 'gh', slug: 'dream11', name: 'Dream11' },
    { ats: 'gh', slug: 'zeta', name: 'Zeta' },
    { ats: 'gh', slug: 'unacademy', name: 'Unacademy' },
    { ats: 'gh', slug: 'urbancompany', name: 'Urban Company' },
    { ats: 'gh', slug: 'khatabook', name: 'Khatabook' },
    { ats: 'gh', slug: 'coindcx', name: 'CoinDCX' },
    { ats: 'gh', slug: 'mpl', name: 'Mobile Premier League (MPL)' },
    { ats: 'gh', slug: 'curefit', name: 'Curefit' },
    { ats: 'gh', slug: 'lenskart', name: 'Lenskart' },
    { ats: 'gh', slug: 'zeptonow', name: 'Zepto' },
    { ats: 'gh', slug: 'zepto', name: 'Zepto' },
    { ats: 'gh', slug: 'sprinklr', name: 'Sprinklr' },
    { ats: 'gh', slug: 'zeta', name: 'Zeta Suite' },
    { ats: 'gh', slug: 'browserstack', name: 'BrowserStack' },
    { ats: 'gh', slug: 'swiggy', name: 'Swiggy' },
    { ats: 'gh', slug: 'zomato', name: 'Zomato' },
    { ats: 'gh', slug: 'spinny', name: 'Spinny' },
    { ats: 'gh', slug: 'cars24', name: 'Cars24' },
    { ats: 'gh', slug: 'airmeet', name: 'Airmeet' },
    { ats: 'gh', slug: 'loconav', name: 'LocoNav' },
    { ats: 'gh', slug: 'signzy', name: 'Signzy' },
    { ats: 'gh', slug: 'infracloudtechnologies', name: 'InfraCloud' },
    { ats: 'gh', slug: 'sprinto', name: 'Sprinto' },

    // Lever
    { ats: 'lever', slug: 'urbancompany', name: 'Urban Company' },
    { ats: 'lever', slug: 'clevertap', name: 'CleverTap' },
    { ats: 'lever', slug: 'moengage', name: 'MoEngage' },
    { ats: 'lever', slug: 'kissflow', name: 'Kissflow' },
    { ats: 'lever', slug: 'chargebee', name: 'Chargebee' },
    { ats: 'lever', slug: 'spinny', name: 'Spinny' },
    { ats: 'lever', slug: 'observeai', name: 'Observe.AI' },
    { ats: 'lever', slug: 'signzy', name: 'Signzy' },
    { ats: 'lever', slug: 'loconav', name: 'LocoNav' },
    { ats: 'lever', slug: 'khatabook', name: 'Khatabook' },
    { ats: 'lever', slug: 'coindcx', name: 'CoinDCX' },
    { ats: 'lever', slug: 'sliceit', name: 'Slice' },
    { ats: 'lever', slug: 'zeptonow', name: 'Zepto' },
    { ats: 'lever', slug: 'zepto', name: 'Zepto' },
    { ats: 'lever', slug: 'lenskart', name: 'Lenskart' },
    { ats: 'lever', slug: 'infracloud', name: 'InfraCloud' },
    { ats: 'lever', slug: 'sprinto', name: 'Sprinto' },
    { ats: 'lever', slug: 'simpl', name: 'Simpl' },
    { ats: 'lever', slug: 'juspay', name: 'Juspay' },
    { ats: 'lever', slug: 'famapp', name: 'FamPay' },
    { ats: 'lever', slug: 'smallcase', name: 'Smallcase' },
    { ats: 'lever', slug: 'navi', name: 'Navi' },
    { ats: 'lever', slug: 'cuemath', name: 'Cuemath' },
    { ats: 'lever', slug: 'shiprocket', name: 'Shiprocket' },

    // Ashby
    { ats: 'ashby', slug: 'sprinto', name: 'Sprinto' },
    { ats: 'ashby', slug: 'hasura', name: 'Hasura' },
    { ats: 'ashby', slug: 'devrev', name: 'DevRev' },
    { ats: 'ashby', slug: 'dhiwise', name: 'DhiWise' },
    { ats: 'ashby', slug: 'toplyne', name: 'Toplyne' },
    { ats: 'ashby', slug: 'turing', name: 'Turing' },
    { ats: 'ashby', slug: 'monk-commerce', name: 'Monk' },

    // Workable
    { ats: 'workable', slug: 'infracloud', name: 'InfraCloud Technologies' },
    { ats: 'workable', slug: 'browserstack', name: 'BrowserStack' },
    { ats: 'workable', slug: 'housing', name: 'Housing.com' },
    { ats: 'workable', slug: 'keka', name: 'Keka' },
    { ats: 'workable', slug: 'practo', name: 'Practo' },
    { ats: 'workable', slug: 'clevertap', name: 'CleverTap' },
  ];

  const results: ProbeResult[] = [];

  for (const c of candidates) {
    let res: ProbeResult | null = null;
    if (c.ats === 'gh') {
      res = await probeGreenhouse(c.slug, c.name);
    } else if (c.ats === 'lever') {
      res = await probeLever(c.slug, c.name);
    } else if (c.ats === 'ashby') {
      res = await probeAshby(c.slug, c.name);
    } else if (c.ats === 'workable') {
      res = await probeWorkable(c.slug, c.name);
    }

    if (res && res.indiaTotal > 0) {
      results.push(res);
      console.log(`? [${res.ats}] ${res.companyName} (${res.slug}): total=${res.total}, India=${res.indiaTotal}, Freshers=${res.fresherTotal}`);
      if (res.sampleFreshers.length > 0) {
        console.log(`   Sample Freshers:`, res.sampleFreshers);
      }
    }
  }

  console.log('\n-----------------------------------------------------------');
  console.log(`Found ${results.length} active Indian hiring sources.`);
  console.log('Top Fresher Yield Sources:');
  const sorted = [...results].sort((a, b) => b.fresherTotal - a.fresherTotal);
  for (const r of sorted) {
    console.log(`- ${r.companyName} (${r.ats}): ${r.fresherTotal} freshers / ${r.indiaTotal} India jobs`);
  }
}

main().catch(console.error);
