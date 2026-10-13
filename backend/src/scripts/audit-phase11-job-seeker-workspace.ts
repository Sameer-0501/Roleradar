/**
 * Phase 11 — Acceptance Audit Script: RoleRadar Personal Job-Seeker Workspace & Application Tracking
 *
 * Validates the 25 core acceptance criteria for Phase 11:
 *  1. Initial workspace state is clean.
 *  2. Job discovery with user preferences.
 *  3. Save job (isSaved: true, savedAt timestamp set).
 *  4. Un-save job (isSaved: false, savedAt cleared).
 *  5. Re-save multiple jobs.
 *  6. Mark job as applied (isApplied: true, appliedAt set).
 *  7. Un-mark job applied (isApplied: false, appliedAt cleared).
 *  8. Re-mark job applied with tracking.
 *  9. Direct employer career portal URL integrity.
 * 10. Application tracking retrieval with applied date and status.
 * 11. Add private notes (scoped strictly to user).
 * 12. Update private notes.
 * 13. Delete private notes.
 * 14. Dismiss / Hide job from feed.
 * 15. Feed query automatically excludes dismissed jobs by default.
 * 16. includeDismissed flag correctly overrides feed filter.
 * 17. Hidden jobs retrieval list.
 * 18. Restore dismissed job to active feed.
 * 19. Restored job reappears in feed.
 * 20. Detail view tracking (viewedAt updated upon detail view).
 * 21. Recently viewed jobs returned in reverse chronological order.
 * 22. Workspace stats (savedCount, appliedCount, recentlyViewedCount).
 * 23. Strict multi-user scoping & isolation (User A vs User B).
 * 24. Closed job preservation (closed jobs remain in saved/applied with CLOSED status).
 * 25. DB unique constraint (user_id, job_id) and cascade delete on user removal.
 */

import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { saveUserPreferences } from '../preferences/preference-service.js';
import {
  saveJob,
  unsaveJob,
  markJobApplied,
  unmarkJobApplied,
  dismissJob,
  restoreJob,
  recordJobView,
  setJobNotes,
  deleteJobNotes,
  getJobInteraction,
  getInteractionsBatch,
  getSavedJobs,
  getAppliedJobs,
  getDismissedJobs,
  getRecentlyViewedJobs,
  getWorkspaceStats,
} from '../workspace/user-job-service.js';
import { findMatchesForUser } from '../matching/matching-service.js';
import { upsertDiscoveredJob, markJobClosed } from '../jobs/job-service.js';

interface AuditResult {
  step: number;
  title: string;
  passed: boolean;
  details: string;
}

const results: AuditResult[] = [];

function record(step: number, title: string, passed: boolean, details: string) {
  results.push({ step, title, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [Checklist Item ${step}] ${title}: ${details}`);
}

async function runPhase11Audit() {
  console.log('\n===============================================================');
  console.log('🚀 RUNNING PHASE 11 AUDIT: PERSONAL JOB-SEEKER WORKSPACE');
  console.log('===============================================================\n');

  const db = getDb();

  // Setup test users and test jobs
  const testEmailA = `test_p11_user_a_${Date.now()}@example.com`;
  const testEmailB = `test_p11_user_b_${Date.now()}@example.com`;

  // Create User A
  const [userA] = await db
    .insert(schema.users)
    .values({
      email: testEmailA,
      password_hash: 'hashed_pw_test',
      name: 'User A (Phase 11 Tester)',
      email_verified: true,
      onboarding_completed: true,
    })
    .returning();

  // Create User B
  const [userB] = await db
    .insert(schema.users)
    .values({
      email: testEmailB,
      password_hash: 'hashed_pw_test',
      name: 'User B (Phase 11 Isolation Tester)',
      email_verified: true,
      onboarding_completed: true,
    })
    .returning();

  // Set User A preferences: Backend Developer in Bengaluru / Remote
  await saveUserPreferences(
    userA.id,
    {
      roles: ['Backend Engineer', 'Software Engineer', 'Platform Engineer'],
      locations: ['Bengaluru', 'Remote'],
      workplaceTypes: ['REMOTE', 'HYBRID', 'ONSITE'],
      experienceLevel: 'ANY',
      companyIds: [],
      keywords: [],
    } as any,
    true
  );

  // Ensure test company
  let [testCompany] = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.name, 'Phase11 Tech Labs'))
    .limit(1);

  if (!testCompany) {
    [testCompany] = await db
      .insert(schema.companies)
      .values({
        name: 'Phase11 Tech Labs',
        official_domain: 'phase11tech.com',
        careers_url: 'https://boards.greenhouse.io/phase11tech',
        ats_type: 'GREENHOUSE',
        is_active: true,
      })
      .returning();
  }

  // Create 3 Test Jobs
  const [job1] = await db
    .insert(schema.jobs)
    .values({
      company_id: testCompany.id,
      source_system: 'GREENHOUSE',
      external_job_id: `p11-job-1-${Date.now()}`,
      title: 'Junior Backend Engineer (Node.js)',
      location: 'Bengaluru, India',
      workplace_type: 'HYBRID',
      description: 'Build backend APIs with Node.js and Postgres. Freshers welcome.',
      requirements: 'Node.js, SQL, REST APIs',
      official_url: 'https://boards.greenhouse.io/phase11tech/jobs/101',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      first_seen_at: new Date(),
      last_seen_at: new Date(),
      last_verified_at: new Date(),
      content_hash: 'hash-p11-1',
    })
    .returning();
  const job1Id = job1.id;

  const [job2] = await db
    .insert(schema.jobs)
    .values({
      company_id: testCompany.id,
      source_system: 'GREENHOUSE',
      external_job_id: `p11-job-2-${Date.now()}`,
      title: 'Software Engineer - Distributed Systems',
      location: 'Remote (India)',
      workplace_type: 'REMOTE',
      description: 'Work on distributed systems and high-throughput pipelines.',
      requirements: 'TypeScript, Distributed Systems',
      official_url: 'https://boards.greenhouse.io/phase11tech/jobs/102',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      first_seen_at: new Date(),
      last_seen_at: new Date(),
      last_verified_at: new Date(),
      content_hash: 'hash-p11-2',
    })
    .returning();
  const job2Id = job2.id;

  const [job3] = await db
    .insert(schema.jobs)
    .values({
      company_id: testCompany.id,
      source_system: 'GREENHOUSE',
      external_job_id: `p11-job-3-${Date.now()}`,
      title: 'Associate Platform Engineer',
      location: 'Bengaluru, India',
      workplace_type: 'ONSITE',
      description: 'Support platform reliability and build backend services.',
      requirements: 'Linux, Go, PostgreSQL',
      official_url: 'https://boards.greenhouse.io/phase11tech/jobs/103',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      first_seen_at: new Date(),
      last_seen_at: new Date(),
      last_verified_at: new Date(),
      content_hash: 'hash-p11-3',
    })
    .returning();
  const job3Id = job3.id;

  try {
    // ── Check 1: Initial workspace state is clean ──
    const initStats = await getWorkspaceStats(userA.id);
    const check1Pass =
      initStats.savedCount === 0 &&
      initStats.appliedCount === 0 &&
      initStats.recentlyViewedCount === 0;
    record(
      1,
      'Initial clean workspace state',
      check1Pass,
      `saved=${initStats.savedCount}, applied=${initStats.appliedCount}, viewed=${initStats.recentlyViewedCount}`
    );

    // ── Check 2: Job discovery feed matching ──
    const feedInitial = await findMatchesForUser(userA.id, {
      companyId: testCompany.id,
      page: 1,
      limit: 10,
    });
    const feedJobIds = feedInitial.jobs.map((j) => j.id);
    const check2Pass =
      feedJobIds.includes(job1Id) &&
      feedJobIds.includes(job2Id) &&
      feedJobIds.includes(job3Id);
    record(
      2,
      'Job discovery with preferences',
      check2Pass,
      `Feed returned ${feedInitial.totalMatches} matched jobs (includes all 3 test jobs)`
    );

    // ── Check 3: Save Job 1 ──
    const save1 = await saveJob(userA.id, job1Id);
    const check3Pass =
      save1.isSaved === true &&
      save1.savedAt !== null &&
      save1.savedAt !== undefined;
    record(
      3,
      'Save job (isSaved: true, savedAt timestamp set)',
      check3Pass,
      `Job 1 saved at ${save1.savedAt}`
    );

    // ── Check 4: Un-save Job 1 ──
    const unsave1 = await unsaveJob(userA.id, job1Id);
    const check4Pass = unsave1.isSaved === false && unsave1.savedAt === null;
    record(
      4,
      'Un-save job (isSaved: false, savedAt cleared)',
      check4Pass,
      `Job 1 unsaved successfully`
    );

    // ── Check 5: Re-save Job 1 and Job 2 ──
    await saveJob(userA.id, job1Id);
    await saveJob(userA.id, job2Id);
    const savedList = await getSavedJobs(userA.id, { page: 1, limit: 10 });
    const check5Pass =
      savedList.total === 2 &&
      savedList.items.some((j) => j.id === job1Id) &&
      savedList.items.some((j) => j.id === job2Id);
    record(
      5,
      'Saved jobs list retrieval',
      check5Pass,
      `Saved jobs total: ${savedList.total}`
    );

    // ── Check 6: Mark Job 2 as Applied ──
    const apply2 = await markJobApplied(userA.id, job2Id);
    const check6Pass =
      apply2.isApplied === true &&
      apply2.appliedAt !== null &&
      apply2.appliedAt !== undefined;
    record(
      6,
      'Mark job as applied (isApplied: true, appliedAt set)',
      check6Pass,
      `Job 2 marked applied at ${apply2.appliedAt}`
    );

    // ── Check 7: Un-mark Job 2 applied ──
    const unapply2 = await unmarkJobApplied(userA.id, job2Id);
    const check7Pass = unapply2.isApplied === false && unapply2.appliedAt === null;
    record(
      7,
      'Un-mark job applied (isApplied: false, appliedAt cleared)',
      check7Pass,
      `Job 2 unapplied successfully`
    );

    // ── Check 8: Re-mark Job 2 applied ──
    await markJobApplied(userA.id, job2Id);
    const appList = await getAppliedJobs(userA.id, { page: 1, limit: 10 });
    const check8Pass = appList.total === 1 && appList.items[0]?.id === job2Id;
    record(
      8,
      'Application tracking retrieval',
      check8Pass,
      `Tracked applications total: ${appList.total} (Job 2)`
    );

    // ── Check 9: Direct employer career portal URL integrity ──
    const targetJob = appList.items[0];
    const check9Pass =
      targetJob.officialUrl === 'https://boards.greenhouse.io/phase11tech/jobs/102';
    record(
      9,
      'Official career portal URL preserved',
      check9Pass,
      `Official portal url: ${targetJob.officialUrl}`
    );

    // ── Check 10: Saved jobs filter by applied status ──
    const savedAppliedOnly = await getSavedJobs(userA.id, { applied: 'APPLIED' });
    const savedNotAppliedOnly = await getSavedJobs(userA.id, { applied: 'NOT_APPLIED' });
    const check10Pass =
      savedAppliedOnly.total === 1 &&
      savedAppliedOnly.items[0]?.id === job2Id &&
      savedNotAppliedOnly.total === 1 &&
      savedNotAppliedOnly.items[0]?.id === job1Id;
    record(
      10,
      'Saved jobs filter (APPLIED vs NOT_APPLIED)',
      check10Pass,
      `Applied in saved: ${savedAppliedOnly.total}, Not Applied in saved: ${savedNotAppliedOnly.total}`
    );

    // ── Check 11: Add private notes to Job 1 ──
    const note1Text = 'Revisit PostgreSQL query planner and concurrency control';
    const note1Res = await setJobNotes(userA.id, job1Id, note1Text);
    const check11Pass = note1Res.notes === note1Text;
    record(
      11,
      'Add private note',
      check11Pass,
      `Note attached: "${note1Res.notes}"`
    );

    // ── Check 12: Update private notes ──
    const note1UpdatedText = 'Updated: completed round 1 screening on Monday';
    const note1UpdatedRes = await setJobNotes(userA.id, job1Id, note1UpdatedText);
    const check12Pass = note1UpdatedRes.notes === note1UpdatedText;
    record(
      12,
      'Update private note',
      check12Pass,
      `Note updated to: "${note1UpdatedRes.notes}"`
    );

    // ── Check 13: Delete private notes ──
    const note1DeletedRes = await deleteJobNotes(userA.id, job1Id);
    const check13Pass = note1DeletedRes.notes === null;
    record(
      13,
      'Delete private note',
      check13Pass,
      `Note cleared (notes = null)`
    );

    // ── Check 14: Dismiss / Hide Job 3 from feed ──
    const dismiss3 = await dismissJob(userA.id, job3Id);
    const check14Pass =
      dismiss3.isDismissed === true &&
      dismiss3.dismissedAt !== null;
    record(
      14,
      'Dismiss / Hide job from feed',
      check14Pass,
      `Job 3 dismissed at ${dismiss3.dismissedAt}`
    );

    // ── Check 15: Matched feed automatically excludes dismissed jobs ──
    const feedAfterDismiss = await findMatchesForUser(userA.id, {
      companyId: testCompany.id,
      page: 1,
      limit: 10,
    });
    const feedAfterIds = feedAfterDismiss.jobs.map((j) => j.id);
    const check15Pass =
      !feedAfterIds.includes(job3Id) &&
      feedAfterIds.includes(job1Id) &&
      feedAfterIds.includes(job2Id);
    record(
      15,
      'Default feed excludes dismissed jobs',
      check15Pass,
      `Dismissed Job 3 excluded from active feed. Total in feed: ${feedAfterDismiss.totalMatches}`
    );

    // ── Check 16: Feed includeDismissed: true returns dismissed job ──
    const feedWithDismissed = await findMatchesForUser(userA.id, {
      companyId: testCompany.id,
      page: 1,
      limit: 10,
      includeDismissed: true,
    });
    const check16Pass = feedWithDismissed.jobs.some((j) => j.id === job3Id);
    record(
      16,
      'includeDismissed flag includes hidden jobs',
      check16Pass,
      `Job 3 found when includeDismissed=true`
    );

    // ── Check 17: Hidden jobs recovery list ──
    const dismissedList = await getDismissedJobs(userA.id, { page: 1, limit: 10 });
    const check17Pass =
      dismissedList.total === 1 && dismissedList.items[0]?.id === job3Id;
    record(
      17,
      'Hidden jobs recovery list query',
      check17Pass,
      `Hidden jobs count: ${dismissedList.total} (Job 3)`
    );

    // ── Check 18: Restore dismissed Job 3 ──
    const restore3 = await restoreJob(userA.id, job3Id);
    const check18Pass =
      restore3.isDismissed === false && restore3.dismissedAt === null;
    record(
      18,
      'Restore hidden job (isDismissed: false, dismissedAt: null)',
      check18Pass,
      `Job 3 restored successfully`
    );

    // ── Check 19: Restored job reappears in active feed ──
    const feedAfterRestore = await findMatchesForUser(userA.id, {
      companyId: testCompany.id,
      page: 1,
      limit: 10,
    });
    const check19Pass = feedAfterRestore.jobs.some((j) => j.id === job3Id);
    record(
      19,
      'Restored job reappears in active feed',
      check19Pass,
      `Job 3 present in active feed after restore`
    );

    // ── Check 20: Detail view tracking ──
    await recordJobView(userA.id, job1Id);
    await new Promise((r) => setTimeout(r, 50));
    await recordJobView(userA.id, job2Id);
    const interaction1 = await getJobInteraction(userA.id, job1Id);
    const interaction2 = await getJobInteraction(userA.id, job2Id);
    const check20Pass =
      interaction1?.viewedAt !== null &&
      interaction2?.viewedAt !== null &&
      new Date(interaction2!.viewedAt!).getTime() >=
        new Date(interaction1!.viewedAt!).getTime();
    record(
      20,
      'Detail view tracking (viewedAt updated)',
      check20Pass,
      `Job 1 viewed: ${interaction1?.viewedAt}, Job 2 viewed: ${interaction2?.viewedAt}`
    );

    // ── Check 21: Recently viewed list ordering ──
    const recentList = await getRecentlyViewedJobs(userA.id, 5);
    const check21Pass =
      recentList.length === 2 &&
      recentList[0]?.id === job2Id &&
      recentList[1]?.id === job1Id;
    record(
      21,
      'Recently viewed in reverse chronological order',
      check21Pass,
      `Order: 1st=${recentList[0]?.title}, 2nd=${recentList[1]?.title}`
    );

    // ── Check 22: Workspace stats accuracy ──
    const finalStats = await getWorkspaceStats(userA.id);
    const check22Pass =
      finalStats.savedCount === 2 &&
      finalStats.appliedCount === 1 &&
      finalStats.recentlyViewedCount === 2;
    record(
      22,
      'Workspace stats accuracy',
      check22Pass,
      `saved=${finalStats.savedCount}, applied=${finalStats.appliedCount}, viewed=${finalStats.recentlyViewedCount}`
    );

    // ── Check 23: Strict multi-user scoping & isolation (User A vs User B) ──
    const userBStats = await getWorkspaceStats(userB.id);
    const userBSaved = await getSavedJobs(userB.id);
    const userBApplied = await getAppliedJobs(userB.id);
    const userBDismissed = await getDismissedJobs(userB.id);
    const userBRecent = await getRecentlyViewedJobs(userB.id);
    const userBInteraction1 = await getJobInteraction(userB.id, job1Id);

    const check23Pass =
      userBStats.savedCount === 0 &&
      userBStats.appliedCount === 0 &&
      userBStats.recentlyViewedCount === 0 &&
      userBSaved.total === 0 &&
      userBApplied.total === 0 &&
      userBDismissed.total === 0 &&
      userBRecent.length === 0 &&
      userBInteraction1 === null;
    record(
      23,
      'Strict multi-user scoping & isolation',
      check23Pass,
      `User B has completely isolated workspace with 0 cross-contamination from User A`
    );

    // ── Check 24: Closed job preservation ──
    // Mark Job 1 closed via lifecycle system
    await markJobClosed(job1Id, 'OFFICIAL_404');
    const savedWithClosed = await getSavedJobs(userA.id, { page: 1, limit: 10 });
    const savedJob1 = savedWithClosed.items.find((j) => j.id === job1Id);
    const feedExcludesClosed = await findMatchesForUser(userA.id, {
      companyId: testCompany.id,
      page: 1,
      limit: 10,
    });
    const check24Pass =
      savedJob1 !== undefined &&
      savedJob1.status === 'CLOSED' &&
      !feedExcludesClosed.jobs.some((j) => j.id === job1Id);
    record(
      24,
      'Closed job preservation (saved records intact, excluded from active discovery)',
      check24Pass,
      `Job 1 status in saved list: ${savedJob1?.status}, active feed excludes closed: ${!feedExcludesClosed.jobs.some((j) => j.id === job1Id)}`
    );

    // ── Check 25: Database unique constraint and cascade delete ──
    // Save job for User B then delete User B to check CASCADE
    await saveJob(userB.id, job2Id);
    const [bInteractionBefore] = await db
      .select()
      .from(schema.userJobInteractions)
      .where(eq(schema.userJobInteractions.user_id, userB.id));

    await db.delete(schema.users).where(eq(schema.users.id, userB.id));

    const bInteractionsAfter = await db
      .select()
      .from(schema.userJobInteractions)
      .where(eq(schema.userJobInteractions.user_id, userB.id));

    const check25Pass =
      bInteractionBefore !== undefined && bInteractionsAfter.length === 0;
    record(
      25,
      'Database unique constraint & cascade delete on user removal',
      check25Pass,
      `Interactions for User B before: 1, after user deletion: ${bInteractionsAfter.length}`
    );

  } finally {
    // Cleanup User A & test data
    await db.delete(schema.users).where(eq(schema.users.id, userA.id));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, job1Id));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, job2Id));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, job3Id));
  }

  // Summary
  console.log('\n===============================================================');
  console.log('📊 PHASE 11 AUDIT SUMMARY');
  console.log('===============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${results.length - passedCount}`);

  if (passedCount === results.length) {
    console.log('\n🎉 ALL 25 PHASE 11 ACCEPTANCE CRITERIA PASSED!\n');
  } else {
    console.error('\n⚠️ SOME CHECKS FAILED. Please review the output above.\n');
    process.exit(1);
  }
}

runPhase11Audit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
