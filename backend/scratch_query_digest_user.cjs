const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT DISTINCT user_id FROM notifications WHERE digest_id = '77898ae7-c37f-45c4-b2cc-4566029b3dd4'").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
