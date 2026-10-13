const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('turbohire') || url.includes('careerpage')) {
      if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
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

  console.log('Navigating to Flipkart Turbohire...');
  await page.goto('https://flipkart.turbohire.co/careerpage/4d757ba0-3d57-448a-b82c-238ed87ac90f', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log('Navigation timeout', e.message));
  
  await page.waitForTimeout(5000);

  await browser.close();
})();
