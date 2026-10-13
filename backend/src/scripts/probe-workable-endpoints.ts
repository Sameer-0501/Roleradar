import 'dotenv/config';

async function probeWorkableEndpoints() {
  const account = 'browserstack';
  const endpoints = [
    { method: 'GET', url: `https://apply.workable.com/api/v1/widget/accounts/${account}` },
    { method: 'GET', url: `https://apply.workable.com/api/v1/accounts/${account}` },
    { method: 'GET', url: `https://apply.workable.com/api/v2/accounts/${account}` },
    { method: 'GET', url: `https://apply.workable.com/api/v3/accounts/${account}` },
    { method: 'GET', url: `https://apply.workable.com/api/v1/accounts/${account}/jobs` },
    { method: 'GET', url: `https://apply.workable.com/api/v2/accounts/${account}/jobs` },
    { method: 'GET', url: `https://apply.workable.com/api/v3/accounts/${account}/jobs` },
    { method: 'POST', url: `https://apply.workable.com/api/v1/accounts/${account}/jobs`, body: {} },
    { method: 'POST', url: `https://apply.workable.com/api/v2/accounts/${account}/jobs`, body: {} },
    { method: 'POST', url: `https://apply.workable.com/api/v3/accounts/${account}/jobs`, body: {} },
    { method: 'GET', url: `https://www.workable.com/api/accounts/${account}` },
    { method: 'GET', url: `https://${account}.workable.com/api/v1/jobs` },
    { method: 'GET', url: `https://${account}.workable.com/` },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/html',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      const text = await res.text();
      console.log(`${ep.method} ${ep.url} -> status: ${res.status}, length: ${text.length}`);
      if (res.ok && res.headers.get('content-type')?.includes('json')) {
        console.log('  JSON:', text.slice(0, 300));
      }
    } catch (e) {
      console.log(`${ep.method} ${ep.url} -> err:`, e);
    }
  }
}

probeWorkableEndpoints().catch(console.error);
