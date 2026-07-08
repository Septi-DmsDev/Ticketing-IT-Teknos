-- =========================================================
-- IT Ticketing System — Outbox Claim Timeout (Crash Recovery)
-- Follow-up to 005_notification_outbox.sql. Additive only.
-- =========================================================

-- =========================================================
-- Self-healing claim: a 'sending' row becomes reclaimable if its
-- claim never resolved within CLAIM_TIMEOUT (crash recovery), instead
-- of staying stuck forever. Fixes a gap found in final review: if the
-- bot process crashed or was killed mid-batch (after dispatch_claim_batch
-- set status='sending' but before the row was sent and marked
-- 'sent'/'failed'), the row would remain stuck at status='sending'
-- indefinitely — the old WHERE clause only ever considered
-- 'pending'/'failed' rows, so a stranded 'sending' row was never
-- reclaimed, and the admin dashboard's retry button only renders for
-- 'failed'/'dead' rows, not 'sending'.
--
-- Fix: when a row is claimed, next_attempt_at is pushed 3 minutes into
-- the future. A legitimately in-progress row finishes well within that
-- window (batch_size=20 * ~1.5s send delay is under 1 minute), so it is
-- never reclaimed while genuinely being processed. Only if the process
-- crashes and never resolves the row does the 3-minute deadline pass,
-- making the row eligible to be claimed again by any bot instance
-- (including after a restart) on a future dispatch tick.
-- =========================================================
CREATE OR REPLACE FUNCTION public.dispatch_claim_batch(batch_size INT DEFAULT 20)
RETURNS SETOF public.notification_outbox AS $$
  UPDATE public.notification_outbox
  SET status = 'sending',
      -- Claim deadline: if this row is still 'sending' after this time,
      -- something went wrong (crash) and it becomes reclaimable again.
      -- Worst-case per-batch processing time is ~batch_size * 1.5s send
      -- delay (well under 1 minute for batch_size=20); 3 minutes gives
      -- generous headroom above that without leaving crashed rows
      -- stranded for long.
      next_attempt_at = now() + interval '3 minutes'
  WHERE id IN (
    SELECT id FROM public.notification_outbox
    WHERE status IN ('pending', 'failed', 'sending') AND next_attempt_at <= now()
    ORDER BY created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;
