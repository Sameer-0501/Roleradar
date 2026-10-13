import fs from 'fs';

async function run() {
  const urls = ['https://careers.myntra.com/', 'https://careers.myntra.com/jobs/'];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const matches = [...text.matchAll(/href=["']([^"']+)["']/gi)];
      console.log(`\n\n=== LINKS IN ${url} ===`);
      for (const m of matches) {
        if (m[1].startsWith('http') || m[1].startsWith('/')) {
          console.log(m[1]);
        }
      }
    } catch (e) {
      console.log(`Failed to fetch ${url}: ${e}`);
    }
  }
}
run();
