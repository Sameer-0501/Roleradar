import 'dotenv/config';

interface Target {
  name: string;
  urls: { type: string; url: string; method?: string; body?: any }[];
}

const TARGETS: Target[] = [
  {
    name: 'Paytm',
    urls: [
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/paytm?mode=json' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/one97?mode=json' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/paytm/jobs' },
    ],
  },
  {
    name: 'Razorpay',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/razorpay/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/razorpaysoftware/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/razorpay?mode=json' },
      { type: 'ASHBY', url: 'https://api.ashbyhq.com/posting-api/job-board/razorpay' },
    ],
  },
  {
    name: 'PhonePe',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/phonepe/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/phonepe?mode=json' },
      { type: 'ASHBY', url: 'https://api.ashbyhq.com/posting-api/job-board/phonepe' },
    ],
  },
  {
    name: 'Zepto',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/zepto/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/kiranakart/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/zepto?mode=json' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/zeptonow?mode=json' },
    ],
  },
  {
    name: 'Swiggy',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/swiggy/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/bundl/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/swiggy?mode=json' },
    ],
  },
  {
    name: 'Observe.AI',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/observeai/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/observe/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/observeai?mode=json' },
    ],
  },
  {
    name: 'Uniphore',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/uniphore/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/uniphore?mode=json' },
    ],
  },
  {
    name: 'Yellow.ai',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/yellowai/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/yellowmessenger/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/yellowai?mode=json' },
    ],
  },
  {
    name: 'Fractal',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/fractal/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/fractalanalytics/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/fractal?mode=json' },
    ],
  },
  {
    name: 'Whatfix',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/whatfix/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/whatfix?mode=json' },
    ],
  },
  {
    name: 'Hasura',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/hasura/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/hasura?mode=json' },
      { type: 'ASHBY', url: 'https://api.ashbyhq.com/posting-api/job-board/hasura' },
    ],
  },
  {
    name: 'Cashfree',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/cashfree/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/cashfreepayments/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/cashfree?mode=json' },
    ],
  },
  {
    name: 'Pine Labs',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/pinelabs/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/pinelabs?mode=json' },
      { type: 'SMARTRECRUITERS', url: 'https://api.smartrecruiters.com/v1/companies/pinelabs/postings' },
    ],
  },
  {
    name: 'Krutrim',
    urls: [
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/krutrim/jobs' },
      { type: 'GREENHOUSE', url: 'https://boards-api.greenhouse.io/v1/boards/olakrutrim/jobs' },
      { type: 'LEVER', url: 'https://api.lever.co/v0/postings/krutrim?mode=json' },
    ],
  },
  {
    name: 'Qualcomm',
    urls: [
      {
        type: 'WORKDAY',
        url: 'https://qualcomm.wd5.myworkdayjobs.com/wday/cxs/qualcomm/External/jobs',
        method: 'POST',
        body: { limit: 20, offset: 0, searchText: 'India' },
      },
    ],
  },
  {
    name: 'ServiceNow',
    urls: [
      {
        type: 'WORKDAY',
        url: 'https://servicenow.wd1.myworkdayjobs.com/wday/cxs/servicenow/Careers/jobs',
        method: 'POST',
        body: { limit: 20, offset: 0, searchText: 'India' },
      },
    ],
  },
  {
    name: 'Walmart Global Tech',
    urls: [
      {
        type: 'WORKDAY',
        url: 'https://walmart.wd5.myworkdayjobs.com/wday/cxs/walmart/WalmartGlobalTech/jobs',
        method: 'POST',
        body: { limit: 20, offset: 0, searchText: 'India' },
      },
    ],
  },
  {
    name: 'AMD',
    urls: [
      {
        type: 'WORKDAY',
        url: 'https://amd.wd1.myworkdayjobs.com/wday/cxs/amd/AMD_Careers/jobs',
        method: 'POST',
        body: { limit: 20, offset: 0, searchText: 'India' },
      },
    ],
  },
  {
    name: 'Intel',
    urls: [
      {
        type: 'WORKDAY',
        url: 'https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External/jobs',
        method: 'POST',
        body: { limit: 20, offset: 0, searchText: 'India' },
      },
    ],
  },
];

async function checkUrl(name: string, u: { type: string; url: string; method?: string; body?: any }) {
  try {
    const opts: any = {
      method: u.method || 'GET',
      headers: u.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: u.body ? JSON.stringify(u.body) : undefined,
      signal: AbortSignal.timeout(4000),
    };
    const res = await fetch(u.url, opts);
    if (res.ok) {
      const data: any = await res.json();
      let count = 0;
      if (Array.isArray(data)) count = data.length;
      else if (Array.isArray(data.jobs)) count = data.jobs.length;
      else if (Array.isArray(data.content)) count = data.content.length;
      else if (Array.isArray(data.jobPostings)) count = data.total || data.jobPostings.length;
      console.log(`[SUCCESS] ${name.padEnd(20)} ${u.type.padEnd(12)} -> ${count} jobs | ${u.url}`);
    } else {
      console.log(`[FAIL ${res.status}] ${name.padEnd(20)} ${u.type.padEnd(12)} -> ${u.url}`);
    }
  } catch (err: any) {
    console.log(`[ERR] ${name.padEnd(20)} ${u.type.padEnd(12)} -> ${err.message}`);
  }
}

async function run() {
  console.log('=== TARGETED COMPANY ATS PROBE ===');
  for (const target of TARGETS) {
    for (const u of target.urls) {
      await checkUrl(target.name, u);
    }
  }
}

run();
