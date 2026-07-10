# Decision Log (Planning)

## 2026-07-06 - Admin WhatsApp numbers managed via DB table, not env var

- Type: Human Decision
- Scope: WhatsApp notification rebuild (`docs/superpowers/specs/2026-07-06-whatsapp-notification-rebuild-design.md`)
- Confidence: High
- Evidence: User chose "Tabel notification_admins (Recommended)" over "Tetap env var ADMIN_WA_NUMBER" via AskUserQuestion during spec finalization, 2026-07-06.
- Rule for future plans: `ADMIN_WA_NUMBER` env var is being retired for this feature. Any future plan touching admin WhatsApp recipients should read/write `public.notification_admins`, not env vars. Don't reintroduce an env-var-based admin number list without re-confirming with the user — this was an explicit, deliberate pivot away from it.
- Expiry: Re-check if the user reverses this decision, or after the migration/UI work lands and the env var is formally removed from `.env`/`docs/ENVIRONMENT_VARIABLES.md`.

## 2026-07-06 - vitest added as the project's first test runner

- Type: Human Decision
- Scope: whole project (not just the notification feature)
- Confidence: High
- Evidence: User chose "Tambahkan vitest (Recommended)" over "Skip — manual QA + skrip SQL saja" via AskUserQuestion, 2026-07-06, specifically to unit-test backoff/retry logic in the WhatsApp rebuild.
- Rule for future plans: this project now has an approved path to add `vitest` as a dev dependency. Future plans needing unit tests in this repo can propose `vitest` without re-asking the user for permission to add a test runner in general — though scope/coverage of what gets tested is still plan-specific.
- Expiry: Keep (re-check only if the user later asks to remove/replace the test runner)

## 2026-07-06 - Work directly on main, no feature branch, for the notification rebuild

- Type: Human Decision
- Scope: WhatsApp notification rebuild execution (subagent-driven-development)
- Confidence: High
- Evidence: Asked via AskUserQuestion whether to isolate the rebuild on a feature branch vs. commit directly to `main` (git history shows every prior commit in this repo, including the failed WA bot attempts, went straight to `main` — no branches ever used). User chose "Langsung di main."
- Rule for future plans: this repo's established workflow is trunk-based (direct commits to main), confirmed deliberately even for large/risky changes. Don't default to proposing a feature branch/worktree for future work here without a specific reason to override this — the user has now explicitly reaffirmed the existing convention once.
- Expiry: Re-check if the user asks for a branch-based workflow on a future task — would indicate the convention changed, not just a one-off exception.

## 2026-07-06 - Prior WhatsApp bot fix approach declared a total failure, full rebuild authorized

- Type: Human Decision
- Scope: WhatsApp notification feature specifically
- Confidence: High
- Evidence: User's own words: "code sekarang ngebug fungsi notif ke whatsapp tidak berkerja sama sekali saya anggap batch code ini sudah gagal ... kamu bisa recreate ulang semua code untuk fitur notif ini." This explicitly authorized deleting/rewriting `bot/supabaseListener.ts` and rewriting `bot/index.ts`, not just patching them. See `false-starts.md` for what was tried and rejected.
- Rule for future plans: don't propose incremental patches to the pre-rebuild bot code as a "safer" alternative without the user asking for it — the explicit direction was full recreation, and re-litigating that in a future planning session would go against a decision already made twice (once implicitly by the first plan's failure, once explicitly by the user's instruction).
- Expiry: Keep until the rebuild is verified working end-to-end (see Manual QA checklist in the rebuild plan); if the rebuild also fails, this entry should prompt escalation to the user rather than a third silent patch attempt.
