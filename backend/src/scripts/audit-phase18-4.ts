import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { sql } from 'drizzle-orm';
import { performance } from 'perf_hooks';
import { scheduler } from '../scheduler/scheduler.js';
import { notificationWorker } from '../notifications/notification-worker.js';
import { reverificationWorker } from '../jobs/reverification-worker.js';
import { dailyDigestWorker } from '../notifications/digest-worker.js';

async function measureQuery(queryName: string, queryFn: () => Promise<any>) {
  const start = performance.now();
  await queryFn();
  const end = performance.now();
  console.log(`[Metric] ${queryName}: ${(end - start).toFixed(2)} ms`);
}

async function runBenchmark() {
  console.log('=========================================');
  console.log('PHASE 18.4 BASELINE MEASUREMENTS');
  console.log('=========================================');
  
  const db = getDb();
  
  // 1. Database Pool Stats
  console.log('\n--- 1. Database Pool Info ---');
  const poolInfo = await db.execute(sql`
    SELECT count(*) as active_connections
    FROM pg_stat_activity
    WHERE datname = current_database();
  `);
  console.log(`Active connections: ${(poolInfo as any).rows?.[0]?.active_connections ?? poolInfo[0]?.active_connections}`);
  
  // 2. Notification Worker Baseline
  console.log('\n--- 2. Notification Worker Performance ---');
  const startNotif = performance.now();
  const notifResult = await notificationWorker.processBatch();
  const endNotif = performance.now();
  console.log(`Time taken: ${(endNotif - startNotif).toFixed(2)} ms`);
  console.log(`Processed: ${notifResult.processed}, Successful: ${notifResult.successful}, Failed: ${notifResult.failed}`);
  
  // 3. Reverification Worker Baseline
  console.log('\n--- 3. Reverification Worker Performance ---');
  const startReverif = performance.now();
  const reverifResult = await reverificationWorker.runReverificationCycle({ batchSize: 25 });
  const endReverif = performance.now();
  console.log(`Time taken: ${(endReverif - startReverif).toFixed(2)} ms`);
  console.log(`Checked: ${reverifResult.checked}, Active: ${reverifResult.confirmedActive}, Closed: ${reverifResult.confirmedClosed}`);

  // 4. Digest Worker Baseline
  console.log('\n--- 4. Digest Worker Performance ---');
  const startDigest = performance.now();
  const digestResult = await dailyDigestWorker.processDailyDigests(true); // force run
  const endDigest = performance.now();
  console.log(`Time taken: ${(endDigest - startDigest).toFixed(2)} ms`);
  console.log(`Evaluated: ${digestResult.evaluated}, Sent: ${digestResult.sent}, Skipped: ${digestResult.skipped}`);

  console.log('\nDone.');
  await closeConnection();
  process.exit(0);
}

runBenchmark().catch(console.error);
