/**
 * Bot heartbeat: reports connection health to `bot_heartbeat` so the admin
 * dashboard can distinguish "process is dead" (row goes stale entirely) from
 * "process alive but WhatsApp disconnected" (connection_state updates, but
 * last_heartbeat_at only advances while connected — see spec 4.3).
 */
import { getSocket, onConnectionStateChange } from './connection.js';
import type { ConnectionState } from './connection.js';
import { supabase } from './supabaseClient.js';

const HEARTBEAT_INTERVAL_MS = 60000;
const HEARTBEAT_ROW_ID = 'whatsapp-bot';

// Tracks the most recently emitted connection state so the interval timer
// below knows whether it's allowed to touch last_heartbeat_at.
let lastKnownState: ConnectionState | 'unknown' = 'unknown';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getWaNumber(): string | null {
  return getSocket()?.user?.id ?? null;
}

async function upsertHeartbeat(state: ConnectionState, touchHeartbeatTimestamp: boolean): Promise<void> {
  const row: Record<string, unknown> = {
    id: HEARTBEAT_ROW_ID,
    connection_state: state,
    wa_number: getWaNumber(),
    updated_at: new Date().toISOString(),
  };

  if (touchHeartbeatTimestamp) {
    row.last_heartbeat_at = new Date().toISOString();
  }

  const { error } = await supabase.from('bot_heartbeat').upsert(row);
  if (error) {
    console.error('[BOT] Failed to upsert bot_heartbeat:', error.message);
  }
}

function handleConnectionStateChange(state: ConnectionState): void {
  lastKnownState = state;
  // Immediate upsert for EVERY state transition, not just 'connected'.
  upsertHeartbeat(state, state === 'connected').catch((error: unknown) => {
    console.error('[BOT] Unhandled error upserting heartbeat on state change:', getErrorMessage(error));
  });
}

/**
 * Wires the state-change listener and starts the periodic keep-alive timer.
 * Returns the interval handle so callers (bot/index.ts, Task 5) can clear it
 * on shutdown if needed.
 */
export function startHeartbeat(): NodeJS.Timeout {
  onConnectionStateChange(handleConnectionStateChange);

  console.log(`[BOT] Heartbeat started (interval: ${HEARTBEAT_INTERVAL_MS}ms)`);

  return setInterval(() => {
    // Only re-upsert last_heartbeat_at while WA is actually connected — a
    // disconnected-but-alive process should NOT look "fresh" to the dashboard.
    if (lastKnownState !== 'connected') return;

    upsertHeartbeat(lastKnownState, true).catch((error: unknown) => {
      console.error('[BOT] Unhandled error upserting heartbeat on interval:', getErrorMessage(error));
    });
  }, HEARTBEAT_INTERVAL_MS);
}
