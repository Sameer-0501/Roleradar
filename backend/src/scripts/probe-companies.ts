const candidates = [
  { name: 'Postman', gh: 'https://boards-api.greenhouse.io/v1/boards/postman/jobs' },
  { name: 'Freshworks', sr: 'https://api.smartrecruiters.com/v1/companies/freshworks/postings' },
  { name: 'BrowserStack', gh: 'https://boards-api.greenhouse.io/v1/boards/browserstack/jobs', lever: 'https://api.lever.co/v0/postings/browserstack?mode=json' },
  { name: 'InMobi', gh: 'https://boards-api.greenhouse.io/v1/boards/inmobi/jobs', sr: 'https://api.smartrecruiters.com/v1/companies/inmobi/postings' },
  { name: 'Notion', gh: 'https://boards-api.greenhouse.io/v1/boards/notion/jobs', lever: 'https://api.lever.co/v0/postings/notion?mode=json', ashby: 'https://api.ashbyhq.com/posting-api/job-board/notion' },
  { name: 'Anthropic', gh: 'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs', ashby: 'https://api.ashbyhq.com/posting-api/job-board/anthropic' },
  { name: 'Supabase', ashby: 'https://api.ashbyhq.com/posting-api/job-board/supabase', gh: 'https://boards-api.greenhouse.io/v1/boards/supabase/jobs' },
  { name: 'Vercel', ashby: 'https://api.ashbyhq.com/posting-api/job-board/vercel' },
  { name: 'Zepto', gh: 'https://boards-api.greenhouse.io/v1/boards/zepto/jobs', lever: 'https://api.lever.co/v0/postings/zepto?mode=json', ashby: 'https://api.ashbyhq.com/posting-api/job-board/zepto' },
  { name: 'Swiggy', gh: 'https://boards-api.greenhouse.io/v1/boards/swiggy/jobs', lever: 'https://api.lever.co/v0/postings/swiggy?mode=json' },
  { name: 'Razorpay', gh: 'https://boards-api.greenhouse.io/v1/boards/razorpay/jobs', lever: 'https://api.lever.co/v0/postings/razorpay?mode=json' },
  { name: 'Meesho', gh: 'https://boards-api.greenhouse.io/v1/boards/meesho/jobs', lever: 'https://api.lever.co/v0/postings/meesho?mode=json' },
  { name: 'PhonePe', gh: 'https://boards-api.greenhouse.io/v1/boards/phonepe/jobs', lever: 'https://api.lever.co/v0/postings/phonepe?mode=json' },
  { name: 'Dream11', gh: 'https://boards-api.greenhouse.io/v1/boards/dream11/jobs', lever: 'https://api.lever.co/v0/postings/dream11?mode=json' },
  { name: 'Groww', gh: 'https://boards-api.greenhouse.io/v1/boards/groww/jobs', lever: 'https://api.lever.co/v0/postings/groww?mode=json' },
  { name: 'CRED', gh: 'https://boards-api.greenhouse.io/v1/boards/cred/jobs', lever: 'https://api.lever.co/v0/postings/cred?mode=json' },
  { name: 'Perplexity', ashby: 'https://api.ashbyhq.com/posting-api/job-board/perplexity', gh: 'https://boards-api.greenhouse.io/v1/boards/perplexity/jobs' },
  { name: 'Replit', ashby: 'https://api.ashbyhq.com/posting-api/job-board/replit', gh: 'https://boards-api.greenhouse.io/v1/boards/replit/jobs' },
  { name: 'Cohere', ashby: 'https://api.ashbyhq.com/posting-api/job-board/cohere', lever: 'https://api.lever.co/v0/postings/cohere?mode=json' },
  { name: 'Scale AI', gh: 'https://boards-api.greenhouse.io/v1/boards/scaleai/jobs', lever: 'https://api.lever.co/v0/postings/scaleai?mode=json' },
];

async function check() {
  for (const c of candidates) {
    for (const [type, url] of Object.entries(c)) {
      if (type === 'name') continue;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data: any = await res.json();
          const count = Array.isArray(data) ? data.length : (data.jobs?.length || data.content?.length || data.jobsPostings?.length || 0);
          if (count > 0) {
            console.log(`[VERIFIED LIVE] ${c.name} on ${type.toUpperCase()}: count=${count} url=${url}`);
          }
        }
      } catch (e) {}
    }
  }
}
check();
