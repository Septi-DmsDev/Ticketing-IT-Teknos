# Environment Variables

Daftar variabel lingkungan (*environment variables*) yang dibutuhkan untuk menjalankan sistem IT Ticketing.

| Variable | Purpose | Required | Sensitive | Example Placeholder | Notes |
|---|---|---|---|---|---|
| `PUBLIC_SUPABASE_URL` | Endpoint API proyek Supabase | Yes | No | `https://xxxx.supabase.co` | Harus dipasang prefix `PUBLIC_` agar terbaca oleh client Astro. |
| `PUBLIC_SUPABASE_ANON_KEY` | Kunci anonim untuk akses DB dari sisi *client* | Yes | No | `eyJhb...` | Aman ditaruh di *frontend* selama RLS Supabase dikonfigurasi dengan benar. |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci sakti untuk bypass RLS (digunakan oleh Admin/Server) | Yes | Yes | `eyJhb...` | **JANGAN PERNAH** ditaruh di *frontend*. Hanya untuk Node.js server. |

## Catatan Perubahan Scope

- Modul WhatsApp notification sudah dipensiunkan dari aplikasi aktif.
- Tidak ada lagi env var runtime khusus WhatsApp yang dibutuhkan untuk web saat ini.
- Jika environment lama masih memiliki variabel WhatsApp, variabel tersebut aman dihapus setelah migration terbaru dijalankan.
