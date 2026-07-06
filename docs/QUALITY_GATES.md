# Quality Gates

Panduan gerbang kualitas (*quality gates*) sebelum eksekusi tahap tertentu.

## Gate 1: Sebelum Spec Writing (Desain Database & UI)
- **Required inputs**: `konsep.md`, `SOP_FLOW.md`.
- **Required outputs**: `IMPLEMENTATION_PLAN.md` (khusus instalasi proyek).
- **Blocking issues**: Tidak adanya kejelasan struktur autentikasi atau model data.
- **Evidence required**: Review rencana skema tabel di Supabase.
- **Who can approve**: Klien / Project Owner.

## Gate 2: Sebelum Implementation (Koding)
- **Required inputs**: Rencana implementasi teknis disetujui.
- **Required outputs**: Kredensial `.env` terdefinisi.
- **Blocking issues**: Supabase project belum diinisiasi (URL & Anon Key kosong).
- **Evidence required**: Bisa di-*deploy* ke *local server* (Astro dev server menyala).
- **Who can approve**: Agen / Tim Pengembang.

## Gate 3: Sebelum Merge / Release
- **Required inputs**: Kode siap jalan, fitur Modul 1 & 2 lengkap.
- **Required outputs**: Tidak ada *lint error*, *build* Vercel/Coolify sukses.
- **Blocking issues**: 
  - Terdapat kebocoran *secret keys*.
  - RLS (*Row Level Security*) Supabase dimatikan secara serampangan.
  - WA Bot (Baileys) *crash*.
- **Evidence required**: Demo *submit* tiket, dapat notifikasi WA, admin merespons, pelapor menutup tiket.
- **Who can approve**: Klien / IT Manager.
