import fetch from 'node-fetch';

async function testAvature() {
  const urls = [
    'https://jobs.cisco.com/jobs/SearchJobs',
    'https://jobs.siemens.com/jobs/SearchJobs'
  ];

  for (const url of urls) {
    console.log(`Testing ${url}`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ "limit": 10 })
      });
      console.log(`Status: ${res.status}`);
      const text = await res.text();
      console.log(`Response snippet: ${text.substring(0, 150)}`);
    } catch (e: any) {
      console.log(`Error: ${e.message}`);
    }
  }
}
testAvature();
