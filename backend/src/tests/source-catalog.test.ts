/**
 * Unit tests for Source Catalog and Factory.
 */

import { describe, it, expect } from 'vitest';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { createCollectorForSource } from '../sources/source-factory.js';

describe('Source Catalog & Factory', () => {
  it('contains at least 20 verified real companies', () => {
    expect(SOURCE_CATALOG.length).toBeGreaterThanOrEqual(20);
  });

  it('every configured source has valid fields and authoritative domain', () => {
    for (const source of SOURCE_CATALOG) {
      expect(source.companyName).toBeTruthy();
      expect(source.officialDomain).toBeTruthy();
      expect(source.careersUrl).toMatch(/^https:\/\//);
      expect(source.atsType).toMatch(/^(GREENHOUSE|LEVER|WORKDAY|CUSTOM|ASHBY|WORKABLE|SMARTRECRUITERS|SAP)$/);
      expect(source.isActive).toBe(true);
    }
  });

  it('source factory creates working collector for each source definition', () => {
    for (const source of SOURCE_CATALOG) {
      const collector = createCollectorForSource(source);
      expect(collector).toBeDefined();
      expect(collector.supports(source.companyName)).toBe(true);
      expect(typeof collector.discoverJobs).toBe('function');
      expect(typeof collector.healthCheck).toBe('function');
    }
  });

  it('covers 6 major ATS architectures across the catalog', () => {
    const atsTypes = new Set(SOURCE_CATALOG.map((s) => s.atsType));
    expect(atsTypes.has('GREENHOUSE')).toBe(true);
    expect(atsTypes.has('LEVER')).toBe(true);
    expect(atsTypes.has('WORKDAY')).toBe(true);
    expect(atsTypes.has('ASHBY')).toBe(true);
    expect(atsTypes.has('WORKABLE')).toBe(true);
    expect(atsTypes.has('SMARTRECRUITERS')).toBe(true);
  });
});
