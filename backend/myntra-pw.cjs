const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = new Set();
  
  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('graphql') || url.includes('jobs') || url.includes('recruit')) {
      requests.add(url);
    }
  });

  console.log('Navigating to Myntra Jobs...');
  await page.goto('https://jobs.myntra.com/home', { waitUntil: 'networkidle' });
  
  // Wait a bit for flutter to load and make requests
  await page.waitForTimeout(10000);

  console.log('\n=== OBSERVED API CALLS ===');
  for (const req of requests) {
    console.log(req);
  }

  await browser.close();
})();
