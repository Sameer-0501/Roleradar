const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('spire2grow') || url.includes('api')) {
      try {
        const body = await response.json();
        console.log(`\n\n=== RESPONSE FROM ${url} ===`);
        console.log(JSON.stringify(body, null, 2).substring(0, 500));
      } catch (e) {
        // Not JSON
      }
    }
  });

  console.log('Navigating to Myntra Jobs...');
  await page.goto('https://jobs.myntra.com/home', { waitUntil: 'networkidle' });
  
  // Wait a bit to let APIs fire
  await page.waitForTimeout(5000);

  // Maybe we need to click a "Search Jobs" button? Let's check for buttons...
  // In Flutter Web, everything is rendered on a canvas, but sometimes there are semantics nodes.
  
  await browser.close();
})();
