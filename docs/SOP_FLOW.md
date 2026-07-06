# SOP Flow

## 1. Purpose
Mengatur prosedur pengajuan fitur baru (System Request) dan penanganan keluhan (Support) oleh Tim IT secara digital, terpusat, dan terukur.

## 2. Scope
Berlaku untuk seluruh karyawan perusahaan (Pelapor) dan seluruh anggota Tim IT perusahaan.

## 3. Roles and Responsibilities

| Role | Responsibility | Permissions / Authority |
|---|---|---|
| **Pelapor (Karyawan)** | Mengisi form laporan/pengajuan dengan jelas, memvalidasi perbaikan. | Create Ticket, Read Ticket Status, Confirm Resolution. |
| **IT Staff** | Merespons tiket, menangani *support*, melakukan *development*, mencatat log. | Read All Tickets, Assign Ticket, Update Status, Write Internal Notes. |
| **Super Admin** | Mendaftarkan akun IT Staff, memantau *bottleneck* dan SLA. | Manage IT Users, Manage Categories, All IT Staff permissions. |

## 4. Current Workflow
Proses manual via chat/telpon yang tidak terpusat, lambat, dan menyulitkan pemantauan prioritas/SLA.

## 5. Proposed System Workflow

| Step | Actor/System | Input | Action | Output | Quality Gate |
|---|---|---|---|---|---|
| 1 | Karyawan | Data Diri & Detail Keluhan | Submit Form | Kode Tiket (REQ/SUP) | Field wajib terisi (Nama, Dept, Deskripsi). |
| 2 | Sistem | Kode Tiket | Kirim Notifikasi WA | Pesan Masuk WA | Bot Baileys aktif. |
| 3 | IT Staff (Support) | Tiket Support | Mengambil (*Assign*) & Merespons tiket | Status `In Progress` | Harus dalam < 2 jam (SLA). |
| 4 | IT Staff (Request) | Tiket Request | Menganalisa & Override Prioritas | Status `Approved`/`Rejected` | Tidak butuh approval Head Divisi Pelapor. |
| 5 | IT Staff (Support) | Tiket Support | Selesai memperbaiki | Status `Resolved` | - |
| 6 | Karyawan | Kode Tiket | Cek web & tekan "Konfirmasi Selesai" | Status `Closed` | Karyawan memvalidasi perbaikan benar-benar tuntas. |

## 6. Approval Points
- **Pengajuan Fitur**: Tidak butuh *approval* manajer pemohon. Langsung di-*approve* atau di-*reject* oleh Tim IT.
- **Penutupan Support**: Membutuhkan *approval* akhir dari Pelapor (konfirmasi `Closed`).

## 7. Exception Handling
- Jika pelapor tidak melakukan konfirmasi `Closed` dalam 3x24 jam setelah tiket `Resolved`, tiket bisa dianggap ditutup atau ditutup manual oleh admin IT.

## 8. Escalation Path
- Tiket *support* yang mendekati batas 2 jam tanpa respons akan ditandai dengan warna peringatan di *dashboard* admin.

## 9. Data Created / Updated / Deleted
- Dibuat: `feature_requests`, `support_tickets`, `categories`.
- Dihapus: `categories` dapat di-nonaktifkan (`is_active = false`), tiket bersifat *append-only* (tidak boleh dihapus secara *hard delete*).

## 10. Audit Trail Requirements
- Mencatat waktu pembuatan (`created_at`) dan penyelesaian (`resolved_at`) untuk mengukur *performance* SLA.

## 11. Security and Access Control Notes
- Dashboard admin diproteksi RLS (Row Level Security) Supabase.
- Form *submit* publik tidak bisa *query* sembarang data, hanya bisa *insert*. *Read* publik hanya lewat pencarian kode tiket spesifik.

## 12. Operational Risks and Mitigations
- **Risiko Spam Tiket**. Mitigasi: Validasi *rate limiting* dasar di Supabase.

## 13. Questions to Confirm Before Spec Writing
- Semuanya sudah diselesaikan pada `konsep.md`.
