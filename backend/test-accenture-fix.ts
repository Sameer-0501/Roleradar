async function test() {
  try {
    let res = await fetch('https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs', {
      method: 'POST',
      headers: { 'User-Agent': 'KCarrier-JobEngine/2.0 (job-verification-system)', 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 10, offset: 0, searchText: '' })
    });
    console.log(res.status);
    console.log((await res.text()).substring(0, 500));
  } catch(e: any) { console.error(e.message); }
} test();
