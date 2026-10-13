async function test() {
  try {
    let res = await fetch('https://accenture.wd3.myworkdayjobs.com/Accenture_Careers', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    console.log(res.status);
    let html = await res.text();
    const match = html.match(/"clientSite":"([^"]+)"/);
    const tenantMatch = html.match(/"tenant":"([^"]+)"/);
    console.log('clientSite:', match ? match[1] : 'not found');
    console.log('tenant:', tenantMatch ? tenantMatch[1] : 'not found');
  } catch(e: any) { console.error(e.message); }
} test();
