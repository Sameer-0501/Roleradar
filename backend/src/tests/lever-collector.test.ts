/**
 * Lever Collector Tests
 *
 * Unit tests with mocked fetch — no real network calls.
 * Tests normalization, field validation, requirements extraction,
 * error handling, and health check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LeverCollector } from '../collectors/ats/lever-collector.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeLeverPosting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ac978161-6f46-4f6b-ad9e-a258e642751c',
    text: 'Software Engineer - Infrastructure',
    createdAt: 1711403416463,
    categories: {
      commitment: 'Full-time',
      location: 'New York, NY',
      team: 'Engineering',
      allLocations: ['New York, NY'],
    },
    descriptionPlain: 'Build world-class distributed platforms.',
    description: '<div>Build <strong>world-class</strong> distributed platforms.</div>',
    lists: [
      {
        text: 'What We Require',
        content: '\n<li>5+ years of distributed systems experience</li>\n<li>Proficiency in Go or C++</li>',
      },
    ],
    hostedUrl: 'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c',
    applyUrl: 'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c/apply',
    workplaceType: 'hybrid',
    country: 'US',
    ...overrides,
  };
}

function makeSuccessResponse(postings: unknown[]) {
  return new Response(JSON.stringify(postings), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeCollector() {
  return new LeverCollector({
    siteToken: 'palantir',
    companyName: 'Palantir',
    officialDomain: 'jobs.lever.co',
    timeoutMs: 5000,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeverCollector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── discoverJobs: happy path ───────────────────────────────────────────
  it('returns normalized JobCandidates for a valid response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse([makeLeverPosting()]));

    const collector = makeCollector();
    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.externalJobId).toBe('ac978161-6f46-4f6b-ad9e-a258e642751c');
    expect(c.title).toBe('Software Engineer - Infrastructure');
    expect(c.officialUrl).toBe(
      'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c'
    );
    expect(c.applyUrl).toBe(
      'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c/apply'
    );
    expect(c.location).toBe('New York, NY');
    expect(c.employmentType).toBe('Full-time');
    expect(c.sourceSystem).toBe('LEVER');
    expect(c.officialPostedAt).toBeInstanceOf(Date);
    expect(c.description).toContain('Build world-class distributed platforms.');
    expect(c.requirements).toContain('What We Require');
    expect(c.requirements).toContain('5+ years of distributed systems experience');
  });

  it('handles HTML descriptions when plain text description is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([
        makeLeverPosting({
          descriptionPlain: undefined,
          descriptionBodyPlain: undefined,
          description: '<p>Join our <b>core team</b></p>',
        }),
      ])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates[0]!.description).toBe('Join our core team');
  });

  it('returns empty array for empty postings list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse([]));
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array for malformed JSON response (non-array)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'not an array' }), { status: 200 })
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array when HTTP response is 500', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Server Error', { status: 500 }));
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array on network timeout/error', async () => {
    vi.mocked(fetch).mockRejectedValue(
      Object.assign(new Error('Aborted'), { name: 'AbortError' })
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  // ── discoverJobs: field validations ────────────────────────────────────
  it('rejects a posting with missing id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeLeverPosting({ id: undefined })])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a posting with empty text (title)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeLeverPosting({ text: '   ' })])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a posting with missing hostedUrl', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([makeLeverPosting({ hostedUrl: null })])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a posting with an invalid non-HTTPS hostedUrl', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([
        makeLeverPosting({
          hostedUrl: 'http://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c',
        }),
      ])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('rejects a posting with a hostedUrl on the wrong domain', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([
        makeLeverPosting({
          hostedUrl: 'https://fakejobs.com/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c',
        }),
      ])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('handles optional fields omitted gracefully (no categories, lists, createdAt)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeSuccessResponse([
        makeLeverPosting({
          categories: null,
          lists: null,
          createdAt: null,
          descriptionPlain: null,
          description: null,
          applyUrl: null,
        }),
      ])
    );
    const candidates = await makeCollector().discoverJobs();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.location).toBeUndefined();
    expect(candidates[0]!.requirements).toBeUndefined();
    expect(candidates[0]!.officialPostedAt).toBeUndefined();
    expect(candidates[0]!.applyUrl).toBeUndefined();
  });

  // ── Collector metadata & healthCheck ──────────────────────────────────
  it('returns correct source name', () => {
    expect(makeCollector().getSourceName()).toBe('Palantir Lever Collector');
  });

  it('returns LEVER as source type', () => {
    expect(makeCollector().getSourceType()).toBe('LEVER');
  });

  it('supports("Palantir") returns true', () => {
    expect(makeCollector().supports('Palantir')).toBe(true);
  });

  it('supports("palantir") returns true (case-insensitive)', () => {
    expect(makeCollector().supports('palantir')).toBe(true);
  });

  it('supports("Other") returns false', () => {
    expect(makeCollector().supports('Other')).toBe(false);
  });

  it('healthCheck returns healthy=true when API is reachable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse([makeLeverPosting()]));
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
