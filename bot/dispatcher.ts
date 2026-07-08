/**
 * Outbox dispatcher: polls `notification_outbox` for pending/failed rows
 * whose retry time has come, claims a batch atomically via the
 * `dispatch_claim_batch` RPC (see supabase/migrations/005_notification_outbox.sql),
 * and sends each one sequentially through the live Baileys socket.
 */
import { getSocket } from './connection.js';
import { supabase } from './supabaseClient.js';
import { computeNextAttempt } from './backoff.js';

const DISPATCH_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
// Minimum delay observed BEFORE each send (including the first one in a
// batch) to avoid WhatsApp rate limiting — sequential, never Promise.all.
const SEND_DELAY_MS = 1500;

// Local mirror of the `notification_outbox` columns (no Supabase-generated
// types are configured for this project). Keep in sync with
// supabase/migrations/005_notification_outbox.sql if that schema changes.
export interface NotificationOutboxRow {
  id: string;
  ticket_type: 'support' | 'request';
  ticket_code: string;
  recipient_phone: string; // 62xxxx, no '@s.whatsapp.net' suffix
  recipient_role: 'reporter' | 'admin';
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
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

  const jid = `${row.recipient_phone}@s.whatsapp.net`;

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

async function dispatchTick(): Promise<void> {
  if (!getSocket()) {
    // WA not connected — skip the tick entirely, don't even claim a batch
    // (claimed rows would sit stuck in 'sending' until the next tick anyway).
    return;
  }

  const rows = await claimBatch();
  if (rows.length === 0) return;

  for (const row of rows) {
    // Delay BEFORE every send, including the first, per spec.
    await sleep(SEND_DELAY_MS);
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
