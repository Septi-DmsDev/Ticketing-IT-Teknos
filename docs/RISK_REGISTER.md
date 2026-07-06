# Risk Register

| Risk | Category | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| Baileys Disconnected | Technical | Medium | High | Menggunakan metode *auto-reconnect* pada *script* Node.js, dan menyimpan *auth_info* ke dalam volume persisten di Coolify. | Tim IT | Open |
| Spam Tiket Palsu | Security | Low | Medium | Menambahkan *rate-limiter* berdasarkan IP atau opsi reCAPTCHA di form jika terjadi serangan. | Tim IT | Open |
| Kebocoran Data Sensitif | Security | Low | High | Pastikan Supabase RLS terkonfigurasi (*Insert Only* untuk Anonymous, *Select* hanya pakai filter `ticket_code`). | Developer | Open |
| Nomor WA Diblokir | Operational | Medium | High | Gunakan nomor khusus (jangan nomor pribadi), hindari *blast* masif dalam hitungan detik (*delay* pengiriman). | Tim IT | Open |
| Limitasi Server (RAM Penuh) | Operational | Low | Medium | Pantau *resource* container Baileys dan Supabase self-hosted (jika ada) via Coolify *dashboard*. | Super Admin | Open |
