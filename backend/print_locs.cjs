const { Client } = require('pg');
async function run() {
  const client = new Client({
    connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs'
  });
  await client.connect();
  const res = await client.query(`
    SELECT location
    FROM jobs 
    WHERE company_id = (SELECT id FROM companies WHERE name ILIKE '%phonepe%')
  `);
  
  const counts = {};
  res.rows.forEach(j => {
    counts[j.location] = (counts[j.location] || 0) + 1;
  });
  
  console.log(JSON.stringify(counts, null, 2));
  await client.end();
}
run().catch(console.error);
