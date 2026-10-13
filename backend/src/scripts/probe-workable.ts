import 'dotenv/config';

async function testWorkableAccounts() {
  const accounts = [
    'browserstack',
    'browserstackinc',
    'browserstack-1',
    'invideo',
    'invideo-io',
    'yellow-ai',
    'yellowai',
    'clevertap',
    'chargebee',
    'hasura',
    'postman',
    'springworks',
    'springrole',
    'taxfix',
    'snyk',
    'transferwise',
    'wise',
    'monzo',
    'deliveroo',
    'pleo',
    'personio',
  ];

  for (const acc of accounts) {
    try {
      const url = `https://apply.workable.com/api/v3/accounts/${acc}/jobs`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          query: '',
          location: [],
          department: [],
          worktype: [],
          remote: [],
        }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        console.log(`Workable [${acc}]: status 200, total=${data.total}, results count=${data.results?.length}`);
        if (data.results && data.results.length > 0) {
          console.log(`  Sample 1: ${data.results[0].title} | ${data.results[0].city}, ${data.results[0].country} | code: ${data.results[0].shortcode}`);
        }
      } else {
        // console.log(`Workable [${acc}]: HTTP ${res.status}`);
      }
    } catch (e) {
      // console.log(`Workable [${acc}] err:`, e);
    }
  }
}

testWorkableAccounts().catch(console.error);
