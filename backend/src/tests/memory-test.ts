import 'dotenv/config';
import { findMatchesForUser } from '../matching/matching-service.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import fs from 'fs';

async function run() {
  const db = getDb();
  
  const users = await db.select().from(schema.users).limit(1);
  if (users.length === 0) {
    console.error("No users found.");
    process.exit(1);
  }
  const userId = users[0].id;
  
  // Force GC before measurement if possible
  if (global.gc) {
    global.gc();
  }

  const startMem = process.memoryUsage();
  const startTime = performance.now();

  const res = await findMatchesForUser(userId, { limit: 100 });

  const endTime = performance.now();
  const endMem = process.memoryUsage();

  const heapDiff = endMem.heapUsed - startMem.heapUsed;
  
  const output = {
    startHeapUsed: Math.round(startMem.heapUsed / 1024 / 1024) + ' MB',
    endHeapUsed: Math.round(endMem.heapUsed / 1024 / 1024) + ' MB',
    heapDiff: Math.round(heapDiff / 1024 / 1024) + ' MB',
    executionTimeMs: Math.round(endTime - startTime),
    totalMatches: res.totalMatches,
  };

  fs.writeFileSync('memory-results-before.json', JSON.stringify(output, null, 2));
  console.log("Memory baseline captured in memory-results-before.json");
  console.log(output);
  process.exit(0);
}

run().catch(console.error);
