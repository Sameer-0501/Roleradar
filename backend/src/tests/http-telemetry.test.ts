/**
 * Step 4: Outbound HTTP Telemetry & Byte Metrics Unit Tests
 *
 * Verifies Safeguard 4:
 * 1. Telemetry clearly distinguishes decompressedPayloadBytes, contentLengthBytes,
 *    requestPayloadBytes, and estimatedWireBytes.
 * 2. Estimated wire bytes are explicitly labeled with isWireBytesEstimated: true and never as exact measurements.
 * 3. tracedFetch passes through the exact response unmutated so caller response.json() works seamlessly.
 * 4. Aggregated metrics accurately group by host, category, and time window.
 * 5. Network failures are recorded with status 0 and outbound payload metrics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpTelemetry, tracedFetch, HttpTelemetryService } from '../utils/http-telemetry.js';

describe('Step 4: Outbound HTTP Telemetry & Byte Metrics', () => {
  beforeEach(() => {
    httpTelemetry.resetForTesting();
    vi.restoreAllMocks();
  });

  it('1. Safeguard 4: Explicitly distinguishes payload bytes, Content-Length, and estimated wire bytes', () => {
    const service = new HttpTelemetryService();

    service.record({
      url: 'https://boards-api.greenhouse.io/v1/boards/gitlab/jobs',
      host: 'boards-api.greenhouse.io',
      method: 'GET',
      status: 200,
      durationMs: 145,
      contentLengthBytes: 45000, // compressed Content-Length on wire
      decompressedPayloadBytes: 180000, // decompressed in-memory JSON size
      requestPayloadBytes: 0,
      estimatedWireBytes: 45750,
      category: 'ATS_DISCOVERY',
    });

    const summary = service.getSummary();

    // Invariant: clearly distinguished metrics
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalContentLengthBytes).toBe(45000);
    expect(summary.totalDecompressedPayloadBytes).toBe(180000);
    expect(summary.totalEstimatedWireBytes).toBe(45750);
    expect(summary.isWireBytesEstimated).toBe(true);

    const hostStats = summary.byHost['boards-api.greenhouse.io'];
    expect(hostStats).toBeDefined();
    expect(hostStats?.decompressedPayloadBytes).toBe(180000);
    expect(hostStats?.contentLengthBytesTotal).toBe(45000);
    expect(hostStats?.estimatedWireBytes).toBe(45750);
  });

  it('2. Handles responses without Content-Length (chunked transfer) without crashing or mislabeling', () => {
    const service = new HttpTelemetryService();

    service.record({
      url: 'https://api.ashbyhq.com/posting-api/job-board/linear',
      host: 'api.ashbyhq.com',
      method: 'GET',
      status: 200,
      durationMs: 210,
      contentLengthBytes: null, // chunked transfer encoding — no header
      decompressedPayloadBytes: 65400,
      requestPayloadBytes: 0,
      estimatedWireBytes: 66150,
      category: 'ATS_DISCOVERY',
    });

    const summary = service.getSummary();

    expect(summary.totalContentLengthBytes).toBe(0); // null not added
    expect(summary.totalDecompressedPayloadBytes).toBe(65400);
    expect(summary.isWireBytesEstimated).toBe(true);
  });

  it('3. tracedFetch captures metrics and allows caller to read response.json() cleanly', async () => {
    const mockJson = { id: 123, title: 'Staff Systems Engineer', active: true };
    const mockBody = JSON.stringify(mockJson);

    // Mock global fetch
    const mockResponse = new Response(mockBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(mockBody, 'utf8')),
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const response = await tracedFetch(
      'https://boards-api.greenhouse.io/v1/boards/gitlab/jobs/123',
      { method: 'GET' },
      'ATS_VERIFICATION'
    );

    // Verify caller can still read response.json() unhindered
    const data = await response.json();
    expect(data).toEqual(mockJson);

    const summary = httpTelemetry.getSummary();
    expect(summary.totalRequests).toBe(1);
    expect(summary.byCategory.ATS_VERIFICATION.requests).toBe(1);
    expect(summary.byCategory.ATS_VERIFICATION.decompressedPayloadBytes).toBe(Buffer.byteLength(mockBody, 'utf8'));
    expect(summary.byHost['boards-api.greenhouse.io']?.requests).toBe(1);
  });

  it('4. tracedFetch measures outbound POST payload bytes', async () => {
    const postPayload = JSON.stringify({ page: 1, limit: 50, filters: { department: 'Engineering' } });
    const mockResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Length': '11' },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await tracedFetch(
      'https://apply.workable.com/api/v3/accounts/acme/jobs',
      {
        method: 'POST',
        body: postPayload,
      },
      'ATS_DISCOVERY'
    );

    const summary = httpTelemetry.getSummary();
    expect(summary.totalRequests).toBe(1);
    const recent = summary.recentRequests[0]!;
    expect(recent.method).toBe('POST');
    expect(recent.requestPayloadBytes).toBe(Buffer.byteLength(postPayload, 'utf8'));
    expect(recent.decompressedPayloadBytes).toBe(11);
  });

  it('5. Records network errors with status 0 without throwing away telemetry', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection reset by peer'));

    await expect(
      tracedFetch('https://api.lever.co/v0/postings/palantir', { method: 'GET' }, 'ATS_DISCOVERY')
    ).rejects.toThrow('Connection reset by peer');

    const summary = httpTelemetry.getSummary();
    expect(summary.totalRequests).toBe(1);
    const failedRecord = summary.recentRequests[0]!;
    expect(failedRecord.status).toBe(0);
    expect(failedRecord.host).toBe('api.lever.co');
    expect(failedRecord.category).toBe('ATS_DISCOVERY');
  });
});
