# Decision Log

| Date | Decision | Context | Options Considered | Chosen By | Impact | Revisit Trigger |
|---|---|---|---|---|---|---|
| 2026-07-06 | Penggunaan Astro.js | Kebutuhan antarmuka cepat, ringan, non-login, dan modern. | React SPA, Next.js, Astro.js | User | Form publik akan sangat ringan dan SEO-friendly. Pengembangan berbasis komponen `.astro`. | Jika ke depan butuh *state management* yang rumit (SPA penuh). |
| 2026-07-06 | Deployment via Coolify (Self-Hosted) | Bot Baileys butuh proses long-running, Vercel serverless tidak cocok. | Vercel, Netlify, VPS Manual, Coolify | User | Server harus dikonfigurasi dengan Docker/Nixpacks di Coolify. | Jika server kehabisan memori (*out of memory*). |
| 2026-07-06 | Tanpa Autentikasi Publik | Mempermudah pelaporan untuk karyawan tanpa repot daftar. | Supabase Auth (semua login), No Auth + Tracking Code | User | Resiko tiket palsu/iseng naik, tracking hanya via kode. | Jika spamming tiket menjadi masalah operasional serius. |
| 2026-07-06 | Bot Notifikasi via Baileys | Kirim info progress instan. | Email (Resend), API WA berbayar, Baileys | User | Butuh setup spesifik agar sesi WA awet (*auth state* disimpan). | Jika nomor WA terblokir sistem WhatsApp. |
