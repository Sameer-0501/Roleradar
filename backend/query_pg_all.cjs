const { Client } = require('pg');
async function run() {
  const client = new Client({
    connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs'
  });
  await client.connect();
  const res = await client.query(`
    SELECT external_job_id, title, location, official_url 
    FROM jobs 
    WHERE company_id = (SELECT id FROM companies WHERE name ILIKE '%phonepe%')
  `);
  
  const nonIndiaJobs = res.rows.filter(j => {
    if (!j.location) return true; // no location means non-India?
    return !j.location.endsWith(', IN');
  });
  
  console.log("Total non-India:", nonIndiaJobs.length);
  console.log(JSON.stringify(nonIndiaJobs, null, 2));
  await client.end();
}
run().catch(console.error);
