const { Client } = require('pg');
async function run() {
  const client = new Client({
    connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs'
  });
  await client.connect();
  const res = await client.query(`
    SELECT * FROM jobs 
    WHERE company_id = (SELECT id FROM companies WHERE name ILIKE '%phonepe%')
  `);
  
  // A job might be "classified" as non-India by the matching service if its country is not 'IN'
  const nonIndiaJobs = res.rows.filter(j => j.country !== 'IN');
  console.log("Total non-IN country:", nonIndiaJobs.length);
  console.log(JSON.stringify(nonIndiaJobs, null, 2));
  await client.end();
}
run().catch(console.error);
