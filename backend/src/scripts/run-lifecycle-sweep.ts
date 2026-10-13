/**
 * Script: Run Job Lifecycle Sweep
 *
 * Executes the Tiered Job Lifecycle Policy:
 * 1. Checks baseline stats (active < 14d, 15-30d, > 30d, closed).
 * 2. Auto-closes stale jobs older than maxActiveDays (30 days).
 * 3. Prunes unreferenced closed jobs older than purgeRetentionDays (60 days).
 * 4. Displays before/after comparison.
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import {
  getJobLifecycleStats,
  runJobLifecycleSweep,
} from '../jobs/job-lifecycle-service.js';
import { config } from '../config/env.js';

async function main() {
  console.log('====================================================');
  console.log('       ROLERADAR — JOB LIFECYCLE SWEEP RUNNER       ');
  console.log('====================================================');
  console.log(`Configured Job Max Active Days: ${config.jobMaxActiveDays} days`);
  console.log(`Configured Job Purge Retention: ${config.jobPurgeRetentionDays} days`);
  console.log(`Configured Recent Window Days:  ${config.recentJobWindowDays} days`);

  console.log('\n--- 1. BASELINE STATS BEFORE SWEEP ---');
  const before = await getJobLifecycleStats();
  console.table({
    'Total Jobs': before.totalJobs,
    'Active Jobs': before.activeCount,
    'Active (<= 14 days)': before.activeWithin14Days,
    'Active (15 to 30 days)': before.active15to30Days,
    'Active (> 30 days - STALE)': before.activeOlderThan30Days,
    'Closed Jobs': before.closedCount,
    'Jobs with User Interactions': before.jobsWithUserInteractions,
  });

  console.log('\n--- 2. EXECUTING LIFECYCLE SWEEP ---');
  const sweep = await runJobLifecycleSweep();
  console.log(`✓ Stale Jobs Auto-Closed: ${sweep.closedCount}`);
  console.log(`✓ Unreferenced Jobs Purged: ${sweep.purgedCount}`);
  console.log(`✓ Sweep Duration: ${sweep.durationMs}ms`);

  console.log('\n--- 3. UPDATED STATS AFTER SWEEP ---');
  const after = await getJobLifecycleStats();
  console.table({
    'Total Jobs': after.totalJobs,
    'Active Jobs': after.activeCount,
    'Active (<= 14 days)': after.activeWithin14Days,
    'Active (15 to 30 days)': after.active15to30Days,
    'Active (> 30 days - STALE)': after.activeOlderThan30Days,
    'Closed Jobs': after.closedCount,
    'Jobs with User Interactions': after.jobsWithUserInteractions,
  });

  console.log('====================================================');
  console.log('       SWEEP COMPLETE — DATABASE IS HYGIENIC        ');
  console.log('====================================================');

  await closeConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error during lifecycle sweep:', err);
  await closeConnection();
  process.exit(1);
});
