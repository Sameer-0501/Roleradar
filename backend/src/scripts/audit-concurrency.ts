import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';

async function testConcurrency() {
  const db = getDb();
  
  // Pick an existing user ID (we'll just fetch the first user)
  const users = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (users.length === 0) {
    console.log('No users found.');
    process.exit(1);
  }
  const userId = users[0].id;
  
  const idempotencyKey = `CONCURRENCY_TEST_${Date.now()}`;
  
  console.log(`Starting concurrency test for DAILY_DIGEST without unique index...`);
  
  // Simulate what digest-worker does
  async function simulateDigestWorker() {
    // 1. SELECT
    const existing = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(eq(schema.notifications.idempotency_key, idempotencyKey))
      .limit(1);
      
    if (existing.length > 0) {
      return 'SKIPPED';
    }
    
    // Slight artificial delay to exacerbate the race
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 2. INSERT
    const [inserted] = await db
      .insert(schema.notifications)
      .values({
        user_id: userId,
        notification_type: 'DAILY_DIGEST',
        delivery_status: 'PENDING', // Don't actually send email
        idempotency_key: idempotencyKey,
      })
      .returning({ id: schema.notifications.id });
      
    return `INSERTED ${inserted.id}`;
  }
  
  // Run two concurrent attempts
  const results = await Promise.all([
    simulateDigestWorker(),
    simulateDigestWorker()
  ]);
  
  console.log('Results of concurrent execution:', results);
  
  // Check how many actually exist
  const finalCheck = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(eq(schema.notifications.idempotency_key, idempotencyKey));
    
  console.log(`Total durable records created: ${finalCheck.length}`);
  
  if (finalCheck.length > 1) {
    console.log('RACE CONDITION CONFIRMED: Multiple records created.');
  } else {
    console.log('SAFE: Only one record created.');
  }

  process.exit(0);
}

testConcurrency().catch(err => {
  console.error(err);
  process.exit(1);
});
