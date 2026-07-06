import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import { startSupabaseListener } from './supabaseListener.js';

dotenv.config();

const SESSION_DIR = process.env.WA_SESSION_FOLDER || './auth_info_baileys';

// Keep socket instance available for external modules
export let waSocket: ReturnType<typeof makeWASocket> | null = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) as any, // Muted logs back
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
        console.log('[BOT] You are logged out. Please delete auth folder and scan QR again.');
      }
    } else if (connection === 'open') {
      console.log('[BOT] WhatsApp connected successfully!');
      
      // Start listening to Supabase events once WA is connected
      startSupabaseListener();
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Start the bot
console.log('[BOT] Starting Baileys WhatsApp Bot...');
connectToWhatsApp();
