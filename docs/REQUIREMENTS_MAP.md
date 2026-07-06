# Requirements Map

| Concept Source | Requirement | SOP Step | User Role | Priority | Spec Section | Plan Task | Test Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| Konsep.md | Form Publik tanpa login | 1 | Karyawan | High | UI/UX Form | Setup Astro Form | Can submit without token | Ready for spec |
| Konsep.md | Generate Kode Tiket unik | 1 | Sistem | High | Database Schema | Supabase UUID/ID | Return ticket code | Ready for spec |
| Konsep.md | Notifikasi WA | 2 | Sistem | High | Baileys Integration | Setup Baileys Node | Message received on WA | Ready for spec |
| Konsep.md | Tracking page pakai kode | 6 | Karyawan | High | Tracking UI | Setup Astro Routing | Can see ticket detail | Ready for spec |
| Konsep.md | Modul 1: Override prioritas | 4 | IT Staff | Medium | IT Dashboard | Setup Admin Feature | IT can change priority | Ready for spec |
| Konsep.md | Modul 2: SLA 2 Jam | 3 | IT Staff | High | Dashboard SLA | Setup Admin Dashboard | Warning color on UI | Ready for spec |
| Konsep.md | Modul 2: Penutupan oleh pelapor | 6 | Karyawan | High | Tracking UI | Add Confirm Button | Ticket status -> Closed | Ready for spec |
| Konsep.md | Modul 2: Manajemen Kategori dinamis | - | Super Admin | Medium | Admin Category | Setup Admin Settings | Can CRUD categories | Ready for spec |
| Konsep.md | Super Admin role | - | Super Admin | High | Supabase Auth | User Management | Can create IT accounts | Ready for spec |
| Konsep.md | Onboarding Popup | 1 | Karyawan | High | Homepage UI | Setup Modal Component | Modal shows on first visit | Ready for spec |
