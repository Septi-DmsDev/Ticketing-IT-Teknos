# Setup Guide

## Prerequisites
- Node.js (v18 atau lebih baru).
- `npm` (atau `pnpm`/`yarn`).
- Git.
- Akun Supabase (atau instalasi Supabase Self-Hosted).
- Akun Coolify (di VPS) untuk deployment.

## Local Development Setup
Panduan ini HANYA berupa instruksi (tidak dieksekusi otomatis oleh *skill* inisialisasi ini).

1. Buka terminal di folder proyek.
2. Inisialisasi Astro (bisa dilakukan nanti):
   ```bash
   npm create astro@latest
   ```
3. Install Supabase Client:
   ```bash
   npm install @supabase/supabase-js
   ```
4. Install Tailwind CSS untuk Astro:
   ```bash
   npx astro add tailwind
   ```

## Environment Variables
- Salin `.env.example` menjadi `.env`.
- Isi variabel `PUBLIC_SUPABASE_URL` dan `PUBLIC_SUPABASE_ANON_KEY`.

## Database Setup
1. Buat proyek baru di Supabase.
2. Eksekusi skema SQL (akan dibuatkan file `.sql` di tahap *coding*).
3. Atur RLS agar tabel `support_tickets` dan `feature_requests` bisa di-*insert* publik, tapi di-*read/update* oleh *authenticated user* saja.

## What This Skill Did Not Execute
*Skill* `init-project-operating-system` **TIDAK** menjalankan perintah instalasi NPM apapun, tidak membuat koneksi ke Supabase, dan tidak menjalankan Docker. *Skill* ini murni menyiapkan dokumentasi protokol.
