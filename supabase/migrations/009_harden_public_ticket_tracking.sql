-- =========================================================
-- IT Ticketing System — Harden Public Ticket Tracking
-- Replace overly broad public SELECT access with narrow RPC endpoints.
-- =========================================================

-- Remove broad public read policies from ticket tables.
DROP POLICY IF EXISTS "public_read_by_code" ON public.support_tickets;
DROP POLICY IF EXISTS "public_read_feature_request" ON public.feature_requests;

-- Public tracking should use an RPC that returns only safe fields.
CREATE OR REPLACE FUNCTION public.get_public_ticket_by_code(input_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  normalized_code TEXT := UPPER(TRIM(input_code));
  result JSONB;
BEGIN
  IF normalized_code = '' THEN
    RETURN NULL;
  END IF;

  IF normalized_code LIKE 'SUP-%' THEN
    SELECT jsonb_build_object(
      'ticket_type', 'support',
      'ticket_code', ticket_code,
      'reporter_name', reporter_name,
      'reporter_division', reporter_division,
      'category_name', category_name,
      'description', description,
      'location', location,
      'attachment_url', attachment_url,
      'status', status,
      'urgency', urgency,
      'it_response', it_response,
      'created_at', created_at,
      'updated_at', updated_at,
      'resolved_at', resolved_at,
      'closed_at', closed_at
    )
    INTO result
    FROM public.support_tickets
    WHERE ticket_code = normalized_code
    LIMIT 1;

    RETURN result;
  END IF;

  IF normalized_code LIKE 'REQ-%' THEN
    SELECT jsonb_build_object(
      'ticket_type', 'request',
      'ticket_code', ticket_code,
      'requester_name', requester_name,
      'requester_division', requester_division,
      'title', title,
      'description', description,
      'attachment_url', attachment_url,
      'status', status,
      'user_priority', user_priority,
      'it_priority', it_priority,
      'it_response', it_response,
      'created_at', created_at,
      'updated_at', updated_at,
      'target_date', target_date
    )
    INTO result
    FROM public.feature_requests
    WHERE ticket_code = normalized_code
    LIMIT 1;

    RETURN result;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_ticket_closed_public(input_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  normalized_code TEXT := UPPER(TRIM(input_code));
BEGIN
  IF normalized_code = '' OR normalized_code NOT LIKE 'SUP-%' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.support_tickets
  SET status = 'closed',
      closed_at = NOW()
  WHERE ticket_code = normalized_code
    AND status = 'resolved';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_ticket_by_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_closed_public(TEXT) TO anon, authenticated;
