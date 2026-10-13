import 'dotenv/config';
import { getDb } from './src/database/connection.js';
async function run() {
  const db = getDb();
  const jobs = await db.execute('SELECT status, count(*) FROM jobs GROUP BY status');
  const notifs = await db.execute('SELECT delivery_status, count(*) FROM notifications GROUP BY delivery_status');
  console.log('JOBS:', jobs.rows);
  console.log('NOTIFS:', notifs.rows);
  process.exit(0);
}
run();
