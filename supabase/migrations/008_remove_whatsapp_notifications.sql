-- =========================================================
-- IT Ticketing System — Remove WhatsApp Notification Feature
-- Follow-up cleanup after disabling the WhatsApp notification subsystem.
-- =========================================================

-- Remove notification triggers from ticket tables.
DROP TRIGGER IF EXISTS trg_support_ticket_notification ON public.support_tickets;
DROP TRIGGER IF EXISTS trg_feature_request_notification ON public.feature_requests;

-- Remove notification-related trigger functions / RPC.
DROP FUNCTION IF EXISTS public.enqueue_support_ticket_notification();
DROP FUNCTION IF EXISTS public.enqueue_feature_request_notification();
DROP FUNCTION IF EXISTS public.dispatch_claim_batch(INT);

-- Remove notification infrastructure tables.
DROP TABLE IF EXISTS public.notification_settings;
DROP TABLE IF EXISTS public.notification_admins;
DROP TABLE IF EXISTS public.bot_heartbeat;
DROP TABLE IF EXISTS public.notification_outbox;

-- Remove WhatsApp-specific ticket columns.
ALTER TABLE public.support_tickets
  DROP COLUMN IF EXISTS whatsapp_number;

ALTER TABLE public.feature_requests
  DROP COLUMN IF EXISTS whatsapp_number;
