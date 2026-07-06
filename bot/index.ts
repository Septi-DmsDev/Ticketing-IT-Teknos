import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import { startSupabaseListener, flushPendingMessages } from './supabaseListener.js';

dotenv.config();

// Read session folder from .env (WA_SESSION_FOLDER), default to auth_info_baileys
const SESSION_DIR = process.env.WA_SESSION_FOLDER || './auth_info_baileys';

// Keep socket instance available for external modules
export let waSocket: ReturnType<typeof makeWASocket> | null = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) as any,
    syncFullHistory: false,
    // Prevent WA phone from detecting bot as "online" and replacing connection (fix 440)
    markOnlineOnConnect: false,
  });

  // Expose socket ONLY after it's created (not yet 'open')
  waSocket = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[BOT] Scan the QR Code below to authenticate:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      // Null out the socket so processQueue won't attempt sends during disconnect
      waSocket = null;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.log(`[BOT] Connection closed (code: ${statusCode})`);

      if (statusCode === DisconnectReason.loggedOut) {
        // 401: Truly logged out — delete session and scan new QR
        console.log('[BOT] Logged out (401). Deleting session for fresh QR scan...');
        try {
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          console.log('[BOT] Session deleted. Restarting...');
          setTimeout(connectToWhatsApp, 2000);
        } catch (err) {
          console.error('[BOT] Failed to delete session:', err);
        }
      } else if (statusCode === DisconnectReason.conflict) {
        // 409: Another instance is running — wait longer before reconnect
        console.log('[BOT] Conflict (409): Another bot instance detected. Waiting 10s before retry...');
        setTimeout(connectToWhatsApp, 10000);
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        // 440: Connection replaced by another device — reconnect normally
        console.log('[BOT] Connection replaced (440). Reconnecting in 5s...');
        setTimeout(connectToWhatsApp, 5000);
      } else {
        // Other errors (stream error, timeout, etc) — reconnect
        console.log(`[BOT] Disconnected (code: ${statusCode}). Reconnecting in 3s...`);
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      // Log the exact WA number the bot is authenticated as
      const botNumber = sock.user?.id || 'unknown';
      console.log(`[BOT] ✅ WhatsApp connected! Bot is running as: ${botNumber}`);
      console.log(`[BOT] Session folder: ${SESSION_DIR}`);

      // Flush any messages that were queued during disconnect
      flushPendingMessages();

      // Start Supabase listener only once
      if (!(global as any).isListening) {
        console.log('[BOT] Waiting 3 seconds for session sync before subscribing...');
        setTimeout(() => {
          startSupabaseListener();
          (global as any).isListening = true;
        }, 3000);
      }
    }
  });

  // Track message delivery acknowledgment
  sock.ev.on('messages.update', (updates) => {
    for (const update of updates) {
      const ack = update.update?.status;
      if (ack !== undefined) {
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

function acquireLock(): boolean {
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

function releaseLock() {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch {}
}

// Release lock on exit
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

// Start the bot
console.log('[BOT] Starting Baileys WhatsApp Bot...');
console.log(`[BOT] Using session folder: ${SESSION_DIR}`);
acquireLock();
connectToWhatsApp();

