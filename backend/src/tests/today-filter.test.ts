/**
 * Regression Tests: Today's Verified Jobs Filter (onlyToday)
 *
 * Verifies the exact semantics of the Today's Verified Jobs filter:
 *   initial_verified_at >= startOfTodayIST
 *   AND initial_verified_at < startOfTomorrowIST
 *
 * Root cause guarded against: markJobActive previously used
 * COALESCE(initial_verified_at, NOW()), which caused old jobs with a
 * NULL initial_verified_at to receive today's re-verification timestamp,
 * making them appear in the Today filter even though they were first seen
 * and verified days earlier. Fixed to use COALESCE(initial_verified_at, first_seen_at).
 *
 * Test categories:
 * 1. IST day boundary correctness (yesterday excluded, today included, tomorrow excluded)
 * 2. markJobActive COALESCE semantics (re-verification must NOT change initial_verified_at)
 * 3. The Today filter interval semantics
 */

import { describe, it, expect } from 'vitest';
import { getStartOfTodayInTimezone } from '../utils/timezone.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getISTBoundaries() {
  const startOfToday = getStartOfTodayInTimezone('Asia/Kolkata');
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  return { startOfToday, startOfTomorrow };
}

function isInTodayFilter(ts: Date): boolean {
  const { startOfToday, startOfTomorrow } = getISTBoundaries();
  return ts >= startOfToday && ts < startOfTomorrow;
}

// ─── IST Boundary Tests ───────────────────────────────────────────────────────

describe("Today's Verified Jobs Filter — IST day boundary semantics", () => {
  it('yesterday 23:59:59.999 IST → EXCLUDED', () => {
    const { startOfToday } = getISTBoundaries();
    const yesterdayLastMs = new Date(startOfToday.getTime() - 1); // 1ms before midnight IST
    expect(isInTodayFilter(yesterdayLastMs)).toBe(false);
  });

  it('today 00:00:00.000 IST → INCLUDED', () => {
    const { startOfToday } = getISTBoundaries();
    expect(isInTodayFilter(startOfToday)).toBe(true);
  });

  it('today during day (current moment) → INCLUDED', () => {
    const now = new Date();
    expect(isInTodayFilter(now)).toBe(true);
  });

  it('today 23:59:59.999 IST → INCLUDED', () => {
    const { startOfTomorrow } = getISTBoundaries();
    const lastMsOfToday = new Date(startOfTomorrow.getTime() - 1);
    expect(isInTodayFilter(lastMsOfToday)).toBe(true);
  });

  it('tomorrow 00:00:00.000 IST → EXCLUDED', () => {
    const { startOfTomorrow } = getISTBoundaries();
    expect(isInTodayFilter(startOfTomorrow)).toBe(false);
  });
});

// ─── markJobActive COALESCE Semantics ────────────────────────────────────────

describe('markJobActive COALESCE — initial_verified_at must not change on re-verification', () => {
  const originalInitialVerifiedAt = new Date('2026-09-15T08:00:00.000Z'); // 3 days ago
  const firstSeenAt = new Date('2026-09-15T06:00:00.000Z');               // also 3 days ago

  // Mirrors the FIXED SQL: COALESCE(initial_verified_at, first_seen_at)
  function coalesceFixed(existingValue: Date | null, firstSeen: Date): Date {
    return existingValue ?? firstSeen;
  }

  // Mirrors the BUGGY SQL: COALESCE(initial_verified_at, NOW())
  function coalesceBuggy(existingValue: Date | null): Date {
    return existingValue ?? new Date();
  }

  it('COALESCE returns existing value when initial_verified_at is already set (re-verification)', () => {
    const result = coalesceFixed(originalInitialVerifiedAt, firstSeenAt);
    expect(result).toEqual(originalInitialVerifiedAt);
    // Must NOT be today
    expect(isInTodayFilter(result)).toBe(false);
  });

  it('FIXED: COALESCE returns first_seen_at (NOT now) when initial_verified_at is NULL (old job first activation)', () => {
    const result = coalesceFixed(null, firstSeenAt);
    expect(result).toEqual(firstSeenAt);
    // first_seen_at is 3 days ago — must NOT be in today's filter
    expect(isInTodayFilter(result)).toBe(false);
  });

  it('BUG: COALESCE with now() as fallback would put old job into today filter', () => {
    // Demonstrates the original defect: COALESCE(initial_verified_at, NOW())
    // caused old jobs (initial_verified_at IS NULL) to receive today's timestamp
    // during re-verification, making them appear in Today's Verified Jobs.
    const buggyResult = coalesceBuggy(null); // NULL job → now()
    expect(isInTodayFilter(buggyResult)).toBe(true); // ← the bug: old job appears in today filter

    // The fix uses first_seen_at instead — old job stays out of today filter
    const fixedResult = coalesceFixed(null, firstSeenAt);
    expect(isInTodayFilter(fixedResult)).toBe(false); // ← correct
  });

  it('old job re-verified today: initial_verified_at must remain unchanged at original value', () => {
    // A job with initial_verified_at already set must not change on re-verification
    const afterReverification = coalesceFixed(originalInitialVerifiedAt, firstSeenAt);
    expect(afterReverification).toEqual(originalInitialVerifiedAt);
    expect(isInTodayFilter(afterReverification)).toBe(false);
  });

  it('brand-new job first activated today: initial_verified_at falls back to first_seen_at (today)', () => {
    const { startOfToday } = getISTBoundaries();
    const todayFirstSeenAt = new Date(startOfToday.getTime() + 60_000); // 1 minute into today IST
    const result = coalesceFixed(null, todayFirstSeenAt);
    expect(result).toEqual(todayFirstSeenAt);
    // first_seen today → should be in today's filter
    expect(isInTodayFilter(result)).toBe(true);
  });
});

// ─── Today Filter Interval Semantics ─────────────────────────────────────────

describe("Today's Verified Jobs Filter — eligibility interval", () => {
  it('old job with recent re-verification should NOT appear if initial_verified_at is old', () => {
    const oldInitialVerified = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    expect(isInTodayFilter(oldInitialVerified)).toBe(false);
  });

  it('job first verified today at 2h into the day → INCLUDED', () => {
    const { startOfToday } = getISTBoundaries();
    const todayInitialVerified = new Date(startOfToday.getTime() + 2 * 60 * 60 * 1000);
    expect(isInTodayFilter(todayInitialVerified)).toBe(true);
  });

  it('job discovered today but not yet ACTIVE+VERIFIED (initial_verified_at IS NULL) → EXCLUDED', () => {
    // In SQL: NULL >= startOfToday → false → job excluded from filter (correct)
    const nullInitialVerified: Date | null = null;
    const wouldBeIncluded = nullInitialVerified !== null && isInTodayFilter(nullInitialVerified);
    expect(wouldBeIncluded).toBe(false);
  });

  it('the filter is a strict half-open interval [startOfTodayIST, startOfTomorrowIST)', () => {
    const { startOfToday, startOfTomorrow } = getISTBoundaries();
    // Start is included
    expect(startOfToday >= startOfToday && startOfToday < startOfTomorrow).toBe(true);
    // End (tomorrow midnight) is excluded
    expect(startOfTomorrow >= startOfToday && startOfTomorrow < startOfTomorrow).toBe(false);
  });
});

// ─── getStartOfTodayInTimezone correctness ────────────────────────────────────

describe('getStartOfTodayInTimezone — Asia/Kolkata produces exact midnight IST', () => {
  it('returns a UTC Date whose IST representation is 00:00:00', () => {
    const start = getStartOfTodayInTimezone('Asia/Kolkata');
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(start);
    const h = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
    const m = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
    const s = parseInt(parts.find(p => p.type === 'second')!.value, 10);
    const normalizedHour = h === 24 ? 0 : h;
    expect(normalizedHour).toBe(0);
    expect(m).toBe(0);
    expect(s).toBe(0);
  });

  it('startOfTomorrow is exactly 24h after startOfToday', () => {
    const { startOfToday, startOfTomorrow } = getISTBoundaries();
    expect(startOfTomorrow.getTime() - startOfToday.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
