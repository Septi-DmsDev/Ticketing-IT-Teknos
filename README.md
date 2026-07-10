# IT Ticketing System

Sistem tiket IT berbasis Astro + Supabase untuk menerima tiket support dan pengajuan sistem baru, lengkap dengan dashboard admin internal.

## Fitur Inti

- Form publik untuk `Tiket Support`
- Form publik untuk `Pengajuan Sistem`
- Tracking tiket publik berbasis kode tiket
- Dashboard admin dengan proteksi session
- Assignment PIC IT untuk tiket support
- Filter, search, urgency, dan quick assignment di daftar tiket support

## Stack

- `Astro` untuk web app server-rendered
- `Supabase` untuk auth, database, dan storage
- `Tailwind CSS` untuk UI

## Environment Variables

Salin `.env.example` ke `.env` lalu isi:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Lihat detail lengkap di `docs/ENVIRONMENT_VARIABLES.md:1`.

## Commands

- `npm install` — install dependency
- `npm run dev` — jalankan server development
- `npm run build` — build production
- `npm run preview` — preview hasil build
- `npm run start` — jalankan server production dari `dist/`
- `npm test` — jalankan test dasar

## Database Migrations Penting

Untuk kondisi terbaru aplikasi, pastikan migration ini sudah diterapkan:

- `supabase/migrations/008_remove_whatsapp_notifications.sql:1`
- `supabase/migrations/009_harden_public_ticket_tracking.sql:1`

## Deploy Readiness

Panduan deploy dan checklist final ada di:

- `docs/DEPLOYMENT_GUIDE.md:1`
- `docs/QA_REPORT_03_PREDEPLOY.md:1`
