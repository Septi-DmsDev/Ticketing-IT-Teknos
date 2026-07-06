# Project Charter

## Project Summary
IT Ticketing System (Internal) untuk memisahkan pengajuan fitur baru (System Request) dan masalah operasional (Support/Helpdesk) tanpa mewajibkan pelapor untuk login.

## Background / Real Case
Karyawan membutuhkan sistem yang cepat, profesional, dan mudah untuk melaporkan masalah atau meminta fitur baru tanpa harus melewati proses birokrasi pendaftaran atau birokrasi *approval* Head Divisi.

## Problem Statement
Proses pelaporan masalah dan *request* fitur sering kali tidak terpusat, lambat, atau tercampur baur, sehingga tim IT sulit memprioritaskan pekerjaan (SLA tidak tercapai) dan pelapor kesulitan melacak *progress* laporannya.

## Goals
- Menyediakan platform satu pintu untuk tiket Support dan Pengajuan Fitur.
- Pelapor tidak perlu mendaftar atau *login*.
- Memiliki *tracking system* menggunakan Kode Tiket Unik.
- Memberikan notifikasi instan via WhatsApp menggunakan Baileys.
- Menerapkan batas SLA respons 2 jam untuk tiket *support*.

## Non-Goals
- Aplikasi mobile native (iOS/Android).
- Integrasi Single Sign-On (SSO) perusahaan untuk pelapor.
- Modul manajemen aset IT (*Inventory/Asset Management*).

## Target Users
- **Karyawan Internal** (Semua divisi) - Sebagai Pelapor / Pemohon.
- **Tim IT** - Sebagai Admin yang menindaklanjuti tiket.
- **Manager IT / Super Admin** - Mengelola *user access* untuk tim IT dan memantau performa SLA.

## Stakeholders
- Manager IT
- Karyawan / Pemohon dari seluruh Departemen

## Scope Version 1
- Halaman Publik (Onboarding Popup, Form Pengajuan, Form Support, Halaman Tracking).
- Halaman Dashboard Admin IT (Role: Super Admin & IT Staff).
- Autentikasi Admin via Supabase Auth.
- Notifikasi WhatsApp.
- SLA Management (2 Jam).
- Manajemen Kategori dinamis.

## Out of Scope
- Integrasi ke sistem HR / Absensi untuk *auto-fill* data karyawan.
- SLA untuk pengajuan fitur (hanya ada SLA untuk tiket *support*).

## Success Criteria
- Karyawan dapat submit tiket dalam waktu < 1 menit dan mendapat notifikasi WA.
- Tim IT mampu merespons 95% tiket *support* dalam waktu kurang dari 2 jam.
- Aplikasi berjalan stabil (24/7) di atas infrastruktur VPS + Coolify tanpa *downtime* terkait *timeout* integrasi WA.

## Key Risks
- **Kestabilan Koneksi WA**: Bot Baileys butuh koneksi stabil (harus tetap berjalan *long-running*). Jika *crash*, notifikasi tidak terkirim.
- **Keamanan Data (Tanpa Login)**: Siapa pun yang memiliki Kode Tiket bisa melihat status tiket, risiko kebocoran info jika judul pengajuan bersifat rahasia.

## Assumptions
- Server (VPS) via Coolify memiliki spesifikasi dan *uptime* yang memadai.
- Nomor WhatsApp untuk bot Baileys sudah tersedia dan di-scan QR-nya.

## Open Questions
- Apakah perlu ada *Captcha* pada halaman publik agar tidak dispam oleh internal/pihak iseng?
