# Agent Protocol

## Project Source of Truth

Priority:
1. Human instruction in current session
2. `konsep.md` (Spesifikasi absolut IT Ticketing System)
3. `docs/PROJECT_CHARTER.md`
4. `docs/SOP_FLOW.md`
5. Approved spec / Implementation Plan
6. Existing code/config evidence
7. Assumptions

## Mandatory Workflow

For new features:
1. Read `konsep.md`, `SOP_FLOW.md`, and `docs/REQUIREMENTS_MAP.md`.
2. Jika ada penambahan fitur di luar Modul 1 dan Modul 2, wajib merujuk ke `docs/CHANGE_CONTROL.md`.
3. Use `implementation_plan.md` to create an implementation plan (koding/struktur Astro).
4. Implement using standard Astro.js + Supabase JS Client practices.
5. Run task review, fix loop, and final review.
6. Pastikan Baileys Bot dan UI web (Astro) berjalan lancar dalam infrastruktur deployment yang dituju (Coolify/Docker).

## Pre-Task Checklist

- [ ] I know which concept requirement this work supports.
- [ ] I checked SOP flow impact.
- [ ] I checked user role and permission impact (Super Admin vs Public vs IT Staff).
- [ ] I checked data/security impact (Pastikan Supabase RLS benar).
- [ ] I know which tests or validation commands prove the change.
- [ ] I will not modify unrelated files.

## Security Gate

Never read or print secrets. Never hardcode tokens. Never bypass Supabase RLS. Bot WA Baileys JANGAN membeberkan detail internal.
