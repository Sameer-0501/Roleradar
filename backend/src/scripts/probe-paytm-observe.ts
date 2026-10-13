import 'dotenv/config';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

async function checkPaytm() {
  const res = await fetch('https://api.lever.co/v0/postings/paytm?mode=json');
  const jobs: any = await res.json();
  console.log(`Paytm Total Jobs: ${jobs.length}`);
  let inJobs = 0;
  let fresher = 0;
  for (const j of jobs) {
    const loc = j.categories?.location || '';
    const title = j.text || '';
    const desc = j.descriptionPlain || '';
    inJobs++;
    const parsed = parseExperienceRequirements(title, desc, '');
    if (parsed.classification === 'FRESHER_COMPATIBLE' || parsed.classification === 'BOTH') {
      fresher++;
      console.log(`  [FRESHER] ${title} | Loc: ${loc} | URL: ${j.hostedUrl}`);
    }
  }
  console.log(`Paytm: ${inJobs} Indian jobs, ${fresher} fresher jobs`);
}

async function checkObserveAI() {
  const res = await fetch('https://boards-api.greenhouse.io/v1/boards/observeai/jobs?content=true');
  const data: any = await res.json();
  const jobs = data.jobs || [];
  console.log(`Observe.AI Total Jobs: ${jobs.length}`);
  for (const j of jobs) {
    const loc = j.location?.name || '';
    const title = j.title || '';
    const desc = j.content || '';
    const parsed = parseExperienceRequirements(title, desc, '');
    console.log(`  [${parsed.classification}] ${title} | Loc: ${loc} | URL: ${j.absolute_url}`);
  }
}

async function run() {
  await checkPaytm();
  await checkObserveAI();
}

run();
