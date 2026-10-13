const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/roleradar'
  });
  await client.connect();
  
  const res = await client.query(`
    SELECT external_job_id, title, location, official_url 
    FROM jobs 
    WHERE company_id = (SELECT id FROM companies WHERE name ILIKE '%phonepe%')
  `);
  
  const nonIndiaJobs = res.rows.filter(j => {
    const loc = j.location.toLowerCase();
    return !loc.includes('india') && !loc.includes('ind');
  });
  
  console.log(JSON.stringify(nonIndiaJobs, null, 2));
  await client.end();
}

run().catch(console.error);
