/**
 * Unit tests for Workable ATS Collector.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkableCollector } from '../collectors/ats/workable-collector.js';

describe('WorkableCollector', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('initializes with correct sourceName and supports company check', () => {
    const collector = new WorkableCollector({
      accountSlug: 'browserstack',
      companyName: 'BrowserStack',
    });

    expect(collector.getSourceName()).toBe('BrowserStack Workable Collector');
    expect(collector.getSourceType()).toBe('CUSTOM');
    expect(collector.supports('BrowserStack')).toBe(true);
    expect(collector.supports('browserstack')).toBe(true);
    expect(collector.supports('OtherCo')).toBe(false);
  });

  it('normalizes valid jobs from Workable API', async () => {
    const mockResults = [
      {
        id: 123456,
        shortcode: 'B9A1B2C3',
        title: 'Senior Software Engineer - Backend',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        employment_type: 'Full-time',
        telecommuting: false,
        published: '2026-08-20T10:00:00.000Z',
        description: 'Build robust distributed systems.',
        requirements: '3+ years experience with Go or Java.',
      },
      {
        id: 789012,
        shortcode: 'D4E5F6G7',
        title: 'Software Engineer - Frontend',
        city: 'Mumbai',
        country: 'India',
        telecommuting: true,
        published: '2026-08-22T10:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 2,
        results: mockResults,
      }),
    } as unknown as Response);

    const collector = new WorkableCollector({
      accountSlug: 'browserstack',
      companyName: 'BrowserStack',
    });

    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(2);

    const first = candidates[0]!;
    expect(first.externalJobId).toBe('B9A1B2C3');
    expect(first.title).toBe('Senior Software Engineer - Backend');
    expect(first.location).toBe('Bengaluru, Karnataka, India');
    expect(first.officialUrl).toBe('https://apply.workable.com/browserstack/j/B9A1B2C3');
    expect(first.applyUrl).toBe('https://apply.workable.com/browserstack/j/B9A1B2C3/apply/');
    expect(first.employmentType).toBe('Full-time');
    expect(first.sourceSystem).toBe('CUSTOM');

    const second = candidates[1]!;
    expect(second.externalJobId).toBe('D4E5F6G7');
    expect(second.title).toBe('Software Engineer - Frontend');
    expect(second.location).toBe('Mumbai, India (Remote)');
    expect(second.officialUrl).toBe('https://apply.workable.com/browserstack/j/D4E5F6G7');
  });

  it('rejects postings with missing shortcode/id or empty title', async () => {
    const mockResults = [
      {
        title: 'Invalid Job with no shortcode or id',
      },
      {
        shortcode: 'ABCDEF',
        title: '',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 2,
        results: mockResults,
      }),
    } as unknown as Response);

    const collector = new WorkableCollector({
      accountSlug: 'browserstack',
      companyName: 'BrowserStack',
    });

    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array when Workable API returns non-200 or throws', async () => {
    const collector = new WorkableCollector({
      accountSlug: 'browserstack',
      companyName: 'BrowserStack',
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as unknown as Response);

    const res429 = await collector.discoverJobs();
    expect(res429).toEqual([]);

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection timed out'));
    const resTimeout = await collector.discoverJobs();
    expect(resTimeout).toEqual([]);
  });

  it('health check reports healthy on HTTP 200 and unhealthy on failure', async () => {
    const collector = new WorkableCollector({
      accountSlug: 'browserstack',
      companyName: 'BrowserStack',
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as unknown as Response);

    const healthyResult = await collector.healthCheck();
    expect(healthyResult.healthy).toBe(true);

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as unknown as Response);

    const unhealthyResult = await collector.healthCheck();
    expect(unhealthyResult.healthy).toBe(false);
  });
});
