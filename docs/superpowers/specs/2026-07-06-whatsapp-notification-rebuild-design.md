# WhatsApp Notification Feature (Full Recreation) — Design Spec

**Tanggal:** 2026-07-06
**Status:** Review (keputusan kunci Q2 & dependency test runner dikonfirmasi user; Q1/Q3/Q4/Q5 masih asumsi default, lihat Section 8)
**Author:** Agent + User

---

## 1. Overview

Fitur notifikasi WhatsApp saat ini (`bot/index.ts` + `bot/supabaseListener.ts`) dianggap gagal total oleh user ("tidak bekerja sama sekali") dan akan **direkonstruksi ulang sepenuhnya**, bukan ditambal. Baileys tetap dipertahankan sebagai library WA (sudah menjadi keputusan tercatat di `docs/DECISION_LOG.md` dan `docs/TECH_STACK_DECISION.md`), tetapi arsitektur pengiriman notifikasi diganti total: dari "in-memory queue + realtime listener tanpa error handling" menjadi **durable outbox di Postgres + dispatcher yang polling**, sehingga tidak ada notifikasi yang hilang secara diam-diam dan status kesehatan bot terlihat oleh admin.

## 2. Goals & Non-Goals

### Goals
- Setiap tiket baru (support & feature request) dan setiap perubahan status **pasti** menghasilkan catatan notifikasi yang tersimpan di database (outbox), terlepas dari apakah proses bot sedang hidup saat event terjadi.
- Bot WhatsApp mengirim pesan dari outbox tersebut secara reliable, dengan retry + backoff, dan mencatat hasil (sent/failed/dead) per baris — bukan `console.log`/`console.error` yang hilang saat proses restart.
- Admin bisa melihat status kesehatan bot (connected/disconnected/qr pending) dan riwayat notifikasi (terkirim/gagal/butuh perhatian) dari dashboard `/admin`, tanpa perlu SSH ke server / baca log container.
- Root cause kegagalan lama (stale `waSocket` binding, `.subscribe()` tanpa error handling, queue in-memory yang hilang saat crash) dieliminasi oleh desain baru, bukan sekadar di-patch.
- Rate limiting terhadap WhatsApp tetap dijaga (delay antar pesan) agar nomor bot tidak diblokir — risiko ini sudah tercatat di `docs/RISK_REGISTER.md` ("Nomor WA Diblokir").

### Non-Goals (explicitly out of scope)
- **Tidak** pindah dari Baileys ke WA Business API berbayar (Wablas/Fonnte/dll) — sudah diputuskan ditolak di Tech Stack Decision.
- **Tidak** membangun sistem notifikasi generik multi-channel (email/push). Fokus hanya WhatsApp.
- **Tidak** mengubah enum/status workflow tiket yang sudah ada (`support_tickets.status`, `feature_requests.status`).
- **Tidak** menambah pengiriman ke WhatsApp Group JID pada versi ini — `ADMIN_WA_NUMBER` tetap berupa daftar nomor individu dipisah koma (lihat Open Questions #3 soal grup).
- **Tidak** memperbaiki kebocoran PII yang ditemukan sebagai efek samping (lihat Security Considerations #4) — dicatat sebagai temuan terpisah, bukan bagian dari scope rebuild ini kecuali user minta digabung.

## 3. User Stories / Use Cases

- Sebagai **pelapor tiket support**, saya ingin menerima WA saat tiket saya dibuat dan setiap kali statusnya berubah, agar saya tahu progres tanpa harus buka halaman tracking terus-menerus.
- Sebagai **pemohon fitur baru**, saya ingin menerima WA saat pengajuan saya masuk dan saat statusnya berubah.
- Sebagai **admin/tim IT**, saya ingin menerima WA setiap ada tiket support atau pengajuan baru, dan saat tiket support ditandai `resolved`, agar saya segera aware tanpa harus refresh dashboard terus.
- Sebagai **admin/tim IT**, saya ingin tahu kalau bot WhatsApp sedang terputus (disconnected/butuh scan QR ulang) dari dashboard, agar saya tidak baru sadar setelah berhari-hari notifikasi tidak terkirim.
- Sebagai **admin/tim IT**, saya ingin bisa melihat kenapa suatu notifikasi gagal terkirim (nomor invalid, WA disconnect, dll) dan retry manual jika perlu.

## 4. Technical Design

### 4.0 Ringkasan Arsitektur

```
[Astro form submit] ──insert──▶ [support_tickets / feature_requests]
                                          │
                                          │ AFTER INSERT/UPDATE trigger (Postgres, dalam transaksi yang sama)
                                          ▼
                                 [notification_outbox]  ◀── source of truth, durable
                                          │
                                          │ polling tiap N detik (bukan bergantung Realtime)
                                          ▼
                              [bot process: dispatcher loop]
                                          │
                                          ├─ Baileys sendMessage (rate-limited, sequential)
                                          ├─ update outbox.status = sent/failed
                                          └─ upsert bot_heartbeat (connection_state, last_heartbeat_at)
                                          ▼
                              [/admin dashboard] ── baca outbox + heartbeat (read-only, service role)
```

**Keputusan desain kunci:** enqueue notifikasi dipindah dari kode aplikasi (Astro) / kode bot (Realtime listener) ke **Postgres trigger**. Ini membuat pembuatan baris outbox atomik dengan insert/update tiket itu sendiri — tidak mungkin "tiket dibuat tapi notifikasi lupa di-enqueue" karena keduanya satu transaksi DB. Bot tidak lagi bergantung pada `postgres_changes` Realtime sama sekali untuk *mengetahui* ada tiket baru; bot hanya perlu **polling** tabel `notification_outbox` untuk baris berstatus `pending`. Ini menghilangkan seluruh kelas bug lama:
- Tidak ada lagi stale `waSocket` binding — karena tidak ada lagi cross-module import yang jadi sumber bug; dispatcher polling loop hidup dalam proses yang sama dengan koneksi socket, memakai fungsi getter yang sama tapi sekarang diverifikasi lewat test manual di Testing Strategy.
- Tidak ada lagi silent failure dari `.subscribe()` tanpa callback — karena Realtime tidak lagi menjadi jalur kritis pengiriman (opsional, tidak dipakai di v1 ini untuk menyederhanakan permukaan kegagalan).
- Tidak ada lagi outbox yang hilang saat proses restart — karena outbox ada di Postgres, bukan array in-memory.

### 4.1 Data Model

Migration baru: `supabase/migrations/005_notification_outbox.sql`

```sql
-- Outbox: satu baris = satu pesan WA yang harus/sudah dikirim ke satu nomor
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type       TEXT NOT NULL CHECK (ticket_type IN ('support', 'request')),
  ticket_code       TEXT NOT NULL,
  recipient_phone   TEXT NOT NULL,          -- format 62xxxx, tanpa '+' dan tanpa '@s.whatsapp.net'
  recipient_role    TEXT NOT NULL CHECK (recipient_role IN ('reporter', 'admin')),
  event_type        TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed')),
  message_body      TEXT NOT NULL,          -- pesan final yang sudah di-render, bukan template mentah
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempt_count     INT NOT NULL DEFAULT 0,
  max_attempts      INT NOT NULL DEFAULT 5,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ
);

-- Index untuk query dispatcher: ambil batch pending yang sudah waktunya dicoba
CREATE INDEX IF NOT EXISTS idx_outbox_dispatch
  ON public.notification_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
-- TIDAK ADA policy publik sama sekali. Hanya service_role yang boleh akses
-- (service_role bypass RLS by default di Supabase, jadi cukup tidak buat policy untuk anon/authenticated).

-- Heartbeat: 1 baris singleton yang di-upsert oleh proses bot
CREATE TABLE IF NOT EXISTS public.bot_heartbeat (
  id                 TEXT PRIMARY KEY DEFAULT 'whatsapp-bot',
  connection_state   TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (connection_state IN ('unknown', 'connected', 'disconnected', 'qr_pending', 'logged_out')),
  wa_number          TEXT,
  last_heartbeat_at  TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.bot_heartbeat ENABLE ROW LEVEL SECURITY;
-- Tidak ada policy publik; hanya service_role.

INSERT INTO public.bot_heartbeat (id, connection_state)
VALUES ('whatsapp-bot', 'unknown')
ON CONFLICT (id) DO NOTHING;

-- Admin numbers config table — replaces env var ADMIN_WA_NUMBER entirely.
CREATE TABLE IF NOT EXISTS public.notification_admins (
  phone       TEXT PRIMARY KEY,       -- format 62xxxx
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notification_admins ENABLE ROW LEVEL SECURITY;
-- Tidak ada policy publik; hanya service_role (dipakai oleh trigger via SECURITY DEFINER dan halaman admin).

-- =========================================================
-- Trigger: enqueue notifikasi saat tiket dibuat / status berubah
-- =========================================================
CREATE OR REPLACE FUNCTION public.enqueue_support_ticket_notification()
RETURNS TRIGGER AS $$
DECLARE
  admin_row RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('support', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'created',
        format('Halo %s, tiket laporan kendala Anda berhasil dibuat.' || E'\n\n' || '*Kode Tiket*: %s' || E'\n\n' ||
               'Tim IT akan segera meninjau laporan Anda. Kami akan mengirimkan notifikasi perubahan status tiket ke nomor ini.',
               NEW.reporter_name, NEW.ticket_code));
    END IF;

    FOR admin_row IN SELECT phone FROM public.notification_admins WHERE is_active LOOP
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('support', NEW.ticket_code, admin_row.phone, 'admin', 'created',
        format(E'\U0001F6A8 *TIKET SUPPORT BARU* \U0001F6A8\n\n*Kode*: %s\n*Pelapor*: %s (%s)\n*Keluhan*:\n_%s_\n\nSegera cek dashboard admin!',
               NEW.ticket_code, NEW.reporter_name, NEW.reporter_division, NEW.description));
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.whatsapp_number IS NOT NULL AND NEW.whatsapp_number <> '' THEN
      INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
      VALUES ('support', NEW.ticket_code, NEW.whatsapp_number, 'reporter', 'status_changed',
        format('Halo, status tiket support Anda (*%s*) telah diperbarui menjadi: *%s*.%s',
               NEW.ticket_code, public.status_label_id(NEW.status),
               CASE WHEN NEW.it_response IS NOT NULL THEN E'\n\nPesan dari IT:\n_' || NEW.it_response || '_' ELSE '' END));
    END IF;

    IF NEW.status = 'resolved' THEN
      FOR admin_row IN SELECT phone FROM public.notification_admins WHERE is_active LOOP
        INSERT INTO public.notification_outbox (ticket_type, ticket_code, recipient_phone, recipient_role, event_type, message_body)
        VALUES ('support', NEW.ticket_code, admin_row.phone, 'admin', 'status_changed',
          format(E'✅ *TIKET SUPPORT SELESAI*\n\nKode: %s telah ditandai Selesai (Resolved) oleh IT.\n\nCatatan IT: %s',
                 NEW.ticket_code, COALESCE(NEW.it_response, '-')));
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_support_ticket_notification
  AFTER INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_support_ticket_notification();

-- Analogous trigger + function `enqueue_feature_request_notification()` on feature_requests,
-- mirroring the INSERT (admin + requester) and UPDATE-status-changed (requester only) rules
-- from the current bot/supabaseListener.ts feature-changes channel handler.

-- Helper: status label translation (Indonesian), single source of truth instead of
-- duplicating the map in both the bot and the tracking page.
CREATE OR REPLACE FUNCTION public.status_label_id(status TEXT)
RETURNS TEXT AS $$
  SELECT CASE status
    WHEN 'open' THEN 'Terbuka'
    WHEN 'assigned' THEN 'Ditugaskan'
    WHEN 'in_progress' THEN 'Sedang Dikerjakan'
    WHEN 'resolved' THEN 'Selesai / Menunggu Konfirmasi'
    WHEN 'closed' THEN 'Ditutup'
    WHEN 'reviewing' THEN 'Sedang Direview'
    WHEN 'approved' THEN 'Disetujui'
    WHEN 'rejected' THEN 'Ditolak'
    WHEN 'testing' THEN 'Dalam Pengujian'
    WHEN 'done' THEN 'Selesai'
    ELSE status
  END;
$$ LANGUAGE sql IMMUTABLE;
```

> **Keputusan final (dikonfirmasi user):** Admin numbers disimpan di tabel konfigurasi `public.notification_admins (phone TEXT PRIMARY KEY, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`, dikelola dari `/admin`, **menggantikan** env var `ADMIN_WA_NUMBER` sepenuhnya. Trigger melakukan `SELECT phone FROM public.notification_admins WHERE is_active` alih-alih parsing env var atau GUC — pendekatan `current_setting('app.admin_wa_numbers')` yang disebut di draft awal **tidak dipakai** karena rapuh (butuh proses lain men-set GUC per koneksi). Menambah/menonaktifkan nomor admin tidak lagi butuh restart proses bot.

### 4.2 API / Route Contract

Tidak ada API publik baru. Semua akses ke `notification_outbox` / `bot_heartbeat` / `notification_admins` terjadi lewat halaman admin server-side (Astro, `supabaseAdmin` / service role), tidak pernah lewat client anon key.

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | `/admin/notifikasi` | admin session (existing middleware) | Tampilkan status `bot_heartbeat`, daftar notifikasi terakhir (sent/failed/dead), filter by ticket_code |
| POST | `/admin/notifikasi` (form action) | admin session | `action=retry` → set baris outbox terpilih kembali ke `status='pending', next_attempt_at=now()` |
| GET/POST | `/admin/notifikasi/admins` (opsional, atau bagian dari halaman yang sama) | admin session | CRUD nomor admin (`notification_admins`) menggantikan env var `ADMIN_WA_NUMBER` statis |

Bot process sendiri tidak membuka port HTTP apa pun (tetap long-running background process seperti sekarang, dijalankan lewat `npm run start:bot`).

### 4.3 Business Logic

**Aturan trigger notifikasi (mengacu ke perilaku existing di `bot/supabaseListener.ts`, dipertahankan agar tidak mengubah UX yang sudah benar):**

| Tabel | Event | Kondisi | Penerima |
|---|---|---|---|
| support_tickets | INSERT | selalu | semua admin aktif + reporter (jika `whatsapp_number` terisi) |
| support_tickets | UPDATE | `status` berubah | reporter (jika `whatsapp_number` terisi) |
| support_tickets | UPDATE | `status` berubah **menjadi** `resolved` | tambahan: semua admin aktif |
| feature_requests | INSERT | selalu | semua admin aktif + requester (jika `whatsapp_number` terisi) |
| feature_requests | UPDATE | `status` berubah | requester (jika `whatsapp_number` terisi) — **tidak** notifikasi admin (lihat Open Questions #1) |

**Dispatcher loop (proses bot, menggantikan `processQueue()` lama):**
1. Setiap `DISPATCH_INTERVAL_MS` (default 5 detik), klaim batch pending lewat RPC (bukan query builder biasa — Supabase JS client tidak punya API untuk `FOR UPDATE SKIP LOCKED`):
   ```sql
   CREATE OR REPLACE FUNCTION public.dispatch_claim_batch(batch_size INT DEFAULT 20)
   RETURNS SETOF public.notification_outbox AS $$
     UPDATE public.notification_outbox
     SET status = 'sending'
     WHERE id IN (
       SELECT id FROM public.notification_outbox
       WHERE status IN ('pending', 'failed') AND next_attempt_at <= now()
       ORDER BY created_at ASC
       LIMIT batch_size
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *;
   $$ LANGUAGE sql;
   ```
   Bot memanggil `supabase.rpc('dispatch_claim_batch', { batch_size: 20 })`. Baris yang berhasil diklaim langsung berstatus `sending` (transaksional, atomik) sebelum benar-benar dikirim — ini mencegah dua instance bot (kalau pernah tidak sengaja jalan dobel) saling mengirim baris yang sama, menggantikan PID lock file sebagai mekanisme utama korektnes (PID lock file dipertahankan sebagai lapisan tambahan, tapi bukan satu-satunya penjamin).
2. Untuk tiap baris: kirim via `waSocket.sendMessage(jid, { text })` dengan delay tetap antar pesan (≥1500ms) agar tidak kena rate-limit WA.
3. Sukses → `status='sent', sent_at=now()`.
4. Gagal → `attempt_count += 1`, `last_error=<pesan error>`. Jika `attempt_count >= max_attempts` → `status='dead'`. Jika belum → `status='failed'`, `next_attempt_at = now() + backoff(attempt_count)` dengan backoff eksponensial (mis. `30s * 2^attempt_count`, capped 30 menit).
5. Jika `waSocket` belum siap (belum connect / sedang reconnect) → jangan proses batch sama sekali, tunggu tick berikutnya (baris tetap `pending`, tidak dianggap gagal).

**Heartbeat:**
- Bot meng-upsert `bot_heartbeat` setiap kali `connection.update` berubah (connected/disconnected/qr_pending/logged_out) **dan** setiap `HEARTBEAT_INTERVAL_MS` (mis. 60 detik) selama status `connected`, supaya admin dashboard bisa mendeteksi "proses mati total" (heartbeat berhenti update) vs "proses hidup tapi WA disconnect" (heartbeat update dengan `connection_state='disconnected'`).

**Format nomor telepon:** tetap satu fungsi `formatWhatsAppNumber()` yang sudah ada di `src/lib/ticket.ts`, dipakai saat insert ke `whatsapp_number` (sekali, di titik input). Trigger SQL dan bot **tidak** memformat ulang nomor — nomor di kolom `whatsapp_number` dan di `notification_admins.phone` dianggap sudah dalam format final `62xxxxxxxxxx`. Ini menghilangkan duplikasi logic format-phone yang tadinya ada di dua tempat (`src/lib/ticket.ts` dan `bot/supabaseListener.ts`).

### 4.4 UI / UX

**Halaman baru `/admin/notifikasi`:**
- Card status koneksi bot: badge hijau "Terhubung sebagai +62xxx" / kuning "Menunggu Scan QR" / merah "Terputus (last seen: X menit lalu)", diambil dari `bot_heartbeat`.
- Tabel riwayat notifikasi (join manual `notification_outbox`, terbaru dulu): kolom ticket_code, recipient_role, status (badge), attempt_count, last_error (jika ada), created_at. Filter by status (`pending`/`sent`/`failed`/`dead`) dan search by ticket_code.
- Tombol "Retry" pada baris `failed`/`dead`.
- (Jika config-table dipilih) Section kecil kelola nomor admin: tambah/nonaktifkan nomor, menggantikan env var.

**Tidak ada perubahan UX di halaman publik** (`support.astro`, `pengajuan.astro`, `tracking.astro`) — pesan yang diterima end-user tetap sama secara redaksional.

## 5. Security Considerations

- [x] **RLS ketat**: `notification_outbox`, `bot_heartbeat`, `notification_admins` — **tidak ada policy untuk `anon`/`authenticated`**, hanya `service_role` (dipakai bot dan halaman admin server-side) yang bisa baca/tulis. Ini lebih ketat dari tabel tiket yang memang sengaja publik.
- [x] **Nomor telepon adalah PII**. `message_body` di outbox berisi nama & deskripsi tiket (bisa sensitif) — pastikan tabel ini tidak pernah diekspos ke client bundle (hanya diakses lewat `supabaseAdmin` di server Astro, sama pola dengan `src/lib/supabase-admin.ts` yang sudah ada).
- [x] **Trigger `SECURITY DEFINER`**: fungsi trigger perlu `SECURITY DEFINER` agar bisa insert ke `notification_outbox` terlepas dari role yang melakukan INSERT/UPDATE ke tabel tiket (termasuk `anon` yang insert tiket baru lewat form publik). Perlu di-review agar fungsi ini tidak disalahgunakan sebagai jalur privilege escalation — fungsi harus **hanya** melakukan INSERT ke `notification_outbox` dengan data yang berasal dari `NEW`/`OLD` row, tidak menerima input bebas dari caller.
- [ ] **Temuan terpisah (di luar scope rebuild ini, tapi perlu dicatat):** `getTicketByCode()` di `src/lib/ticket.ts` melakukan `select('*')` pada `support_tickets`/`feature_requests`, dan RLS policy `public_read_by_code`/`public_read_feature_request` adalah `USING (TRUE)` — artinya **siapa pun yang menebak/mengetahui `ticket_code` bisa membaca `whatsapp_number` pelapor**, bukan cuma status tiketnya. Ini pre-existing issue, bukan bagian dari kerusakan notifikasi WA, tapi terkait erat karena kolom yang sama dipakai fitur notif. Direkomendasikan dibuatkan tiket/spec terpisah untuk membatasi kolom yang di-`select` di halaman tracking publik (whitelist kolom, bukan `select('*')`).

## 6. Testing Strategy

- **Unit tests** (bot process, mis. dengan `node --test` atau `vitest` — project belum punya test runner terpasang, lihat Dependencies):
  - Rendering pesan per event type menghasilkan teks yang diharapkan (given ticket row → expected message string) — cocok ditest di level SQL function (`status_label_id`) dan/atau di level dispatcher jika template dipindah ke JS.
  - Backoff calculation: `attempt_count` → `next_attempt_at` delta sesuai formula, dan `attempt_count >= max_attempts` → `status='dead'`.
- **Integration tests (manual SQL, didokumentasikan sebagai skrip)** karena project belum punya DB test harness otomatis:
  - `INSERT` ke `support_tickets` dengan `whatsapp_number` terisi → assert 2 baris outbox muncul (1 reporter + 1 admin per nomor admin aktif) dengan `status='pending'`.
  - `UPDATE status → 'resolved'` → assert baris tambahan admin muncul selain baris reporter.
  - `UPDATE` tanpa perubahan `status` → assert **tidak ada** baris baru (mencegah spam notifikasi untuk update field lain seperti `it_notes`).
- **Manual QA (wajib sebelum dianggap selesai, sesuai instruksi project untuk fitur risiko tinggi/external API):**
  1. Submit tiket support baru via UI dengan nomor WA valid → cek baris outbox muncul → cek pesan WA benar-benar diterima di HP reporter & admin.
  2. Matikan proses bot (`Ctrl+C`) sebelum sempat kirim → nyalakan ulang → pastikan baris `pending` yang tertunda tetap terkirim (tidak hilang).
  3. Cabut koneksi internet server / paksa Baileys disconnect → cek `bot_heartbeat.connection_state` berubah `disconnected` dan admin dashboard menampilkan status merah.
  4. Ubah status tiket lewat `/admin/support/[code]` → cek reporter menerima WA update status, dan untuk `resolved`, admin juga menerima.
  5. Skenario nomor invalid (mis. nomor tidak terdaftar di WhatsApp) → cek baris outbox berakhir di `failed` → `dead` setelah `max_attempts`, dengan `last_error` terisi jelas (bukan silent).
  6. Tombol Retry di `/admin/notifikasi` pada baris `dead`/`failed` → cek baris kembali `pending` dan berhasil terkirim di siklus berikut.

## 7. Migration & Rollback

- Migration baru bersifat **additive**: `005_notification_outbox.sql` menambah tabel + trigger baru, **tidak mengubah** kolom/tabel `support_tickets`/`feature_requests` yang sudah ada. Aman dijalankan tanpa downtime.
- Rollback migration: `DROP TRIGGER trg_support_ticket_notification ON support_tickets; DROP TRIGGER trg_feature_request_notification ON feature_requests; DROP FUNCTION enqueue_support_ticket_notification; DROP FUNCTION enqueue_feature_request_notification; DROP FUNCTION dispatch_claim_batch; DROP FUNCTION status_label_id; DROP TABLE notification_outbox; DROP TABLE bot_heartbeat; DROP TABLE notification_admins;` — semua reversible, tidak ada data tiket yang tersentuh.
- Kode lama `bot/index.ts` dan `bot/supabaseListener.ts` akan **ditulis ulang total** (bukan dihapus dulu baru dibuat — akan diganti isinya, riwayat lama tetap ada di git history untuk referensi/rollback via `git revert`).
- Selama transisi: proses bot lama harus dihentikan sebelum bot baru dijalankan (hindari 2 proses Baileys jalan bersamaan memakai 1 sesi WA yang sama — akan memicu `DisconnectReason.conflict` yang sudah ditangani, tapi lebih baik dihindari saat deploy).
- **Breaking change untuk operasional:** `notification_admins` menggantikan env var `ADMIN_WA_NUMBER` sepenuhnya. Perlu langkah migrasi data satu kali saat deploy: isi tabel `notification_admins` dengan nomor-nomor yang sebelumnya ada di `ADMIN_WA_NUMBER` (manual lewat UI `/admin` baru, atau lewat satu `INSERT` manual di SQL Editor saat migration dijalankan). `ADMIN_WA_NUMBER` di `.env`/`docs/ENVIRONMENT_VARIABLES.md` ditandai deprecated setelah migrasi data selesai.

## 8. Open Questions

- [ ] **Q1:** Apakah perubahan status `feature_requests` juga perlu menotifikasi admin (mirip aturan `resolved` di support_tickets), atau tetap hanya requester seperti perilaku saat ini? Spec ini mengasumsikan **tetap seperti sekarang** (requester only) kecuali user bilang lain.
- [x] **Q2 (resolved):** Nomor admin dikelola lewat tabel `notification_admins` dari `/admin`, menggantikan env var `ADMIN_WA_NUMBER`. Dikonfirmasi user.
- [ ] **Q3:** konsep.md menyebut notifikasi ke "pelapor maupun grup/tim IT" — apakah "grup" di sini literal WhatsApp Group, atau cukup broadcast ke beberapa nomor individu admin (perilaku saat ini)? Spec ini mengasumsikan **broadcast ke individu**, dukungan WA Group JID didefer ke iterasi berikutnya jika dibutuhkan.
- [ ] **Q4:** Apakah dibutuhkan halaman `/admin/notifikasi` penuh, atau cukup widget kecil di `/admin` (index) yang menampilkan status bot + link ke daftar gagal? Mempengaruhi ukuran task di implementation plan.
- [ ] **Q5:** Interval polling dispatcher (default diusulkan 5 detik) dan interval heartbeat (default 60 detik) — apakah nilai ini perlu dikonfigurasi lewat env var, atau hardcode cukup untuk skala penggunaan internal ini?

## 9. Dependencies

- **Tidak ada package baru** untuk bot itu sendiri — tetap `@whiskeysockets/baileys`, `@supabase/supabase-js`, `pino`, `qrcode-terminal`, `dotenv` (sudah ada di `package.json`).
- **Test runner (dikonfirmasi user):** tambahkan **`vitest`** sebagai dev dependency baru — project belum punya test runner sama sekali. Dipakai untuk unit test rendering pesan (jika template dipindah ke JS/TS di sisi bot untuk keperluan test) dan kalkulasi backoff dispatcher. Tambahkan script `"test": "vitest run"` di `package.json`.
- **Supabase project**: migration `005_notification_outbox.sql` harus dijalankan di project Supabase yang sama (lewat SQL Editor atau CLI, mengikuti pola migration sebelumnya di `supabase/migrations/`).
- **File/fitur lain yang jadi dependency**: `src/middleware/index.ts` (proteksi route `/admin/*` sudah ada, halaman baru otomatis terlindungi karena prefix `/admin`), `src/layouts/AdminLayout.astro` (dipakai untuk halaman baru agar konsisten dengan admin pages lain).

---

## Referensi
- `konsep.md` §2 (tech stack), §7 (dashboard admin)
- `docs/DECISION_LOG.md` — keputusan Baileys & Coolify
- `docs/RISK_REGISTER.md` — risiko "Baileys Disconnected" dan "Nomor WA Diblokir" yang langsung ditangani desain ini (heartbeat + rate limit + retry)
- `docs/ENVIRONMENT_VARIABLES.md` — env var terkait (`WA_SESSION_FOLDER`, `ADMIN_WA_NUMBER`, `SUPABASE_SERVICE_ROLE_KEY`)
- Kode lama yang direkonstruksi: `bot/index.ts`, `bot/supabaseListener.ts`
- `supabase/migrations/001_init_schema.sql`, `002_enable_realtime.sql`, `004_whatsapp_notifications.sql`
