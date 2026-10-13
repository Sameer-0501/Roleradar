const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT id, idempotency_key, created_at, delivery_status, failure_reason FROM notifications WHERE notification_type = 'WINDOWED_DIGEST' AND idempotency_key LIKE '%16:30%' ORDER BY created_at DESC LIMIT 10").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
