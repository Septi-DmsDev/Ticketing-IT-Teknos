# WhatsApp Notification Bot — Design Spec

**Tanggal:** 2026-07-06  
**Status:** Approved  
**Author:** Agent + Septian  

---

## 1. Overview

Bot Baileys WhatsApp yang berjalan sebagai proses Node.js terpisah dari Astro frontend. Bot bertugas:
1. Mendengarkan event Supabase Realtime (`INSERT`/`UPDATE` pada `support_tickets` dan `feature_requests`)
2. Mengirimkan notifikasi WhatsApp ke admin IT dan ke nomor WA pelapor/pemohon

**Root cause bugs yang ada saat ini:**
- `sendMessage()` berhasil dipanggil tapi pesan tidak benar-benar terkirim (STATUS_0 setelah send)
- Session Baileys tidak stabil (440/515 disconnect loop) karena opsi `browser` dan `markOnlineOnConnect` yang salah
- Queue logic yang rumit menyebabkan pesan nyangkut saat socket null
- Tidak ada retry yang benar saat socket tidak tersedia

**Keputusan desain utama:**
- Hapus queue — gunakan **simple retry dengan exponential backoff** langsung di `sendMessage`
- Gunakan `Browsers.baileys('Desktop')` bukan custom browser string
- Gunakan `makeWASocket` dengan opsi minimal (proven working di Baileys v7)
- `supabaseListener.ts` tidak boleh import dari `index.ts` (circular) — gunakan **dependency injection** lewat setter function

---

## 2. Goals & Non-Goals

### Goals
- Bot bisa mengirim notifikasi WA ke admin saat tiket support baru dibuat
- Bot bisa mengirim notifikasi WA ke admin saat feature request baru dibuat
- Bot bisa mengirim notifikasi WA ke pelapor saat tiket support dibuat (konfirmasi)
- Bot bisa mengirim notifikasi WA ke pemohon saat feature request dibuat (konfirmasi)
- Bot bisa mengirim notifikasi WA ke pelapor/pemohon saat status tiket berubah
- Bot reconnect otomatis saat disconnect (tanpa menghapus session)
- Hanya satu instance bot yang bisa berjalan (lock file)
- Session tidak terhapus kecuali benar-benar logout (401)

### Non-Goals
- Notifikasi ke grup WhatsApp
- Notifikasi lewat media selain WhatsApp
- Bot bisa menerima dan memproses pesan masuk dari user
- WhatsApp Business API (tetap pakai Baileys Linked Device)

---

## 3. User Stories / Use Cases

- Sebagai admin IT, saya ingin menerima notifikasi WA saat ada tiket support baru, agar saya bisa langsung merespons.
- Sebagai admin IT, saya ingin menerima notifikasi WA saat ada feature request baru, agar saya bisa segera me-review.
- Sebagai pelapor, saya ingin menerima konfirmasi WA saat tiket saya berhasil dibuat, agar saya tahu laporan diterima sistem.
- Sebagai pelapor, saya ingin menerima notifikasi WA saat status tiket saya berubah, agar saya tahu progres penanganan.

---

## 4. Technical Design

### 4.1 Data Model
Tidak ada perubahan schema database. Bot membaca event dari Supabase Realtime.

Field yang digunakan dari `support_tickets`:
- `ticket_code`, `reporter_name`, `reporter_division`, `description`, `whatsapp_number`, `status`, `it_response`

Field yang digunakan dari `feature_requests`:
- `ticket_code`, `requester_name`, `requester_division`, `title`, `whatsapp_number`, `status`, `it_response`

### 4.2 Arsitektur Bot (New Design)

```
bot/
├── index.ts          ← Entry point, Baileys socket lifecycle
├── notifier.ts       ← [NEW] Dependency-injected WA sender (no import dari index.ts)
└── listener.ts       ← [RENAME dari supabaseListener.ts] Supabase Realtime listener
```

**Alur dependency (bukan circular):**
```
index.ts
  → creates Baileys socket
  → injects socket ke notifier via notifier.setSocket(sock)
  → starts listener.ts after connection open
listener.ts
  → imports notifier.ts (sendMessage)
  → TIDAK import index.ts (eliminasi circular import)
notifier.ts
  → holds socket reference via setSocket()
  → exports sendMessage(jid, text)
```

### 4.3 Business Logic

**`notifier.ts` — WA Sender:**
```typescript
// Singleton pattern: socket di-inject dari luar
let _socket: WASocket | null = null;

export function setSocket(sock: WASocket | null) {
  _socket = sock;
}

export async function sendWA(jid: string, text: string): Promise<void> {
  // Retry 3x dengan delay 2s antar attempt
  // Jika socket null → wait 5s → retry
  // Throw error setelah 3x gagal
}
```

**`listener.ts` — Supabase Listener:**
- Hanya dipanggil sekali (`startListener()`) setelah WA connected
- Menggunakan `sendWA()` dari notifier
- Tidak ada state internal (stateless listener)

**`index.ts` — Bot Lifecycle:**
```
1. acquireLock() → exit jika ada instance lain
2. connectToWhatsApp() → makeWASocket(config)
3. on 'open' → setSocket(sock), startListener() (sekali saja)
4. on 'close' → setSocket(null), reconnect based on statusCode:
   - 401 → delete session, reconnect
   - 440/409 → wait 5-10s, reconnect (JANGAN delete session)
   - other → wait 3s, reconnect
5. on creds.update → saveCreds()
```

**makeWASocket config yang proven stable:**
```typescript
makeWASocket({
  auth: state,
  logger: pino({ level: 'silent' }),
  browser: Browsers.ubuntu('Desktop'),  // proven stable untuk linked device
  syncFullHistory: false,
  markOnlineOnConnect: false,           // prevent phone dari disconnect bot
  connectTimeoutMs: 60000,
  keepAliveIntervalMs: 10000,
})
```

**Retry logic di `sendWA()`:**
```
attempt 1 → sendMessage → jika error/timeout → wait 2s
attempt 2 → sendMessage → jika error/timeout → wait 4s  
attempt 3 → sendMessage → jika error/timeout → log error, give up
```

### 4.4 Environment Variables
```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
WA_SESSION_FOLDER=./auth_info_baileys
ADMIN_WA_NUMBER=628xxxx,628yyyy,628zzzz  (comma-separated)
```

### 4.5 Format Pesan WA

**Admin — Support Ticket Baru:**
```
🚨 *TIKET SUPPORT BARU* 🚨

*Kode*: SUP-2026-XXXX
*Pelapor*: Nama (Divisi)
*Keluhan*:
_Deskripsi masalah..._

Segera cek dashboard admin!
```

**Pelapor — Konfirmasi Tiket Dibuat:**
```
Halo [Nama], tiket laporan kendala Anda berhasil dibuat.

*Kode Tiket*: SUP-2026-XXXX

Tim IT akan segera meninjau laporan Anda. Kami akan mengirimkan notifikasi perubahan status tiket ke nomor ini.
```

**Pelapor — Status Update:**
```
Halo, status tiket support Anda (*SUP-2026-XXXX*) telah diperbarui menjadi: *Sedang Dikerjakan*.

Pesan dari IT:
_Catatan dari tim IT..._
```

---

## 5. Security Considerations
- [x] `.env` tidak di-commit (gitignore)
- [x] Service role key hanya dipakai di bot (server-side), tidak di frontend
- [x] Bot tidak menerima pesan dari user (satu arah saja)
- [x] Lock file mencegah multiple instance yang bisa saling konflik
- [x] Session folder tidak dihapus kecuali benar-benar logout (preserves linked device)

---

## 6. Testing Strategy

**Manual QA:**
- [ ] Scan QR → bot connected sebagai linked device
- [ ] Submit tiket support → admin WA menerima notifikasi
- [ ] Submit tiket support dengan nomor WA → pelapor menerima konfirmasi
- [ ] Update status tiket di dashboard → pelapor menerima notifikasi status
- [ ] Submit feature request → admin WA menerima notifikasi
- [ ] Matikan dan nyalakan ulang bot → reconnect tanpa scan QR ulang
- [ ] Jalankan dua instance → instance kedua exit dengan error "already running"

---

## 7. Migration & Rollback

- Tidak ada perubahan database schema
- File yang dimodifikasi: `bot/index.ts`, `bot/supabaseListener.ts` → `bot/listener.ts` (rename+rewrite)
- File baru: `bot/notifier.ts`
- Rollback: `git revert` ke commit sebelumnya

---

## 8. Open Questions

Semua sudah dijawab berdasarkan analisis bug sesi ini. Tidak ada open questions.

---

## 9. Dependencies

- `@whiskeysockets/baileys@^7.0.0-rc13` — sudah ada, tidak perlu update
- `@supabase/supabase-js` — sudah ada
- `pino` — sudah ada
- `qrcode-terminal` — sudah ada

---

## Referensi
- Root cause analysis dari sesi debugging hari ini (2026-07-06)
- konsep.md: Section 2 (Tech Stack), Section 8 (Notifikasi WA)
