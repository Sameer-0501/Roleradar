const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT * FROM notifications WHERE user_id = '9c5fba41-dc88-4378-b05b-dab3f699ac8e' AND created_at >= '2026-10-04T00:00:00Z'").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
