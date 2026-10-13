/**
 * Tests: Collector Interface & Registry
 *
 * Tests the collector registry and base collector contracts.
 * No DB connection required.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CollectorRegistry } from '../collectors/registry.js';
import { BaseCollector } from '../collectors/base-collector.js';
import type { JobCandidate, CollectorHealth } from '../collectors/types.js';
import type { AtsType } from '../ats/types.js';

class TestCollector extends BaseCollector {
  constructor(private readonly companyName: string) {
    super();
  }

  async discoverJobs(): Promise<JobCandidate[]> {
    return [];
  }

  getSourceName(): string {
    return `${this.companyName} Test Collector`;
  }

  getSourceType(): AtsType {
    return 'GREENHOUSE';
  }

  supports(companyName: string): boolean {
    return companyName === this.companyName;
  }

  override async healthCheck(): Promise<CollectorHealth> {
    return { healthy: true, message: 'Test collector always healthy', checkedAt: new Date() };
  }
}

describe('CollectorRegistry', () => {
  beforeEach(() => {
    CollectorRegistry.clear();
  });

  it('starts empty', () => {
    expect(CollectorRegistry.count()).toBe(0);
  });

  it('registers a collector', () => {
    CollectorRegistry.register(new TestCollector('AcmeCorp'));
    expect(CollectorRegistry.count()).toBe(1);
  });

  it('finds a collector by company name', () => {
    CollectorRegistry.register(new TestCollector('AcmeCorp'));
    const found = CollectorRegistry.findForCompany('AcmeCorp');
    expect(found).toBeDefined();
    expect(found?.getSourceName()).toBe('AcmeCorp Test Collector');
  });

  it('returns undefined for unregistered company', () => {
    const found = CollectorRegistry.findForCompany('UnknownCorp');
    expect(found).toBeUndefined();
  });

  it('lists registered collector names', () => {
    CollectorRegistry.register(new TestCollector('Alpha'));
    CollectorRegistry.register(new TestCollector('Beta'));
    const names = CollectorRegistry.listNames();
    expect(names).toContain('Alpha Test Collector');
    expect(names).toContain('Beta Test Collector');
  });

  it('getAll returns all registered collectors', () => {
    CollectorRegistry.register(new TestCollector('Alpha'));
    CollectorRegistry.register(new TestCollector('Beta'));
    expect(CollectorRegistry.getAll()).toHaveLength(2);
  });

  it('clear removes all collectors', () => {
    CollectorRegistry.register(new TestCollector('Alpha'));
    CollectorRegistry.clear();
    expect(CollectorRegistry.count()).toBe(0);
  });

  it('registering same source name overwrites', () => {
    CollectorRegistry.register(new TestCollector('Alpha'));
    CollectorRegistry.register(new TestCollector('Alpha'));
    expect(CollectorRegistry.count()).toBe(1);
  });
});

describe('BaseCollector', () => {
  it('safeDiscover returns empty array (no real scraping in Phase 1)', async () => {
    const collector = new TestCollector('TestCorp');
    const results = await collector.safeDiscover();
    expect(results).toEqual([]);
  });

  it('healthCheck returns healthy=true for test collector', async () => {
    const collector = new TestCollector('TestCorp');
    const health = await collector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.checkedAt).toBeInstanceOf(Date);
  });

  it('supports() returns true for matching company', () => {
    const collector = new TestCollector('TargetCorp');
    expect(collector.supports('TargetCorp')).toBe(true);
    expect(collector.supports('OtherCorp')).toBe(false);
  });
});
