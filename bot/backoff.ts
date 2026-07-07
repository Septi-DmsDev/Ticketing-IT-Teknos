/**
 * Pure retry/backoff calculator for `notification_outbox` rows.
 *
 * Convention (documented explicitly so Task 4's dispatcher stays consistent):
 * `attemptCount` is the POST-increment value — the caller increments
 * `attempt_count` on the outbox row FIRST (to account for the attempt that
 * just failed), then passes that new value in here. e.g. a row starts at
 * attempt_count=0; after its first failed send the dispatcher sets
 * attempt_count=1 and calls `computeNextAttempt(1, maxAttempts)`.
 *
 * No I/O, no system clock access other than the optional `now` parameter —
 * safe to unit test without mocking (see Task 6).
 */

const BASE_DELAY_MS = 30_000; // 30s
const MAX_DELAY_MS = 30 * 60_000; // 30 minutes

export function computeNextAttempt(
  attemptCount: number,
  maxAttempts: number,
  now: Date = new Date()
): { status: 'failed' | 'dead'; nextAttemptAt: Date } {
  if (attemptCount >= maxAttempts) {
    // Exhausted all attempts — nextAttemptAt is irrelevant (dead rows are
    // excluded from the dispatcher's claim query regardless of this value)
    // but we still return a concrete Date to keep the return type simple.
    return { status: 'dead', nextAttemptAt: now };
  }

  const delayMs = Math.min(BASE_DELAY_MS * 2 ** attemptCount, MAX_DELAY_MS);
  return { status: 'failed', nextAttemptAt: new Date(now.getTime() + delayMs) };
}
