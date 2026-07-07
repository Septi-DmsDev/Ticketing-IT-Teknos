import { describe, it, expect } from 'vitest';
import { computeNextAttempt } from './backoff';

// Reference constants from bot/backoff.ts (kept in sync manually since the
// module does not export them): BASE_DELAY_MS = 30_000, MAX_DELAY_MS = 1_800_000.
// Convention (per backoff.ts header comment): `attemptCount` is POST-increment —
// the caller increments attempt_count on the outbox row BEFORE calling this,
// so `attemptCount >= maxAttempts` means attempts are exhausted ('dead').

const NOW = new Date('2026-01-01T00:00:00Z');

describe('computeNextAttempt', () => {
  it('returns status "failed" with a 60s delay for a low attempt count (attemptCount=1)', () => {
    const result = computeNextAttempt(1, 5, NOW);

    expect(result.status).toBe('failed');
    expect(result.nextAttemptAt.getTime() - NOW.getTime()).toBe(60_000); // 30_000 * 2^1
  });

  it('returns status "failed" with the correctly scaled delay for a mid-range attempt count under the cap (attemptCount=5)', () => {
    const result = computeNextAttempt(5, 10, NOW);

    expect(result.status).toBe('failed');
    expect(result.nextAttemptAt.getTime() - NOW.getTime()).toBe(960_000); // 30_000 * 2^5
  });

  it('caps the delay at 30 minutes when the exponential formula would exceed it (attemptCount=10)', () => {
    const result = computeNextAttempt(10, 15, NOW);

    expect(result.status).toBe('failed');
    // Uncapped would be 30_000 * 2^10 = 30_720_000ms; capped at MAX_DELAY_MS.
    expect(result.nextAttemptAt.getTime() - NOW.getTime()).toBe(1_800_000);
  });

  it('returns status "failed" when attemptCount is one below maxAttempts (boundary)', () => {
    const result = computeNextAttempt(4, 5, NOW);

    expect(result.status).toBe('failed');
    expect(result.nextAttemptAt.getTime() - NOW.getTime()).toBe(480_000); // 30_000 * 2^4
  });

  it('returns status "dead" when attemptCount equals maxAttempts (boundary, post-increment convention)', () => {
    const result = computeNextAttempt(5, 5, NOW);

    expect(result.status).toBe('dead');
    expect(result.nextAttemptAt.getTime()).toBe(NOW.getTime());
  });
});
