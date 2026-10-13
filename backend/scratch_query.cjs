const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT id, delivery_status, failure_reason, idempotency_key, created_at, last_attempted_at FROM notifications WHERE notification_type = 'WINDOWED_DIGEST' ORDER BY created_at DESC LIMIT 5").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
