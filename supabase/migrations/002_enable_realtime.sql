-- =========================================================
-- Enable Realtime for WhatsApp Notifier Bot
-- =========================================================

-- Step 1: Create the publication for supabase_realtime if it doesn't exist
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication
      WHERE pubname = 'supabase_realtime'
    ) THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END
  $$;
COMMIT;

-- Step 2: Add tables to the publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_requests;

-- Step 3: Set Replica Identity to FULL so we get the old/new records fully
ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.feature_requests REPLICA IDENTITY FULL;
