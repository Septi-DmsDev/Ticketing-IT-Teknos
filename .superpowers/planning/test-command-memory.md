# Test Command Memory

## 2026-07-06 - `npx astro check` has pre-existing, unrelated findings

- Type: Test Command
- Scope: IT-Ticket repo, whole project
- Confidence: High
- Evidence: Running `npx astro check` on 2026-07-06 (before the WhatsApp rebuild plan's tasks were executed) produced 6 pre-existing errors, all in `src/pages/admin/tim.astro` (`Cannot find name 'supabaseAdmin'` — missing import, unrelated to any notification work) plus warnings for unused vars in `src/pages/admin/index.astro` and `src/pages/admin/support/[code].astro` (`STATUS_LABELS`, `PRIORITY_CLASS`, `STATUS_FLOW`, `fetchError` declared but never read).
- Rule for future plans/executions: when running `npx astro check` as a validation step in this repo, expect a baseline of 6 errors / several warnings that predate any current task. Only new errors beyond that baseline indicate a regression from the current work. Don't treat the existing `tim.astro` import error as caused by whatever feature is being built — it was already broken.
- Expiry: Re-check after `tim.astro`'s missing `supabaseAdmin` import is fixed (a separate, unrelated bug not yet scheduled) — once fixed, the baseline count should drop and this entry should be updated or removed.

## 2026-07-06 - No test runner configured; `npm test` does not exist yet

- Type: Test Command
- Scope: IT-Ticket repo, whole project
- Confidence: High
- Evidence: `package.json` scripts (read 2026-07-06): `dev`, `build`, `preview`, `astro`, `start:bot`, `dev:all`, `start` — no `test` script. No `vitest`/`jest` in dependencies or devDependencies.
- Rule for future plans: `npm test` will fail with "missing script" until a plan explicitly adds a test runner (see decision-log.md — vitest is approved for this). Any plan that lists `npm test` as a validation command must also include the task that installs and configures the runner, in the same plan, before that validation step is reachable.
- Expiry: Re-check once `vitest` is actually installed and `"test": "vitest run"` exists in `package.json` — this entry's specific claim ("no test runner exists") will then be stale, though the general rule (verify test commands exist before relying on them) stays valid.
