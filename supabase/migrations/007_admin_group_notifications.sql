-- =========================================================
-- IT Ticketing System — Admin Group Notifications
-- Follow-up to 005_notification_outbox.sql / 006_outbox_claim_timeout.sql.
-- Additive only.
--
-- Why: the bot's WhatsApp number was temporarily suspended, most likely
-- because broadcasting near-identical messages to N individual admin
-- phone numbers in quick succession is a documented WhatsApp
-- bot-detection signal. Fix: route admin notifications to ONE WhatsApp
-- group instead of looping over notification_admins.
--
-- NOTE: public.notification_admins is intentionally NOT dropped or
-- altered here. It is superseded by notification_settings.admin_group_jid
-- (no longer referenced by the trigger functions below), but kept in
-- place per additive-migration convention — avoids data loss and keeps
-- rollback simple.
-- =========================================================

-- =========================================================
-- 1. TABLE: notification_settings
-- Singleton row (same pattern as bot_heartbeat) holding the destination
-- WhatsApp group JID for admin notifications. Nullable/NULL until an
-- operator fills it in via the admin UI (format: xxxxxxxxxx-xxxxxxxxxx@g.us).
-- While NULL, admin notifications are silently skipped (no error).
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id               TEXT PRIMARY KEY DEFAULT 'default',
  admin_group_jid  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
-- No public policies; only service_role, same as notification_admins /
-- bot_heartbeat / notification_outbox.

INSERT INTO public.notification_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 2. COLUMN: notification_outbox.recipient_type
-- 'individual' (default, unchanged behavior): recipient_phone holds a
--   plain phone number (62xxxx); the bot appends '@s.whatsapp.net'.
-- 'group': recipient_phone holds a COMPLETE WhatsApp group JID already
--   (e.g. xxxxxxxxxx-xxxxxxxxxx@g.us); the bot uses it as-is.
-- =========================================================
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS recipient_type TEXT NOT NULL DEFAULT 'individual'
  CHECK (recipient_type IN ('individual', 'group'));

-- =========================================================
-- 3. Trigger: enqueue notification when a support ticket is created /
-- status changes. Admin side now enqueues a SINGLE 'group' row (instead
-- of looping over notification_admins) when a group JID is configured.
-- Message text/wording, the no-op status-change guard, SECURITY DEFINER,
-- and search_path hardening are all preserved unchanged from 005.
-- =========================================================
CREATE OR REPLACE FUNCTION public.enqueue_support_ticket_notification()
RETURNS TRIGGER AS $$
DECLARE
  admin_group_jid TEXT;
BEGIN
  SELECT ns.admin_group_jid INTO admin_group_jid
  FROM public.notification_settings ns
  WHERE ns.id = 'default';

  IF TG_OP = 'INSERT' THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('support', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'created',
        format('Halo %s, tiket laporan kendala Anda berhasil dibuat.' || E'\n\n' || '*Kode Tiket*: %s' || E'\n\n' ||
               'Tim IT akan segera meninjau laporan Anda. Kami akan mengirimkan notifikasi perubahan status tiket ke nomor ini.',
               NEW.reporter_name, NEW.ticket_code));
    END IF;

    IF admin_group_jid IS NOT NULL AND admin_group_jid <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body, recipient_type)
      VALUES ('support', NEW.ticket_code, admin_group_jid, 'admin', 'created',
        format(E'\U0001F6A8 *TIKET SUPPORT BARU* \U0001F6A8\n\n*Kode*: %s\n*Pelapor*: %s (%s)\n*Keluhan*:\n_%s_\n\nSegera cek dashboard admin!',
               NEW.ticket_code, NEW.reporter_name, NEW.reporter_division, NEW.description),
        'group');
    END IF;
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
      IF admin_group_jid IS NOT NULL AND admin_group_jid <> '' THEN
        INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body, recipient_type)
        VALUES ('support', NEW.ticket_code, admin_group_jid, 'admin', 'status_changed',
          format(E'✅ *TIKET SUPPORT SELESAI*\n\nKode: %s telah ditandai Selesai (Resolved) oleh IT.\n\nCatatan IT: %s',
                 NEW.ticket_code, COALESCE(NEW.it_response, '-')),
          'group');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Trigger definition (trg_support_ticket_notification) already exists from
-- 005 and points at this function by name; CREATE OR REPLACE FUNCTION above
-- is sufficient, no need to re-create the trigger itself.

-- =========================================================
-- 4. Trigger: enqueue notification when a feature request is created /
-- status changes. Same single-group-lookup treatment as support tickets.
-- Business rule unchanged: UPDATE status change → requester only, no
-- admin group message (feature_request status changes never notify admins).
-- =========================================================
CREATE OR REPLACE FUNCTION public.enqueue_feature_request_notification()
RETURNS TRIGGER AS $$
DECLARE
  admin_group_jid TEXT;
BEGIN
  SELECT ns.admin_group_jid INTO admin_group_jid
  FROM public.notification_settings ns
  WHERE ns.id = 'default';

  IF TG_OP = 'INSERT' THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('request', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'created',
        format('Halo %s, pengajuan sistem baru Anda berhasil dikirim.' || E'\n\n' || '*Kode Tiket*: %s' || E'\n' || '*Judul*: %s' || E'\n\n' ||
               'Tim IT akan menganalisis kebutuhan ini. Kami akan memberikan kabar selanjutnya melalui WhatsApp.',
               NEW.requester_name, NEW.ticket_code, NEW.title));
    END IF;

    IF admin_group_jid IS NOT NULL AND admin_group_jid <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body, recipient_type)
      VALUES ('request', NEW.ticket_code, admin_group_jid, 'admin', 'created',
        format(E'\U0001F4A1 *PENGAJUAN SISTEM BARU* \U0001F4A1\n\n*Kode*: %s\n*Pemohon*: %s (%s)\n*Judul*: %s\n\nMohon lakukan review di dashboard admin!',
               NEW.ticket_code, NEW.requester_name, NEW.requester_division, NEW.title),
        'group');
    END IF;
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

-- Trigger definition (trg_feature_request_notification) already exists from
-- 005 and points at this function by name; CREATE OR REPLACE FUNCTION above
-- is sufficient, no need to re-create the trigger itself.

-- =========================================================
-- 5. dispatch_claim_batch: widen the claim-timeout and shrink batch_size.
--
-- The bot's per-message send delay is moving from a fixed 1.5s to a
-- randomized 3-5 MINUTE delay (separate change, not in this migration),
-- and batch_size is dropping from 20 to 5. Worst-case time to fully
-- process one claimed batch is now 5 messages * 5 minutes = 25 minutes.
-- The claim-timeout must stay well above that worst case or a message
-- still being legitimately processed would get falsely reclaimed as
-- "stuck," causing a duplicate send. 40 minutes gives comfortable margin
-- above the 25-minute worst case.
-- =========================================================
CREATE OR REPLACE FUNCTION public.dispatch_claim_batch(batch_size INT DEFAULT 5)
RETURNS SETOF public.notification_outbox AS $$
  UPDATE public.notification_outbox
  SET status = 'sending',
      -- Claim deadline: if this row is still 'sending' after this time,
      -- something went wrong (crash) and it becomes reclaimable again.
      -- Worst-case per-batch processing time is ~batch_size * 3-5min send
      -- delay (up to 25 minutes for batch_size=5); 40 minutes gives
      -- generous headroom above that without leaving crashed rows
      -- stranded for long.
      next_attempt_at = now() + interval '40 minutes'
  WHERE id IN (
    SELECT id FROM public.notification_outbox
    WHERE status IN ('pending', 'failed', 'sending') AND next_attempt_at <= now()
    ORDER BY created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;
