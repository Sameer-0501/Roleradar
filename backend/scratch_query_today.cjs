const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT id, user_id, notification_type, delivery_status, failure_reason, idempotency_key, created_at, last_attempted_at FROM notifications WHERE created_at >= '2026-10-04T11:00:00Z'").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
