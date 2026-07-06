# Environment Variables

Daftar variabel lingkungan (*environment variables*) yang dibutuhkan untuk menjalankan sistem IT Ticketing.

| Variable | Purpose | Required | Sensitive | Example Placeholder | Notes |
|---|---|---|---|---|---|
| `PUBLIC_SUPABASE_URL` | Endpoint API proyek Supabase | Yes | No | `https://xxxx.supabase.co` | Harus dipasang prefix `PUBLIC_` agar terbaca oleh client Astro. |
| `PUBLIC_SUPABASE_ANON_KEY` | Kunci anonim untuk akses DB dari sisi *client* | Yes | No | `eyJhb...` | Aman ditaruh di *frontend* selama RLS Supabase dikonfigurasi dengan benar. |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci sakti untuk bypass RLS (digunakan oleh Admin/Server) | Yes | Yes | `eyJhb...` | **JANGAN PERNAH** ditaruh di *frontend*. Hanya untuk Node.js server. |
| `WA_SESSION_FOLDER` | Lokasi penyimpanan status *login* / sesi WhatsApp Baileys | Yes | No | `./auth_info_baileys` | Pastikan *folder* ini di-*gitignore* agar sesi tidak bocor. |
