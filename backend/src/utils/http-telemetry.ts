/**
 * Outbound HTTP Telemetry & Byte Metrics Tracker.
 *
 * Implements Step 4 (P1) of the Network Consumption Optimization Master Plan.
 *
 * SAFEGUARD 4 COMPLIANCE:
 * Clearly distinguishes:
 * 1. `decompressedPayloadBytes`: Exact byte length of decoded application payload in memory.
 * 2. `contentLengthBytes`: Content-Length header value if sent by origin server (null if chunked/omitted).
 * 3. `requestPayloadBytes`: Exact byte length of outbound request body (e.g. POST JSON payload).
 * 4. `estimatedWireBytes`: Explicitly labeled ESTIMATE combining headers and compressed/chunked payload.
 *    Never mislabeled as an exact network wire measurement.
 */

import { createLogger } from './logger.js';

const log = createLogger('http-telemetry');

export type HttpTelemetryCategory =
  | 'ATS_DISCOVERY'
  | 'ATS_VERIFICATION'
  | 'HEALTH_CHECK'
  | 'OTHER';

export interface HttpTelemetryRecord {
  url: string;
  host: string;
  method: string;
  status: number;
  durationMs: number;
  contentLengthBytes: number | null;
  decompressedPayloadBytes: number;
  requestPayloadBytes: number;
  estimatedWireBytes: number;
  isWireBytesEstimated: true; // Explicit flag confirming wire bytes are estimated
  category: HttpTelemetryCategory;
  timestamp: Date;
}

export interface HostMetricsSummary {
  requests: number;
  decompressedPayloadBytes: number;
  contentLengthBytesTotal: number;
  estimatedWireBytes: number;
  avgDurationMs: number;
}

export interface TelemetrySummary {
  totalRequests: number;
  totalDecompressedPayloadBytes: number;
  totalContentLengthBytes: number;
  totalEstimatedWireBytes: number;
  isWireBytesEstimated: true;
  byHost: Record<string, HostMetricsSummary>;
  byCategory: Record<
    HttpTelemetryCategory,
    {
      requests: number;
      decompressedPayloadBytes: number;
      estimatedWireBytes: number;
    }
  >;
  recentRequests: HttpTelemetryRecord[];
}

export class HttpTelemetryService {
  private records: HttpTelemetryRecord[] = [];
  private maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  /**
   * Record a completed HTTP request and its byte metrics.
   */
  record(entry: Omit<HttpTelemetryRecord, 'isWireBytesEstimated' | 'timestamp'> & { timestamp?: Date }): HttpTelemetryRecord {
    const fullRecord: HttpTelemetryRecord = {
      ...entry,
      isWireBytesEstimated: true,
      timestamp: entry.timestamp ?? new Date(),
    };

    this.records.push(fullRecord);
    if (this.records.length > this.maxHistory) {
      this.records.shift();
    }

    log.debug(
      {
        host: fullRecord.host,
        status: fullRecord.status,
        durationMs: fullRecord.durationMs,
        decompressedBytes: fullRecord.decompressedPayloadBytes,
        contentLength: fullRecord.contentLengthBytes,
        estimatedWireBytes: fullRecord.estimatedWireBytes,
        category: fullRecord.category,
      },
      'HTTP_TELEMETRY_RECORD'
    );

    return fullRecord;
  }

  /**
   * Get an aggregated summary of outbound HTTP network metrics.
   *
   * @param timeWindowMs - Optional window in milliseconds (e.g. last 60 minutes)
   */
  getSummary(timeWindowMs?: number): TelemetrySummary {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const filtered = cutoff > 0 ? this.records.filter((r) => r.timestamp.getTime() >= cutoff) : this.records;

    const summary: TelemetrySummary = {
      totalRequests: filtered.length,
      totalDecompressedPayloadBytes: 0,
      totalContentLengthBytes: 0,
      totalEstimatedWireBytes: 0,
      isWireBytesEstimated: true,
      byHost: {},
      byCategory: {
        ATS_DISCOVERY: { requests: 0, decompressedPayloadBytes: 0, estimatedWireBytes: 0 },
        ATS_VERIFICATION: { requests: 0, decompressedPayloadBytes: 0, estimatedWireBytes: 0 },
        HEALTH_CHECK: { requests: 0, decompressedPayloadBytes: 0, estimatedWireBytes: 0 },
        OTHER: { requests: 0, decompressedPayloadBytes: 0, estimatedWireBytes: 0 },
      },
      recentRequests: filtered.slice(-50),
    };

    const hostDurations: Record<string, number[]> = {};

    for (const record of filtered) {
      summary.totalDecompressedPayloadBytes += record.decompressedPayloadBytes;
      if (record.contentLengthBytes !== null) {
        summary.totalContentLengthBytes += record.contentLengthBytes;
      }
      summary.totalEstimatedWireBytes += record.estimatedWireBytes;

      // By Category
      const cat = summary.byCategory[record.category] ?? summary.byCategory.OTHER;
      cat.requests++;
      cat.decompressedPayloadBytes += record.decompressedPayloadBytes;
      cat.estimatedWireBytes += record.estimatedWireBytes;

      // By Host
      if (!summary.byHost[record.host]) {
        summary.byHost[record.host] = {
          requests: 0,
          decompressedPayloadBytes: 0,
          contentLengthBytesTotal: 0,
          estimatedWireBytes: 0,
          avgDurationMs: 0,
        };
        hostDurations[record.host] = [];
      }

      const hostEntry = summary.byHost[record.host]!;
      hostEntry.requests++;
      hostEntry.decompressedPayloadBytes += record.decompressedPayloadBytes;
      if (record.contentLengthBytes !== null) {
        hostEntry.contentLengthBytesTotal += record.contentLengthBytes;
      }
      hostEntry.estimatedWireBytes += record.estimatedWireBytes;
      hostDurations[record.host]!.push(record.durationMs);
    }

    // Compute average durations per host
    for (const [host, durations] of Object.entries(hostDurations)) {
      if (durations.length > 0 && summary.byHost[host]) {
        const total = durations.reduce((a, b) => a + b, 0);
        summary.byHost[host]!.avgDurationMs = Math.round(total / durations.length);
      }
    }

    return summary;
  }

  /**
   * Reset stored records (primarily for testing).
   */
  resetForTesting(): void {
    this.records = [];
  }
}

export const httpTelemetry = new HttpTelemetryService();

/**
 * Lightweight traced wrapper around fetch() that captures exact payload sizes,
 * server Content-Length headers, and estimated wire bytes without mutating
 * or consuming the caller's response stream.
 *
 * @param url      - Target URL string or URL object
 * @param init     - Standard RequestInit options
 * @param category - Classification of the outbound call (e.g. ATS_DISCOVERY)
 */
export async function tracedFetch(
  url: string | URL,
  init?: RequestInit,
  category: HttpTelemetryCategory = 'OTHER'
): Promise<Response> {
  const urlObj = typeof url === 'string' ? new URL(url) : url;
  const host = urlObj.hostname.toLowerCase();
  const method = (init?.method ?? 'GET').toUpperCase();
  const startMs = Date.now();

  // Measure outbound request body size
  let requestPayloadBytes = 0;
  if (init?.body) {
    if (typeof init.body === 'string') {
      requestPayloadBytes = Buffer.byteLength(init.body, 'utf8');
    } else if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) {
      requestPayloadBytes = init.body.byteLength;
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), init);
  } catch (err) {
    const durationMs = Date.now() - startMs;
    httpTelemetry.record({
      url: url.toString(),
      host,
      method,
      status: 0, // network failure
      durationMs,
      contentLengthBytes: null,
      decompressedPayloadBytes: 0,
      requestPayloadBytes,
      estimatedWireBytes: requestPayloadBytes + 400, // estimated headers on failure
      category,
    });
    throw err;
  }

  const durationMs = Date.now() - startMs;

  // Inspect headers safely (supports both WHATWG Response and unit test mocks)
  const headers = response.headers;
  const clHeader = headers && typeof headers.get === 'function' ? headers.get('content-length') : null;
  const contentLengthBytes = clHeader !== null && !isNaN(Number(clHeader)) ? parseInt(clHeader, 10) : null;

  // Accurately capture decompressed body size using clone() if available
  let decompressedPayloadBytes = 0;
  if (typeof response.clone === 'function') {
    try {
      const clone = response.clone();
      if (typeof clone.arrayBuffer === 'function') {
        const buffer = await clone.arrayBuffer();
        decompressedPayloadBytes = buffer.byteLength;
      }
    } catch {
      decompressedPayloadBytes = contentLengthBytes ?? 0;
    }
  } else {
    decompressedPayloadBytes = contentLengthBytes ?? 0;
  }

  // Calculate estimated wire bytes (never claimed as exact wire measurement):
  // Estimated as: outbound request (~400 bytes headers + body) + incoming response (Content-Length or decompressed + ~350 bytes headers)
  const headerEstimate = 750;
  const bodyWireEstimate = contentLengthBytes !== null ? contentLengthBytes : decompressedPayloadBytes;
  const estimatedWireBytes = requestPayloadBytes + bodyWireEstimate + headerEstimate;

  httpTelemetry.record({
    url: url.toString(),
    host,
    method,
    status: response.status,
    durationMs,
    contentLengthBytes,
    decompressedPayloadBytes,
    requestPayloadBytes,
    estimatedWireBytes,
    category,
  });

  return response;
}
