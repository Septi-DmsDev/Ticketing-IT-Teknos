/**
 * Bot entry point: thin wiring layer only. All connection, dispatch, and
 * heartbeat logic lives in connection.ts / dispatcher.ts / heartbeat.ts
 * (Tasks 3 & 4) — this file just starts them in the right order.
 */
import * as dotenv from 'dotenv';
import { acquireLock, releaseLock, connectToWhatsApp, onConnectionStateChange } from './connection.js';
import type { ConnectionState } from './connection.js';
import { startDispatcher } from './dispatcher.js';
import { startHeartbeat } from './heartbeat.js';

dotenv.config();

const SESSION_DIR = process.env.WA_SESSION_FOLDER || './auth_info_baileys';

// Start dispatcher + heartbeat exactly once, on the first successful
// connection — not on every reconnect.
let hasStartedWorkers = false;

function handleConnectionStateChange(state: ConnectionState): void {
  if (state !== 'connected' || hasStartedWorkers) return;
  hasStartedWorkers = true;
  startDispatcher();
  startHeartbeat();
}

process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

console.log('[BOT] Starting Baileys WhatsApp Bot...');
console.log(`[BOT] Using session folder: ${SESSION_DIR}`);
acquireLock();
onConnectionStateChange(handleConnectionStateChange);
connectToWhatsApp();
