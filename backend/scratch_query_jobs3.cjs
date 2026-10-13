const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT job_id FROM notifications WHERE digest_id = '77898ae7-c37f-45c4-b2cc-4566029b3dd4' LIMIT 5").then(res => {
  const ids = res.rows.map(r => r.job_id).map(id => "'" + id + "'").join(',');
  return pool.query("SELECT id, title, company_id, external_job_id FROM jobs WHERE id IN (" + ids + ")");
}).then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
