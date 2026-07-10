# Dokumen Konsep Lengkap: IT Ticketing System

## 1. Pendahuluan
Sistem ticketing IT internal yang dirancang untuk memisahkan dua jenis alur kerja utama perusahaan: 
1. **Pengajuan pengembangan/fitur baru** (System Request) 
2. **Pelaporan masalah operasional** (Support/Helpdesk). 

Sistem ini didesain agar **tidak mewajibkan karyawan/pelapor untuk login** saat membuat tiket, sehingga mempermudah aksesibilitas bagi seluruh karyawan. Pelacakan progres tiket murni mengandalkan **Kode Tiket Unik** yang diberikan oleh sistem setelah pengajuan berhasil dikirim.

## 2. Tech Stack & Infrastruktur
- **Frontend**: Astro.js (Dipilih karena performanya yang sangat ringan, mulus, dan cocok untuk interaktivitas form/UI).
- **Styling**: Tailwind CSS.
- **Backend & Database**: Supabase (PostgreSQL untuk database relasional, Supabase Auth untuk manajemen sesi tim IT, Supabase Storage untuk upload lampiran dokumen/foto).
- **Notifikasi**: Tidak menjadi bagian dari scope awal. Fokus sistem pada pelacakan tiket melalui dashboard admin dan halaman tracking.
- **Hosting/Deployment**: Self-hosted menggunakan **Coolify** di VPS/Server Kantor untuk aplikasi web Astro.js dan layanan pendukung inti yang benar-benar dibutuhkan sistem.

## 3. UI/UX & Identitas Visual
Antarmuka difokuskan pada kesan profesional, *clean*, dan natural (menjauhi nuansa template generik atau hasil *generate* AI):
- **Primary Color**: `#000e38` (Dark Navy Blue) – Digunakan pada elemen penekanan seperti tombol *submit*, *header*, dan ikon *brand* agar terasa korporat dan dapat dipercaya.
- **Secondary Color**: `#666e88` (Cool Gray) – Digunakan untuk teks deskripsi, garis tepi (*border*), dan tombol aksi pendukung (seperti tombol "Batal" atau "Lihat FAQ").
- **Background/Surface Color**: `#ffffff` (White) – Menjaga *whitespace* yang sangat luas agar form tidak terasa sesak dan mudah dibaca.
- **Interaksi**: Efek transisi mikro (*micro-animations*) dengan durasi ~200ms saat *hover* tombol, navigasi antar halaman, atau pembukaan *popup modal* agar tidak terkesan kaku.

## 4. Alur Pengguna (User Flow) Halaman Publik
Karyawan yang masuk ke web akan melewati alur berikut:
1. **Onboarding Popup (Modal)**: Muncul di kunjungan pertama (menyimpan state di *Local Storage*), terdiri dari 2 slide/halaman yang harus di-*Next*:
   - **Slide 1**: Pengumuman urgensi penggunaan sistem (*Mengapa harus lapor via sistem ini?*) dan panduan alur kerja singkat (Lapor ➔ Dapat Kode ➔ Tracking).
   - **Slide 2**: FAQ (Frequently Asked Questions) yang mencakup penjelasan detail dari tiap kolom form (apa bedanya pengajuan vs support), dan aturan internal seperti SLA (contoh: *Kapan masalah saya akan dikerjakan IT?*).
2. **Halaman Utama (Homepage)**: Setelah melewati popup, pengguna melihat antarmuka sederhana dengan 3 elemen interaktif utama:
   - Card/Tombol Besar: **"Ajukan Sistem Baru"**
   - Card/Tombol Besar: **"Lapor Kendala (Support)"**
   - Kolom Pencarian Cepat: **"Cek Status Tiket"** (Input field)
3. **Formulir**: Tidak butuh login. Pengguna cukup memasukkan identitas primer (Nama, Jabatan, Divisi) beserta keluhan mereka.
4. **Kode Tiket**: Setelah *submit*, user akan langsung mendapat kode tiket (misal: `REQ-2026-X123` atau `SUP-2026-Y987`) di layar untuk disalin.

## 5. Detail Modul 1: Pengajuan Sistem / Fitur Baru
Modul ini khusus menampung proyek yang butuh analisis kelayakan dan waktu *development*.

**Rancangan Field Form (Publik)**:
- Nama Lengkap
- Posisi / Jabatan
- Divisi / Departemen
- Judul Pengajuan
- Latar Belakang / Masalah (*Masalah apa yang saat ini terjadi/ingin diselesaikan?*)
- Deskripsi Kebutuhan (*Ekspektasi sistem/fitur yang diinginkan*)
- Tingkat Prioritas (Dari sudut pandang Pemohon: Tinggi / Sedang / Rendah)
- Target Selesai (Opsional)
- Lampiran (Hanya dibatasi pada format Gambar & PDF, misal max 5MB).

**Aturan Bisnis & Workflow**:
- **Alur Persetujuan**: Permintaan langsung dinilai dan dianalisis kelayakannya oleh Tim IT (tanpa birokrasi *approval* berlapis dari Head Divisi pemohon).
- **Override Prioritas**: Tim IT memiliki hak eksklusif untuk mengubah (*override*) prioritas yang sebelumnya diajukan pemohon, menyesuaikan dengan beban kerja dan *resource* IT saat ini.
- **Status Tiket**: `Draft` ➔ `Reviewing` ➔ `Approved` / `Rejected` ➔ `In Progress` ➔ `Testing` ➔ `Done`.

## 6. Detail Modul 2: Tiket Support (IT Helpdesk)
Modul ini menangani masalah harian operasional yang sifatnya reaktif dan butuh respons seketika.

**Rancangan Field Form (Publik)**:
- Nama Lengkap
- Posisi / Jabatan
- Divisi / Departemen
- Kategori Masalah (Pilihan dropdown yang dinamis, default: *Hardware, Software, Jaringan, Lainnya*).
- Deskripsi Detail
- Lokasi / Ruangan (Opsional)
- Bukti Error / Lampiran (Screenshot)

**Aturan Bisnis & Workflow**:
- **Kategori Dinamis**: Pilihan kategori masalah tidak di-*hardcode* melainkan bisa ditambah, dikurangi, atau diubah namanya oleh Admin IT melalui Dashboard.
- **SLA Internal**: Tim IT terikat pada Service Level Agreement dengan durasi maksimal **2 jam** untuk merespons/mengambil tindakan awal (mengubah tiket dari `Open` ke status selanjutnya).
- **Workflow Status**: `Open` ➔ `Assigned` ➔ `In Progress` ➔ `Resolved` (Selesai diperbaiki Tim IT) ➔ `Closed` (Tervalidasi).
- **Validasi Penutupan**: Tim IT tidak bisa menutup tiket secara sepihak. Saat IT merasa masalah selesai, statusnya adalah `Resolved`. Pelapor harus mengecek lewat Halaman Tracking, memvalidasi bahwa sistem sudah normal, lalu menekan tombol **"Konfirmasi Masalah Sudah Beres"** untuk menjadikan tiket tersebut `Closed`. Hal ini memastikan *fairness*.

## 7. Dashboard Admin & Manajemen IT
Halaman ini (`/admin`) merupakan area tertutup yang hanya bisa diakses menggunakan autentikasi akun.
- **Manajemen Akun Terpusat**: Terdapat 1 akun istimewa bernama **Super Admin**. Super Admin adalah satu-satunya entitas yang berhak membuatkan/mendaftarkan akun untuk staf IT lainnya. Staf tidak bisa mendaftar sendiri (*no public signup*).
- **Fitur Dasbor**:
  - Melihat daftar antrean semua tiket secara *real-time*.
  - Indikator peringatan/alert untuk tiket support yang mendekati batas SLA 2 jam.
  - Melakukan *assign* tiket support ke teknisi tertentu.
  - Menulis catatan internal (*internal notes*) yang tidak dipublikasikan ke pelapor.
  - Memberi status atau balasan resmi yang nantinya akan muncul di Halaman Tracking pelapor.

## 8. Rancangan Skema Database (Draft Supabase)

**Tabel `profiles` (Staf IT)**:
- `id` (uuid, PK, relasi ke `auth.users` Supabase)
- `role` (enum: `super_admin`, `it_staff`)
- `full_name` (text)

**Tabel `categories` (Master Kategori Support)**:
- `id` (uuid, PK)
- `name` (text)
- `is_active` (boolean)

**Tabel `support_tickets`**:
- `id` (uuid, PK)
- `ticket_code` (text, unique)
- `reporter_name` (text)
- `reporter_position` (text)
- `reporter_division` (text)
- `category_id` (uuid, FK ke `categories`)
- `description` (text)
- `location` (text)
- `attachment_url` (text)
- `status` (enum: `open`, `assigned`, `in_progress`, `resolved`, `closed`)
- `assigned_to` (uuid, FK ke `profiles`) - *Siapa staf yang memegang*
- `created_at` (timestamp) - *Acuan perhitungan batas waktu SLA 2 jam*
- `resolved_at` (timestamp)

**Tabel `feature_requests`**:
- `id` (uuid, PK)
- `ticket_code` (text, unique)
- `requester_name` (text)
- `requester_position` (text)
- `requester_division` (text)
- `title` (text)
- `background` (text)
- `description` (text)
- `user_priority` (enum: `low`, `medium`, `high`)
- `it_priority` (enum: `low`, `medium`, `high`) - *Kolom ini yang dipakai untuk override prioritas user*
- `target_date` (date)
- `attachment_url` (text)
- `status` (enum: `draft`, `reviewing`, `approved`, `in_progress`, `testing`, `done`, `rejected`)
- `created_at` (timestamp)

---
*Dokumen ini merupakan satu kesatuan sumber kebenaran (*single source of truth*) yang siap digunakan sebagai panduan rekayasa perangkat lunak (*software engineering*).*
