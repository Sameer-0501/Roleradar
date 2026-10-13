import 'dotenv/config';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchRole } from '../matching/role-matcher.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';

interface SourceCandidate {
  companyName: string;
  officialDomain: string;
  careersUrl: string;
  atsType: 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'SMARTRECRUITERS' | 'WORKDAY' | 'WORKABLE';
  config: any;
}

const CANDIDATES_TO_AUDIT: SourceCandidate[] = [
  // 1. Ashby candidates
  {
    companyName: 'Sarvam AI',
    officialDomain: 'sarvam.ai',
    careersUrl: 'https://jobs.ashbyhq.com/sarvam',
    atsType: 'ASHBY',
    config: { jobBoardName: 'sarvam' },
  },
  {
    companyName: 'DevRev',
    officialDomain: 'devrev.ai',
    careersUrl: 'https://jobs.ashbyhq.com/devrev',
    atsType: 'ASHBY',
    config: { jobBoardName: 'devrev' },
  },
  {
    companyName: 'Sprinto',
    officialDomain: 'sprinto.com',
    careersUrl: 'https://jobs.ashbyhq.com/sprinto',
    atsType: 'ASHBY',
    config: { jobBoardName: 'sprinto' },
  },
  {
    companyName: 'ElevenLabs',
    officialDomain: 'elevenlabs.io',
    careersUrl: 'https://jobs.ashbyhq.com/elevenlabs',
    atsType: 'ASHBY',
    config: { jobBoardName: 'elevenlabs' },
  },

  // 2. Lever candidates
  {
    companyName: 'Fi Money',
    officialDomain: 'fi.money',
    careersUrl: 'https://jobs.lever.co/epifi',
    atsType: 'LEVER',
    config: { siteToken: 'epifi' },
  },
  {
    companyName: 'Porter',
    officialDomain: 'porter.in',
    careersUrl: 'https://jobs.lever.co/porter',
    atsType: 'LEVER',
    config: { siteToken: 'porter' },
  },
  {
    companyName: 'Secureframe',
    officialDomain: 'secureframe.com',
    careersUrl: 'https://jobs.lever.co/secureframe',
    atsType: 'LEVER',
    config: { siteToken: 'secureframe' },
  },

  // 3. Greenhouse candidates
  {
    companyName: 'Sigmoid',
    officialDomain: 'sigmoid.com',
    careersUrl: 'https://job-boards.greenhouse.io/sigmoid',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'sigmoid' },
  },
  {
    companyName: 'SingleStore',
    officialDomain: 'singlestore.com',
    careersUrl: 'https://job-boards.greenhouse.io/singlestore',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'singlestore' },
  },
  {
    companyName: 'Suki AI',
    officialDomain: 'suki.ai',
    careersUrl: 'https://job-boards.greenhouse.io/suki',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'suki' },
  },
  {
    companyName: 'Cresta',
    officialDomain: 'cresta.com',
    careersUrl: 'https://job-boards.greenhouse.io/cresta',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'cresta' },
  },
  {
    companyName: 'Yugabyte',
    officialDomain: 'yugabyte.com',
    careersUrl: 'https://job-boards.greenhouse.io/yugabyte',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'yugabyte' },
  },
  {
    companyName: 'Neo4j',
    officialDomain: 'neo4j.com',
    careersUrl: 'https://job-boards.greenhouse.io/neo4j',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'neo4j' },
  },
  {
    companyName: 'Karat',
    officialDomain: 'karat.com',
    careersUrl: 'https://job-boards.greenhouse.io/karat',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'karat' },
  },
  {
    companyName: 'Slice',
    officialDomain: 'sliceit.com',
    careersUrl: 'https://job-boards.greenhouse.io/slice',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'slice' },
  },
  {
    companyName: 'Clear',
    officialDomain: 'clear.in',
    careersUrl: 'https://job-boards.greenhouse.io/clear',
    atsType: 'GREENHOUSE',
    config: { boardToken: 'clear' },
  },

  // 4. Workday candidates
  {
    companyName: 'Cisco',
    officialDomain: 'cisco.com',
    careersUrl: 'https://cisco.wd5.myworkdayjobs.com/Cisco_Careers',
    atsType: 'WORKDAY',
    config: {
      host: 'cisco.wd5.myworkdayjobs.com',
      tenant: 'cisco',
      site: 'Cisco_Careers',
    },
  },
  {
    companyName: 'Target',
    officialDomain: 'target.com',
    careersUrl: 'https://target.wd5.myworkdayjobs.com/targetcareers',
    atsType: 'WORKDAY',
    config: {
      host: 'target.wd5.myworkdayjobs.com',
      tenant: 'target',
      site: 'targetcareers',
    },
  },
  {
    companyName: 'CrowdStrike',
    officialDomain: 'crowdstrike.com',
    careersUrl: 'https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers',
    atsType: 'WORKDAY',
    config: {
      host: 'crowdstrike.wd5.myworkdayjobs.com',
      tenant: 'crowdstrike',
      site: 'crowdstrikecareers',
    },
  },
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

async function auditCandidate(candidate: SourceCandidate) {
  console.log(`\n=== AUDITING: ${candidate.companyName} (${candidate.atsType}) ===`);
  try {
    if (candidate.atsType === 'ASHBY') {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${candidate.config.jobBoardName}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        console.log(`Failed HTTP ${res.status}`);
        return;
      }
      const data: any = await res.json();
      const jobs = data.jobs || [];
      const indianJobs = jobs.filter((j: any) => {
        const loc = j.location || (j.secondaryLocations?.map((l: any) => l.location).join(', ')) || '';
        return isIndian(loc) || isIndian(j.title);
      });
      console.log(`Total Jobs: ${jobs.length} | Indian Jobs: ${indianJobs.length}`);
      for (const j of indianJobs) {
        const loc = j.location || (j.secondaryLocations?.map((l: any) => l.location).join(', ')) || '';
        const parsed = parseExperienceRequirements(j.title, j.descriptionHtml || '', '');
        console.log(`  - [${parsed.classification.padEnd(18)}] ${j.title} | Loc: ${loc} | URL: ${j.jobUrl}`);
      }
    } else if (candidate.atsType === 'LEVER') {
      const res = await fetch(`https://api.lever.co/v0/postings/${candidate.config.siteToken}?mode=json`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        console.log(`Failed HTTP ${res.status}`);
        return;
      }
      const jobs: any = await res.json();
      const indianJobs = jobs.filter((j: any) => {
        const loc = j.categories?.location || '';
        return isIndian(loc) || isIndian(j.text);
      });
      console.log(`Total Jobs: ${jobs.length} | Indian Jobs: ${indianJobs.length}`);
      for (const j of indianJobs) {
        const loc = j.categories?.location || '';
        const parsed = parseExperienceRequirements(j.text, j.descriptionPlain || '', '');
        console.log(`  - [${parsed.classification.padEnd(18)}] ${j.text} | Loc: ${loc} | URL: ${j.hostedUrl}`);
      }
    } else if (candidate.atsType === 'GREENHOUSE') {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${candidate.config.boardToken}/jobs?content=true`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        console.log(`Failed HTTP ${res.status}`);
        return;
      }
      const data: any = await res.json();
      const jobs = data.jobs || [];
      const indianJobs = jobs.filter((j: any) => {
        const loc = j.location?.name || '';
        return isIndian(loc) || isIndian(j.title);
      });
      console.log(`Total Jobs: ${jobs.length} | Indian Jobs: ${indianJobs.length}`);
      for (const j of indianJobs) {
        const loc = j.location?.name || '';
        const parsed = parseExperienceRequirements(j.title, j.content || '', '');
        console.log(`  - [${parsed.classification.padEnd(18)}] ${j.title} | Loc: ${loc} | URL: ${j.absolute_url}`);
      }
    } else if (candidate.atsType === 'WORKDAY') {
      const res = await fetch(`https://${candidate.config.host}/wday/cxs/${candidate.config.tenant}/${candidate.config.site}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20, offset: 0, searchText: 'India' }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.log(`Failed HTTP ${res.status}`);
        return;
      }
      const data: any = await res.json();
      console.log(`Total Indian Jobs: ${data.total || 0}`);
      for (const j of (data.jobPostings || []).slice(0, 10)) {
        const parsed = parseExperienceRequirements(j.title, '', '');
        console.log(`  - [${parsed.classification.padEnd(18)}] ${j.title} | Loc: ${j.locationsText} | Path: ${j.externalPath}`);
      }
    }
  } catch (err: any) {
    console.error(`Error auditing ${candidate.companyName}:`, err.message);
  }
}

async function run() {
  for (const c of CANDIDATES_TO_AUDIT) {
    await auditCandidate(c);
  }
}

run();
