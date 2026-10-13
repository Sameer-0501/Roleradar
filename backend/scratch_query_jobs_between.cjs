const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT count(*) FROM jobs WHERE created_at > '2026-10-04T11:00:00Z' AND created_at < '2026-10-04T13:30:00Z'").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
