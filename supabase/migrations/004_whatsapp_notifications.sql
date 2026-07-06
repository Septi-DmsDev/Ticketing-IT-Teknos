-- Add whatsapp_number column to both tickets tables
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

ALTER TABLE public.feature_requests
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
