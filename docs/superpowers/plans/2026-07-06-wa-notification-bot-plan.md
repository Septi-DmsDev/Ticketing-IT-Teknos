# WhatsApp Notification Bot — Implementation Plan

**Tanggal:** 2026-07-06
**Spec:** `docs/superpowers/specs/2026-07-06-wa-notification-bot-design.md`
**Status:** Draft

---

## Scope Summary
- Hapus queue yang rentan nyangkut dan ganti dengan *exponential backoff retry*
- Hilangkan *circular dependency* antara listener dan koneksi utama
- Pisahkan modul khusus untuk *sender* (pengirim pesan) yang mandiri
- Perbarui lifecycle di `index.ts` dengan opsi Baileys yang lebih stabil untuk mode Linked Device

## Task Breakdown

### Task 1: Create Notifier Module
**Files:**
- `[NEW] bot/notifier.ts` — Modul untuk mengirim pesan dengan *retry*

**Detail:**
- Buat variabel global/module-level `waSocket` yang nilainya bisa di-set dari luar.
- Buat fungsi `setSocket(sock)` untuk meng-inject socket dari `index.ts`.
- Buat fungsi `sendWA(jid, text)` dengan *retry logic* (maksimal 3 kali percobaan: delay 2 detik, lalu 4 detik). Jika socket tidak ada, tunggu 5 detik sebelum retry.
- Jangan import `index.ts` di sini.

**Validation:**
```bash
npx tsc --noEmit
```

**Depends on:** -

---

### Task 2: Refactor Supabase Listener
**Files:**
- `[MODIFY] bot/supabaseListener.ts` — Ubah menjadi *stateless listener*

**Detail:**
- Hapus semua *queue logic* lama (`processQueue`, `flushPendingMessages`, `messageQueue`).
- Import `sendWA` dari `bot/notifier.ts`.
- Gunakan `sendWA(jid, msg)` untuk setiap event notifikasi (baik Admin maupun Pelapor/Pemohon).
- Jangan import `index.ts` di sini.

**Validation:**
```bash
npx tsc --noEmit
```

**Depends on:** Task 1

---

### Task 3: Refactor Main Bot Lifecycle
**Files:**
- `[MODIFY] bot/index.ts` — Atur ulang *connection lifecycle*

**Detail:**
- Import `setSocket` dari `bot/notifier.ts`.
- Pada saat event `connection.update`:
  - Jika `connection === 'open'`, panggil `setSocket(sock)` lalu jalankan `startSupabaseListener()`.
  - Jika `connection === 'close'`, panggil `setSocket(null)`.
  - Jangan hapus *session* untuk error 440, 515, dll. Hanya hapus jika 401 (Logged Out).
- Tambahkan `browser: Browsers.ubuntu('Desktop')` (atau `Browsers.baileys('Desktop')`) ke dalam konfigurasi `makeWASocket` agar lebih stabil sebagai Linked Device.

**Validation:**
```bash
npx tsc --noEmit
npm run start:bot # Pastikan bisa start
```

**Depends on:** Task 1, Task 2

---

## File Manifest (Complete)

### WhatsApp Bot Core
| Action | File | Description |
|---|---|---|
| NEW | `bot/notifier.ts` | WA Sender with retry logic and socket injection |
| MODIFY | `bot/supabaseListener.ts` | Stateless Supabase Realtime listener |
| MODIFY | `bot/index.ts` | Entry point, socket lifecycle, connection config |

## Shared-File Risks
- `bot/index.ts` saat ini sedang running di terminal (`npm run start:bot`), harus di-*stop* dulu sebelum validasi akhir.

## Validation Plan

### Automated
```bash
npx tsc --noEmit        # type safety
```

### Manual QA
- [ ] Matikan bot yang sedang berjalan, run ulang `npm run start:bot`.
- [ ] Tunggu hingga terhubung.
- [ ] Buat tiket support baru dari Web, pastikan notifikasi masuk ke Admin WA.
- [ ] Update status tiket support, pastikan notifikasi masuk ke user WA.

## Security Review Checklist
- [x] Pastikan `.env` keys tidak terexpose di output log.
- [x] Pastikan lock file system tetap bekerja.

## Rollback Notes
- Rollback cukup menggunakan `git checkout` / `git revert` ke commit sebelum implementasi ini.

## Estimated Order of Execution
1. Task 1 → commit: `feat(bot): create independent notifier module with retry`
2. Task 2 → commit: `refactor(bot): update listener to use new notifier module`
3. Task 3 → commit: `fix(bot): update baileys lifecycle and connection stability`
4. Final validation → `chore(bot): verify bot notification flows`

---
## Next Step
Plan tersimpan di: `docs/superpowers/plans/2026-07-06-wa-notification-bot-plan.md`

Setelah kamu approve plan ini, saya akan mulai implementasi menggunakan pendekatan **Subagent-Driven Development**.
Atau: ada yang perlu diubah/dipecah lebih detail?
