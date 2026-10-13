async function testEndpoints() {
  const tests = [
    { name: 'HPE Workday', url: 'https://hpe.wd5.myworkdayjobs.com/wday/cxs/hpe/Jobsathpe/jobs', method: 'POST', body: JSON.stringify({ appliedFacets: {}, limit: 10, offset: 0, searchText: '' }) },
    { name: 'JLL Workday', url: 'https://jll.wd1.myworkdayjobs.com/wday/cxs/jll/jllcareers/jobs', method: 'POST', body: JSON.stringify({ appliedFacets: {}, limit: 10, offset: 0, searchText: '' }) },
    { name: 'Accenture Workday', url: 'https://accenture.wd3.myworkdayjobs.com/wday/cxs/accenture/Accenture_Careers/jobs', method: 'POST', body: JSON.stringify({ appliedFacets: {}, limit: 10, offset: 0, searchText: '' }) },
    { name: 'Hevo Data Lever', url: 'https://api.lever.co/v0/postings/hevodata?mode=json', method: 'GET' }
  ];

  for (const t of tests) {
    try {
      const res = await fetch(t.url, {
        method: t.method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: t.body
      });
      console.log(`[${t.name}] Status: ${res.status}`);
      if (res.status === 200) {
        const data = await res.json();
        const count = t.name.includes('Lever') ? data.length : data.total;
        console.log(`[${t.name}] Success! Found ${count} jobs.`);
      } else {
        const text = await res.text();
        console.log(`[${t.name}] Failed: ${text.substring(0, 100)}`);
      }
    } catch (e: any) {
      console.log(`[${t.name}] Error: ${e.message}`);
    }
  }
}
testEndpoints();
