# Plan Memory

## 2026-07-06 - Spec/plan docs live under docs/superpowers/, Indonesian-language format

- Type: Planning Convention
- Scope: IT-Ticket repo, all future `/spec-writer` and `/plan-writer` output
- Confidence: High
- Evidence: `docs/superpowers/specs/*.md` and `docs/superpowers/plans/*.md`, all four existing files (two now superseded) written in Bahasa Indonesia with headers `**Tanggal:**`, `**Status:**`, `**Author:**` / `**Spec:**`. This repo's `/spec-writer` and `/plan-writer` skills are project-local (not the `superpowers:` namespaced ones) and already establish this format.
- Rule for future plans: keep new specs/plans in this repo in Bahasa Indonesia, same header format, same directory. Don't switch to the `superpowers:writing-plans` English template structure for this repo unless the user asks for it explicitly — it would break consistency with sibling docs already in `docs/superpowers/`.
- Expiry: Keep

## 2026-07-06 - Admin CRUD pages in this repo are single-file Astro pages with POST-action dispatch

- Type: Planning Convention
- Scope: IT-Ticket repo, `src/pages/admin/`
- Confidence: High
- Evidence: `src/pages/admin/kategori.astro`, `src/pages/admin/tim.astro`, `src/pages/admin/support/[code].astro`, `src/pages/admin/pengajuan/[code].astro` all follow the same pattern: frontmatter reads `Astro.request.method === 'POST'`, branches on a hidden `action` field, mutates via `supabaseAdmin`, then `Astro.redirect()`s back to the same page. No separate API routes are used for admin mutations.
- Rule for future plans: when planning a new admin management page (e.g. `/admin/notifikasi`), follow this exact pattern rather than introducing REST API routes or client-side fetch-based mutation — it's the established convention across every admin page in this codebase.
- Expiry: Keep

## 2026-07-06 - New Supabase tables in this repo always get RLS enabled explicitly, even when there's no public policy

- Type: Planning Convention
- Scope: IT-Ticket repo, `supabase/migrations/`
- Confidence: High
- Evidence: `supabase/migrations/001_init_schema.sql` calls `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every table including ones with permissive policies. The project's global security rules (user CLAUDE.md) also mandate RLS review for schema/auth changes before coding.
- Rule for future plans: every new table in a migration plan must have an explicit `ENABLE ROW LEVEL SECURITY` line and an explicit statement of which policies exist (or "no policies — service role only"), even when the intent is "nobody but service_role touches this." Don't rely on "no policy = no access" being self-evident in the plan; state it, and flag it in the Security Review Checklist so a reviewer double-checks it.
- Expiry: Keep

## 2026-07-06 - Project has no automated test runner as of this date — confirm before assuming any test command works

- Type: Risk Area
- Scope: IT-Ticket repo, whole project
- Confidence: High
- Evidence: `package.json` (read 2026-07-06) has no `test` script and no `vitest`/`jest`/`playwright` devDependency. `npx astro check` is the only type-level automated check available pre-existing.
- Rule for future plans: don't assume `npm test` exists or write a plan validation step that calls it until a task in that same plan actually adds a test runner. If a plan needs automated tests, adding the runner must be its own task/step with an explicit `npm install -D <runner>` command, not just a devDependency line added to a file-manifest table.
- Expiry: Re-check after a test runner is actually added and merged (would invalidate the "no test runner" half of this entry, but the "confirm before assuming" rule itself stays valid for whatever the next testing gap turns out to be).
