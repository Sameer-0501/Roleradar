async function test() {
  try {
    let res = await fetch('https://accenture.wd3.myworkdayjobs.com/wday/cxs/accenture/Accenture_Careers/jobs', {
      method: 'POST',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({})
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e: any) { console.error(e.message); }
} test();
