import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    const db = getDb();
    const digests = await db.execute(sql`
      SELECT id, delivery_status, created_at, sent_at, failure_reason 
      FROM notifications 
      WHERE notification_type = 'WINDOWED_DIGEST' 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log('--- RECENT DIGESTS ---');
    console.table(digests.rows);

    await db.execute(sql`UPDATE user_preferences SET timezone = 'Asia/Kolkata' WHERE user_id = 'ee9c7230-e25f-4163-9675-b6c29e7b013a'`);
    const prefs = await db.execute(sql`SELECT timezone, instant_notifications, daily_digest, email_alerts_enabled FROM user_preferences WHERE user_id = 'ee9c7230-e25f-4163-9675-b6c29e7b013a'`);
    console.log('\n--- USER PREFS (UPDATED) ---');
    console.table(prefs.rows);

    const budget = await db.execute(sql`SELECT * FROM email_daily_budget`);
    console.log('\n--- DAILY BUDGET ---');
    console.table(budget.rows);
    
    // Check timezone output from worker
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    console.log('\n--- CURRENT TIME FORMATTER OUTPUT ---');
    console.log(formatter.formatToParts(new Date()));
    
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

run();
