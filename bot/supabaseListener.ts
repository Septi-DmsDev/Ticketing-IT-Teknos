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

// A simple queue to avoid WhatsApp spam/rate limit disconnects (428 Error)
const messageQueue: { jid: string, text: string }[] = [];
let isSending = false;

async function processQueue() {
  if (isSending || messageQueue.length === 0) return;
  isSending = true;

  while (messageQueue.length > 0) {
    const { jid, text } = messageQueue.shift()!;
    if (!waSocket) {
      console.warn('[BOT] waSocket is not ready to send message.');
      continue;
    }
    try {
      // Small delay to prevent rate limiting (428 Connection Closed)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate typing/presence to warm up the connection to this JID
      await waSocket.presenceSubscribe(jid).catch(() => {});
      await waSocket.sendPresenceUpdate('composing', jid).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500));
      await waSocket.sendPresenceUpdate('paused', jid).catch(() => {});

      await waSocket.sendMessage(jid, { text });
      console.log('[BOT] Sent message to %s', jid);
    } catch (err) {
      console.error('[BOT] Failed to send message to %s:', jid, err);
    }
  }
  isSending = false;
}

export function sendWhatsAppMessage(jid: string, text: string) {
  messageQueue.push({ jid, text });
  processQueue();
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

  // Helper to map status to Indonesian
  const statusToIndo = (status: string) => {
    const map: Record<string, string> = {
      'open': 'Terbuka',
      'assigned': 'Ditugaskan',
      'in_progress': 'Sedang Dikerjakan',
      'resolved': 'Selesai / Menunggu Konfirmasi',
      'closed': 'Ditutup',
      'reviewing': 'Sedang Direview',
      'approved': 'Disetujui',
      'rejected': 'Ditolak',
      'testing': 'Dalam Pengujian',
      'done': 'Selesai'
    };
    return map[status] || status;
  };

  // Listen to support_tickets
  supabase
    .channel('support-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_tickets' },
      (payload) => {
        console.log('[BOT] New Support Ticket Inserted:', payload.new.ticket_code);
        const { ticket_code, reporter_name, reporter_division, description, whatsapp_number } = payload.new;
        
        // Notify Admins
        const msgAdmin = `🚨 *TIKET SUPPORT BARU* 🚨\n\n*Kode*: ${ticket_code}\n*Pelapor*: ${reporter_name} (${reporter_division})\n*Keluhan*:\n_${description}_\n\nSegera cek dashboard admin!`;
        adminJids.forEach(jid => sendWhatsAppMessage(jid, msgAdmin));

        // Notify User
        if (whatsapp_number) {
          const userJid = formatPhone(whatsapp_number);
          const msgUser = `Halo ${reporter_name}, tiket laporan kendala Anda berhasil dibuat.\n\n*Kode Tiket*: ${ticket_code}\n\nTim IT akan segera meninjau laporan Anda. Kami akan mengirimkan notifikasi perubahan status tiket ke nomor ini.`;
          sendWhatsAppMessage(userJid, msgUser);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'support_tickets' },
      (payload) => {
        const oldStatus = payload.old.status;
        const newStatus = payload.new.status;
        const ticketCode = payload.new.ticket_code;
        const whatsappNumber = payload.new.whatsapp_number;
        
        // Notify Admins if resolved
        if (oldStatus !== newStatus && newStatus === 'resolved') {
           console.log(`[BOT] Support Ticket ${ticketCode} resolved.`);
           const msg = `✅ *TIKET SUPPORT SELESAI*\n\nKode: ${ticketCode} telah ditandai Selesai (Resolved) oleh IT.\n\nCatatan IT: ${payload.new.it_response || '-'}`;
           adminJids.forEach(jid => sendWhatsAppMessage(jid, msg));
        }

        // Notify User if status changed
        if (oldStatus !== newStatus && whatsappNumber) {
          const userJid = formatPhone(whatsappNumber);
          const statusStr = statusToIndo(newStatus);
          let msgUser = `Halo, status tiket support Anda (*${ticketCode}*) telah diperbarui menjadi: *${statusStr}*.`;
          if (payload.new.it_response) {
            msgUser += `\n\nPesan dari IT:\n_${payload.new.it_response}_`;
          }
          sendWhatsAppMessage(userJid, msgUser);
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
        const { ticket_code, requester_name, requester_division, title, whatsapp_number } = payload.new;
        
        // Notify Admins
        const msgAdmin = `💡 *PENGAJUAN SISTEM BARU* 💡\n\n*Kode*: ${ticket_code}\n*Pemohon*: ${requester_name} (${requester_division})\n*Judul*: ${title}\n\nMohon lakukan review di dashboard admin!`;
        adminJids.forEach(jid => sendWhatsAppMessage(jid, msgAdmin));

        // Notify User
        if (whatsapp_number) {
          const userJid = formatPhone(whatsapp_number);
          const msgUser = `Halo ${requester_name}, pengajuan sistem baru Anda berhasil dikirim.\n\n*Kode Tiket*: ${ticket_code}\n*Judul*: ${title}\n\nTim IT akan menganalisis kebutuhan ini. Kami akan memberikan kabar selanjutnya melalui WhatsApp.`;
          sendWhatsAppMessage(userJid, msgUser);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'feature_requests' },
      (payload) => {
        const oldStatus = payload.old.status;
        const newStatus = payload.new.status;
        const ticketCode = payload.new.ticket_code;
        const whatsappNumber = payload.new.whatsapp_number;
        
        // Notify User if status changed
        if (oldStatus !== newStatus && whatsappNumber) {
          const userJid = formatPhone(whatsappNumber);
          const statusStr = statusToIndo(newStatus);
          let msgUser = `Halo, status pengajuan sistem Anda (*${ticketCode}*) telah diperbarui menjadi: *${statusStr}*.`;
          if (payload.new.it_response) {
            msgUser += `\n\nTanggapan IT:\n_${payload.new.it_response}_`;
          }
          sendWhatsAppMessage(userJid, msgUser);
        }
      }
    )
    .subscribe();
}
