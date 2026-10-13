const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT * FROM notifications WHERE user_id = 'cd4d7ef4-1b1d-4357-941e-3d8f7ec480b3' AND notification_type = 'WINDOWED_DIGEST'").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
