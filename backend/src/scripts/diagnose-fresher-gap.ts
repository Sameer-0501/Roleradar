import 'dotenv/config';
import pg from 'pg';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import { evaluateJobMatch } from '../matching/matching-service.js';
import type { CandidateJobData } from '../matching/matching-types.js';

const isIndiaLocation = (loc: string | null): boolean => {
  if (!loc) return false;
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

const STANDARD_TECH_ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'DevOps Engineer',
  'Cloud Engineer',
  'Data Engineer',
  'Data Scientist',
  'Data Analyst',
  'QA Engineer',
  'Security Engineer',
  'Solutions Engineer',
  'Business Analyst',
  'Product Manager',
  'Mobile Developer',
  'iOS Developer',
  'Android Developer',
  'Machine Learning Engineer',
  'Site Reliability Engineer',
  'IT Support Engineer',
  'Technical Support Engineer',
  'Associate',
  'Graduate Engineer Trainee',
  'Intern',
];

const ALL_INDIA_LOCATIONS = [
  'Bangalore',
  'Bengaluru',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi',
  'Noida',
  'Gurgaon',
  'Gurugram',
  'Remote',
  'India',
];

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://kcarrier:kcarrier_dev_password@localhost:5433/kcarrier_jobs',
  });
  await client.connect();

  const query = `
    SELECT j.id, c.name as "companyName", j.title, j.location, j.workplace_type as "workplaceType",
           j.description, j.requirements, j.official_url as "officialUrl"
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'ACTIVE' AND j.verification_status = 'VERIFIED'
  `;

  const res = await client.query(query);
  const indian = res.rows.filter((j) => isIndiaLocation(j.location));

  console.log('Total Indian Active+Verified in DB:', indian.length);

  const fresherList: any[] = [];
  for (const job of indian) {
    const parsed = parseExperienceRequirements(job.title, job.description, job.requirements);
    const fres = matchExperience(parsed, 'FRESHER');
    if (fres.matched) {
      const matchEval = evaluateJobMatch(job as CandidateJobData, {
        roles: STANDARD_TECH_ROLES,
        locations: ALL_INDIA_LOCATIONS,
        experienceLevel: 'FRESHER',
        companyIds: [],
        keywords: [],
        workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE', 'UNKNOWN'],
      });
      fresherList.push({
        id: job.id,
        company: job.companyName,
        title: job.title,
        location: job.location,
        workplaceType: job.workplaceType,
        parsed,
        isStrictMatched: matchEval.matched,
        reasons: matchEval.reasons,
        components: matchEval.components,
      });
    }
  }

  console.log(`Fresher-Compatible Inventory Count: ${fresherList.length}`);
  const strictlyMatched = fresherList.filter((f) => f.isStrictMatched);
  console.log(`Strictly Matched Fresher Count (All India Prefs): ${strictlyMatched.length}`);

  console.log('\n-------------------------------------------------------------------');
  console.log('                 ALL 18 FRESHER JOBS BREAKDOWN                     ');
  console.log('-------------------------------------------------------------------');

  fresherList.forEach((item, idx) => {
    console.log(`\n[${idx + 1}] ${item.company} | "${item.title}"`);
    console.log(`    Location: ${item.location} | Workplace: ${item.workplaceType}`);
    console.log(`    Classification: ${item.parsed.classification} (Confidence: ${item.parsed.confidence}, MinYears: ${item.parsed.minYears})`);
    console.log(`    Classification Reason: ${item.parsed.reason}`);
    console.log(`    Strictly Matched: ${item.isStrictMatched ? 'YES' : 'NO'}`);
    if (!item.isStrictMatched) {
      console.log(`    Role Match:`, item.components.role);
      console.log(`    Location Match:`, item.components.location);
      console.log(`    Workplace Match:`, item.components.workplace);
      console.log(`    Experience Match:`, item.components.experience);
    }
  });

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
