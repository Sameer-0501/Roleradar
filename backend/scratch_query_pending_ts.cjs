const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT id, created_at, job_id FROM notifications WHERE user_id = 'ee9c7230-e25f-4163-9675-b6c29e7b013a' AND delivery_status = 'PENDING' AND notification_type = 'INSTANT_JOB'").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
