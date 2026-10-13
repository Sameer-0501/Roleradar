async function test() {
  try {
    let res = await fetch('https://accenture.wd3.myworkdayjobs.com/wday/cxs/accenture/Accenture_Careers/jobs', {
      method: 'POST',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json', 
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({ appliedFacets: {}, limit: 10, offset: 0, searchText: '' })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e: any) { console.error(e.message); }
} test();
