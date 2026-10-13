import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { gte, lte, and } from 'drizzle-orm';

async function run() {
  const db = getDb();
  
  // 13:40 UTC to 15:00 UTC covers 19:10 IST to 20:30 IST
  const startTime = new Date('2026-09-16T13:40:00Z');
  const endTime = new Date('2026-09-16T15:00:00Z');
  
  const notifs = await db.query.notifications.findMany({
    where: and(
      gte(schema.notifications.created_at, startTime),
      lte(schema.notifications.created_at, endTime)
    ),
    with: {
      user: true,
      job: {
        with: { company: true }
      }
    }
  });

  console.log('--- NOTIFICATIONS ---');
  for (const n of notifs) {
    if (!n.user.email.endsWith('@beta.local')) {
      console.log(JSON.stringify({
        notification_id: n.id,
        user_id: n.user.id,
        user_email: n.user.email,
        job_id: n.job?.id,
        job_title: n.job?.title,
        company: n.job?.company?.name,
        type: n.notification_type,
        delivery_status: n.delivery_status,
        attempt_count: n.attempt_count,
        created_at: n.created_at,
        last_attempted_at: n.last_attempted_at,
        sent_at: n.sent_at,
        provider_message_id: n.provider_message_id,
        idempotency_key: n.idempotency_key
      }, null, 2));
    }
  }
  
  await closeConnection();
}

run().catch(console.error);
