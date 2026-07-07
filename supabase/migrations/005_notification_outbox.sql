-- =========================================================
-- IT Ticketing System — WhatsApp Notification Outbox
-- Durable outbox + heartbeat + admin numbers config + triggers
-- Additive only: does NOT modify support_tickets / feature_requests
-- columns from 001_init_schema.sql (only adds triggers on them).
-- Run this SQL in your Supabase SQL Editor (or via CLI) AFTER
-- 001-004 have already been applied.
-- =========================================================

-- =========================================================
-- 1. TABLE: notification_outbox
-- One row = one WhatsApp message that must/has been sent to one phone number.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type       TEXT NOT NULL CHECK (ticket_type IN ('support', 'request')),
  ticket_code       TEXT NOT NULL,
  recipient_phone   TEXT NOT NULL,          -- format 62xxxx, no leading '+' and no '@s.whatsapp.net' suffix
  recipient_role    TEXT NOT NULL CHECK (recipient_role IN ('reporter', 'admin')),
  event_type        TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed')),
  message_body      TEXT NOT NULL,          -- final rendered message, not a raw template
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempt_count     INT NOT NULL DEFAULT 0,
  max_attempts      INT NOT NULL DEFAULT 5,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ
);

-- Index for the dispatcher's claim query: pending/failed rows whose time has come.
CREATE INDEX IF NOT EXISTS idx_outbox_dispatch
  ON public.notification_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
-- NO public policy at all. Only service_role may access this table
-- (service_role bypasses RLS by default in Supabase, so omitting anon/authenticated
-- policies is sufficient — intentionally stricter than the ticket tables).

-- =========================================================
-- 2. TABLE: bot_heartbeat
-- Singleton row upserted by the bot process to report connection health.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.bot_heartbeat (
  id                 TEXT PRIMARY KEY DEFAULT 'whatsapp-bot',
  connection_state   TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (connection_state IN ('unknown', 'connected', 'disconnected', 'qr_pending', 'logged_out')),
  wa_number          TEXT,
  last_heartbeat_at  TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.bot_heartbeat ENABLE ROW LEVEL SECURITY;
-- No public policy; only service_role.

INSERT INTO public.bot_heartbeat (id, connection_state)
VALUES ('whatsapp-bot', 'unknown')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 3. TABLE: notification_admins
-- Replaces env var ADMIN_WA_NUMBER entirely. Managed from /admin.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notification_admins (
  phone       TEXT PRIMARY KEY,       -- format 62xxxx
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notification_admins ENABLE ROW LEVEL SECURITY;
-- No public policy; only service_role (used by the trigger via SECURITY DEFINER
-- and by the admin page).

-- =========================================================
-- Trigger: enqueue notification when a support ticket is created / status changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.enqueue_support_ticket_notification()
RETURNS TRIGGER AS $$
DECLARE
  admin_row RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('support', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'created',
        format('Halo %s, tiket laporan kendala Anda berhasil dibuat.' || E'\n\n' || '*Kode Tiket*: %s' || E'\n\n' ||
               'Tim IT akan segera meninjau laporan Anda. Kami akan mengirimkan notifikasi perubahan status tiket ke nomor ini.',
               NEW.reporter_name, NEW.ticket_code));
    END IF;

    FOR admin_row IN SELECT phone FROM public.notification_admins WHERE is_active LOOP
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('support', NEW.ticket_code, admin_row.phone, 'admin', 'created',
        format(E'\U0001F6A8 *TIKET SUPPORT BARU* \U0001F6A8\n\n*Kode*: %s\n*Pelapor*: %s (%s)\n*Keluhan*:\n_%s_\n\nSegera cek dashboard admin!',
               NEW.ticket_code, NEW.reporter_name, NEW.reporter_division, NEW.description));
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('support', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'status_changed',
        format('Halo, status tiket support Anda (*%s*) telah diperbarui menjadi: *%s*.%s',
               NEW.ticket_code, public.status_label_id(NEW.status),
               CASE WHEN NEW.it_response IS NOT NULL THEN E'\n\nPesan dari IT:\n_' || NEW.it_response || '_' ELSE '' END));
    END IF;

    IF NEW.status = 'resolved' THEN
      FOR admin_row IN SELECT phone FROM public.notification_admins WHERE is_active LOOP
        INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
        VALUES ('support', NEW.ticket_code, admin_row.phone, 'admin', 'status_changed',
          format(E'✅ *TIKET SUPPORT SELESAI*\n\nKode: %s telah ditandai Selesai (Resolved) oleh IT.\n\nCatatan IT: %s',
                 NEW.ticket_code, COALESCE(NEW.it_response, '-')));
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE TRIGGER trg_support_ticket_notification
  AFTER INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_support_ticket_notification();

-- =========================================================
-- Trigger: enqueue notification when a feature request is created / status changes
-- Mirrors the rules from the old bot/supabaseListener.ts 'feature-changes' channel:
--   INSERT              → all active admins + requester (if whatsapp_number present)
--   UPDATE status change → requester only (no additional admin notification, unlike
--                          support_tickets' 'resolved' rule — see spec Section 4.3 Q1)
-- =========================================================
CREATE OR REPLACE FUNCTION public.enqueue_feature_request_notification()
RETURNS TRIGGER AS $$
DECLARE
  admin_row RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('request', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'created',
        format('Halo %s, pengajuan sistem baru Anda berhasil dikirim.' || E'\n\n' || '*Kode Tiket*: %s' || E'\n' || '*Judul*: %s' || E'\n\n' ||
               'Tim IT akan menganalisis kebutuhan ini. Kami akan memberikan kabar selanjutnya melalui WhatsApp.',
               NEW.requester_name, NEW.ticket_code, NEW.title));
    END IF;

    FOR admin_row IN SELECT phone FROM public.notification_admins WHERE is_active LOOP
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('request', NEW.ticket_code, admin_row.phone, 'admin', 'created',
        format(E'\U0001F4A1 *PENGAJUAN SISTEM BARU* \U0001F4A1\n\n*Kode*: %s\n*Pemohon*: %s (%s)\n*Judul*: %s\n\nMohon lakukan review di dashboard admin!',
               NEW.ticket_code, NEW.requester_name, NEW.requester_division, NEW.title));
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('request', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'status_changed',
        format('Halo, status pengajuan sistem Anda (*%s*) telah diperbarui menjadi: *%s*.%s',
               NEW.ticket_code, public.status_label_id(NEW.status),
               CASE WHEN NEW.it_response IS NOT NULL THEN E'\n\nTanggapan IT:\n_' || NEW.it_response || '_' ELSE '' END));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE TRIGGER trg_feature_request_notification
  AFTER INSERT OR UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_feature_request_notification();

-- =========================================================
-- Helper: status label translation (Indonesian). Single source of truth
-- instead of duplicating the map in both the bot (statusToIndo) and the
-- tracking page (STATUS_LABELS in src/pages/tracking.astro).
-- =========================================================
CREATE OR REPLACE FUNCTION public.status_label_id(status TEXT)
RETURNS TEXT AS $$
  SELECT CASE status
    WHEN 'draft' THEN 'Draft'
    WHEN 'open' THEN 'Terbuka'
    WHEN 'assigned' THEN 'Ditugaskan'
    WHEN 'in_progress' THEN 'Sedang Dikerjakan'
    WHEN 'resolved' THEN 'Selesai / Menunggu Konfirmasi'
    WHEN 'closed' THEN 'Ditutup'
    WHEN 'reviewing' THEN 'Sedang Direview'
    WHEN 'approved' THEN 'Disetujui'
    WHEN 'rejected' THEN 'Ditolak'
    WHEN 'testing' THEN 'Dalam Pengujian'
    WHEN 'done' THEN 'Selesai'
    ELSE status
  END;
$$ LANGUAGE sql IMMUTABLE;

-- =========================================================
-- Dispatcher support: atomically claim a batch of pending/failed rows.
-- Supabase's JS/PostgREST client cannot express `FOR UPDATE SKIP LOCKED`
-- directly, so this must be a database function called via
-- supabase.rpc('dispatch_claim_batch', { batch_size: 20 }).
-- =========================================================
CREATE OR REPLACE FUNCTION public.dispatch_claim_batch(batch_size INT DEFAULT 20)
RETURNS SETOF public.notification_outbox AS $$
  UPDATE public.notification_outbox
  SET status = 'sending'
  WHERE id IN (
    SELECT id FROM public.notification_outbox
    WHERE status IN ('pending', 'failed') AND next_attempt_at <= now()
    ORDER BY created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;
