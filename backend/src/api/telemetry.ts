/**
 * RoleRadar Web Vitals & Real-User Performance Telemetry (Item 30).
 *
 * Implements recommendation: "track real-user speed with a performance-monitoring tool"
 * Ingests client Core Web Vitals (INP, LCP, CLS, FCP, TTFB) with privacy protection.
 */

import type { Request, Response } from 'express';
import { createLogger } from '../utils/logger.js';

const log = createLogger('telemetry:rum');

export interface VitalMetric {
  name: 'INP' | 'LCP' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  route: string;
  timestamp: number;
  navigationType?: string;
}

const vitalsBuffer: VitalMetric[] = [];
const VALID_METRIC_NAMES = new Set(['INP', 'LCP', 'CLS', 'FCP', 'TTFB']);

export function recordVitalsHandler(req: Request, res: Response): void {
  const metric = req.body as VitalMetric;

  if (metric && VALID_METRIC_NAMES.has(metric.name) && typeof metric.value === 'number') {
    // Sanitize route to avoid PII / token leakage
    const sanitizedMetric: VitalMetric = {
      name: metric.name,
      value: metric.value,
      rating: metric.rating || (metric.value > 1000 ? 'poor' : 'good'),
      route: (metric.route || '/').replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, ':id'),
      timestamp: metric.timestamp || Date.now(),
      navigationType: metric.navigationType,
    };

    vitalsBuffer.push(sanitizedMetric);
    if (vitalsBuffer.length > 1000) {
      vitalsBuffer.shift();
    }

    if (sanitizedMetric.rating === 'poor') {
      log.warn(
        { metric: sanitizedMetric.name, value: sanitizedMetric.value, rating: sanitizedMetric.rating, route: sanitizedMetric.route },
        `[RUM] Web Vital POOR performance: ${sanitizedMetric.name} = ${sanitizedMetric.value}`
      );
    } else {
      log.debug(
        { metric: sanitizedMetric.name, value: sanitizedMetric.value, rating: sanitizedMetric.rating },
        '[RUM] Web Vital recorded'
      );
    }
  }

  res.status(204).end();
}

export function getVitalsSummaryHandler(_req: Request, res: Response): void {
  res.json({
    totalRecorded: vitalsBuffer.length,
    recent: vitalsBuffer.slice(-25),
  });
}
