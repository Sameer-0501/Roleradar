import 'dotenv/config';

async function checkUrl(url: string) {
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log(`[${res.status}] ${url} -> ${res.headers.get('location') || ''}`);
  } catch (e: any) {
    console.log(`[ERROR] ${url}: ${e.message}`);
  }
}

async function checkWorkday(tenant: string) {
  const url = `https://${tenant}.wd1.myworkdayjobs.com/wday/cxs/${tenant}/External/jobs`;
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({limit:1}) });
    if (res.ok) console.log(`[WORKDAY] ${tenant} is ACTIVE Workday`);
    else console.log(`[WORKDAY] ${tenant} failed: ${res.status}`);
  } catch (e: any) {
    console.log(`[WORKDAY] ${tenant} error: ${e.message}`);
  }
}

async function run() {
  console.log('--- Checking generic ATS urls ---');
  await checkUrl('https://wipro.icims.com');
  await checkUrl('https://wipro.taleo.net');
  await checkUrl('https://capgemini.taleo.net');
  await checkUrl('https://infosys.taleo.net');
  await checkUrl('https://hcl.icims.com');
  await checkUrl('https://tcs.taleo.net');

  console.log('\n--- Checking Workday ---');
  await checkWorkday('cognizant');
  await checkWorkday('capgemini');
  await checkWorkday('wipro');
  await checkWorkday('infosys');
  await checkWorkday('hcl');
}

run();
