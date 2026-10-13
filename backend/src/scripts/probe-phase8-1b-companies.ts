

interface ProbeTarget {
  name: string;
  type: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';
  token: string;
  officialDomain?: string;
}

const TARGETS: ProbeTarget[] = [
  // Greenhouse
  { name: 'Elastic', type: 'greenhouse', token: 'elastic' },
  { name: 'Datadog', type: 'greenhouse', token: 'datadog' },
  { name: 'Chargebee', type: 'greenhouse', token: 'chargebee' },
  { name: 'CleverTap', type: 'greenhouse', token: 'clevertap' },
  { name: 'Dream11', type: 'greenhouse', token: 'dream11' },
  { name: 'Lenskart', type: 'greenhouse', token: 'lenskart' },
  { name: 'Cars24', type: 'greenhouse', token: 'cars24' },
  { name: 'Tenable', type: 'greenhouse', token: 'tenable' },
  { name: 'Observe.ai', type: 'greenhouse', token: 'observeai' },
  { name: 'Postman', type: 'greenhouse', token: 'postman' },

  // Lever
  { name: 'BookMyShow', type: 'lever', token: 'bookmyshow' },
  { name: 'Urban Company', type: 'lever', token: 'urbancompany' },
  { name: 'Paytm', type: 'lever', token: 'paytm' },
  { name: 'Kissflow', type: 'lever', token: 'kissflow' },
  { name: 'PharmEasy', type: 'lever', token: 'pharmeasy' },

  // Ashby
  { name: 'Zepto', type: 'ashby', token: 'zepto' },
  { name: 'Blinkit', type: 'ashby', token: 'blinkit' },
  { name: 'Zomato', type: 'ashby', token: 'zomato' },
  { name: 'Swiggy', type: 'ashby', token: 'swiggy' },
  { name: 'Razorpay', type: 'ashby', token: 'razorpay' },

  // SmartRecruiters
  { name: 'Pine Labs', type: 'smartrecruiters', token: 'PineLabs' },
  { name: 'Amdocs', type: 'smartrecruiters', token: 'Amdocs' },
  { name: 'Publicis Sapient', type: 'smartrecruiters', token: 'PublicisSapient' },
];

async function probe() {
  console.log('Testing candidates for Phase 8.1B...\n');

  for (const t of TARGETS) {
    try {
      let url = '';
      if (t.type === 'greenhouse') {
        url = `https://boards-api.greenhouse.io/v1/boards/${t.token}/jobs?content=true`;
      } else if (t.type === 'lever') {
        url = `https://api.lever.co/v0/postings/${t.token}?mode=json`;
      } else if (t.type === 'ashby') {
        url = `https://api.ashbyhq.com/posting-api/job-board/${t.token}`;
      } else if (t.type === 'smartrecruiters') {
        url = `https://api.smartrecruiters.com/v1/companies/${t.token}/postings?limit=50`;
      }

      const res = await fetch(url, { headers: { 'User-Agent': 'RoleRadar-Probe/1.0' } });
      if (!res.ok) {
        console.log(`? [${t.type.toUpperCase()}] ${t.name}: HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as any;
      let jobs: any[] = [];
      if (t.type === 'greenhouse') jobs = data.jobs || [];
      else if (t.type === 'lever') jobs = data || [];
      else if (t.type === 'ashby') jobs = data.jobs || [];
      else if (t.type === 'smartrecruiters') jobs = data.content || [];

      // Filter for India locations
      const indiaJobs = jobs.filter((j: any) => {
        const str = JSON.stringify(j).toLowerCase();
        return (
          str.includes('india') ||
          str.includes('bengaluru') ||
          str.includes('bangalore') ||
          str.includes('hyderabad') ||
          str.includes('pune') ||
          str.includes('chennai') ||
          str.includes('mumbai') ||
          str.includes('delhi') ||
          str.includes('noida') ||
          str.includes('gurgaon') ||
          str.includes('gurugram')
        );
      });

      console.log(`? [${t.type.toUpperCase()}] ${t.name}: Total=${jobs.length}, India=${indiaJobs.length}`);
      if (indiaJobs.length > 0) {
        indiaJobs.slice(0, 3).forEach((j: any) => {
          const title = j.title || j.text || j.name;
          const loc = j.location?.name || j.categories?.location || j.location || 'India';
          console.log(`     • "${title}" (${loc})`);
        });
      }
    } catch (e: any) {
      console.log(`? [${t.type.toUpperCase()}] ${t.name}: ${e.message}`);
    }
  }
}

probe();
