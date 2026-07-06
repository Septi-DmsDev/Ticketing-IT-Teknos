import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import { startSupabaseListener } from './supabaseListener.js';

dotenv.config();

// Force a completely new session folder to bypass corrupted docker volumes
const SESSION_DIR = './auth_session_v2';

// Keep socket instance available for external modules
export let waSocket: ReturnType<typeof makeWASocket> | null = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) as any, // Muted logs back
    browser: ['IT Ticket Bot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  });

  waSocket = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('[BOT] Scan the QR Code below to authenticate:');
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[BOT] Connection closed due to: ${lastDisconnect?.error}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        console.log('[BOT] You are logged out or session is corrupted. Deleting auth folder to force fresh scan...');
        try {
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          console.log('[BOT] Auth folder deleted. Restarting bot to generate new QR...');
          setTimeout(connectToWhatsApp, 2000);
        } catch (err) {
          console.error('[BOT] Failed to delete auth folder:', err);
        }
      }
    } else if (connection === 'open') {
      console.log('[BOT] WhatsApp connected successfully! Waiting 3 seconds for session sync...');
      if (!(global as any).isListening) {
        setTimeout(() => {
          startSupabaseListener();
          (global as any).isListening = true;
        }, 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Start the bot
console.log('[BOT] Starting Baileys WhatsApp Bot...');
connectToWhatsApp();
