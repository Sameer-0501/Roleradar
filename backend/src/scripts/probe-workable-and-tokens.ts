import 'dotenv/config';

async function testRazorpayAndSchneider() {
  console.log('--- Inspecting Razorpay (razorpaysoftwareprivatelimited) ---');
  const rpRes = await fetch('https://boards-api.greenhouse.io/v1/boards/razorpaysoftwareprivatelimited/jobs?content=true');
  const rpData = await rpRes.json() as any;
  console.log('Razorpay total jobs:', rpData.jobs?.length);
  for (const j of rpData.jobs?.slice(0, 5) || []) {
    console.log(`  • ${j.title} | ${j.location?.name} | ${j.absolute_url}`);
  }

  console.log('\n--- Probing Schneider Electric tokens ---');
  const schTokens = ['schneiderelectric', 'schneider-electric', 'schneider', 'se', 'SchneiderElectric'];
  for (const t of schTokens) {
    try {
      const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=10`);
      if (res.ok) {
        const d = await res.json() as any;
        console.log(`Schneider token "${t}": status 200, totalFound: ${d.totalFound}, content length: ${d.content?.length}`);
      }
    } catch {}
  }

  console.log('\n--- Probing Workable Slugs ---');
  const workableSlugs = [
    'browserstack', 'browser-stack', 'browserstack-1', 'browserstackinc',
    'chargebee', 'clevertap', 'unacademy', 'upstox', 'invideo', 'yellowai',
    'haptik', 'moengage', 'darwinbox', 'khatabook', 'lendingkart', 'leena-ai',
    'hasura', 'curefit', 'urban-piper', 'signeasy', 'wingify', 'vwo',
    'synup', 'whatfix', 'kissflow', 'facilio', 'gupshup', 'thoughtspot'
  ];
  for (const s of workableSlugs) {
    try {
      const res = await fetch(`https://apply.workable.com/api/v3/accounts/${s}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
      });
      if (res.ok) {
        const d = await res.json() as any;
        if (d.total > 0) {
          console.log(`Workable "${s}": total=${d.total}, results=${d.results?.length}`);
          const indLocs = d.results?.map((j: any) => `${j.city}, ${j.country}`).filter(Boolean);
          console.log(`   Locations:`, Array.from(new Set(indLocs)).slice(0, 5));
          console.log(`   Sample job:`, d.results[0]?.title, d.results[0]?.city, d.results[0]?.shortcode);
        }
      }
    } catch {}
  }
}

testRazorpayAndSchneider().catch(console.error);
