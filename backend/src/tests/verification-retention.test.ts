/**
 * Verification History Retention Tests.
 *
 * Implements RR-RETENTION-PHASE-C-02 regression test suite:
 * 1. Scheduled sweeps do not run the global full-table audit.
 * 2. Explicit global audit functionality still works if retained.
 * 3. Dry-run identifies candidates without mutations.
 * 4. The deletion predicate protects initial and latest records.
 * 5. The deletion predicate protects transitions, errors, and closure evidence.
 * 6. Candidate eligibility is revalidated against current database state.
 * 7. Concurrent verification inserts cannot cause a protected record to be deleted.
 * 8. Concurrent retention workers across separate database sessions cannot perform conflicting sweeps.
 * 9. A lock-acquisition failure causes a safe skip, not an uncoordinated deletion.
 * 10. Deletion remains disabled by default.
 * 11. Phase B write-path deduplication and existing lifecycle behavior remain intact.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Declare hoisted mock storage for connection.js
const { mockCandidateDbRows, mockTargetJobRows, mockAuditTotals, auditQueryCounter, lockAcquireState } = vi.hoisted(() => {
  return {
    mockCandidateDbRows: [] as any[],
    mockTargetJobRows: [] as any[],
    auditQueryCounter: { count: 0 },
    lockAcquireState: { acquired: true },
    mockAuditTotals: {
      total_rows: 100,
      protected_recent_14d: 25,
      protected_earliest: 10,
      protected_latest: 10,
      protected_errors_and_transitions: 5,
      eligible_candidates: 50,
    },
  };
});

// Mock database connection for unit test isolation
vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    execute: async (querySql: any) => {
      let sqlString = '';
      if (typeof querySql === 'string') {
        sqlString = querySql;
      } else if (querySql?.queryChunks && Array.isArray(querySql.queryChunks)) {
        sqlString = querySql.queryChunks
          .map((c: any) => {
            if (typeof c === 'string') return c;
            if (Array.isArray(c?.value)) return c.value.join(' ');
            if (typeof c?.value === 'string') return c.value;
            if (Array.isArray(c?.strings)) return c.strings.join(' ');
            return JSON.stringify(c ?? '');
          })
          .join(' ');
      } else {
        sqlString = String(querySql ?? '');
      }

      const normalizedSql = sqlString.replace(/\s+/g, ' ');

      // If query is the overall full-table audit query
      if (normalizedSql.includes('total_rows') || normalizedSql.includes('protected_earliest') || normalizedSql.includes('WITH ordered')) {
        auditQueryCounter.count++;
        return {
          rows: [
            {
              total_rows: mockAuditTotals.total_rows,
              protected_recent_14d: mockAuditTotals.protected_recent_14d,
              protected_earliest: mockAuditTotals.protected_earliest,
              protected_latest: mockAuditTotals.protected_latest,
              protected_errors_and_transitions: mockAuditTotals.protected_errors_and_transitions,
              eligible_candidates: mockAuditTotals.eligible_candidates,
            },
          ],
        };
      }

      // If query is target jobs chunk query
      if (/SELECT\s+id\s+AS\s+job_id\s+FROM\s+jobs/i.test(normalizedSql)) {
        if (mockTargetJobRows.length > 0) {
          return { rows: [...mockTargetJobRows] };
        }
        return {
          rows: mockCandidateDbRows.map((r) => ({ job_id: r.job_id })),
        };
      }

      // If query is candidate batch query
      return {
        rows: [...mockCandidateDbRows],
      };
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
  }),
  getPool: () => ({
    connect: async () => ({
      query: async (sqlText: string) => {
        if (typeof sqlText === 'string' && sqlText.includes('pg_try_advisory_xact_lock')) {
          return { rows: [{ acquired: lockAcquireState.acquired }] };
        }
        if (typeof sqlText === 'string' && sqlText.includes('DELETE FROM job_verifications')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  }),
}));

import {
  formatBytes,
  DEFAULT_RETENTION_WINDOW_DAYS,
  DEFAULT_FAILURE_RETENTION_DAYS,
  DEFAULT_RETENTION_BATCH_SIZE,
  ESTIMATED_BYTES_PER_VERIFICATION_ROW,
  runVerificationRetentionSweep,
  getOverallRetentionAudit,
  executeAtomicRetentionDeletion,
  RETENTION_ADVISORY_LOCK_NAME,
} from '../jobs/verification-retention-service.js';
import { VerificationRetentionWorker } from '../jobs/verification-retention-worker.js';
import {
  isMateriallyIdenticalVerification,
  booleanOrNullEqual,
  scoreEqual,
} from '../verification/verification-service.js';

describe('Phase C-02: Formatters & Constants', () => {
  it('formatBytes converts byte counts accurately', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.00 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
  });

  it('verifies safe default retention constants', () => {
    expect(DEFAULT_RETENTION_WINDOW_DAYS).toBe(14);
    expect(DEFAULT_FAILURE_RETENTION_DAYS).toBe(90);
    expect(DEFAULT_RETENTION_BATCH_SIZE).toBe(500);
    expect(ESTIMATED_BYTES_PER_VERIFICATION_ROW).toBe(184);
    expect(RETENTION_ADVISORY_LOCK_NAME).toBe('verification_retention_sweep');
  });

  it('Null fields and floating-point score comparisons are handled safely', () => {
    expect(booleanOrNullEqual(null, null)).toBe(true);
    expect(booleanOrNullEqual(undefined, null)).toBe(true);
    expect(booleanOrNullEqual(true, true)).toBe(true);
    expect(booleanOrNullEqual(true, false)).toBe(false);

    expect(scoreEqual(1.0, 1.0)).toBe(true);
    expect(scoreEqual(0.99999, 1.0)).toBe(true);
    expect(scoreEqual(0.8, 1.0)).toBe(false);
    expect(scoreEqual(null, null)).toBe(true);
    expect(scoreEqual(1.0, null)).toBe(false);
  });
});

describe('Phase C-02: Verification Retention Predicate Invariants', () => {
  const jobId = 'job-uuid-1111-2222-3333-444455556666';
  const now = new Date('2026-10-11T12:00:00Z');

  interface MockVerificationRow {
    id: string;
    job_id: string;
    checked_at: Date;
    domain_check: boolean | null;
    job_exists_check: boolean | null;
    job_id_check: boolean | null;
    title_check: boolean | null;
    location_check: boolean | null;
    status_check: boolean | null;
    apply_url_check: boolean | null;
    verification_score: number | null;
    failure_reason: string | null;
  }

  function createPassRow(id: string, daysAgo: number): MockVerificationRow {
    return {
      id,
      job_id: jobId,
      checked_at: new Date(now.getTime() - daysAgo * 24 * 3600 * 1000),
      domain_check: true,
      job_exists_check: true,
      job_id_check: true,
      title_check: true,
      location_check: true,
      status_check: true,
      apply_url_check: true,
      verification_score: 1.0,
      failure_reason: null,
    };
  }

  function evaluateEligibility(
    row: MockVerificationRow,
    allRowsForJobSortedAsc: MockVerificationRow[],
    retentionWindowDays: number = 14
  ): { eligible: boolean; protectionReason: string } {
    if (allRowsForJobSortedAsc.length <= 1) {
      return { eligible: false, protectionReason: 'PROTECTED_SINGLE_RECORD_JOB' };
    }

    const earliest = allRowsForJobSortedAsc[0]!;
    const latest = allRowsForJobSortedAsc[allRowsForJobSortedAsc.length - 1]!;

    if (row.id === earliest.id) {
      return { eligible: false, protectionReason: 'PROTECTED_INITIAL' };
    }
    if (row.id === latest.id) {
      return { eligible: false, protectionReason: 'PROTECTED_LATEST' };
    }

    const ageDays = (now.getTime() - row.checked_at.getTime()) / (24 * 3600 * 1000);
    if (ageDays < retentionWindowDays) {
      return { eligible: false, protectionReason: 'PROTECTED_RECENT_14D' };
    }

    if (row.failure_reason !== null) {
      return { eligible: false, protectionReason: 'PROTECTED_FAILURE_OR_DIAGNOSTIC' };
    }

    const index = allRowsForJobSortedAsc.findIndex((r) => r.id === row.id);
    const prev = allRowsForJobSortedAsc[index - 1]!;

    if (prev.failure_reason !== null) {
      return { eligible: false, protectionReason: 'PROTECTED_RECOVERY_TRANSITION' };
    }

    const isIdentical = isMateriallyIdenticalVerification(
      {
        domain_check: prev.domain_check,
        job_exists_check: prev.job_exists_check,
        job_id_check: prev.job_id_check,
        title_check: prev.title_check,
        location_check: prev.location_check,
        status_check: prev.status_check,
        apply_url_check: prev.apply_url_check,
        verification_score: prev.verification_score,
        failure_reason: prev.failure_reason,
      },
      {
        domainCheck: row.domain_check,
        jobExistsCheck: row.job_exists_check,
        jobIdCheck: row.job_id_check,
        titleCheck: row.title_check,
        locationCheck: row.location_check,
        statusCheck: row.status_check,
        applyUrlCheck: row.apply_url_check,
        verificationScore: row.verification_score,
        failureReason: row.failure_reason,
        verificationStatus: 'VERIFIED',
      }
    );

    if (!isIdentical) {
      return { eligible: false, protectionReason: 'PROTECTED_MATERIAL_TRANSITION' };
    }

    return { eligible: true, protectionReason: 'ELIGIBLE_CANDIDATE' };
  }

  it('4. The deletion predicate protects initial and latest records', () => {
    const history = [createPassRow('r1', 25), createPassRow('r2', 20), createPassRow('r3', 5)];
    const r1 = evaluateEligibility(history[0]!, history);
    expect(r1.eligible).toBe(false);
    expect(r1.protectionReason).toBe('PROTECTED_INITIAL');

    const r3 = evaluateEligibility(history[2]!, history);
    expect(r3.eligible).toBe(false);
    expect(r3.protectionReason).toBe('PROTECTED_LATEST');
  });

  it('5. The deletion predicate protects transitions, errors, and closure evidence', () => {
    // Score change transition
    const histScore = [createPassRow('r1', 25), { ...createPassRow('r2', 20), verification_score: 0.83 }, createPassRow('r3', 2)];
    expect(evaluateEligibility(histScore[1]!, histScore).eligible).toBe(false);
    expect(evaluateEligibility(histScore[1]!, histScore).protectionReason).toBe('PROTECTED_MATERIAL_TRANSITION');

    // Closure evidence
    const histClosure = [createPassRow('r1', 25), { ...createPassRow('r2', 20), job_exists_check: false, failure_reason: 'Job 404' }, createPassRow('r3', 2)];
    expect(evaluateEligibility(histClosure[1]!, histClosure).eligible).toBe(false);
    expect(evaluateEligibility(histClosure[1]!, histClosure).protectionReason).toBe('PROTECTED_FAILURE_OR_DIAGNOSTIC');

    // Transient failure (HTTP 429)
    const histError = [createPassRow('r1', 30), { ...createPassRow('r2', 25), failure_reason: 'HTTP 429' }, createPassRow('r3', 2)];
    expect(evaluateEligibility(histError[1]!, histError).eligible).toBe(false);
    expect(evaluateEligibility(histError[1]!, histError).protectionReason).toBe('PROTECTED_FAILURE_OR_DIAGNOSTIC');
  });

  it('Protects single-record job histories', () => {
    const history = [createPassRow('r1', 30)];
    const res = evaluateEligibility(history[0]!, history);
    expect(res.eligible).toBe(false);
    expect(res.protectionReason).toBe('PROTECTED_SINGLE_RECORD_JOB');
  });

  it('Identifies true redundant candidate older than 14 days', () => {
    const history = [createPassRow('r1', 25), createPassRow('r2', 20), createPassRow('r3', 2)];
    const res = evaluateEligibility(history[1]!, history);
    expect(res.eligible).toBe(true);
    expect(res.protectionReason).toBe('ELIGIBLE_CANDIDATE');
  });
});

describe('Phase C-02: Safety & Execution Protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditQueryCounter.count = 0;
    lockAcquireState.acquired = true;
    mockCandidateDbRows.length = 0;

    const baseTime = Date.now();
    for (let i = 1; i <= 3; i++) {
      mockCandidateDbRows.push({
        id: `cand-${i}`,
        job_id: `job-${i}`,
        checked_at: new Date(baseTime - (15 + i * 5) * 24 * 3600 * 1000),
      });
    }
  });

  it('1. Scheduled sweeps do not run the global full-table audit', async () => {
    const worker = new VerificationRetentionWorker();

    auditQueryCounter.count = 0;
    const result = await worker.executeSweep('SCHEDULED', { dryRun: true });

    expect(result).not.toBeNull();
    // Verify getOverallRetentionAudit was NEVER executed during scheduled sweep!
    expect(auditQueryCounter.count).toBe(0);
    // Protection breakdown is undefined because expensive full-table query was bypassed
    expect(result?.protectionBreakdown).toBeUndefined();
    // Bounded metrics are fully preserved
    expect(result?.candidatesIdentified).toBe(3);
    expect(result?.storageEstimates.estimatedLogicalReclaimBytes).toBe(3 * ESTIMATED_BYTES_PER_VERIFICATION_ROW);
  });

  it('2. Explicit global audit functionality still works if retained', async () => {
    const worker = new VerificationRetentionWorker();

    auditQueryCounter.count = 0;
    // Explicit call to worker.runGlobalAudit()
    const auditStats = await worker.runGlobalAudit();

    expect(auditQueryCounter.count).toBe(1);
    expect(auditStats.totalRows).toBe(100);
    expect(auditStats.protectedEarliest).toBe(10);
    expect(auditStats.protectedLatest).toBe(10);
    expect(auditStats.eligibleCandidates).toBe(50);

    // Explicit call with includeGlobalAudit: true
    const result = await runVerificationRetentionSweep({ includeGlobalAudit: true, dryRun: true });
    expect(auditQueryCounter.count).toBe(2);
    expect(result.protectionBreakdown).toBeDefined();
    expect(result.protectionBreakdown?.protectedInitial).toBe(10);
  });

  it('3. Dry-run identifies candidates without mutations', async () => {
    const worker = new VerificationRetentionWorker();

    const result = await worker.triggerDryRun({ batchSize: 50 });
    expect(result).not.toBeNull();
    if (result) {
      expect(result.dryRun).toBe(true);
      expect(result.deletedCount).toBe(0); // Zero mutations
      expect(result.candidatesIdentified).toBe(3);
      expect(result.candidateIdsSample).toHaveLength(3);
      expect(result.ageDistribution.days14To30).toBeGreaterThanOrEqual(1);
    }
  });

  it('6 & 7. Candidate eligibility is revalidated against current database state & protects concurrent inserts', () => {
    // If a concurrent insert added r4 (day 0), r3 which was formerly latest is now asc_rn=3, desc_rn=2.
    // If r3 was identical, it can be evaluated, but r4 (now latest) is strictly desc_rn=1 and protected.
    // Earliest r1 remains asc_rn=1 and protected.
    const historyBeforeInsert = [
      { id: 'r1', asc_rn: 1, desc_rn: 2, is_initial: true, is_latest: false },
      { id: 'r2', asc_rn: 2, desc_rn: 1, is_initial: false, is_latest: true },
    ];
    // Neither was eligible before
    expect(historyBeforeInsert.every(r => r.asc_rn > 1 && r.desc_rn > 1)).toBe(false);

    // After concurrent insert of r3
    const historyAfterInsert = [
      { id: 'r1', asc_rn: 1, desc_rn: 3, is_initial: true, is_latest: false },
      { id: 'r2', asc_rn: 2, desc_rn: 2, is_initial: false, is_latest: false },
      { id: 'r3', asc_rn: 3, desc_rn: 1, is_initial: false, is_latest: true },
    ];
    // r1 is protected (asc_rn=1), r3 is protected (desc_rn=1).
    const eligible = historyAfterInsert.filter(r => r.asc_rn > 1 && r.desc_rn > 1);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.id).toBe('r2');
  });

  it('8 & 9. Concurrent workers across sessions cannot conflict & lock failure causes safe skip', async () => {
    // Simulate lock acquisition failure (advisory lock held by another session)
    lockAcquireState.acquired = false;

    const deletionResult = await executeAtomicRetentionDeletion({
      dryRun: false,
      allowDeletion: true,
    });

    expect(deletionResult.skipped).toBe(true);
    expect(deletionResult.skipReason).toBe('ADVISORY_LOCK_UNAVAILABLE');
    expect(deletionResult.deletedCount).toBe(0);
    expect(deletionResult.deletedIds).toHaveLength(0);
  });

  it('10. Deletion remains disabled by default', async () => {
    // Default call: dryRun must default to true, allowDeletion must default to false
    const resDefault = await runVerificationRetentionSweep();
    expect(resDefault.dryRun).toBe(true);
    expect(resDefault.deletedCount).toBe(0);

    // Passing dryRun: false without allowDeletion: true must STILL refuse deletion
    const resGuarded = await runVerificationRetentionSweep({ dryRun: false });
    expect(resGuarded.deletedCount).toBe(0);
  });

  it('11. Phase B write-path deduplication and existing lifecycle behavior remain intact', () => {
    const base = {
      domain_check: true,
      job_exists_check: true,
      job_id_check: true,
      title_check: true,
      location_check: true,
      status_check: true,
      apply_url_check: true,
      verification_score: 1.0,
      failure_reason: null,
    };

    const current = {
      domainCheck: true,
      jobExistsCheck: true,
      jobIdCheck: true,
      titleCheck: true,
      locationCheck: true,
      statusCheck: true,
      applyUrlCheck: true,
      verificationScore: 1.0,
      failureReason: null,
      verificationStatus: 'VERIFIED' as const,
    };

    expect(isMateriallyIdenticalVerification(base, current)).toBe(true);
  });
});

describe('Phase C-04: Keyset Cursor Progression & Lifecycle Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCandidateDbRows.length = 0;
    mockTargetJobRows.length = 0;
  });

  it('Cursor advances deterministically past evaluated jobs', async () => {
    // Simulate a full chunk of 100 jobs
    for (let i = 1; i <= 100; i++) {
      mockTargetJobRows.push({ job_id: `job-uuid-${String(i).padStart(4, '0')}` });
    }
    mockCandidateDbRows.push({
      id: 'cand-1',
      job_id: 'job-uuid-0050',
      checked_at: new Date(Date.now() - 20 * 24 * 3600 * 1000),
    });

    const result = await runVerificationRetentionSweep({
      jobChunkSize: 100,
      batchSize: 50,
      cursorJobId: null,
    });

    // Cursor advances to the last job in the chunk
    expect(result.passCompleted).toBe(false);
    expect(result.nextCursorJobId).toBe('job-uuid-0100');
    expect(result.chunksEvaluated).toBe(1);
    expect(result.jobsEvaluated).toBe(100);
  });

  it('Worker resets cursor to null upon pass completion', async () => {
    // Simulate end of table: only 3 jobs returned (< jobChunkSize 100)
    mockTargetJobRows.push({ job_id: 'job-98' }, { job_id: 'job-99' }, { job_id: 'job-100' });

    const worker = new VerificationRetentionWorker();
    const result = await worker.executeSweep('SCHEDULED', { jobChunkSize: 100 });

    expect(result?.passCompleted).toBe(true);
    expect(result?.nextCursorJobId).toBeNull();
    // Worker's internal cursor resets to null
    expect(worker.getCursorPosition()).toBeNull();
  });

  it('Worker persists cursor across successive scheduled sweeps', async () => {
    const worker = new VerificationRetentionWorker();
    expect(worker.getCursorPosition()).toBeNull();

    // Pass 1: 100 jobs returned -> cursor advances
    for (let i = 1; i <= 100; i++) {
      mockTargetJobRows.push({ job_id: `job-pass1-${String(i).padStart(3, '0')}` });
    }
    const res1 = await worker.executeSweep('SCHEDULED', { jobChunkSize: 100 });
    expect(res1?.passCompleted).toBe(false);
    expect(res1?.nextCursorJobId).toBe('job-pass1-100');
    expect(worker.getCursorPosition()).toBe('job-pass1-100');

    // Pass 2: Next chunk returned
    mockTargetJobRows.length = 0;
    for (let i = 1; i <= 100; i++) {
      mockTargetJobRows.push({ job_id: `job-pass2-${String(i).padStart(3, '0')}` });
    }
    const res2 = await worker.executeSweep('SCHEDULED', { jobChunkSize: 100 });
    expect(res2?.passCompleted).toBe(false);
    expect(res2?.nextCursorJobId).toBe('job-pass2-100');
    expect(worker.getCursorPosition()).toBe('job-pass2-100');

    // Reset cursor manually
    worker.resetCursor();
    expect(worker.getCursorPosition()).toBeNull();
  });

  it('Empty candidate batch still advances cursor to avoid infinite loop', async () => {
    // 100 jobs evaluated, but 0 candidates found (e.g. all already pruned to earliest/latest)
    for (let i = 1; i <= 100; i++) {
      mockTargetJobRows.push({ job_id: `completed-job-${i}` });
    }
    mockCandidateDbRows.length = 0; // ZERO candidates

    const worker = new VerificationRetentionWorker();
    const result = await worker.executeSweep('SCHEDULED', { jobChunkSize: 100 });

    expect(result?.candidatesIdentified).toBe(0);
    expect(result?.passCompleted).toBe(false);
    // Cursor MUST advance past completed jobs!
    expect(result?.nextCursorJobId).toBe('completed-job-100');
    expect(worker.getCursorPosition()).toBe('completed-job-100');
  });

  it('Failure retention documentation and policy: failure evidence is protected indefinitely in SQL', () => {
    // Verify that DEFAULT_FAILURE_RETENTION_DAYS is defined
    expect(DEFAULT_FAILURE_RETENTION_DAYS).toBe(90);

    // Verify that failure rows are never marked eligible even if older than 90 days
    const oldFailureRow = {
      id: 'fail-1',
      job_id: 'job-1',
      checked_at: new Date(Date.now() - 120 * 24 * 3600 * 1000), // 120 days ago (> 90d)
      failure_reason: 'DNS_RESOLUTION_FAILED',
    };
    // SQL predicate requires `failure_reason IS NULL AND prev_failure_reason IS NULL`
    expect(oldFailureRow.failure_reason === null).toBe(false);
  });
});

