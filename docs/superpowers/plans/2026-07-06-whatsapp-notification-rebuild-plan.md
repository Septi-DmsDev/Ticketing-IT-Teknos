# WhatsApp Notification Feature (Full Recreation) — Implementation Plan

**Tanggal:** 2026-07-06
**Spec:** `docs/superpowers/specs/2026-07-06-whatsapp-notification-rebuild-design.md`
**Status:** Draft
**Supersedes:** `docs/superpowers/plans/2026-07-06-wa-notification-bot-plan.md` (in-memory retry pendekatan, sudah dieksekusi sebagian dan terbukti gagal — notifikasi tetap tidak bekerja)

---

## Scope Summary
- Migration baru: tabel `notification_outbox`, `bot_heartbeat`, `notification_admins` + trigger Postgres yang meng-enqueue notifikasi secara atomik saat tiket dibuat/berubah status.
- Bot Baileys ditulis ulang total, dipecah jadi modul kecil (`connection`, `dispatcher`, `heartbeat`, `backoff`, `supabaseClient`) menggantikan `bot/index.ts` + `bot/supabaseListener.ts` yang lama — Realtime listener dihapus sepenuhnya, diganti polling outbox.
- Halaman admin baru `/admin/notifikasi`: status koneksi bot (heartbeat), riwayat notifikasi + retry, dan CRUD nomor admin (`notification_admins`, menggantikan `ADMIN_WA_NUMBER`).
- `vitest` ditambahkan sebagai dev dependency untuk unit test backoff logic.
- Bug tidak terkait (admin pengajuan status list) sudah diperbaiki terpisah sebelum plan ini dibuat.

## Task Breakdown

### Task 1: Migration — Outbox, Heartbeat, Admin Numbers, Triggers
**Files:**
- `[NEW] supabase/migrations/005_notification_outbox.sql` — semua tabel baru + trigger functions + helper `status_label_id()`

**Detail:**
- Ikuti SQL di spec Section 4.1 persis untuk `notification_outbox`, `bot_heartbeat`, `notification_admins`, `enqueue_support_ticket_notification()` + trigger.
- Tambahkan fungsi analog `enqueue_feature_request_notification()` + trigger `trg_feature_request_notification` pada `feature_requests`, mengikuti aturan tabel di spec Section 4.3:
  - INSERT → admin aktif (semua) + requester (jika `whatsapp_number` ada)
  - UPDATE status berubah → requester saja (tidak ada notifikasi admin tambahan untuk feature request, beda dengan support_tickets `resolved`)
  - Pesan admin INSERT: reuse teks `💡 *PENGAJUAN SISTEM BARU* 💡 ...` dari `bot/supabaseListener.ts` lama (baris ~166) sebagai baseline redaksional.
  - Pesan requester INSERT & status update: reuse teks dari `bot/supabaseListener.ts` lama (baris ~172, ~190) sebagai baseline.
- Semua tabel baru: `ENABLE ROW LEVEL SECURITY`, **tanpa** policy untuk `anon`/`authenticated` (hanya `service_role` yang implisit bypass RLS).
- Index `idx_outbox_dispatch` pada `(status, next_attempt_at) WHERE status IN ('pending','failed')`.
- Migration bersifat **additive only** — jangan sentuh kolom/tabel `support_tickets`/`feature_requests` yang sudah ada selain menambah trigger baru padanya.

**Validation:**
```bash
# Jalankan lewat Supabase SQL Editor atau CLI terhadap project Supabase yang dipakai project ini
# Verifikasi manual:
psql "$SUPABASE_DB_URL" -c "\d notification_outbox"
psql "$SUPABASE_DB_URL" -c "\d bot_heartbeat"
psql "$SUPABASE_DB_URL" -c "\d notification_admins"
psql "$SUPABASE_DB_URL" -c "SELECT tgname FROM pg_trigger WHERE tgrelid = 'support_tickets'::regclass;"
psql "$SUPABASE_DB_URL" -c "SELECT tgname FROM pg_trigger WHERE tgrelid = 'feature_requests'::regclass;"
```
- Manual: insert 1 baris test ke `notification_admins` (`INSERT INTO notification_admins (phone) VALUES ('628000000000')`), lalu insert dummy row ke `support_tickets` dengan `whatsapp_number` terisi → `SELECT * FROM notification_outbox` harus menghasilkan 2 baris (`admin` + `reporter`) berstatus `pending`. Update `status` dummy row itu tanpa mengubah kolom lain (harus **tidak** menghasilkan baris baru — no-op update guard via `IS DISTINCT FROM`).

**Depends on:** —

---

### Task 2: Seed Admin Numbers (data migration, satu kali)
**Files:**
- Tidak ada file kode baru — langkah operasional, didokumentasikan di sini agar tidak terlewat.

**Detail:**
- Baca nilai `ADMIN_WA_NUMBER` yang sekarang ada di `.env` (format: nomor dipisah koma, sudah dalam format `62xxxx` karena diproses `formatWhatsAppNumber` di alur lama — verifikasi manual sebelum insert).
- `INSERT INTO notification_admins (phone) VALUES ('628xxxxxxxxx'), ('628yyyyyyyyy') ON CONFLICT DO NOTHING;` dijalankan sekali lewat SQL Editor, ATAU diisi lewat UI `/admin/notifikasi` setelah Task 5 selesai (pilih salah satu, dicatat sebagai langkah deploy).
- Tandai `ADMIN_WA_NUMBER` di `docs/ENVIRONMENT_VARIABLES.md` sebagai **deprecated** setelah data pindah (lihat Task 6).

**Validation:**
```bash
psql "$SUPABASE_DB_URL" -c "SELECT phone, is_active FROM notification_admins;"
```

**Depends on:** Task 1

---

### Task 3: Bot Core Rewrite — Shared Client, Backoff, Connection
**Files:**
- `[NEW] bot/supabaseClient.ts` — satu instance `createClient` service-role, dipakai dispatcher & heartbeat (menggantikan duplikasi `createClient` yang ada di `bot/supabaseListener.ts` lama)
- `[NEW] bot/backoff.ts` — pure function `computeNextAttempt(attemptCount: number, maxAttempts: number): { status: 'failed' | 'dead'; nextAttemptAt: Date }`, formula `30s * 2^attemptCount` cap 30 menit
- `[NEW] bot/connection.ts` — Baileys socket lifecycle (extract dari `bot/index.ts` lama): `useMultiFileAuthState`, `makeWASocket`, reconnect branching (401/409/440/other), lock file (`acquireLock`/`releaseLock`), expose `getSocket()` getter + `onConnectionStateChange(cb)` untuk dipakai `heartbeat.ts`
- `[DELETE] bot/supabaseListener.ts` — digantikan total oleh `bot/dispatcher.ts` (Task 4) dan trigger DB (Task 1); Realtime channel subscription tidak dipakai lagi sama sekali

**Detail:**
- `backoff.ts` harus pure (tidak akses DB/waktu sistem langsung selain `Date` — terima `now` sebagai parameter opsional untuk testability) agar bisa di-unit-test tanpa mocking berat.
- `connection.ts` mempertahankan opsi yang sudah proven stabil dari kode uncommitted saat ini: `markOnlineOnConnect: false`, `syncFullHistory: false`, `logger: pino({ level: 'silent' })`, lock file mechanism dengan PID check. Tambahkan `Browsers.ubuntu('Desktop')` (usulan dari spec lama yang belum sempat diverifikasi) sebagai opsi browser eksplisit — dokumentasikan di komentar kenapa (linked device stability).
- `getSocket()` mengembalikan referensi live (bukan snapshot) — dipakai `dispatcher.ts` dan `heartbeat.ts` tanpa import balik ke `index.ts`, menghilangkan pola circular-import yang jadi sumber bug lama.
- Hapus seluruh logic `messageQueue`/`processQueue`/`flushPendingMessages` — tidak ada lagi in-memory queue.

**Validation:**
```bash
npx tsc --noEmit
```

**Depends on:** —（bisa paralel dengan Task 1/2, tidak menyentuh DB）

---

### Task 4: Bot Core Rewrite — Dispatcher & Heartbeat
**Files:**
- `[NEW] bot/dispatcher.ts` — polling loop
- `[NEW] bot/heartbeat.ts` — upsert `bot_heartbeat`

**Detail:**
- `dispatcher.ts`:
  - Setiap `DISPATCH_INTERVAL_MS` (const, default 5000ms): jika `getSocket()` null, skip tick (jangan proses batch).
  - Query lewat Supabase client (service role) — **catatan penting:** Supabase JS client tidak mendukung `FOR UPDATE SKIP LOCKED` langsung lewat query builder biasa. Gunakan `supabase.rpc('dispatch_claim_batch', { batch_size: 20 })` yang memanggil sebuah Postgres function (tambahkan ke migration Task 1) yang melakukan `SELECT ... FOR UPDATE SKIP LOCKED` dan `UPDATE status='sending'` dalam satu transaksi sebelum mengembalikan baris — ini menghindari race condition yang tidak bisa dijamin lewat REST call biasa dari client.
    - **Tambahan ke Task 1:** buat fungsi SQL `dispatch_claim_batch(batch_size int) RETURNS SETOF notification_outbox` yang `UPDATE notification_outbox SET status='sending' WHERE id IN (SELECT id FROM notification_outbox WHERE status IN ('pending','failed') AND next_attempt_at <= now() ORDER BY created_at LIMIT batch_size FOR UPDATE SKIP LOCKED) RETURNING *;`. Tambahkan `'sending'` ke CHECK constraint `status` di Task 1 sebelum lanjut ke task ini.
  - Untuk tiap baris hasil klaim: `await sendMessage(jid, text)` dengan delay ≥1500ms sebelum tiap kirim (sequential, bukan `Promise.all`).
  - Sukses → `UPDATE notification_outbox SET status='sent', sent_at=now() WHERE id=...`.
  - Gagal → panggil `computeNextAttempt()` dari `bot/backoff.ts`, `UPDATE ... SET status=<result.status>, attempt_count=attempt_count+1, next_attempt_at=<result.nextAttemptAt>, last_error=<pesan>`.
- `heartbeat.ts`:
  - Subscribe ke `onConnectionStateChange` dari `connection.ts` → upsert `bot_heartbeat` segera saat berubah.
  - Timer tambahan tiap `HEARTBEAT_INTERVAL_MS` (default 60000ms) selama state `connected` → upsert ulang `last_heartbeat_at` (supaya admin dashboard bisa deteksi proses mati total vs WA disconnect, sesuai spec 4.3).

**Validation:**
```bash
npx tsc --noEmit
```

**Depends on:** Task 1 (butuh fungsi `dispatch_claim_batch` & kolom status `sending`), Task 3

---

### Task 5: Bot Entry Point
**Files:**
- `[MODIFY] bot/index.ts` — jadi entry point tipis: `acquireLock()` → `connectToWhatsApp()` (dari `connection.ts`) → start `dispatcher` loop + `heartbeat` timer setelah socket pertama kali terhubung → `releaseLock()` di exit handlers

**Detail:**
- File ini seharusnya jadi sangat pendek (wiring saja), sebagian besar logic sudah pindah ke `connection.ts`/`dispatcher.ts`/`heartbeat.ts` di Task 3 & 4.
- Pastikan `npm run start:bot` (`tsx bot/index.ts`) tetap jadi entry point yang sama — tidak ada perubahan di `package.json` untuk script ini.

**Validation:**
```bash
npx tsc --noEmit
npm run start:bot   # jalankan manual, pastikan bisa connect / atau reuse sesi existing tanpa error
```

**Depends on:** Task 3, Task 4

---

### Task 6: Test Runner Setup + Backoff Unit Tests
**Files:**
- `[MODIFY] package.json` — tambah devDependency `vitest`, tambah script `"test": "vitest run"`
- `[NEW] vitest.config.ts` — config minimal (root project, tanpa jsdom karena bot adalah Node-only)
- `[NEW] bot/backoff.test.ts` — unit test untuk `computeNextAttempt()`: attempt ke-0/1/2 menghasilkan delay yang sesuai formula, attempt >= max_attempts menghasilkan `status: 'dead'`

**Detail:**
- `npm install -D vitest` (jalankan sebagai bagian task, bukan hanya edit package.json manual, agar lockfile ikut ter-update).
- Test cukup 3-5 case, fokus pada boundary (`attemptCount = maxAttempts - 1` vs `attemptCount = maxAttempts`).

**Validation:**
```bash
npm test
```

**Depends on:** Task 3 (butuh `bot/backoff.ts` sudah ada)

---

### Task 7: Admin UI — Notifikasi Dashboard & Admin Numbers CRUD
**Files:**
- `[NEW] src/pages/admin/notifikasi.astro` — halaman baru: card status `bot_heartbeat`, tabel riwayat `notification_outbox` (filter status via querystring, retry via POST), section CRUD `notification_admins` (tambah nomor, toggle `is_active`)
- `[MODIFY] src/layouts/AdminLayout.astro` — tambah link nav "Notifikasi WA" di section "Pengaturan" (setelah link "Kategori Support", baris ~83), `activeNav="notifikasi"`, terlihat untuk semua role (tidak digate `super_admin` seperti `tim.astro`)

**Detail:**
- Ikuti pola existing `src/pages/admin/kategori.astro` (single-file CRUD dengan POST form actions) dan `src/pages/admin/support/[code].astro` (pola `if (Astro.request.method === 'POST')` dengan `action` field) untuk konsistensi.
- Query `bot_heartbeat` (1 baris, `id='whatsapp-bot'`) → render badge: hijau jika `connection_state='connected'` dan `last_heartbeat_at` dalam 2 menit terakhir; kuning jika `qr_pending`; merah jika `disconnected`/`logged_out`/heartbeat basi (>2 menit tanpa update meski state katanya connected — indikasi proses mati/hang).
- Query `notification_outbox` terbaru (limit 50, order `created_at desc`), filter opsional `?status=failed` dsb via `Astro.url.searchParams`.
- POST `action=retry` + `id` → `UPDATE notification_outbox SET status='pending', next_attempt_at=now() WHERE id=$1`.
- POST `action=add_admin` + `phone` → validasi format digit-only sebelum insert ke `notification_admins`.
- POST `action=toggle_admin` + `phone` → flip `is_active`.
- Gunakan `supabaseAdmin` dari `src/lib/supabase.ts` (service role) — **jangan** gunakan `supabase` (anon) karena tabel-tabel ini tidak punya policy publik sama sekali (akan selalu return kosong/error kalau pakai anon key, sesuai desain RLS di Task 1).

**Validation:**
```bash
npx astro check
```
- Manual: buka `/admin/notifikasi` setelah login admin, pastikan tidak redirect (middleware `src/middleware/index.ts` sudah otomatis melindungi karena prefix `/admin`).

**Depends on:** Task 1 (tabel harus ada), tidak bergantung pada Task 3-6

---

### Task 8: Documentation Cleanup
**Files:**
- `[MODIFY] docs/ENVIRONMENT_VARIABLES.md` — tandai `ADMIN_WA_NUMBER` deprecated, tambahkan baris untuk `WA_SESSION_FOLDER` tetap dipakai (tidak berubah)
- `[MODIFY] docs/RISK_REGISTER.md` — update baris "Baileys Disconnected" & "Nomor WA Diblokir": tambahkan kolom mitigasi baru (heartbeat monitoring + durable retry) sebagai referensi bahwa risiko ini sekarang punya mitigasi konkret, bukan cuma niat
- `[MODIFY] docs/DECISION_LOG.md` — tambah baris baru: pivot dari in-memory retry ke durable Postgres outbox, dengan alasan (percobaan sebelumnya gagal total)

**Detail:**
- Perubahan dokumentasi murni, tidak ada logic. Dikerjakan setelah semua task teknis selesai supaya deskripsinya akurat (bukan aspirational).

**Validation:** review manual (baca ulang, tidak ada command otomatis).

**Depends on:** Task 1–7 selesai

---

## File Manifest (Complete)

### Database
| Action | File | Description |
|---|---|---|
| NEW | `supabase/migrations/005_notification_outbox.sql` | outbox, heartbeat, admin numbers tables + triggers + `dispatch_claim_batch()` function |

### Bot Process
| Action | File | Description |
|---|---|---|
| NEW | `bot/supabaseClient.ts` | shared service-role Supabase client |
| NEW | `bot/backoff.ts` | pure retry/backoff calculation |
| NEW | `bot/connection.ts` | Baileys socket lifecycle, lock file, reconnect logic |
| NEW | `bot/dispatcher.ts` | outbox polling + send loop |
| NEW | `bot/heartbeat.ts` | bot_heartbeat upsert on state change + interval |
| NEW | `bot/backoff.test.ts` | unit tests untuk backoff |
| MODIFY | `bot/index.ts` | entry point tipis (wiring) |
| DELETE | `bot/supabaseListener.ts` | digantikan trigger DB + dispatcher |

### Admin UI
| Action | File | Description |
|---|---|---|
| NEW | `src/pages/admin/notifikasi.astro` | dashboard status bot + riwayat outbox + retry + CRUD admin numbers |
| MODIFY | `src/layouts/AdminLayout.astro` | tambah nav link "Notifikasi WA" |

### Tooling & Docs
| Action | File | Description |
|---|---|---|
| MODIFY | `package.json` | tambah `vitest` devDependency + script `test` |
| NEW | `vitest.config.ts` | config test runner |
| MODIFY | `docs/ENVIRONMENT_VARIABLES.md` | deprecate `ADMIN_WA_NUMBER` |
| MODIFY | `docs/RISK_REGISTER.md` | update mitigasi risiko WA |
| MODIFY | `docs/DECISION_LOG.md` | catat pivot arsitektur |
| MODIFY (sudah selesai sebelum plan ini) | `docs/superpowers/specs/2026-07-06-wa-notification-bot-design.md` | ditandai Superseded |
| MODIFY (sudah selesai sebelum plan ini) | `docs/superpowers/plans/2026-07-06-wa-notification-bot-plan.md` | ditandai Superseded |

## Shared-File Risks
- `bot/index.ts` kemungkinan sedang **running** di terminal lain (`npm run start:bot`) selama development — harus dihentikan (`Ctrl+C` / cek `ps aux | grep tsx`) sebelum menjalankan versi baru, agar tidak ada 2 proses Baileys memakai 1 sesi WA yang sama (`DisconnectReason.conflict`).
- `src/layouts/AdminLayout.astro` dipakai semua halaman admin — perubahan nav harus hati-hati tidak merusak halaman admin lain (`kategori.astro`, `tim.astro`, dst yang sudah pakai layout ini).
- `.env` berisi `SUPABASE_SERVICE_ROLE_KEY` dan `ADMIN_WA_NUMBER` — tidak disentuh oleh task manapun (hanya dibaca untuk Task 2 seed data), jangan pernah print isinya ke log/commit.
- **Task 3 → Task 4 → Task 5 harus dieksekusi berurutan, bukan paralel**, meskipun Task 3 tidak menyentuh DB (yang membuatnya *terlihat* independen): Task 4 (`dispatcher.ts`, `heartbeat.ts`) memanggil `getSocket()`/`onConnectionStateChange()` yang didefinisikan di Task 3 (`connection.ts`), dan Task 5 (`bot/index.ts`) mengimpor hasil Task 3 & 4 sekaligus. Untuk subagent-driven-development: dispatch Task 3 dulu sendirian, tunggu selesai, baru dispatch Task 4, baru Task 5 — jangan dispatch ketiganya sebagai batch paralel.
- Task 6 (vitest + `backoff.test.ts`) **bergantung pada file `bot/backoff.ts` yang dibuat di Task 3**, jadi meski secara nominal "tidak menyentuh DB" dan tampak bisa paralel dengan Task 1/2, Task 6 tetap harus menunggu Task 3 selesai lebih dulu.

## Validation Plan

### Automated
```bash
npx tsc --noEmit         # type safety seluruh project — expected: exit code 0, "0 errors"
npx astro check          # type-check khusus file .astro — expected: exit code 0, "0 errors" (warning pre-existing di admin/index.astro & admin/tim.astro boleh diabaikan, sudah ada sebelum plan ini, lihat catatan di Task 7)
npm run build             # production build harus tetap sukses — expected: "Complete!" tanpa error, exit code 0
npm test                  # vitest — expected: semua test di bot/backoff.test.ts PASS (exit code 0), 0 failed
```

### Manual QA (dari spec Section 6, wajib sebelum dianggap selesai)
- [ ] Submit tiket support baru via UI dengan nomor WA valid → cek baris outbox muncul di `/admin/notifikasi` → cek pesan WA benar-benar diterima di HP reporter & admin.
- [ ] Matikan proses bot (`Ctrl+C`) sebelum sempat kirim → nyalakan ulang (`npm run start:bot`) → pastikan baris `pending` yang tertunda tetap terkirim (tidak hilang).
- [ ] Putuskan koneksi WA (logout dari HP atau matikan internet server) → cek `bot_heartbeat.connection_state` berubah & `/admin/notifikasi` menampilkan badge merah.
- [ ] Ubah status tiket lewat `/admin/support/[code]` ke `resolved` → cek reporter **dan** admin menerima WA.
- [ ] Ubah status feature request lewat `/admin/pengajuan/[code]` → cek requester menerima WA, admin **tidak** menerima (sesuai aturan bisnis, beda dengan support ticket).
- [ ] Skenario nomor invalid → outbox berakhir `failed` → `dead` setelah 5 attempt, `last_error` terisi jelas di dashboard.
- [ ] Tombol Retry pada baris `dead`/`failed` di `/admin/notifikasi` → baris kembali `pending` dan berhasil terkirim di siklus berikutnya.
- [ ] Jalankan dua instance bot bersamaan (`npm run start:bot` dua kali) → instance kedua exit karena lock file, tidak ada double-send.
- [ ] Tambah/nonaktifkan nomor admin lewat `/admin/notifikasi` → verifikasi tiket baru berikutnya mengikuti daftar admin yang sudah diupdate (tanpa perlu restart bot).

## Security Review Checklist
- [ ] Dispatch `security-reviewer` agent setelah Task 1 (migration + `SECURITY DEFINER` trigger function — pastikan tidak ada jalur privilege escalation, RLS benar-benar menutup akses publik ke 3 tabel baru).
- [ ] Dispatch `security-reviewer` agent setelah Task 7 (halaman admin baru — pastikan pakai `supabaseAdmin`/service role hanya server-side, tidak bocor ke client bundle; validasi input form nomor admin).
- [ ] Dispatch `typescript-reviewer` setelah Task 3–6 selesai (seluruh rewrite `bot/`).
- [ ] Jalankan `gitleaks` sebelum commit (perubahan menyentuh `.env`-adjacent docs di Task 8).
- [ ] Konfirmasi ulang `auth_info_baileys/` tetap ter-gitignore (tidak disentuh plan ini, tapi cek tidak sengaja ke-commit selama development).

## Rollback Notes
- Migration (Task 1) reversible: `DROP TRIGGER trg_support_ticket_notification ON support_tickets; DROP TRIGGER trg_feature_request_notification ON feature_requests; DROP FUNCTION enqueue_support_ticket_notification; DROP FUNCTION enqueue_feature_request_notification; DROP FUNCTION dispatch_claim_batch; DROP FUNCTION status_label_id; DROP TABLE notification_outbox; DROP TABLE bot_heartbeat; DROP TABLE notification_admins;` — tidak menyentuh data tiket.
- Tidak perlu feature flag — bot lama (`bot/supabaseListener.ts`) dan bot baru tidak bisa jalan bersamaan (satu sesi WA), jadi cutover bersifat all-or-nothing per deploy. Jika bot baru bermasalah setelah deploy, `git revert` ke commit sebelum Task 3–5 dan jalankan ulang bot lama — **tapi** baris yang sudah terlanjur masuk `notification_outbox` lewat trigger baru tidak akan diproses oleh bot lama (bot lama tidak tahu soal tabel ini), jadi rollback kode sebaiknya dibarengi rollback migration juga (drop trigger) supaya tidak ada baris outbox yang menumpuk tak terproses.
- Rollback halaman admin (Task 7): hapus file + revert nav link, tidak ada risiko data.

## Estimated Order of Execution
1. Task 1 (migration) → commit: `feat(db): add notification outbox, heartbeat, and admin numbers tables`
2. Task 2 (seed data) → tidak ada commit kode, langkah operasional dicatat di PR description
3. Task 3 (sequential, setelah Task 1) → commit: `refactor(bot): extract connection, backoff, and shared supabase client modules`
4. Task 6 (sequential, setelah Task 3 — **bukan** paralel, lihat Shared-File Risks) → commit: `test(bot): add vitest and backoff unit tests`
5. Task 4 (sequential, setelah Task 3) → commit: `feat(bot): add outbox dispatcher and heartbeat modules`
6. Task 5 (sequential, setelah Task 4) → commit: `refactor(bot): rewrite entry point as thin wiring layer, remove realtime listener`
7. Task 7 (bisa paralel dengan Task 3–6 karena hanya bergantung Task 1) → commit: `feat(admin): add whatsapp notification dashboard and admin numbers management`
8. Task 8 → commit: `docs: update environment variables, risk register, and decision log for notification rebuild`
9. Final validation (semua Manual QA checklist) → dispatch `security-reviewer` + `typescript-reviewer` → commit perbaikan jika ada temuan → `chore(bot): verify whatsapp notification rebuild end-to-end`

---
## Next Step
Plan tersimpan di: `docs/superpowers/plans/2026-07-06-whatsapp-notification-rebuild-plan.md`

Setelah kamu approve plan ini, eksekusi akan dilanjutkan dengan **Subagent-Driven Development** (`/subagent-driven-development`) sesuai permintaan awal, dengan Task 1 sebagai titik mulai (blocking untuk sebagian besar task lain).
Atau: ada task yang perlu diubah/dipecah lebih detail dulu?
