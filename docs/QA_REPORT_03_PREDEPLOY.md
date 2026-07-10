QA REPORT - IT Ticketing System - 2026-07-10 11:30 WIB
Repo/branch: `/home/septian/NEXT/IT-Ticket` `main` ahead 13
Commit tested: local working tree
Target: local | Deploy source: `main`
Scope: auth middleware, public tracking hardening, support assignment, urgency, support search/filter, docs cleanup
Tiers selected: T0,T1,T2,T3,T5,T6,T8,T9
Tiers run: T0,T1,T2,T3,T6,T8,T9

T0 Context: WARN - repo benar, branch `main`, tetapi working tree masih memiliki perubahan lokal yang belum dikomit.
T1 Fast: PASS/WARN - `npx tsc --noEmit` clean, `npm test` pass (4 tests), `gitleaks` clean, `npm run lint` SKIP karena script tidak tersedia.
T2 Build/Deps: PASS/WARN - `npm run build` pass, `npm audit --audit-level=high` clean, `trivy` menemukan 1 HIGH misconfig pada file di `node_modules`, bukan code aplikasi aktif.
T3 Security: PASS - `gitleaks` clean, `semgrep` final clean, dan file stale `src/middleware/index.ts` yang sempat terdeteksi sudah dihapus.
T4 API: SKIP - tidak ada endpoint REST terpisah; mutasi utama berjalan via Astro pages dan Supabase RPC. Perlu probe live setelah deploy bila ingin bukti end-to-end network target.
T5 E2E: SKIP - tidak ada harness Playwright/E2E terpasang di repo saat ini.
T6 RBAC: PASS - `/admin/*` kini diproteksi middleware, login memakai cookie httpOnly, dan tracking publik dipindahkan ke RPC terbatas.
T7 Deploy: SKIP - belum ada target live/preview yang diverifikasi dalam QA ini.
T8 A11y/Visual/Perf: WARN/SKIP - build pass dan UI utama ter-render, tetapi tidak ada harness a11y/browser automation terpasang untuk pembuktian keyboard/axe/lighthouse.
T9 Regression/Coverage/Contracts: PASS/WARN - test dasar status-flow ada dan pass; migration `008` dan `009` harus diterapkan sebelum deploy.
AI Review: WARN - tidak dispatch reviewer terpisah; penilaian berbasis tool + inspeksi lokal langsung.

BLOCKERS:
- none

WARNINGS:
- Tidak ada script `lint`.
- Tidak ada harness E2E/browser regression.
- Working tree masih berisi perubahan lokal dan file docs historis/untracked lain.
- Trivy HIGH berasal dari Dockerfile dependency di `node_modules`, bukan aplikasi utama, tetapi tetap tercatat.

SKIPPED:
- T4 API - tidak ada target API/live probe terpisah yang relevan pada sesi ini.
- T5 E2E - harness tidak tersedia.
- T7 Deploy - tidak ada target live yang diuji.
- Sebagian T8 - tidak ada tool a11y/lighthouse/playwright.

EVIDENCE:
- `npm test` => 4 tests passed.
- `npm run build` => complete.
- `gitleaks detect --source .` => no leaks found.
- `npm audit --audit-level=high` => 0 vulnerabilities.
- `trivy fs .` => clean on app package, 1 HIGH misconfig in dependency Dockerfile under `node_modules`.
- `semgrep --config auto src/` => 0 findings pada scan final.

GO/NO-GO: GO
Confidence: MEDIUM - core gates for local predeploy pass, but browser E2E/live deploy proof is not available in this repo/session.
Next actions:
1. Commit changes and apply DB migrations `008` + `009`.
2. Deploy with production env vars set.
3. Jalankan smoke test manual pada target live.
