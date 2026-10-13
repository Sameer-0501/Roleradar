import { performance } from 'perf_hooks';

const API_BASE = 'http://localhost:4000/api';

async function measureRequest(name: string, requestFn: () => Promise<any>) {
  const start = performance.now();
  try {
    const res = await requestFn();
    const end = performance.now();
    const data = await res.json().catch(() => ({}));
    const size = res.headers.get('content-length') || JSON.stringify(data).length;
    console.log(`[API] ${name} - ${(end - start).toFixed(2)} ms - Size: ${size} bytes`);
    if (!res.ok) {
      console.log(`[API] ${name} - Failed with status ${res.status}`);
    }
    return { data, time: end - start, size };
  } catch (err: any) {
    const end = performance.now();
    console.log(`[API] ${name} - ERROR: ${(end - start).toFixed(2)} ms - ${err.message}`);
    return null;
  }
}

async function runAudit() {
  console.log('=========================================');
  console.log('PHASE 18.5 REQUEST-PATH BASELINE');
  console.log('=========================================');

  const testEmail = `test_18_5_${Date.now()}@example.com`;
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'Password123!',
      firstName: 'Audit',
      lastName: 'User'
    })
  });
  
  const registerData = await registerRes.json().catch(() => ({}));
  let token = registerData?.token;

  if (!token) {
    console.error('Failed to register test user for audit', registerData);
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  await fetch(`${API_BASE}/users/me/preferences`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      roles: ['Software Engineer'],
      locations: ['Remote'],
      experienceLevels: ['MID_LEVEL'],
      workplaceTypes: ['REMOTE']
    })
  });

  console.log('\n--- PUBLIC ENDPOINTS ---');
  await measureRequest('GET /api/jobs', () => fetch(`${API_BASE}/jobs?limit=50`));
  const jobsRes = await measureRequest('GET /api/jobs/verified', () => fetch(`${API_BASE}/jobs/verified?limit=50`));
  
  if (jobsRes?.data?.jobs?.length > 0) {
    const jobId = jobsRes.data.jobs[0].id;
    await measureRequest(`GET /api/jobs/${jobId} (Job Details)`, () => fetch(`${API_BASE}/jobs/${jobId}`));
    
    await fetch(`${API_BASE}/jobs/${jobId}/save`, { method: 'POST', headers });
  }

  console.log('\n--- AUTHENTICATED ENDPOINTS ---');
  await measureRequest('GET /api/users/me/preferences', () => fetch(`${API_BASE}/users/me/preferences`, { headers }));
  await measureRequest('GET /api/jobs/matches', () => fetch(`${API_BASE}/jobs/matches?limit=50`, { headers }));
  await measureRequest('GET /api/jobs/matches/today', () => fetch(`${API_BASE}/jobs/matches/today?limit=50`, { headers }));
  await measureRequest('GET /api/workspace/saved', () => fetch(`${API_BASE}/workspace/saved?limit=15`, { headers }));
  await measureRequest('GET /api/workspace/applications', () => fetch(`${API_BASE}/workspace/applications?limit=15`, { headers }));
  await measureRequest('GET /api/workspace/recently-viewed', () => fetch(`${API_BASE}/workspace/recently-viewed?limit=10`, { headers }));
  await measureRequest('GET /api/notifications', () => fetch(`${API_BASE}/notifications?limit=20`, { headers }));

  console.log('\nDone.');
}

runAudit().catch(console.error);
