/**
 * Location Matcher Unit Tests.
 *
 * Tests canonical location normalization, aliases, multi-location support,
 * pure remote compatibility, and hybrid distinctions.
 */

import { describe, it, expect } from 'vitest';
import { matchLocation } from '../matching/location-matcher.js';

describe('Location Matcher', () => {
  // ── 1. Canonical Normalization & Aliases ────────────────────────────────────

  it('matches Bangalore canonical aliases (Bengaluru, BLR)', () => {
    const userLocs = ['Bangalore'];

    expect(matchLocation('Bangalore', userLocs).matched).toBe(true);
    expect(matchLocation('Bengaluru', userLocs).matched).toBe(true);
    expect(matchLocation('Bengaluru, Karnataka, India', userLocs).matched).toBe(true);
    expect(matchLocation('BLR, India', userLocs).matched).toBe(true);
  });

  it('matches Gurgaon canonical aliases (Gurugram)', () => {
    const userLocs = ['Gurgaon'];

    expect(matchLocation('Gurgaon', userLocs).matched).toBe(true);
    expect(matchLocation('Gurugram, Haryana', userLocs).matched).toBe(true);
  });

  it('matches Delhi NCR aliases (Delhi, New Delhi)', () => {
    const userLocs = ['Delhi NCR'];

    expect(matchLocation('Delhi', userLocs).matched).toBe(true);
    expect(matchLocation('New Delhi', userLocs).matched).toBe(true);
    expect(matchLocation('Delhi NCR', userLocs).matched).toBe(true);
  });

  // ── 2. Remote Compatibility ────────────────────────────────────────────────

  it('matches Remote jobs when user selects Remote', () => {
    const userLocs = ['Remote'];

    expect(matchLocation('Remote', userLocs).matched).toBe(true);
    expect(matchLocation('Worldwide', userLocs).matched).toBe(true);
    expect(matchLocation('Anywhere', userLocs).matched).toBe(true);
    expect(matchLocation('Work From Home', userLocs).matched).toBe(true);
  });

  it('does NOT automatically match Hybrid jobs as pure Remote', () => {
    const userLocs = ['Remote'];

    expect(matchLocation('Hybrid - Bangalore', userLocs).matched).toBe(false);
    expect(matchLocation('Hybrid (London)', userLocs).matched).toBe(false);
  });

  it('matches Hybrid jobs if user explicitly selected the location', () => {
    const userLocs = ['Bangalore'];

    expect(matchLocation('Hybrid - Bangalore', userLocs).matched).toBe(true);
  });

  // ── 3. Multi-location Preferences ──────────────────────────────────────────

  it('matches if job location is compatible with at least one preferred location', () => {
    const userLocs = ['Bangalore', 'Hyderabad', 'Remote'];

    expect(matchLocation('Bengaluru', userLocs).matched).toBe(true);
    expect(matchLocation('Hyderabad, Telangana', userLocs).matched).toBe(true);
    expect(matchLocation('Remote', userLocs).matched).toBe(true);
    expect(matchLocation('Geneva, Switzerland', userLocs).matched).toBe(false);
  });

  // ── 4. Unrelated Location Rejections ───────────────────────────────────────

  it('rejects unrelated locations', () => {
    expect(matchLocation('Chennai', ['Bangalore']).matched).toBe(false);
    expect(matchLocation('San Francisco, CA', ['Pune']).matched).toBe(false);
    expect(matchLocation('Berlin, Germany', ['Hyderabad']).matched).toBe(false);
  });

  // ── 5. Country-Aware Remote Semantics ──────────────────────────────────────

  it('rejects foreign country-specific remote jobs for Indian candidates with Remote', () => {
    const indianCandidateLocs = ['Bangalore', 'Hyderabad', 'Pune', 'Remote'];

    expect(matchLocation('Remote - United States', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('US - Remote', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('Remote - Canada', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('Remote - EMEA', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('Remote - UK', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('Remote - Germany', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('United States (Remote)', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('Remote (U.S.)', indianCandidateLocs).matched).toBe(false);
    expect(matchLocation('Remote (U.S)', indianCandidateLocs).matched).toBe(false);
  });

  it('matches India-compatible remote jobs for Indian candidates with Remote', () => {
    const indianCandidateLocs = ['Bangalore', 'Hyderabad', 'Pune', 'Remote'];

    expect(matchLocation('Remote - India', indianCandidateLocs).matched).toBe(true);
    expect(matchLocation('Remote, Bangalore', indianCandidateLocs).matched).toBe(true);
    expect(matchLocation('India (Remote)', indianCandidateLocs).matched).toBe(true);
    expect(matchLocation('Remote', indianCandidateLocs).matched).toBe(true);
    expect(matchLocation('Worldwide', indianCandidateLocs).matched).toBe(true);
  });

  it('matches foreign country-specific remote if candidate explicitly requests that foreign region', () => {
    const globalCandidateLocs = ['Bangalore', 'Remote', 'United States'];

    expect(matchLocation('Remote - United States', globalCandidateLocs).matched).toBe(true);
    expect(matchLocation('US - Remote', globalCandidateLocs).matched).toBe(true);
  });
});
