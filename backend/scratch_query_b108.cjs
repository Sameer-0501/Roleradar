const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT count(*) FROM notifications WHERE user_id = '9c5fba41-dc88-4378-b05b-dab3f699ac8e' AND delivery_status = 'PENDING'").then(res => {
  console.log('Pending for b10854752@gmail.com:', res.rows[0].count);
  pool.end();
}).catch(console.error);
