import 'dotenv/config';

interface ProbeResult {
  company: string;
  ats: string;
  url: string;
  status: number;
  jobCount?: number;
  indiaJobCount?: number;
  fresherCount?: number;
  locations?: string[];
  sampleJobs?: Array<{ title: string; location: string; url: string }>;
  error?: string;
}

const INDIA_KEYWORDS = [
  'india', 'bangalore', 'bengaluru', 'hyderabad', 'pune', 'chennai',
  'mumbai', 'delhi', 'ncr', 'noida', 'gurgaon', 'gurugram'
];

function isIndia(text: string): boolean {
  const l = text.toLowerCase();
  return INDIA_KEYWORDS.some((k) => l.includes(k));
}

function isFresher(title: string): boolean {
  const l = title.toLowerCase();
  return /\b(intern|internship|graduate|new grad|entry level|entry-level|junior|associate|trainee|campus|early career|university graduate|0-1|0 to 1)\b/i.test(l);
}

async function probeGreenhouse(company: string, token: string): Promise<ProbeResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { company, ats: 'GREENHOUSE', url, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json() as any;
    const jobs = data.jobs || [];
    const indiaJobs = jobs.filter((j: any) => isIndia(j.location?.name || '') || (j.offices && j.offices.some((o: any) => isIndia(o.name || o.location || ''))));
    const fresherJobs = indiaJobs.filter((j: any) => isFresher(j.title || ''));
    return {
      company,
      ats: 'GREENHOUSE',
      url,
      status: res.status,
      jobCount: jobs.length,
      indiaJobCount: indiaJobs.length,
      fresherCount: fresherJobs.length,
      locations: Array.from(new Set(indiaJobs.map((j: any) => j.location?.name || 'Unknown'))).slice(0, 10),
      sampleJobs: indiaJobs.slice(0, 5).map((j: any) => ({
        title: j.title,
        location: j.location?.name || 'Unknown',
        url: j.absolute_url,
      })),
    };
  } catch (e) {
    return { company, ats: 'GREENHOUSE', url, status: 0, error: String(e) };
  }
}

async function probeLever(company: string, token: string): Promise<ProbeResult> {
  const url = `https://api.lever.co/v0/postings/${token}?mode=json`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { company, ats: 'LEVER', url, status: res.status, error: `HTTP ${res.status}` };
    const jobs = await res.json() as any[];
    const indiaJobs = jobs.filter((j: any) => isIndia(j.categories?.location || '') || (j.categories?.allLocations && j.categories.allLocations.some((l: string) => isIndia(l))));
    const fresherJobs = indiaJobs.filter((j: any) => isFresher(j.text || ''));
    return {
      company,
      ats: 'LEVER',
      url,
      status: res.status,
      jobCount: jobs.length,
      indiaJobCount: indiaJobs.length,
      fresherCount: fresherJobs.length,
      locations: Array.from(new Set(indiaJobs.map((j: any) => j.categories?.location || 'Unknown'))).slice(0, 10),
      sampleJobs: indiaJobs.slice(0, 5).map((j: any) => ({
        title: j.text,
        location: j.categories?.location || 'Unknown',
        url: j.hostedUrl,
      })),
    };
  } catch (e) {
    return { company, ats: 'LEVER', url, status: 0, error: String(e) };
  }
}

async function probeAshby(company: string, token: string): Promise<ProbeResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${token}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { company, ats: 'ASHBY', url, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json() as any;
    const jobs = data.jobs || [];
    const indiaJobs = jobs.filter((j: any) => isIndia(j.location || '') || (j.secondaryLocations && j.secondaryLocations.some((l: any) => isIndia(l.location || ''))));
    const fresherJobs = indiaJobs.filter((j: any) => isFresher(j.title || ''));
    return {
      company,
      ats: 'ASHBY',
      url,
      status: res.status,
      jobCount: jobs.length,
      indiaJobCount: indiaJobs.length,
      fresherCount: fresherJobs.length,
      locations: Array.from(new Set(indiaJobs.map((j: any) => j.location || 'Unknown'))).slice(0, 10),
      sampleJobs: indiaJobs.slice(0, 5).map((j: any) => ({
        title: j.title,
        location: j.location || 'Unknown',
        url: j.jobUrl || `https://jobs.ashbyhq.com/${token}/${j.id}`,
      })),
    };
  } catch (e) {
    return { company, ats: 'ASHBY', url, status: 0, error: String(e) };
  }
}

async function probeSmartRecruiters(company: string, identifier: string): Promise<ProbeResult> {
  const url = `https://api.smartrecruiters.com/v1/companies/${identifier}/postings?limit=100`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { company, ats: 'SMARTRECRUITERS', url, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json() as any;
    const jobs = data.content || [];
    const indiaJobs = jobs.filter((j: any) => isIndia(j.location?.city || '') || isIndia(j.location?.country || '') || isIndia(j.location?.region || ''));
    const fresherJobs = indiaJobs.filter((j: any) => isFresher(j.name || ''));
    return {
      company,
      ats: 'SMARTRECRUITERS',
      url,
      status: res.status,
      jobCount: jobs.length,
      indiaJobCount: indiaJobs.length,
      fresherCount: fresherJobs.length,
      locations: Array.from(new Set(indiaJobs.map((j: any) => `${j.location?.city || ''}, ${j.location?.country || ''}`))).slice(0, 10),
      sampleJobs: indiaJobs.slice(0, 5).map((j: any) => ({
        title: j.name,
        location: `${j.location?.city || ''}, ${j.location?.country || ''}`,
        url: `https://jobs.smartrecruiters.com/${identifier}/${j.id}`,
      })),
    };
  } catch (e) {
    return { company, ats: 'SMARTRECRUITERS', url, status: 0, error: String(e) };
  }
}

async function probeWorkable(company: string, slug: string): Promise<ProbeResult> {
  const url = `https://apply.workable.com/api/v3/accounts/${slug}/jobs`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { company, ats: 'WORKABLE', url, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json() as any;
    const jobs = data.results || [];
    const indiaJobs = jobs.filter((j: any) => isIndia(j.city || '') || isIndia(j.country || '') || isIndia(j.state || ''));
    const fresherJobs = indiaJobs.filter((j: any) => isFresher(j.title || ''));
    return {
      company,
      ats: 'WORKABLE',
      url,
      status: res.status,
      jobCount: data.total || jobs.length,
      indiaJobCount: indiaJobs.length,
      fresherCount: fresherJobs.length,
      locations: Array.from(new Set(indiaJobs.map((j: any) => `${j.city || ''}, ${j.country || ''}`))).slice(0, 10),
      sampleJobs: indiaJobs.slice(0, 5).map((j: any) => ({
        title: j.title,
        location: `${j.city || ''}, ${j.country || ''}`,
        url: `https://apply.workable.com/${slug}/j/${j.shortcode}`,
      })),
    };
  } catch (e) {
    return { company, ats: 'WORKABLE', url, status: 0, error: String(e) };
  }
}

async function main() {
  console.log('--- PROBING TARGET COMPANIES FOR PHASE 8.1 ---');
  
  const targets = [
    // Mentioned in spec
    () => probeLever('Meesho', 'meesho'),
    () => probeGreenhouse('Razorpay', 'razorpay'),
    () => probeSmartRecruiters('Bosch India', 'boschgroup'),
    () => probeSmartRecruiters('Bosch', 'bosch'),
    () => probeGreenhouse('HackerRank', 'hackerrank'),
    () => probeSmartRecruiters('Schneider Electric', 'schneiderelectric'),
    () => probeAshby('Atlan', 'atlan'),
    () => probeWorkable('BrowserStack', 'browserstack'),
    
    // Additional Indian Product / Fintech / SaaS companies
    () => probeGreenhouse('Swiggy', 'swiggy'),
    () => probeLever('Swiggy', 'swiggy'),
    () => probeGreenhouse('PhonePe', 'phonepe'),
    () => probeLever('PhonePe', 'phonepe'),
    () => probeGreenhouse('Urban Company', 'urbancompany'),
    () => probeLever('Urban Company', 'urbancompany'),
    () => probeGreenhouse('Dream11', 'dreamsports'),
    () => probeGreenhouse('Dream11', 'dream11'),
    () => probeLever('Dream11', 'dream11'),
    () => probeGreenhouse('Zepto', 'zepto'),
    () => probeLever('Zepto', 'zepto'),
    () => probeGreenhouse('Slice', 'slice'),
    () => probeLever('Slice', 'sliceit'),
    () => probeGreenhouse('Navi', 'navi'),
    () => probeLever('Navi', 'navi'),
    () => probeGreenhouse('Juspay', 'juspay'),
    () => probeLever('Juspay', 'juspay'),
    () => probeGreenhouse('CoinDCX', 'coindcx'),
    () => probeLever('CoinDCX', 'coindcx'),
    () => probeGreenhouse('Delhivery', 'delhivery'),
    () => probeLever('Delhivery', 'delhivery'),
    () => probeGreenhouse('Zeta', 'zeta'),
    () => probeLever('Zeta', 'corp-zeta'),
    () => probeGreenhouse('Cars24', 'cars24'),
    () => probeLever('Cars24', 'cars24'),
    () => probeGreenhouse('Sprinklr', 'sprinklr'),
    () => probeLever('Sprinklr', 'sprinklr'),
    () => probeAshby('Sprinto', 'sprinto'),
    () => probeAshby('Darwinbox', 'darwinbox'),
    () => probeLever('Darwinbox', 'darwinbox'),
    () => probeGreenhouse('Darwinbox', 'darwinbox'),
    () => probeGreenhouse('LeadSquared', 'leadsquared'),
    () => probeLever('LeadSquared', 'leadsquared'),
    () => probeGreenhouse('KreditBee', 'kreditbee'),
    () => probeLever('KreditBee', 'kreditbee'),
    () => probeGreenhouse('BrowserStack', 'browserstack'),
    () => probeWorkable('Chargebee', 'chargebee'),
    () => probeLever('Chargebee', 'chargebee'),
    () => probeGreenhouse('Chargebee', 'chargebee'),
    () => probeSmartRecruiters('Publicis Sapient', 'PublicisSapient'),
    () => probeSmartRecruiters('Visa', 'visa'),
  ];

  for (const fn of targets) {
    const res = await fn();
    if (res.status === 200 && (res.jobCount || 0) > 0) {
      console.log(`\n✅ ${res.company} [${res.ats}] - Total: ${res.jobCount}, India: ${res.indiaJobCount}, Fresher: ${res.fresherCount}`);
      console.log(`   Locations: ${res.locations?.join('; ')}`);
      if (res.sampleJobs && res.sampleJobs.length > 0) {
        console.log(`   Sample: "${res.sampleJobs[0]?.title}" at ${res.sampleJobs[0]?.location} -> ${res.sampleJobs[0]?.url}`);
      }
    } else {
      // console.log(`❌ ${res.company} [${res.ats}] - Status ${res.status}: ${res.error || '0 jobs'}`);
    }
  }
}

main().catch(console.error);
