import 'dotenv/config';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

interface WorkdayProbe {
  company: string;
  host: string;
  tenant: string;
  site: string;
  officialDomain: string;
}

const WORKDAY_CANDIDATES: WorkdayProbe[] = [
  { company: 'Salesforce', host: 'salesforce.wd1.myworkdayjobs.com', tenant: 'salesforce', site: 'External_Career_Site', officialDomain: 'salesforce.com' },
  { company: 'NVIDIA', host: 'nvidia.wd5.myworkdayjobs.com', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite', officialDomain: 'nvidia.com' },
  { company: 'Autodesk', host: 'autodesk.wd1.myworkdayjobs.com', tenant: 'autodesk', site: 'Ext', officialDomain: 'autodesk.com' },
  { company: 'Adobe', host: 'adobe.wd5.myworkdayjobs.com', tenant: 'adobe', site: 'external_experienced', officialDomain: 'adobe.com' },
  { company: 'ServiceNow', host: 'servicenow.wd1.myworkdayjobs.com', tenant: 'servicenow', site: 'Careers', officialDomain: 'servicenow.com' },
  { company: 'Qualcomm', host: 'qualcomm.wd5.myworkdayjobs.com', tenant: 'qualcomm', site: 'External', officialDomain: 'qualcomm.com' },
  { company: 'Cisco', host: 'cisco.wd5.myworkdayjobs.com', tenant: 'cisco', site: 'Cisco_Careers', officialDomain: 'cisco.com' },
  { company: 'Intuit', host: 'intuit.wd5.myworkdayjobs.com', tenant: 'intuit', site: 'IntuitCareers', officialDomain: 'intuit.com' },
  { company: 'PayPal', host: 'paypal.wd1.myworkdayjobs.com', tenant: 'paypal', site: 'paypal_jobs', officialDomain: 'paypal.com' },
  { company: 'Walmart', host: 'walmart.wd5.myworkdayjobs.com', tenant: 'walmart', site: 'WalmartGlobalTech', officialDomain: 'walmart.com' },
  { company: 'AMD', host: 'amd.wd1.myworkdayjobs.com', tenant: 'amd', site: 'AMD_Careers', officialDomain: 'amd.com' },
  { company: 'Target', host: 'target.wd5.myworkdayjobs.com', tenant: 'target', site: 'targetcareers', officialDomain: 'target.com' },
  { company: 'HP', host: 'hp.wd5.myworkdayjobs.com', tenant: 'hp', site: 'External_Career_Site', officialDomain: 'hp.com' },
  { company: 'Dell', host: 'dell.wd1.myworkdayjobs.com', tenant: 'dell', site: 'External', officialDomain: 'dell.com' },
  { company: 'VMware', host: 'vmware.wd1.myworkdayjobs.com', tenant: 'vmware', site: 'VMware', officialDomain: 'vmware.com' },
  { company: 'CrowdStrike', host: 'crowdstrike.wd5.myworkdayjobs.com', tenant: 'crowdstrike', site: 'crowdstrikecareers', officialDomain: 'crowdstrike.com' },
];

const INDIA_KEYWORDS = [
  'bangalore', 'bengaluru', 'blr',
  'hyderabad', 'hyd',
  'pune',
  'chennai', 'madras',
  'mumbai', 'bombay',
  'delhi', 'ncr', 'noida', 'gurgaon', 'gurugram',
  'india', 'in'
];

function isIndian(locStr: string | null | undefined): boolean {
  if (!locStr) return false;
  const lower = locStr.toLowerCase();
  if (lower.includes('indiana') || lower.includes('in, us') || lower.includes('in, usa') || lower.includes(', in ')) {
    if (!lower.includes('india') && !INDIA_KEYWORDS.slice(0, -2).some(c => lower.includes(c))) return false;
  }
  return INDIA_KEYWORDS.some(k => k === 'in' ? /\b(in|india)\b/i.test(lower) : lower.includes(k));
}

async function probeWorkday(target: WorkdayProbe) {
  const url = `https://${target.host}/wday/cxs/${target.tenant}/${target.site}/jobs`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 20, offset: 0, searchText: 'India' }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data: any = await res.json();
      const total = data.total || 0;
      const postings = data.jobPostings || [];
      const fresherTitles: string[] = [];
      const inTitles: string[] = [];

      for (const j of postings) {
        const title = j.title || '';
        const loc = j.locationsText || '';
        inTitles.push(`${title} (${loc})`);
        const parsed = parseExperienceRequirements(title, '', '');
        if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
          fresherTitles.push(`${title} [${parsed.classification}]`);
        }
      }

      console.log(`[WORKDAY] ${target.company.padEnd(15)} Total India: ${String(total).padStart(5)} | Fresher in top 20: ${fresherTitles.length}`);
      if (fresherTitles.length > 0) {
        console.log(`   -> Fresher: ${fresherTitles.join('; ')}`);
      }
    } else {
      console.log(`[WORKDAY] ${target.company.padEnd(15)} HTTP ${res.status}`);
    }
  } catch (err: any) {
    console.log(`[WORKDAY] ${target.company.padEnd(15)} ERR: ${err.message}`);
  }
}

async function run() {
  console.log('=== PROBING WORKDAY INDIA ENGINEERING EMPLOYERS ===');
  await Promise.all(WORKDAY_CANDIDATES.map(c => probeWorkday(c)));
}

run();
