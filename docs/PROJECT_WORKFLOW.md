# Project Workflow (AI-Assisted)

Siklus kerja *AI-assisted development* dari konsep menuju rilis untuk proyek IT Ticketing System.

1. **Concept Intake**: Membaca `konsep.md` sebagai acuan utama proyek.
2. **SOP Flow Mapping**: Pembuatan `SOP_FLOW.md` dan *Project Charter* untuk merumuskan batasan operasional.
3. **Brainstorming**: Penyelesaian diskusi kebutuhan UI/UX, infrastruktur (Coolify), dan notifikasi (Baileys).
4. **Tech Stack Confirmation**: Penentuan final: Astro.js + Supabase + Baileys Node.js.
5. **Spec Writing**: Agen AI membuat skema *database* Supabase dan struktur arsitektur *frontend* Astro.js.
6. **Plan Writing**: Pembuatan `implementation_plan.md` khusus untuk fase instalasi *codebase*.
7. **Plan Self-Review**: AI mengecek apakah *plan* aman dari ancaman kebocoran *secret* dan sesuai standar *DevSecOps*.
8. **Implementation**: Agen mengeksekusi pembuatan halaman publik, komponen Tailwind, integrasi Supabase SDK, modul *Dashboard* IT, dan servis WhatsApp Bot.
9. **Task Review and Fix Loops**: Menguji *submit* tiket tanpa *login*, pengecekan Supabase RLS, dan pengiriman pesan Baileys.
10. **Final Branch Review**: Pengecekan stabilitas kode dan UI *responsive*.
11. **Release Readiness**: Panduan *deploy* ke Coolify/VPS (Dockerisasi atau *build output*) disiapkan.
12. **Post-Project Learning**: Penyerahan sistem kepada pengguna dengan Onboarding Popup aktif.
