/**
 * Unit tests for Timezone Utility.
 */

import { describe, it, expect } from 'vitest';
import { getStartOfTodayInTimezone } from '../utils/timezone.js';

describe('Timezone Utility', () => {
  it('computes a valid Date object for Asia/Kolkata', () => {
    const kolkataStart = getStartOfTodayInTimezone('Asia/Kolkata');
    expect(kolkataStart).toBeInstanceOf(Date);
    expect(kolkataStart.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('computes timezone start of day within valid 24h window', () => {
    const tokyoStart = getStartOfTodayInTimezone('Asia/Tokyo');
    const nyStart = getStartOfTodayInTimezone('America/New_York');

    expect(tokyoStart).toBeInstanceOf(Date);
    expect(nyStart).toBeInstanceOf(Date);
    // Both should be valid dates within 24h of current time
    const diffHoursTokyo = Math.abs(Date.now() - tokyoStart.getTime()) / (3600 * 1000);
    const diffHoursNy = Math.abs(Date.now() - nyStart.getTime()) / (3600 * 1000);
    expect(diffHoursTokyo).toBeLessThanOrEqual(24);
    expect(diffHoursNy).toBeLessThanOrEqual(24);
  });

  it('falls back safely to default on invalid timezone string', () => {
    const fallbackStart = getStartOfTodayInTimezone('Invalid/Nonexistent_TZ');
    expect(fallbackStart).toBeInstanceOf(Date);
    expect(fallbackStart.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
