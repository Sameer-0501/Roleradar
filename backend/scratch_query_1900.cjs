const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT id, user_id, idempotency_key, created_at, delivery_status, failure_reason FROM notifications WHERE notification_type = 'WINDOWED_DIGEST' AND created_at >= '2026-10-04T00:00:00Z' ORDER BY created_at DESC").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
