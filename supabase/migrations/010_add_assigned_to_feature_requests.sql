-- =========================================================
-- Modul 1 Update: Menambahkan PIC IT (assigned_to) 
-- ke tabel feature_requests
-- =========================================================

-- 1. Tambahkan kolom assigned_to
ALTER TABLE public.feature_requests
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id);

-- Selesai.
