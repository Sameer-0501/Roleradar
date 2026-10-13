import 'dotenv/config';

async function findActiveWorkable() {
  const companies = [
    'taxfix', 'snyk', 'supercell', 'bolt', 'omio', 'transferwise', 'wise', 'revolut',
    'n26', 'klarna', 'monzo', 'trade-republic', 'delivery-hero', 'personio', 'vinted',
    'strapi', 'grafana', 'sourcegraph', 'posthog', 'sentry', '1password', 'automattic',
    'elastic', 'hashicorp', 'datadog', 'docker', 'vercel', 'supabase', 'render',
    'railway', 'fly-io', 'tailscale', 'modal', 'modal-labs', 'together-ai', 'mistral',
    'cohere', 'anthropic', 'langchain', 'llamaindex', 'deepgram', 'assemblyai',
    'synthesia', 'runway', 'elevenlabs', 'descript', 'replit', 'cursor', 'anysphere',
    'browserstack', 'clevertap', 'yellowai', 'moengage', 'hasura', 'chargebee',
    'whatfix', 'kissflow', 'facilio', 'gupshup', 'wingify', 'vwo', 'signeasy',
    'springworks', 'unacademy', 'upstox', 'invideo', 'khatabook', 'leena-ai',
    'leadsquared', 'darwinbox', 'urban-piper', 'urbanpiper', 'synup', 'loconav',
    'shadowfax', 'dunzo', 'udaan', 'rapido', 'kuku-fm', 'classplus', 'loco',
    'jar', 'progcap', 'jupiter', 'fi', 'epifi', 'slice', 'cred', 'groww', 'zerodha'
  ];

  for (const c of companies) {
    try {
      const res = await fetch(`https://apply.workable.com/api/v3/accounts/${c}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
      });
      if (res.ok) {
        const d = await res.json() as any;
        if (d.total > 0) {
          console.log(`\n🎉 ACTIVE WORKABLE BOARD FOUND: "${c}" -> total: ${d.total}`);
          console.log('Sample job:', d.results?.[0]);
          const shortcode = d.results?.[0]?.shortcode;
          if (shortcode) {
            const detailRes = await fetch(`https://apply.workable.com/api/v3/accounts/${c}/jobs/${shortcode}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            });
            console.log(`Detail GET status: ${detailRes.status}`);
            if (detailRes.ok) {
              const detail = await detailRes.json() as any;
              console.log('Detail keys:', Object.keys(detail));
              console.log('Detail title:', detail.title, 'city:', detail.city, 'country:', detail.country, 'telecommuting:', detail.telecommuting, 'workplace:', detail.workplace);
              console.log('Detail description length:', detail.description?.length, 'requirements length:', detail.requirements?.length);
            }
          }
          break;
        }
      }
    } catch {}
  }
}

findActiveWorkable().catch(console.error);
