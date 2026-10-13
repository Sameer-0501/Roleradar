import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { enforceEmailSafety } from './test-guard.js';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import type { CandidateJobData, UserPreferencesData } from '../matching/matching-types.js';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, matchResult: any) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] ${name}`);
    console.log(JSON.stringify(matchResult, null, 2));
  }
}

async function run() {
  enforceEmailSafety();

  const fresherPref: UserPreferencesData = {
    userId: 'user-1',
    roles: ['Software Engineer'],
    locations: ['Bangalore'],
    workplaceTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: [],
  };

  const seniorJob: CandidateJobData = {
    id: 'job-1',
    companyId: 'comp-1',
    companyName: 'Google',
    sourceSystem: 'GREENHOUSE',
    externalJobId: 'ext-1',
    title: 'Senior Software Engineer',
    location: 'Bangalore',
    workplaceType: 'ONSITE',
    description: '10+ years experience required',
    requirements: '',
    officialUrl: 'https://careers.google.com/job',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED'
  };

  const matchA = evaluateJobMatch(seniorJob, fresherPref);
  assert('A. Fresher user + Senior job -> REJECTED', !matchA.matched && matchA.reasons.some((r: string) => r.includes('experience') || r.includes('Experience')), matchA);

  await closeConnection();
}

run().catch(console.error);
