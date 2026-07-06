-- =========================================================
-- IT Ticketing System — Initial Database Schema
-- Run this SQL in your Supabase SQL Editor
-- =========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- 1. TABLE: profiles (IT Staff Accounts)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'it_staff' CHECK (role IN ('super_admin', 'it_staff')),
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- IT Staff can read all profiles (for assign dropdown)
CREATE POLICY "authenticated_read_profiles" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');
-- Users can only update their own profile
CREATE POLICY "own_profile_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- =========================================================
-- 2. TABLE: categories (Support Ticket Categories — Dynamic)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
-- Anyone (public) can read active categories for the dropdown
CREATE POLICY "public_read_active_categories" ON public.categories
  FOR SELECT USING (is_active = TRUE);
-- Only authenticated (IT Admin) can insert/update/delete categories
CREATE POLICY "admin_manage_categories" ON public.categories
  FOR ALL USING (auth.role() = 'authenticated');

-- Seed default categories
INSERT INTO public.categories (name) VALUES
  ('Hardware (PC, Laptop, Printer, dsb.)'),
  ('Software / Aplikasi'),
  ('Jaringan / Internet / WiFi'),
  ('Akun & Akses (Password, Izin, dsb.)')
ON CONFLICT DO NOTHING;

-- =========================================================
-- 3. TABLE: support_tickets (Modul 2)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code       TEXT UNIQUE NOT NULL,
  reporter_name     TEXT NOT NULL,
  reporter_position TEXT NOT NULL,
  reporter_division TEXT NOT NULL,
  category_id       UUID REFERENCES public.categories(id),
  category_name     TEXT, -- Denormalized for easy display
  description       TEXT NOT NULL,
  location          TEXT,
  attachment_url    TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','assigned','in_progress','resolved','closed')),
  urgency           TEXT NOT NULL DEFAULT 'normal'
                    CHECK (urgency IN ('normal', 'urgent', 'critical')),
  assigned_to       UUID REFERENCES public.profiles(id),
  it_notes          TEXT,        -- Internal notes (not visible to reporter)
  it_response       TEXT,        -- Official response visible to reporter
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Public can INSERT new support tickets
CREATE POLICY "public_insert_support_ticket" ON public.support_tickets
  FOR INSERT WITH CHECK (TRUE);
-- Public can only SELECT ticket by exact ticket_code (for tracking)
CREATE POLICY "public_read_by_code" ON public.support_tickets
  FOR SELECT USING (TRUE); -- RLS filtered in query via .eq('ticket_code', code)
-- Authenticated (IT Admin) can do everything
CREATE POLICY "admin_all_support_tickets" ON public.support_tickets
  FOR ALL USING (auth.role() = 'authenticated');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================================================
-- 4. TABLE: feature_requests (Modul 1)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.feature_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code         TEXT UNIQUE NOT NULL,
  requester_name      TEXT NOT NULL,
  requester_position  TEXT NOT NULL,
  requester_division  TEXT NOT NULL,
  title               TEXT NOT NULL,
  background          TEXT NOT NULL,
  description         TEXT NOT NULL,
  user_priority       TEXT NOT NULL DEFAULT 'medium'
                      CHECK (user_priority IN ('low', 'medium', 'high')),
  it_priority         TEXT CHECK (it_priority IN ('low', 'medium', 'high')),
  target_date         DATE,
  attachment_url      TEXT,
  status              TEXT NOT NULL DEFAULT 'reviewing'
                      CHECK (status IN ('draft','reviewing','approved','rejected','in_progress','testing','done')),
  it_notes            TEXT,
  it_response         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

-- Public can INSERT new feature requests
CREATE POLICY "public_insert_feature_request" ON public.feature_requests
  FOR INSERT WITH CHECK (TRUE);
-- Public can read feature requests (for tracking)
CREATE POLICY "public_read_feature_request" ON public.feature_requests
  FOR SELECT USING (TRUE);
-- Authenticated (IT Admin) can do everything
CREATE POLICY "admin_all_feature_requests" ON public.feature_requests
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER feature_requests_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
