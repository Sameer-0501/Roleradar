import 'dotenv/config';

async function testActiveWorkable() {
  const slugs = ['shield', 'writesonic', 'navtech', 'browserstack', 'zenara-health'];
  for (const slug of slugs) {
    try {
      const res = await fetch(`https://apply.workable.com/api/v3/accounts/${slug}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
      });
      console.log(`Workable slug [${slug}]: status ${res.status}`);
      if (res.ok) {
        const d = await res.json() as any;
        console.log(`  Total: ${d.total}, Results count: ${d.results?.length}`);
        if (d.results?.[0]) {
          console.log(`  Sample: "${d.results[0].title}" | ${d.results[0].city}, ${d.results[0].country} | workplace: ${d.results[0].workplace} | code: ${d.results[0].shortcode}`);
          const detailRes = await fetch(`https://apply.workable.com/api/v3/accounts/${slug}/jobs/${d.results[0].shortcode}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });
          console.log(`  Detail status: ${detailRes.status}`);
          if (detailRes.ok) {
            const detail = await detailRes.json() as any;
            console.log(`  Detail fields:`, Object.keys(detail));
            console.log(`  Detail: title="${detail.title}", location="${detail.city}, ${detail.country}", workplace="${detail.workplace}", remote=${detail.telecommuting}, published="${detail.published}"`);
          }
        }
      }
    } catch (e) {
      console.error(`Slug ${slug} err:`, e);
    }
  }
}

testActiveWorkable().catch(console.error);
