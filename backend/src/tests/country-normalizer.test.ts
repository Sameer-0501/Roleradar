import { describe, it, expect } from 'vitest';
import {
  normalizeCountry,
  analyzeLocation,
  isWorldwideRemoteLocation,
  isCountryCompatible,
} from '../matching/country-normalizer.js';

describe('Country Normalizer & International Location Analysis', () => {
  it('normalizes common country aliases and codes', () => {
    expect(normalizeCountry('USA')).toBe('United States');
    expect(normalizeCountry('US')).toBe('United States');
    expect(normalizeCountry('United States of America')).toBe('United States');
    expect(normalizeCountry('UK')).toBe('United Kingdom');
    expect(normalizeCountry('Great Britain')).toBe('United Kingdom');
    expect(normalizeCountry('Germany')).toBe('Germany');
    expect(normalizeCountry('Deutschland')).toBe('Germany');
    expect(normalizeCountry('DE')).toBe('Germany');
    expect(normalizeCountry('Canada')).toBe('Canada');
    expect(normalizeCountry('Australia')).toBe('Australia');
    expect(normalizeCountry('India')).toBe('India');
    expect(normalizeCountry('IN')).toBe('India');
  });

  it('detects major cities to their canonical country', () => {
    expect(normalizeCountry('London')).toBe('United Kingdom');
    expect(normalizeCountry('Berlin')).toBe('Germany');
    expect(normalizeCountry('Toronto')).toBe('Canada');
    expect(normalizeCountry('San Francisco')).toBe('United States');
    expect(normalizeCountry('Sydney')).toBe('Australia');
    expect(normalizeCountry('Bangalore')).toBe('India');
  });

  it('accurately identifies worldwide remote locations', () => {
    expect(isWorldwideRemoteLocation('Remote - Worldwide')).toBe(true);
    expect(isWorldwideRemoteLocation('Work from anywhere')).toBe(true);
    expect(isWorldwideRemoteLocation('Global Remote')).toBe(true);
    expect(isWorldwideRemoteLocation('Remote, US')).toBe(false);
    expect(isWorldwideRemoteLocation('Remote - India')).toBe(false);
  });

  it('analyzes complex location strings', () => {
    const a1 = analyzeLocation('Remote - United States');
    expect(a1.isRemote).toBe(true);
    expect(a1.detectedCountries).toContain('United States');
    expect(a1.isWorldwideRemote).toBe(false);

    const a2 = analyzeLocation('Berlin, Germany (Hybrid)');
    expect(a2.isRemote).toBe(false);
    expect(a2.detectedCountries).toContain('Germany');
    expect(a2.detectedCities).toContain('berlin');

    const a3 = analyzeLocation('Remote - Worldwide');
    expect(a3.isRemote).toBe(true);
    expect(a3.isWorldwideRemote).toBe(true);
    expect(a3.remoteScope).toBe('WORLDWIDE');
  });

  it('enforces country-aware remote matching and foreign exclusion', () => {
    // US Remote job
    const usRemote = analyzeLocation('Remote - US');

    // Indian user: India + Remote
    const resIndiaUser = isCountryCompatible(usRemote, ['India', 'Bangalore', 'Remote']);
    expect(resIndiaUser.compatible).toBe(false);

    // US user: United States + Remote
    const resUsUser = isCountryCompatible(usRemote, ['United States', 'Remote']);
    expect(resUsUser.compatible).toBe(true);

    // Worldwide remote job matches both
    const worldwideJob = analyzeLocation('Remote (Worldwide)');
    expect(isCountryCompatible(worldwideJob, ['India', 'Remote']).compatible).toBe(true);
    expect(isCountryCompatible(worldwideJob, ['United States', 'Remote']).compatible).toBe(true);
  });
});
