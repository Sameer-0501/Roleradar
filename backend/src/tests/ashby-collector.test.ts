/**
 * Unit tests for Ashby ATS Collector.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AshbyCollector } from '../collectors/ats/ashby-collector.js';

describe('AshbyCollector', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('initializes with correct sourceName and supports company check', () => {
    const collector = new AshbyCollector({
      jobBoardName: 'linear',
      companyName: 'Linear',
    });

    expect(collector.getSourceName()).toBe('Linear Ashby Collector');
    expect(collector.getSourceType()).toBe('CUSTOM');
    expect(collector.supports('Linear')).toBe(true);
    expect(collector.supports('linear')).toBe(true);
    expect(collector.supports('OtherCo')).toBe(false);
  });

  it('normalizes valid jobs from Ashby API', async () => {
    const mockJobs = [
      {
        id: '423f1146-24ea-45a8-bc6b-324f1cb91599',
        title: 'Senior Frontend Engineer',
        location: 'Remote, US',
        employmentType: 'FullTime',
        jobUrl: 'https://jobs.ashbyhq.com/linear/423f1146-24ea-45a8-bc6b-324f1cb91599',
        applyUrl: 'https://jobs.ashbyhq.com/linear/423f1146-24ea-45a8-bc6b-324f1cb91599/application',
        descriptionPlain: 'Build high-performance web applications using React and TypeScript.',
        publishedAt: '2026-08-20T10:00:00.000Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: '1.0',
        jobs: mockJobs,
      }),
    } as unknown as Response);

    const collector = new AshbyCollector({
      jobBoardName: 'linear',
      companyName: 'Linear',
    });

    const candidates = await collector.discoverJobs();

    expect(candidates).toHaveLength(1);
    const first = candidates[0]!;
    expect(first.externalJobId).toBe('423f1146-24ea-45a8-bc6b-324f1cb91599');
    expect(first.title).toBe('Senior Frontend Engineer');
    expect(first.location).toBe('Remote, US');
    expect(first.officialUrl).toBe('https://jobs.ashbyhq.com/linear/423f1146-24ea-45a8-bc6b-324f1cb91599');
    expect(first.sourceSystem).toBe('CUSTOM');
  });

  it('rejects invalid or non-HTTPS URLs', async () => {
    const mockJobs = [
      {
        id: '423f1146-24ea-45a8-bc6b-324f1cb91599',
        title: 'Software Engineer',
        jobUrl: 'http://insecure.com/job/1',
      },
      {
        id: '55555555-24ea-45a8-bc6b-324f1cb91599',
        title: 'Backend Engineer',
        jobUrl: 'https://unauthorized-domain.com/linear/5555',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: '1.0',
        jobs: mockJobs,
      }),
    } as unknown as Response);

    const collector = new AshbyCollector({
      jobBoardName: 'linear',
      companyName: 'Linear',
    });

    const candidates = await collector.discoverJobs();
    expect(candidates).toHaveLength(0);
  });

  it('health check reports healthy on HTTP 200 and unhealthy on failure', async () => {
    const collector = new AshbyCollector({
      jobBoardName: 'linear',
      companyName: 'Linear',
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
    } as unknown as Response);

    const healthyResult = await collector.healthCheck();
    expect(healthyResult.healthy).toBe(true);

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as unknown as Response);

    const unhealthyResult = await collector.healthCheck();
    expect(unhealthyResult.healthy).toBe(false);
  });
});
