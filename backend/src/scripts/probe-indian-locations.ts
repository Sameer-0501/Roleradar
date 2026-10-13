import 'dotenv/config';

async function probeIndianLocations() {
  console.log('--- Probing companies with Chennai, Pune, Hyderabad, Gurgaon presence ---');

  // Let's test known tech companies with Pune/Chennai/Hyderabad offices
  const tests = [
    // SmartRecruiters
    { type: 'SR', name: 'Publicis Sapient', token: 'PublicisSapient' },
    { type: 'SR', name: 'HERE Technologies', token: 'HERE' },
    { type: 'SR', name: 'Synechron', token: 'Synechron' },
    { type: 'SR', name: 'WSP', token: 'WSP' },
    { type: 'SR', name: 'Wolters Kluwer', token: 'WoltersKluwer' },
    { type: 'SR', name: 'Bazaarvoice', token: 'Bazaarvoice' },
    // Greenhouse
    { type: 'GH', name: 'ThoughtSpot', token: 'thoughtspot' },
    { type: 'GH', name: 'Zeta', token: 'zeta' },
    { type: 'GH', name: 'Druva', token: 'druva' },
    { type: 'GH', name: 'Icertis', token: 'icertis' },
    { type: 'GH', name: 'PubMatic', token: 'pubmatic' },
    { type: 'GH', name: 'Mindtickle', token: 'mindtickle' },
    { type: 'GH', name: 'Innovaccer', token: 'innovaccer' },
    { type: 'GH', name: 'Chargebee', token: 'chargebee' },
    { type: 'GH', name: 'Freshworks', token: 'freshworks' },
    { type: 'GH', name: 'Postman', token: 'postman' },
    { type: 'GH', name: 'Tekion', token: 'tekion' },
    { type: 'GH', name: 'Observe.AI', token: 'observeai' },
    { type: 'GH', name: 'HighLevel', token: 'highlevel' },
    { type: 'GH', name: 'Gupshup', token: 'gupshup' },
    { type: 'GH', name: 'BrowserStack', token: 'browserstack' },
    { type: 'GH', name: 'BrowserStack', token: 'browserstack2' },
    // Lever
    { type: 'LEVER', name: 'Druva', token: 'druva' },
    { type: 'LEVER', name: 'PubMatic', token: 'pubmatic' },
    { type: 'LEVER', name: 'Mindtickle', token: 'mindtickle' },
    { type: 'LEVER', name: 'Tekion', token: 'tekion' },
    { type: 'LEVER', name: 'Innovaccer', token: 'innovaccer' },
    { type: 'LEVER', name: 'Icertis', token: 'icertis' },
    { type: 'LEVER', name: 'ThoughtSpot', token: 'thoughtspot' },
    { type: 'LEVER', name: 'HighLevel', token: 'gohighlevel' },
    { type: 'LEVER', name: 'SirionLabs', token: 'sirionlabs' },
    { type: 'LEVER', name: 'Wingify', token: 'wingify' },
    { type: 'LEVER', name: 'Kissflow', token: 'kissflow' },
    { type: 'LEVER', name: 'Facilio', token: 'facilio' },
    // Ashby
    { type: 'ASHBY', name: 'DevRev', token: 'devrev' },
    { type: 'ASHBY', name: 'Sprinto', token: 'sprinto' },
    { type: 'ASHBY', name: 'Mad Street Den', token: 'madstreetden' },
    { type: 'ASHBY', name: 'PostHog', token: 'posthog' },
    { type: 'ASHBY', name: 'Vercel', token: 'vercel' },
  ];

  for (const t of tests) {
    try {
      let jobs: any[] = [];
      if (t.type === 'GH') {
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${t.token}/jobs?content=true`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const d = await res.json() as any;
          jobs = (d.jobs || []).map((j: any) => ({ title: j.title, loc: j.location?.name, url: j.absolute_url }));
        }
      } else if (t.type === 'LEVER') {
        const res = await fetch(`https://api.lever.co/v0/postings/${t.token}?mode=json`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const d = await res.json() as any[];
          jobs = d.map((j: any) => ({ title: j.text, loc: j.categories?.location, url: j.hostedUrl }));
        }
      } else if (t.type === 'SR') {
        const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${t.token}/postings?limit=100`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const d = await res.json() as any;
          jobs = (d.content || []).map((j: any) => ({ title: j.name, loc: `${j.location?.city || ''}, ${j.location?.country || ''}`, url: `https://jobs.smartrecruiters.com/${t.token}/${j.id}` }));
        }
      } else if (t.type === 'ASHBY') {
        const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${t.token}`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const d = await res.json() as any;
          jobs = (d.jobs || []).map((j: any) => ({ title: j.title, loc: j.location, url: j.jobUrl }));
        }
      }

      if (jobs.length > 0) {
        const indiaJobs = jobs.filter((j: any) => {
          const l = (j.loc || '').toLowerCase();
          return l.includes('india') || l.includes('bangalore') || l.includes('bengaluru') || l.includes('pune') || l.includes('chennai') || l.includes('hyderabad') || l.includes('mumbai') || l.includes('gurgaon') || l.includes('noida') || l.includes('delhi');
        });
        if (indiaJobs.length > 0) {
          const locs = Array.from(new Set(indiaJobs.map((j: any) => j.loc))).join('; ');
          console.log(`✅ [${t.type}] ${t.name} (${t.token}) -> ${indiaJobs.length} India jobs: ${locs}`);
          console.log(`   Sample: "${indiaJobs[0].title}" -> ${indiaJobs[0].url}`);
        }
      }
    } catch {}
  }
}

probeIndianLocations().catch(console.error);
