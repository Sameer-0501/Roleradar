import { getDb } from './src/database/connection.js';
import { sql } from 'drizzle-orm';
import { schema } from './src/database/index.js';

async function run() {
  const db = getDb();

  // Find the specific user preference matching "fresher" and "india" locations
  const prefsQuery = await db.execute(sql`
    SELECT p.user_id, p.locations, p.roles, p.experience_level, p.timezone, p.email_alerts_enabled, p.instant_notifications, p.daily_digest, u.email
    FROM user_preferences p
    JOIN users u ON u.id = p.user_id
    WHERE p.experience_level = 'FRESHER'
  `);
  
  // Filter for Indian locations in JSON
  const targetUser = prefsQuery.rows.find((r: any) => {
    const locs = r.locations as string[];
    return locs && locs.some(l => l.toLowerCase().includes('india') || l.toLowerCase().includes('bengaluru') || l.toLowerCase().includes('hyderabad') || l.toLowerCase().includes('pune'));
  });

  if (!targetUser) {
    console.log('No user found matching fresher + Indian locations.');
    process.exit(0);
  }

  console.log('Target User Email:', targetUser.email);
  console.log('User Preferences:', targetUser);

  // Check recent notifications for this user
  const recentNotifications = await db.execute(sql`
    SELECT notification_type, delivery_status, created_at, sent_at
    FROM notifications
    WHERE user_id = ${targetUser.user_id}
    ORDER BY created_at DESC
    LIMIT 20
  `);

  console.log('Recent Notifications:', recentNotifications.rows);

  // Check pending jobs specifically
  const pendingJobs = await db.execute(sql`
    SELECT count(*)
    FROM notifications
    WHERE user_id = ${targetUser.user_id} AND delivery_status = 'PENDING' AND notification_type = 'INSTANT_JOB'
  `);
  
  console.log('Pending Instant Jobs:', pendingJobs.rows[0].count);

  process.exit(0);
}

run().catch(console.error);
