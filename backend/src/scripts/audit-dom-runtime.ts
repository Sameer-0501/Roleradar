import 'dotenv/config';

async function testRuntime() {
  console.log('=== RUNTIME ENDPOINT INVESTIGATION ===\n');

  // 1. Health check
  const healthRes = await fetch('http://localhost:4000/api/health');
  const health = await healthRes.json();
  console.log('1. /api/health:', health);

  // 2. Auth register/login
  let token = '';
  try {
    const regRes = await fetch('http://localhost:4000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'DOM Audit User', email: 'dom_audit@roleradar.local', password: 'Password123!' }),
    });
    const regData = await regRes.json();
    token = regData.token || '';
  } catch (e) {}

  if (!token) {
    const loginRes = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dom_audit@roleradar.local', password: 'Password123!' }),
    });
    const loginData = await loginRes.json();
    token = loginData.token;
  }

  console.log('2. Authenticated Token:', token ? token.slice(0, 20) + '...' : 'FAILED');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 3. /api/jobs/matches
  console.log('\n3. Testing GET /api/jobs/matches:');
  const matchesRes = await fetch('http://localhost:4000/api/jobs/matches?page=1&limit=10', { headers });
  console.log('   Status:', matchesRes.status);
  const matchesData = await matchesRes.json();
  console.log('   Total Matches:', matchesData.totalMatches);
  console.log('   Returned Jobs Count:', matchesData.jobs?.length);

  // 4. Phase 12 Search: fresher java developer in Bangalore
  console.log('\n4. Testing Search: "fresher java developer in Bangalore":');
  const search1Res = await fetch('http://localhost:4000/api/jobs/matches?q=fresher+java+developer+in+Bangalore&page=1&limit=5', { headers });
  console.log('   Status:', search1Res.status);
  const search1Data = await search1Res.json();
  console.log('   Search Intent:', search1Data.searchIntent);
  console.log('   Results Count:', search1Data.jobs?.length);
  for (const j of (search1Data.jobs || []).slice(0, 3)) {
    console.log(`     - [${j.experience_classification}] ${j.title} @ ${j.company_name} (${j.location})`);
  }

  // 5. Phase 12 Search: finance analyst Mumbai
  console.log('\n5. Testing Search: "finance analyst Mumbai":');
  const search2Res = await fetch('http://localhost:4000/api/jobs/matches?q=finance+analyst+Mumbai&page=1&limit=5', { headers });
  console.log('   Status:', search2Res.status);
  const search2Data = await search2Res.json();
  console.log('   Search Intent:', search2Data.searchIntent);
  console.log('   Results Count:', search2Data.jobs?.length);
  for (const j of (search2Data.jobs || []).slice(0, 3)) {
    console.log(`     - [${j.experience_classification}] ${j.title} @ ${j.company_name} (${j.location})`);
  }

  // 6. Phase 13 Profile Endpoint
  console.log('\n6. Testing GET /api/profile:');
  const profileRes = await fetch('http://localhost:4000/api/profile', { headers });
  console.log('   Status:', profileRes.status);
  const profileData = await profileRes.json();
  console.log('   Profile ID:', profileData.profile?.id);
  console.log('   Completeness:', profileData.profile?.completenessScore + '%');

  // 7. Profile Completeness Breakdown
  console.log('\n7. Testing GET /api/profile/completeness:');
  const compRes = await fetch('http://localhost:4000/api/profile/completeness', { headers });
  console.log('   Status:', compRes.status);
  const compData = await compRes.json();
  console.log('   Completeness Data:', compData);

  // 8. Job Fit Comparison
  if (matchesData.jobs && matchesData.jobs.length > 0) {
    const firstJobId = matchesData.jobs[0].id;
    console.log('\n8. Testing POST /api/profile/compare-job/' + firstJobId);
    const fitRes = await fetch(`http://localhost:4000/api/profile/compare-job/${firstJobId}`, { method: 'POST', headers });
    console.log('   Status:', fitRes.status);
    const fitData = await fitRes.json();
    console.log('   Fit Score:', fitData.fitScore, 'Tier:', fitData.fitTier);
    console.log('   Matching Skills:', fitData.matchingSkills);
    console.log('   Missing Skills:', fitData.missingSkills);
    console.log('   Fit Reasons:', fitData.fitReasons);
  }
}

testRuntime().catch(console.error);
