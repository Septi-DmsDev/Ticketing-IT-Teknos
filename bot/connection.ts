import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs';

dotenv.config();

// Read session folder from .env (WA_SESSION_FOLDER), default to auth_info_baileys
const SESSION_DIR = process.env.WA_SESSION_FOLDER || './auth_info_baileys';

export type ConnectionState = 'connected' | 'disconnected' | 'qr_pending' | 'logged_out';

// Live socket reference. Exposed only via the getSocket() getter below so
// consumers (dispatcher.ts, heartbeat.ts) always read the current value
// instead of capturing a stale binding at import time — the exact bug class
// the old `import { waSocket } from './index.js'` pattern had.
let currentSocket: WASocket | null = null;

export function getSocket(): WASocket | null {
  return currentSocket;
}

// Post-pairing warm-up gate: after a FRESH QR-code pairing (Baileys'
// `connection.update` payload sets `isNewLogin === true` only in that case,
// not on ordinary reconnects using an already-saved session), a burst of
// automated sends immediately afterward is one of the strongest known
// WhatsApp bot-detection signals. `warmupUntil` is an epoch-ms deadline;
// `0` (the initial value) means "not warming up" so a normal startup that
// reuses an existing valid session is never gated.
let warmupUntil = 0;
const WARMUP_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isWarmingUp(): boolean {
  return Date.now() < warmupUntil;
}

const stateChangeListeners: Array<(state: ConnectionState) => void> = [];

export function onConnectionStateChange(cb: (state: ConnectionState) => void): void {
  stateChangeListeners.push(cb);
}

function emitConnectionState(state: ConnectionState): void {
  for (const listener of stateChangeListeners) {
    listener(state);
  }
}

export async function connectToWhatsApp(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) as any,
    syncFullHistory: false,
    // Prevent WA phone from detecting bot as "online" and replacing connection (fix 440)
    markOnlineOnConnect: false,
    // Explicit browser identity (proposed in the earlier spec, not previously
    // verified): pins the linked-device fingerprint Baileys presents to
    // WhatsApp, which has proven more stable for long-lived linked-device
    // sessions than the library default.
    browser: Browsers.ubuntu('Desktop'),
  });

  // Expose socket ONLY after it's created (not yet 'open')
  currentSocket = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[BOT] Scan the QR Code below to authenticate:');
      qrcode.generate(qr, { small: true });
      emitConnectionState('qr_pending');
    }

    if (connection === 'close') {
      // Null out the socket so callers won't attempt sends during disconnect
      currentSocket = null;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.log(`[BOT] Connection closed (code: ${statusCode})`);

      if (statusCode === DisconnectReason.loggedOut) {
        // 401: Truly logged out — delete session and scan new QR
        console.log('[BOT] Logged out (401). Deleting session for fresh QR scan...');
        emitConnectionState('logged_out');
        try {
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          console.log('[BOT] Session deleted. Restarting...');
          setTimeout(connectToWhatsApp, 2000);
        } catch (err) {
          console.error('[BOT] Failed to delete session:', err);
        }
      } else if (statusCode === 409) {
        // DisconnectReason.conflict (409) was removed from this Baileys
        // version's enum — compare the raw status code directly instead.
        // 409: Another instance is running — wait longer before reconnect
        console.log('[BOT] Conflict (409): Another bot instance detected. Waiting 10s before retry...');
        emitConnectionState('disconnected');
        setTimeout(connectToWhatsApp, 10000);
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        // 440: Connection replaced by another device — reconnect normally
        console.log('[BOT] Connection replaced (440). Reconnecting in 5s...');
        emitConnectionState('disconnected');
        setTimeout(connectToWhatsApp, 5000);
      } else {
        // Other errors (stream error, timeout, etc) — reconnect
        console.log(`[BOT] Disconnected (code: ${statusCode}). Reconnecting in 3s...`);
        emitConnectionState('disconnected');
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      // Log the exact WA number the bot is authenticated as
      const botNumber = sock.user?.id || 'unknown';
      console.log(`[BOT] ✅ WhatsApp connected! Bot is running as: ${botNumber}`);
      console.log(`[BOT] Session folder: ${SESSION_DIR}`);

      if (update.isNewLogin) {
        // Fresh QR-code pairing just completed (not a routine reconnect using
        // a saved session) — this is exactly the situation that preceded the
        // prior suspension incident. Enter a 2-hour warm-up window during
        // which the dispatcher will skip all automated sending, so the
        // account doesn't immediately look like a freshly-registered bot
        // blasting messages to WhatsApp's abuse detection.
        warmupUntil = Date.now() + WARMUP_MS;
        console.log(
          `[BOT] Fresh QR pairing detected (isNewLogin=true). Entering ${WARMUP_MS / 60000}-minute warm-up window before automated sending resumes.`,
        );
      }

      emitConnectionState('connected');
    }
  });

  // Track message delivery acknowledgment
  sock.ev.on('messages.update', (updates) => {
    for (const update of updates) {
      const ack = update.update?.status;
      if (ack != null) {
        // 1=pending, 2=server ack, 3=delivered, 4=read
        const ackLabels: Record<number, string> = {
          0: 'SENT (pending server ack)',
          1: 'PENDING ⏳',
          2: 'SERVER_ACK ✓',
          3: 'DELIVERED ✓✓',
          4: 'READ ✓✓ (blue)',
          5: 'PLAYED ▶',
        };
        console.log(`[BOT] Message ${update.key?.id} → ${update.key?.remoteJid} : ${ackLabels[ack] || `STATUS_${ack}`}`);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Lock file to prevent multiple instances
const LOCK_FILE = `${SESSION_DIR}/.bot.lock`;

export function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      // Check if the process is still running
      try { process.kill(parseInt(pid), 0); } catch {
        // Process not running, stale lock — remove it
        fs.unlinkSync(LOCK_FILE);
      }
      if (fs.existsSync(LOCK_FILE)) {
        console.error(`[BOT] ❌ Another bot instance is running (PID ${pid}). Exiting.`);
        process.exit(1);
      }
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch {
    return true; // Non-fatal, continue anyway
  }
}

export function releaseLock(): void {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch {}
}
