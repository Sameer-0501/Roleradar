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
    // Greenhouse
    { ats: 'GREENHOUSE', slug: 'phonepe', name: 'PhonePe' },
    { ats: 'GREENHOUSE', slug: 'darwinbox', name: 'Darwinbox' },
    { ats: 'GREENHOUSE', slug: 'chargebee', name: 'Chargebee' },
    { ats: 'GREENHOUSE', slug: 'hasura', name: 'Hasura' },
    { ats: 'GREENHOUSE', slug: 'harness', name: 'Harness' },
    { ats: 'GREENHOUSE', slug: 'thoughtspot', name: 'ThoughtSpot' },
    { ats: 'GREENHOUSE', slug: 'rubrik', name: 'Rubrik' },
    { ats: 'GREENHOUSE', slug: 'cohesity', name: 'Cohesity' },
    { ats: 'GREENHOUSE', slug: 'tekion', name: 'Tekion' },
    { ats: 'GREENHOUSE', slug: 'tekioncorp', name: 'Tekion Corp' },
    { ats: 'GREENHOUSE', slug: 'whatfix', name: 'Whatfix' },
    { ats: 'GREENHOUSE', slug: 'leadsquared', name: 'LeadSquared' },
    { ats: 'GREENHOUSE', slug: 'yellowai', name: 'Yellow.ai' },
    { ats: 'GREENHOUSE', slug: 'slice', name: 'Slice' },
    { ats: 'GREENHOUSE', slug: 'clevertap', name: 'CleverTap' },
    { ats: 'GREENHOUSE', slug: 'moengage', name: 'MoEngage' },
    { ats: 'GREENHOUSE', slug: 'dream11', name: 'Dream11' },
    { ats: 'GREENHOUSE', slug: 'unacademy', name: 'Unacademy' },
    { ats: 'GREENHOUSE', slug: 'urbancompany', name: 'Urban Company' },
    { ats: 'GREENHOUSE', slug: 'khatabook', name: 'Khatabook' },
    { ats: 'GREENHOUSE', slug: 'coindcx', name: 'CoinDCX' },
    { ats: 'GREENHOUSE', slug: 'mpl', name: 'Mobile Premier League (MPL)' },
    { ats: 'GREENHOUSE', slug: 'curefit', name: 'Curefit' },
    { ats: 'GREENHOUSE', slug: 'lenskart', name: 'Lenskart' },
    { ats: 'GREENHOUSE', slug: 'zeptonow', name: 'Zepto' },
    { ats: 'GREENHOUSE', slug: 'zepto', name: 'Zepto' },
    { ats: 'GREENHOUSE', slug: 'sprinklr', name: 'Sprinklr' },
    { ats: 'GREENHOUSE', slug: 'swiggy', name: 'Swiggy' },
    { ats: 'GREENHOUSE', slug: 'zomato', name: 'Zomato' },
    { ats: 'GREENHOUSE', slug: 'spinny', name: 'Spinny' },
    { ats: 'GREENHOUSE', slug: 'cars24', name: 'Cars24' },
    { ats: 'GREENHOUSE', slug: 'loconav', name: 'LocoNav' },
    { ats: 'GREENHOUSE', slug: 'signzy', name: 'Signzy' },
    { ats: 'GREENHOUSE', slug: 'infracloudtechnologies', name: 'InfraCloud' },
    { ats: 'GREENHOUSE', slug: 'sprinto', name: 'Sprinto' },
    { ats: 'GREENHOUSE', slug: 'juspay', name: 'Juspay' },
    { ats: 'GREENHOUSE', slug: 'shipsy', name: 'Shipsy' },
    { ats: 'GREENHOUSE', slug: 'classplus', name: 'Classplus' },
    { ats: 'GREENHOUSE', slug: 'browserstack', name: 'BrowserStack' },
    { ats: 'GREENHOUSE', slug: 'postman', name: 'Postman' },
    { ats: 'GREENHOUSE', slug: 'inmobi', name: 'InMobi' },
    { ats: 'GREENHOUSE', slug: 'groww', name: 'Groww' },
    { ats: 'GREENHOUSE', slug: 'razorpaysoftwareprivatelimited', name: 'Razorpay' },
    { ats: 'GREENHOUSE', slug: 'hackerrank', name: 'HackerRank' },
    { ats: 'GREENHOUSE', slug: 'druva', name: 'Druva' },
    { ats: 'GREENHOUSE', slug: 'pubmatic', name: 'PubMatic' },
    { ats: 'GREENHOUSE', slug: 'glance', name: 'Glance' },
    { ats: 'GREENHOUSE', slug: 'confluent', name: 'Confluent' },
    { ats: 'GREENHOUSE', slug: 'okta', name: 'Okta' },
    { ats: 'GREENHOUSE', slug: 'twilio', name: 'Twilio' },
    { ats: 'GREENHOUSE', slug: 'mongodb', name: 'MongoDB' },
    { ats: 'GREENHOUSE', slug: 'cloudflare', name: 'Cloudflare' },
    { ats: 'GREENHOUSE', slug: 'nutanix', name: 'Nutanix' },
    { ats: 'GREENHOUSE', slug: 'qualcomm', name: 'Qualcomm' },
    { ats: 'GREENHOUSE', slug: 'synopsys', name: 'Synopsys' },

    // Lever
    { ats: 'LEVER', slug: 'urbancompany', name: 'Urban Company' },
    { ats: 'LEVER', slug: 'clevertap', name: 'CleverTap' },
    { ats: 'LEVER', slug: 'moengage', name: 'MoEngage' },
    { ats: 'LEVER', slug: 'kissflow', name: 'Kissflow' },
    { ats: 'LEVER', slug: 'chargebee', name: 'Chargebee' },
    { ats: 'LEVER', slug: 'spinny', name: 'Spinny' },
    { ats: 'LEVER', slug: 'observeai', name: 'Observe.AI' },
    { ats: 'LEVER', slug: 'signzy', name: 'Signzy' },
    { ats: 'LEVER', slug: 'loconav', name: 'LocoNav' },
    { ats: 'LEVER', slug: 'khatabook', name: 'Khatabook' },
    { ats: 'LEVER', slug: 'coindcx', name: 'CoinDCX' },
    { ats: 'LEVER', slug: 'sliceit', name: 'Slice' },
    { ats: 'LEVER', slug: 'zeptonow', name: 'Zepto' },
    { ats: 'LEVER', slug: 'zepto', name: 'Zepto' },
    { ats: 'LEVER', slug: 'lenskart', name: 'Lenskart' },
    { ats: 'LEVER', slug: 'infracloud', name: 'InfraCloud' },
    { ats: 'LEVER', slug: 'sprinto', name: 'Sprinto' },
    { ats: 'LEVER', slug: 'simpl', name: 'Simpl' },
    { ats: 'LEVER', slug: 'juspay', name: 'Juspay' },
    { ats: 'LEVER', slug: 'famapp', name: 'FamPay' },
    { ats: 'LEVER', slug: 'smallcase', name: 'Smallcase' },
    { ats: 'LEVER', slug: 'navi', name: 'Navi' },
    { ats: 'LEVER', slug: 'cuemath', name: 'Cuemath' },
    { ats: 'LEVER', slug: 'shiprocket', name: 'Shiprocket' },
    { ats: 'LEVER', slug: 'shadowfax', name: 'Shadowfax' },
    { ats: 'LEVER', slug: 'rapido', name: 'Rapido' },
    { ats: 'LEVER', slug: 'mpl', name: 'Mobile Premier League' },
    { ats: 'LEVER', slug: 'games24x7', name: 'Games24x7' },
    { ats: 'LEVER', slug: 'scaler', name: 'Scaler / InterviewBit' },
    { ats: 'LEVER', slug: 'interviewbit', name: 'InterviewBit' },
    { ats: 'LEVER', slug: 'cred', name: 'CRED' },
    { ats: 'LEVER', slug: 'meesho', name: 'Meesho' },
    { ats: 'LEVER', slug: 'mindtickle', name: 'Mindtickle' },
    { ats: 'LEVER', slug: 'highlevel', name: 'HighLevel' },
    { ats: 'LEVER', slug: 'atlassian', name: 'Atlassian' },

    // Ashby
    { ats: 'ASHBY', slug: 'sprinto', name: 'Sprinto' },
    { ats: 'ASHBY', slug: 'hasura', name: 'Hasura' },
    { ats: 'ASHBY', slug: 'devrev', name: 'DevRev' },
    { ats: 'ASHBY', slug: 'dhiwise', name: 'DhiWise' },
    { ats: 'ASHBY', slug: 'toplyne', name: 'Toplyne' },
    { ats: 'ASHBY', slug: 'monk-commerce', name: 'Monk' },
    { ats: 'ASHBY', slug: 'atlan', name: 'Atlan' },
    { ats: 'ASHBY', slug: 'notion', name: 'Notion' },
    { ats: 'ASHBY', slug: 'linear', name: 'Linear' },
    { ats: 'ASHBY', slug: 'retool', name: 'Retool' },
    { ats: 'ASHBY', slug: 'openai', name: 'OpenAI' },
    { ats: 'ASHBY', slug: 'ramp', name: 'Ramp' },
    { ats: 'ASHBY', slug: 'supabase', name: 'Supabase' },
    { ats: 'ASHBY', slug: 'perplexity', name: 'Perplexity' },
    { ats: 'ASHBY', slug: 'replit', name: 'Replit' },
    { ats: 'ASHBY', slug: 'cohere', name: 'Cohere' },
    { ats: 'ASHBY', slug: 'quince', name: 'Quince' },
    { ats: 'ASHBY', slug: 'vymo', name: 'Vymo' },
    { ats: 'ASHBY', slug: 'mux', name: 'Mux' },
    { ats: 'ASHBY', slug: 'mercury', name: 'Mercury' },
    { ats: 'ASHBY', slug: 'deel', name: 'Deel' },

    // Workable
    { ats: 'WORKABLE', slug: 'infracloud', name: 'InfraCloud Technologies' },
    { ats: 'WORKABLE', slug: 'browserstack', name: 'BrowserStack' },
    { ats: 'WORKABLE', slug: 'housing', name: 'Housing.com' },
    { ats: 'WORKABLE', slug: 'keka', name: 'Keka' },
    { ats: 'WORKABLE', slug: 'practo', name: 'Practo' },
    { ats: 'WORKABLE', slug: 'clevertap', name: 'CleverTap' },
    { ats: 'WORKABLE', slug: 'wingify', name: 'Wingify (VWO)' },
    { ats: 'WORKABLE', slug: 'chargebee', name: 'Chargebee' },
    { ats: 'WORKABLE', slug: 'sprinklr', name: 'Sprinklr' },

    // SmartRecruiters
    { ats: 'SMARTRECRUITERS', slug: 'cern', name: 'CERN' },
    { ats: 'SMARTRECRUITERS', slug: 'freshworks', name: 'Freshworks' },
    { ats: 'SMARTRECRUITERS', slug: 'boschgroup', name: 'Bosch India' },
    { ats: 'SMARTRECRUITERS', slug: 'visa', name: 'Visa' },
    { ats: 'SMARTRECRUITERS', slug: 'ubisoft', name: 'Ubisoft' },
    { ats: 'SMARTRECRUITERS', slug: 'averydennison', name: 'Avery Dennison' },
    { ats: 'SMARTRECRUITERS', slug: 'publicissapient', name: 'Publicis Sapient' },
    { ats: 'SMARTRECRUITERS', slug: 'wipro', name: 'Wipro' },
    { ats: 'SMARTRECRUITERS', slug: 'snag', name: 'Snag' },
    { ats: 'SMARTRECRUITERS', slug: 'smartrecruiters', name: 'SmartRecruiters' },
  ];

  console.log(`Starting probe of ${candidates.length} candidates in parallel chunks...`);

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
  console.log(`PROBE FINISHED: ${results.length} active Indian sources found.`);
  console.log('-----------------------------------------------------------\n');
  const sorted = [...results].sort((a, b) => b.fresherTotal - a.fresherTotal);
  for (const r of sorted) {
    console.log(`• ${r.name} [${r.ats}]: ${r.fresherTotal} freshers / ${r.indiaTotal} India jobs (${r.total} total) - slug: '${r.slug}'`);
  }
}

main().catch(console.error);
