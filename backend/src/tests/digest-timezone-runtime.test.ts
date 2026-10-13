import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { windowedDigestWorker } from '../notifications/digest-worker.js';

describe('WindowedDigestWorker Timezone Runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('interprets Windows correctly in Asia/Kolkata timezone', () => {
    // 09:00 IST = 03:30 UTC
    // Let's set the system time to 03:30 UTC (09:00 IST)
    const date = new Date(Date.UTC(2023, 0, 1, 3, 30, 0));
    vi.setSystemTime(date);

    // Call the private method via casting to any
    const activeWindow = (windowedDigestWorker as any).getActiveWindowForTimezone('Asia/Kolkata');
    expect(activeWindow).toBe('09:00');
  });

  it('ignores windows outside of the active 30 min block', () => {
    // 09:45 IST = 04:15 UTC (outside the 09:00-09:30 block)
    const date = new Date(Date.UTC(2023, 0, 1, 4, 15, 0));
    vi.setSystemTime(date);

    const activeWindow = (windowedDigestWorker as any).getActiveWindowForTimezone('Asia/Kolkata');
    expect(activeWindow).toBeNull();
  });

  it('correctly handles the 21:30 IST window', () => {
    // 21:30 IST = 16:00 UTC
    const date = new Date(Date.UTC(2023, 0, 1, 16, 0, 0));
    vi.setSystemTime(date);

    const activeWindow = (windowedDigestWorker as any).getActiveWindowForTimezone('Asia/Kolkata');
    expect(activeWindow).toBe('21:30');
  });
});
