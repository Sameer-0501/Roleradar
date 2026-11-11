/**
 * Ashby Board Cache.
 *
 * Provides board-scoped, scan-cycle-scoped, concurrency-safe in-memory caching
 * of Ashby job board responses to eliminate redundant O(N^2) HTTP re-downloads during verification.
 *
 * Invariants:
 * 1. Board-scoped: Partitioned strictly by jobBoardName (case-insensitive, trimmed).
 * 2. Scan-cycle-scoped: Short TTL (default: 3 minutes) matching the scan cycle duration.
 * 3. Concurrency-safe: Synchronous atomic lookups on immutable cached entries.
 * 4. Fallback-safe: If cache miss or expired, caller falls back to authoritative live HTTP fetch.
 */

import crypto from 'node:crypto';

export interface AshbyCachedJob {
  id: string;
  title: string;
  location?: string;
  applyUrl?: string;
}

export interface AshbyBoardCacheEntry {
  jobBoardName: string;
  scanCycleId: string;
  fetchedAt: number;
  jobsById: Map<string, AshbyCachedJob>;
}

export class AshbyBoardCache {
  private cache = new Map<string, AshbyBoardCacheEntry>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 180_000) {
    // 3 minutes default TTL
    this.defaultTtlMs = defaultTtlMs;
  }

  private normalizeBoardName(boardName: string): string {
    return (boardName || '').trim().toLowerCase();
  }

  private normalizeJobId(jobId: string | number): string {
    return String(jobId || '').trim().toLowerCase();
  }

  /**
   * Store parsed jobs for a specific Ashby board from a discovery fetch.
   */
  setBoardJobs(
    jobBoardName: string,
    rawJobs: Array<{ id?: string | number; title?: string; location?: string; applyUrl?: string }>,
    scanCycleId: string = crypto.randomUUID()
  ): void {
    const key = this.normalizeBoardName(jobBoardName);
    if (!key) return;

    const jobsById = new Map<string, AshbyCachedJob>();

    if (Array.isArray(rawJobs)) {
      for (const raw of rawJobs) {
        if (!raw || !raw.id || !raw.title) continue;
        const idStr = String(raw.id).trim();
        const titleStr = String(raw.title).trim();
        if (!idStr || !titleStr) continue;

        jobsById.set(this.normalizeJobId(idStr), {
          id: idStr,
          title: titleStr,
          location: raw.location ? String(raw.location).trim() : undefined,
          applyUrl: raw.applyUrl ? String(raw.applyUrl).trim() : undefined,
        });
      }
    }

    this.cache.set(key, {
      jobBoardName: key,
      scanCycleId,
      fetchedAt: Date.now(),
      jobsById,
    });
  }

  /**
   * Look up a job in the board cache.
   * Returns:
   * - cacheHit: false if board is not cached or cache expired.
   * - cacheHit: true, found: true, job: {...} if job exists on the board.
   * - cacheHit: true, found: false if board is cached, but job does NOT exist (removed/closed).
   */
  getCachedJob(
    jobBoardName: string,
    externalJobId: string,
    maxAgeMs?: number
  ): { cacheHit: false } | { cacheHit: true; found: true; job: AshbyCachedJob } | { cacheHit: true; found: false } {
    const key = this.normalizeBoardName(jobBoardName);
    const entry = this.cache.get(key);

    if (!entry) {
      return { cacheHit: false };
    }

    const ttl = maxAgeMs ?? this.defaultTtlMs;
    if (Date.now() - entry.fetchedAt > ttl) {
      this.cache.delete(key);
      return { cacheHit: false };
    }

    const job = entry.jobsById.get(this.normalizeJobId(externalJobId));
    if (job) {
      return { cacheHit: true, found: true, job };
    }

    return { cacheHit: true, found: false };
  }

  /**
   * Invalidate a single board cache entry.
   */
  invalidate(jobBoardName: string): void {
    this.cache.delete(this.normalizeBoardName(jobBoardName));
  }

  /**
   * Clear all cache entries (e.g. for testing or restart).
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns current active entries count.
   */
  size(): number {
    return this.cache.size;
  }
}

export const ashbyBoardCache = new AshbyBoardCache();
