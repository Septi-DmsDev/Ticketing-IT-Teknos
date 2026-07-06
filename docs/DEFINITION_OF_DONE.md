# Definition of Done

## 1. Fitur Selesai (Feature Done)
Sebuah fitur (misalnya form pengajuan) dianggap selesai jika:
- UI ter-render sesuai palet warna `#000e38` (Primary) dan *whitespace* cukup.
- Tidak ada *error* atau *warning* pada *console browser*.
- Data tersimpan dengan aman ke Supabase.
- Bot WA Baileys berhasil mengirim pesan tes/notifikasi terkait aksi tersebut.

## 2. Rilis Selesai (Release Done)
Aplikasi dianggap siap dirilis (*Release Done*) ke *Coolify / Production* jika:
- Seluruh 4 *Quality Gates* (dari `QUALITY_GATES.md`) sudah terlewati.
- RLS (*Row Level Security*) Supabase sudah diaktifkan dan dikonfigurasi (*insert-only* untuk publik, *read/update* untuk IT Admin).
- Bot WA berjalan sebagai *service* / Docker *container* mandiri yang stabil dan dapat *reconnect* otomatis.
- `.env` produksi sudah diisi, sedangkan kode *repository* hanya berisi `.env.example`.

## 3. Dokumentasi Selesai (Documentation Done)
- Semua dokumen *Project Operating System* yang di-generate pada fase inisialisasi tersedia di dalam direktori `docs/` dan `.agents/`.
- Struktur folder dan *environment variables* tercatat di `SETUP_GUIDE.md` dan `ENVIRONMENT_VARIABLES.md`.
