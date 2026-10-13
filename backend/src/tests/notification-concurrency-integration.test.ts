import { config } from 'dotenv';
config();
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('Phase 15 — Notification Concurrency Idempotency (Real DB)', () => {
  let testUserId: string;

  beforeAll(async () => {
    const db = getDb();
    
    // Create a temporary user for this test so we don't pollute real data
    const [user] = await db.insert(schema.users).values({
      email: `test.concurrency.${Date.now()}@example.com`,
      name: 'Concurrency Test User',
      email_verified: true
    }).returning({ id: schema.users.id });
    
    testUserId = user.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (testUserId) {
      await db.delete(schema.notifications).where(eq(schema.notifications.user_id, testUserId));
      await db.delete(schema.users).where(eq(schema.users.id, testUserId));
    }
  });

  it('8. Two concurrent daily-digest creation attempts -> exactly ONE durable notification record exists', async () => {
    const db = getDb();
    const idempotencyKey = `CONCURRENCY_TEST_${Date.now()}`;
    
    // Simulate what digest-worker does concurrently
    async function simulateDigestWorker() {
      // 1. SELECT check (what the worker normally does)
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
      
      try {
        // 2. INSERT
        const [inserted] = await db
          .insert(schema.notifications)
          .values({
            user_id: testUserId,
            notification_type: 'DAILY_DIGEST',
            delivery_status: 'PENDING',
            idempotency_key: idempotencyKey,
          })
          .returning({ id: schema.notifications.id });
          
        return `INSERTED ${inserted.id}`;
      } catch (error: any) {
        // If the unique constraint catches it, it will throw a duplicate key error
        if (error.code === '23505' || error.cause?.code === '23505' || error.message?.includes('23505') || error.message?.includes('duplicate key value')) {
          return 'CONSTRAINT_VIOLATION';
        }
        throw error;
      }
    }
    
    // Run two concurrent attempts
    const results = await Promise.all([
      simulateDigestWorker(),
      simulateDigestWorker()
    ]);
    
    // Check how many actually exist
    const finalCheck = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(eq(schema.notifications.idempotency_key, idempotencyKey));
      
    // Exactly one must be created durably in the database
    expect(finalCheck.length).toBe(1);
    
    // One should have succeeded, the other should have either skipped or hit the constraint
    expect(results).toContainEqual(expect.stringContaining('INSERTED'));
    expect(
      results.includes('SKIPPED') || results.includes('CONSTRAINT_VIOLATION')
    ).toBe(true);
  });

  describe('Phase 16.7 — Worker Concurrency (FOR UPDATE SKIP LOCKED)', () => {
    it('1. Two workers concurrently process the same PENDING notification -> only one acquires the row', async () => {
      const db = getDb();
      const idempotencyKey = `WORKER_RACE_${Date.now()}`;
      
      // Clear all existing PENDING notifications to isolate our totalProcessed count
      await db.delete(schema.notifications).where(eq(schema.notifications.delivery_status, 'PENDING'));

      const [inserted] = await db.insert(schema.notifications).values({
        user_id: testUserId,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        idempotency_key: idempotencyKey,
      }).returning({ id: schema.notifications.id });

      const { NotificationWorker } = await import('../notifications/notification-worker.js');
      const worker1 = new NotificationWorker();
      const worker2 = new NotificationWorker();

      // Run two worker batches simultaneously from different instances
      const results = await Promise.all([
        worker1.processBatch(),
        worker2.processBatch(),
      ]);

      const totalProcessed = results[0].processed + results[1].processed;
      expect(totalProcessed).toBe(1);

      // Verify final state of our SPECIFIC inserted row
      const finalCheck = await db.select().from(schema.notifications).where(eq(schema.notifications.id, inserted.id));
      // Without a valid job attached, the worker sets it to PROCESSING and skips the instant job flow. 
      // It will remain in PROCESSING until the stale timeout resets it.
      expect(finalCheck[0].delivery_status).toBe('PROCESSING');
    });

    it('2. Two workers concurrently process multiple PENDING notifications -> no row is acquired twice', async () => {
      const db = getDb();
      const idPrefix = `WORKER_MULTI_${Date.now()}`;

      await db.delete(schema.notifications).where(eq(schema.notifications.delivery_status, 'PENDING'));

      // Insert 5 notifications
      const toInsert = Array.from({ length: 5 }).map((_, i) => ({
        user_id: testUserId,
        notification_type: 'INSTANT_JOB' as const,
        delivery_status: 'PENDING' as const,
        idempotency_key: `${idPrefix}_${i}`,
      }));

      const inserted = await db.insert(schema.notifications).values(toInsert).returning({ id: schema.notifications.id });
      const ids = inserted.map(i => i.id);

      const { NotificationWorker } = await import('../notifications/notification-worker.js');
      const worker1 = new NotificationWorker();
      const worker2 = new NotificationWorker();
      const worker3 = new NotificationWorker();

      // Promise.all to genuinely concurrently trigger batches
      const results = await Promise.all([
        worker1.processBatch(),
        worker2.processBatch(),
        worker3.processBatch(),
      ]);

      const totalProcessed = results.reduce((acc, curr) => acc + curr.processed, 0);
      expect(totalProcessed).toBe(5); // All 5 should be processed exactly once total across workers

      // They should all be marked PROCESSING
      const finalCheck = await db.select({ 
          status: schema.notifications.delivery_status,
          attempts: schema.notifications.attempt_count
        })
        .from(schema.notifications)
        .where(inArray(schema.notifications.id, ids));

      for (const row of finalCheck) {
        expect(row.status).toBe('PROCESSING');
      }
      
      // Cleanup
      await db.delete(schema.notifications).where(inArray(schema.notifications.id, ids));
    });
  });
});
