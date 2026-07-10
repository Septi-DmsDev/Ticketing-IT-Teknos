# Deployment Guide

## Scope

Panduan ini untuk deploy aplikasi web IT Ticketing System setelah modul WhatsApp dipensiunkan.

## Prasyarat

- Environment variables terisi:
  - `PUBLIC_SUPABASE_URL`
  - `PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Migration database terbaru sudah diterapkan.

## Migration Wajib

Jalankan minimal migration berikut pada environment target:

- `supabase/migrations/008_remove_whatsapp_notifications.sql:1`
- `supabase/migrations/009_harden_public_ticket_tracking.sql:1`

## Build Lokal Sebelum Deploy

```bash
npm install
npm test
npm run build
```

## Runtime

Aplikasi production dijalankan dengan:

```bash
npm run start
```

Server akan memakai output `dist/` dari Astro adapter Node standalone.

## Smoke Check Setelah Deploy

- Buka halaman publik `/`
- Buat 1 tiket support
- Cari tiket via `/tracking`
- Login admin `/admin/login`
- Buka `/admin/support`
- Coba assign PIC
- Coba ubah urgency

## Rollback Notes

- Jika deploy gagal di layer aplikasi, rollback ke build sebelumnya.
- Jika migration `009` sudah diterapkan, tracking publik tetap harus menggunakan RPC baru.
- Jangan rollback hanya file aplikasi tanpa memperhatikan kompatibilitas migration aktif.
