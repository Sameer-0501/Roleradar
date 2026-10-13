const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kcarrier:kcarrier_dev_password@127.0.0.1:5433/kcarrier_jobs' });
pool.query("SELECT id, idempotency_key, created_at, failure_reason FROM notifications WHERE notification_type = 'WINDOWED_DIGEST' AND delivery_status != 'SENT'").then(res => {
  console.log(res.rows);
  pool.end();
}).catch(console.error);
