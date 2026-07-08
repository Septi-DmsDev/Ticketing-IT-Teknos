import { describe, it, expect } from 'vitest';
import { randomDelayMs } from './dispatcher';

// Reference constants from bot/dispatcher.ts (kept in sync manually since the
// module does not export them): MIN_SEND_DELAY_MS = 3 * 60_000 (3 minutes),
// MAX_SEND_DELAY_MS = 5 * 60_000 (5 minutes).
const MIN_SEND_DELAY_MS = 3 * 60 * 1000;
const MAX_SEND_DELAY_MS = 5 * 60 * 1000;

describe('randomDelayMs', () => {
  it('always returns an integer within [MIN_SEND_DELAY_MS, MAX_SEND_DELAY_MS] across many samples', () => {
    for (let i = 0; i < 1000; i++) {
      const delay = randomDelayMs();
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(MIN_SEND_DELAY_MS);
      expect(delay).toBeLessThanOrEqual(MAX_SEND_DELAY_MS);
    }
  });

  it('produces more than one distinct value across many samples (not a single fixed delay)', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 50; i++) {
      samples.add(randomDelayMs());
    }
    expect(samples.size).toBeGreaterThan(1);
  });
});
