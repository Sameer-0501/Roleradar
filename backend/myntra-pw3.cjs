const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = new Set();
  
  page.on('request', request => {
    requests.add(request.url());
  });

  console.log('Navigating to Myntra Jobs...');
  await page.goto('https://jobs.myntra.com/home', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(10000);

  console.log('\n=== OBSERVED URLS ===');
  for (const req of requests) {
    if (req.includes('io.spire2grow.com') || req.includes('api') || req.includes('job') || req.includes('search')) {
       console.log(req);
    }
  }

  await browser.close();
})();
