const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT user_id, count(*) FROM notifications WHERE notification_type = 'INSTANT_JOB' AND delivery_status = 'PENDING' GROUP BY user_id").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
