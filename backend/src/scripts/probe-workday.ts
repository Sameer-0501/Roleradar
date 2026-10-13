import 'dotenv/config';

interface WorkdayCandidate {
  host: string;
  tenant: string;
  site: string;
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
    l.includes('delhi')
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
    t.includes('engineer 1') ||
    t.includes('engineer i') ||
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

async function testWorkday(c: WorkdayCandidate) {
  try {
    const url = `https://${c.host}/wday/careersection/${c.tenant}/${c.site}/jobs`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ limit: 20, offset: 0 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const total = data.total ?? data.body?.children?.[0]?.facet?.facetValues?.length ?? 0;
    const jobPostings = data.jobPostings ?? [];
    const indiaJobs = jobPostings.filter((j: any) => isIndiaLoc(j.locationsText || '') || isIndiaLoc(j.title || ''));
    const fresherJobs = indiaJobs.filter((j: any) => isFresherTitle(j.title || ''));
    return {
      ...c,
      total,
      sampleIndia: indiaJobs.length,
      sampleFresher: fresherJobs.length,
      samples: indiaJobs.slice(0, 3).map((j: any) => `${j.title} (${j.locationsText || ''})`),
    };
  } catch {
    return null;
  }
}

async function main() {
  const candidates: WorkdayCandidate[] = [
    { host: 'mastercard.wd1.myworkdayjobs.com', tenant: 'mastercard', site: 'CorporateCareers', name: 'Mastercard' },
    { host: 'walmart.wd5.myworkdayjobs.com', tenant: 'walmart', site: 'WalmartExternal', name: 'Walmart Global Tech India' },
    { host: 'target.wd5.myworkdayjobs.com', tenant: 'target', site: 'targetcareers', name: 'Target India' },
    { host: 'appliedmaterials.wd1.myworkdayjobs.com', tenant: 'appliedmaterials', site: 'AppliedMaterialsCareers', name: 'Applied Materials' },
    { host: 'qualcomm.wd5.myworkdayjobs.com', tenant: 'qualcomm', site: 'External', name: 'Qualcomm' },
    { host: 'westerndigital.wd1.myworkdayjobs.com', tenant: 'westerndigital', site: 'WDC_Careers', name: 'Western Digital' },
    { host: 'dell.wd1.myworkdayjobs.com', tenant: 'dell', site: 'External', name: 'Dell Technologies' },
    { host: 'paypal.wd1.myworkdayjobs.com', tenant: 'paypal', site: 'jobs', name: 'PayPal' },
    { host: 'intuit.wd5.myworkdayjobs.com', tenant: 'intuit', site: 'IntuitCareers', name: 'Intuit' },
  ];

  console.log('Probing Workday sources...');
  for (const c of candidates) {
    const res = await testWorkday(c);
    if (res) {
      console.log(`? [WORKDAY] ${res.name}: Total in batch=${res.total}, India in 1st page=${res.sampleIndia}, Freshers in 1st page=${res.sampleFresher}`);
      if (res.samples.length > 0) {
        console.log(`   Samples:`, res.samples);
      }
    }
  }
}

main().catch(console.error);
