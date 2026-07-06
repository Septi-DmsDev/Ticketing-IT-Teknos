import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { waSocket } from './index.js';

dotenv.config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
// Bot should ideally use a service role key if it needs full access, 
// but anon key works for Realtime if RLS is configured or if we just listen to replication.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || '';
const ADMIN_WA = process.env.ADMIN_WA_NUMBER || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[BOT] Missing Supabase environment variables!');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function formatPhone(phone: string) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  return `${cleaned}@s.whatsapp.net`;
}

async function sendWhatsAppMessage(jid: string, text: string) {
  if (!waSocket) {
    console.warn('[BOT] waSocket is not ready to send message.');
    return;
  }
  try {
    await waSocket.sendMessage(jid, { text });
    console.log('[BOT] Sent message to %s', jid);
  } catch (err) {
    console.error('[BOT] Failed to send message to %s:', jid, err);
  }
}

export function startSupabaseListener() {
  if (!ADMIN_WA) {
    console.warn('[BOT] ADMIN_WA_NUMBER is not set in .env! IT notifications will not be sent.');
  }
  
  // Split multiple numbers by comma
  const adminJids = ADMIN_WA.split(',')
    .map(num => num.trim())
    .filter(num => num.length > 0)
    .map(formatPhone);

  console.log(`[BOT] IT Notifications will be sent to ${adminJids.length} numbers.`);
  console.log('[BOT] Subscribing to Supabase Realtime for support_tickets and feature_requests...');

  // Listen to support_tickets
  supabase
    .channel('support-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_tickets' },
      (payload) => {
        console.log('[BOT] New Support Ticket Inserted:', payload.new.ticket_code);
        const { ticket_code, reporter_name, reporter_division, description } = payload.new;
        const msg = `🚨 *TIKET SUPPORT BARU* 🚨\n\n*Kode*: ${ticket_code}\n*Pelapor*: ${reporter_name} (${reporter_division})\n*Keluhan*:\n_${description}_\n\nSegera cek dashboard admin!`;
        adminJids.forEach(jid => sendWhatsAppMessage(jid, msg));
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'support_tickets' },
      (payload) => {
        const oldStatus = payload.old.status;
        const newStatus = payload.new.status;
        
        if (oldStatus !== newStatus && newStatus === 'resolved') {
           console.log(`[BOT] Support Ticket ${payload.new.ticket_code} resolved.`);
           const msg = `✅ *TIKET SUPPORT SELESAI*\n\nKode: ${payload.new.ticket_code} telah ditandai Selesai (Resolved) oleh IT.\n\nCatatan IT: ${payload.new.it_response || '-'}`;
           adminJids.forEach(jid => sendWhatsAppMessage(jid, msg));
        }
      }
    )
    .subscribe();

  // Listen to feature_requests
  supabase
    .channel('feature-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'feature_requests' },
      (payload) => {
        console.log('[BOT] New Feature Request Inserted:', payload.new.ticket_code);
        const { ticket_code, requester_name, requester_division, title } = payload.new;
        const msg = `💡 *PENGAJUAN SISTEM BARU* 💡\n\n*Kode*: ${ticket_code}\n*Pemohon*: ${requester_name} (${requester_division})\n*Judul*: ${title}\n\nMohon lakukan review di dashboard admin!`;
        adminJids.forEach(jid => sendWhatsAppMessage(jid, msg));
      }
    )
    .subscribe();
}
