const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = new Set();
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('search') || url.includes('job') || url.includes('phenom') || url.includes('workday') || url.includes('taleo')) {
      if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
        requests.add(url);
        try {
          const body = await response.json();
          console.log(`\n\n=== RESPONSE FROM ${url} ===`);
          console.log(JSON.stringify(body, null, 2).substring(0, 500));
        } catch (e) {
          // not json
        }
      }
    }
  });

  console.log('Navigating to Cognizant Careers...');
  await page.goto('https://careers.cognizant.com/global/en/search-results', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('Navigation timeout', e.message));
  
  await page.waitForTimeout(5000);
  
  console.log('\n=== OBSERVED URLS ===');
  for (const req of requests) {
    console.log(req);
  }

  await browser.close();
})();
