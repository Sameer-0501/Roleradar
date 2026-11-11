import 'dotenv/config';
import { generateToken } from '../auth/token.js';

async function test() {
  const token = generateToken({
    userId: 'ee9c7230-e25f-4163-9675-b6c29e7b013a',
    email: 'same60806@gmail.com',
  });

  const res = await fetch('http://localhost:4000/api/jobs/matches?page=1&limit=5', {
    headers: { Authorization: 'Bearer ' + token },
  });
  const data = (await res.json()) as any;
  console.log('Matches status:', res.status, 'Total:', data.totalMatches, 'Jobs length:', data.jobs?.length);

  const vRes = await fetch('http://localhost:4000/api/jobs/verified?page=1&limit=5', {
    headers: { Authorization: 'Bearer ' + token },
  });
  const vData = (await vRes.json()) as any;
  console.log('Verified status:', vRes.status, 'Total:', vData.total, 'Jobs length:', vData.jobs?.length);
  if (vData.jobs && vData.jobs.length > 0) {
    const job = vData.jobs[0];
    console.log(`Sample verified job: [${job.id}] ${job.title} at ${job.company?.name || 'Company'}`);

    // Test proof fit endpoint for this job
    const fitRes = await fetch(`http://localhost:4000/api/jobs/${job.id}/proof-fit`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    const fitData = (await fitRes.json()) as any;
    console.log('Proof Fit status:', fitRes.status);
    console.log('Eligibility status:', fitData.fitAnalysis?.overallEligibilityStatus);
    console.log('Mandatory evaluations:', fitData.fitAnalysis?.mandatoryEvaluations?.length);
    console.log('Preferred evaluations:', fitData.fitAnalysis?.preferredEvaluations?.length);
  }
}

test().catch(console.error).finally(() => process.exit(0));

