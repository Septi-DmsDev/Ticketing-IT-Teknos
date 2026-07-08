/**
 * Outbox dispatcher: polls `notification_outbox` for pending/failed rows
 * whose retry time has come, claims a batch atomically via the
 * `dispatch_claim_batch` RPC (see supabase/migrations/005_notification_outbox.sql),
 * and sends each one sequentially through the live Baileys socket.
 */
import { getSocket, isWarmingUp } from './connection.js';
import { supabase } from './supabaseClient.js';
import { computeNextAttempt } from './backoff.js';
import { getErrorMessage } from './errors.js';

const DISPATCH_INTERVAL_MS = 5000;
// Coupled to supabase/migrations/007_admin_group_notifications.sql's
// dispatch_claim_batch claim-timeout (40 minutes): worst case for a batch is
// BATCH_SIZE * MAX_SEND_DELAY_MS = 5 * 5min = 25 minutes, comfortably under
// the 40-minute claim-timeout. Do NOT raise this without also widening that
// migration's claim-timeout.
const BATCH_SIZE = 5;
// Delay observed BEFORE each send (including the first one in a batch), to
// avoid WhatsApp rate limiting/bot-detection — sequential, never Promise.all.
// Randomized per-message (not a single fixed value) because a fixed/mechanical
// interval is itself a documented Baileys bot-detection signal.
const MIN_SEND_DELAY_MS = 3 * 60 * 1000; // 3 minutes
const MAX_SEND_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/** Returns a fresh, uniformly random delay in [MIN_SEND_DELAY_MS, MAX_SEND_DELAY_MS]. */
export function randomDelayMs(): number {
  return Math.floor(Math.random() * (MAX_SEND_DELAY_MS - MIN_SEND_DELAY_MS + 1)) + MIN_SEND_DELAY_MS;
}

// Local mirror of the `notification_outbox` columns (no Supabase-generated
// types are configured for this project). Keep in sync with
// supabase/migrations/005_notification_outbox.sql if that schema changes.
export interface NotificationOutboxRow {
  id: string;
  ticket_type: 'support' | 'request';
  ticket_code: string;
  recipient_phone: string; // 62xxxx (individual) or a full '...@g.us' JID (group)
  recipient_role: 'reporter' | 'admin';
  recipient_type: 'individual' | 'group';
  event_type: 'created' | 'status_changed';
  message_body: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'dead';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimBatch(): Promise<NotificationOutboxRow[]> {
  const { data, error } = await supabase.rpc('dispatch_claim_batch', { batch_size: BATCH_SIZE });
  if (error) {
    console.error('[BOT] Failed to claim outbox batch:', error.message);
    return [];
  }
  return (data as NotificationOutboxRow[] | null) ?? [];
}

async function markSent(id: string): Promise<void> {
  const { error } = await supabase
    .from('notification_outbox')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error(`[BOT] Failed to mark outbox row ${id} as sent:`, error.message);
  }
}

async function markFailed(row: NotificationOutboxRow, errorMessage: string): Promise<void> {
  const nextAttemptCount = row.attempt_count + 1;
  const { status, nextAttemptAt } = computeNextAttempt(nextAttemptCount, row.max_attempts);

  const { error } = await supabase
    .from('notification_outbox')
    .update({
      status,
      attempt_count: nextAttemptCount,
      next_attempt_at: nextAttemptAt.toISOString(),
      last_error: errorMessage,
    })
    .eq('id', row.id);

  if (error) {
    console.error(`[BOT] Failed to mark outbox row ${row.id} as failed:`, error.message);
  }
}

async function sendRow(row: NotificationOutboxRow): Promise<void> {
  const socket = getSocket();
  if (!socket) {
    // Connection dropped mid-batch (between claim and send) — treat as a
    // failed attempt so it goes through the normal backoff/retry path.
    await markFailed(row, 'WhatsApp socket unavailable during send');
    return;
  }

  // 'group' rows already carry a complete WhatsApp group JID (e.g.
  // 'xxxxxxxxxx-xxxxxxxxxx@g.us') in recipient_phone — use as-is. 'individual'
  // rows carry a plain phone number and still need the suffix appended.
  const jid =
    row.recipient_type === 'group' ? row.recipient_phone : `${row.recipient_phone}@s.whatsapp.net`;

  try {
    await socket.sendMessage(jid, { text: row.message_body });
    await markSent(row.id);
    console.log(`[BOT] Sent outbox message ${row.id} (${row.event_type}) to ${row.recipient_phone}`);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error(`[BOT] Failed to send outbox message ${row.id} to ${row.recipient_phone}:`, message);
    await markFailed(row, message);
  }
}

// Tracks whether we've already logged the warm-up skip for the CURRENT
// warm-up window, so it logs once instead of every 5s tick.
let hasLoggedWarmupSkip = false;

async function dispatchTick(): Promise<void> {
  if (!getSocket()) {
    // WA not connected — skip the tick entirely, don't even claim a batch
    // (claimed rows would sit stuck in 'sending' until the next tick anyway).
    return;
  }

  if (isWarmingUp()) {
    // Fresh QR pairing detected recently — hold off on any automated sending
    // until the warm-up window elapses (see connection.ts). Skip the entire
    // tick, same as the socket-not-ready case above.
    if (!hasLoggedWarmupSkip) {
      console.log('[BOT] Skipping dispatch tick(s): still in post-pairing warm-up window.');
      hasLoggedWarmupSkip = true;
    }
    return;
  }
  hasLoggedWarmupSkip = false;

  const rows = await claimBatch();
  if (rows.length === 0) return;

  for (const row of rows) {
    // Delay BEFORE every send, including the first, per spec. Re-randomized
    // fresh for EACH send — never reuse one delay across the whole batch.
    await sleep(randomDelayMs());
    await sendRow(row);
  }
}

/**
 * Starts the polling loop. Returns the interval handle so callers (bot/index.ts,
 * Task 5) can clear it on shutdown if needed.
 */
export function startDispatcher(): NodeJS.Timeout {
  console.log(`[BOT] Dispatcher started (interval: ${DISPATCH_INTERVAL_MS}ms, batch size: ${BATCH_SIZE})`);

  return setInterval(() => {
    dispatchTick().catch((error: unknown) => {
      console.error('[BOT] Unhandled error in dispatcher tick:', getErrorMessage(error));
    });
  }, DISPATCH_INTERVAL_MS);
}
