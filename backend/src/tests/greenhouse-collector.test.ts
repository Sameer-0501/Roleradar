/**
 * Greenhouse Collector Tests
 *
 * Unit tests with mocked fetch — no real network calls.
 * Tests normalization, validation, error handling, and health check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GreenhouseCollector } from '../collectors/ats/greenhouse-collector.js';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 8556658002,
    title: 'Software Engineer',
    absolute_url: 'https://job-boards.greenhouse.io/gitlab/jobs/8556658002',
    location: { name: 'Remote, Bangalore' },
    first_published: '2026-05-22T09:16:29-04:00',
    content: '<p>Write <strong>code</strong></p>',
    updated_at: '2026-08-11T08:18:18-04:00',
    ...overrides,
  };
}

function makeSuccessResponse(jobs: unknown[]) {
  return new Response(JSON.stringify({ jobs }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeCollector() {
  return new GreenhouseCollector({
    boardToken: 'gitlab',
    companyName: 'GitLab',
    officialDomain: 'job-boards.greenhouse.io',
    timeoutMs: 5000,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GreenhouseCollector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── discoverJobs: happy path ───────────────────────────────────────────
  it('returns normalized JobCandidates for a valid response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse([makeJob()]));

    const collector = makeCollector();
    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.externalJobId).toBe('8556658002');
    expect(c.title).toBe('Software Engineer');
    expect(c.officialUrl).toBe('https://job-boards.greenhouse.io/gitlab/jobs/8556658002');
    expect(c.location).toBe('Remote, Bangalore');
    expect(c.sourceSystem).toBe('GREENHOUSE');
    expect(c.officialPostedAt).toBeInstanceOf(Date);
    expect(c.description).toContain('Write');
    expect(c.description).not.toContain('<p>'); // HTML stripped
  });

  it('strips HTML from description', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeJob({ content: '<h2>Role</h2><p>Build <b>great</b> things</p>' })])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates[0]!.description).toBe('Role Build great things');
  });

  it('returns empty array for empty jobs list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse([]));
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array for malformed JSON response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('not-json', { status: 200 })
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array when HTTP response is 500', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Error', { status: 500 }));
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array on network timeout/error', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  // ── discoverJobs: field validation ────────────────────────────────────
  it('rejects a job with missing id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeJob({ id: undefined })])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a job with empty title', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeJob({ title: '   ' })])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a job with missing absolute_url', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeJob({ absolute_url: null })])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a job with a non-HTTPS URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([
        makeJob({ absolute_url: 'http://job-boards.greenhouse.io/gitlab/jobs/8556658002' }),
      ])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a job with a URL on the wrong domain', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([
        makeJob({ absolute_url: 'https://scam-site.com/gitlab/jobs/8556658002' }),
      ])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('handles missing optional fields gracefully (no location, no content)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([
        makeJob({ location: null, content: null, first_published: null }),
      ])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.location).toBeUndefined();
    expect(candidates[0]!.description).toBeUndefined();
    expect(candidates[0]!.officialPostedAt).toBeUndefined();
  });

  it('accepts multiple valid jobs', async () => {
    const jobs = [
      makeJob({ id: 111, title: 'Engineer I' }),
      makeJob({ id: 222, title: 'Engineer II' }),
      makeJob({ id: 333, title: 'Engineer III' }),
    ];
    vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse(jobs));
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(3);
  });

  // ── Metadata ────────────────────────────────────────────────────────
  it('returns correct source name', () => {
    expect(makeCollector().getSourceName()).toBe('GitLab Greenhouse Collector');
  });

  it('returns GREENHOUSE as source type', () => {
    expect(makeCollector().getSourceType()).toBe('GREENHOUSE');
  });

  it('supports("GitLab") returns true', () => {
    expect(makeCollector().supports('GitLab')).toBe(true);
  });

  it('supports("gitlab") returns true (case-insensitive)', () => {
    expect(makeCollector().supports('gitlab')).toBe(true);
  });

  it('supports("Other") returns false', () => {
    expect(makeCollector().supports('Other')).toBe(false);
  });

  // ── healthCheck ─────────────────────────────────────────────────────
  it('healthCheck returns healthy=true when API is reachable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeJob()])
    );
    const health = await makeCollector().healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.message).toMatch(/reachable/i);
  });

  it('healthCheck returns healthy=false when API returns 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not found', { status: 404 }));
    const health = await makeCollector().healthCheck();
    expect(health.healthy).toBe(false);
  });

  it('healthCheck returns healthy=false on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const health = await makeCollector().healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.message).toMatch(/unreachable/i);
  });
});
