# Plan Review Patterns

## 2026-07-06 - Verify row-locking primitives exist in the client library before specifying them

- Type: Plan Review Pattern
- Scope: any plan/spec that proposes SQL-level concurrency control (`FOR UPDATE SKIP LOCKED`, advisory locks, `SELECT ... FOR UPDATE`) dispatched from an app-layer client rather than raw SQL
- Confidence: High
- Evidence: `docs/superpowers/specs/2026-07-06-whatsapp-notification-rebuild-design.md` originally specified a dispatcher doing `SELECT ... FOR UPDATE SKIP LOCKED` through the Supabase JS query builder (PostgREST-backed) — this is not expressible through that client. Caught during `/plan-writer`, requiring a follow-up Postgres RPC function (`dispatch_claim_batch()`) and a spec patch to add a `sending` status value that wasn't in the original CHECK constraint.
- Rule for future plans: when a spec proposes row-locking or other raw-SQL-only semantics (`SKIP LOCKED`, `NOWAIT`, advisory locks, `RETURNING` inside a locking query) and the consumer is an ORM/REST-backed client (PostgREST/Supabase-js, Prisma without `$queryRaw`, most REST-over-SQL layers), verify the client can express it *before* finalizing the spec. If it can't, decide up front whether to wrap it in a database function/RPC (preferred for atomicity) or drop the locking requirement — don't let the plan discover this after the spec is "done."
- Expiry: Keep

## 2026-07-06 - State "looks independent but isn't" dependencies explicitly, not just in a Depends-on field

- Type: Plan Review Pattern
- Scope: any implementation plan with tasks that don't touch shared storage (DB/files) but do share in-process interfaces (function signatures, module exports)
- Confidence: Medium
- Evidence: `docs/superpowers/plans/2026-07-06-whatsapp-notification-rebuild-plan.md` (pre-fix) listed a task as "bisa paralel setelah Task 1" in one field while its own detail text said the opposite ("Task 6 butuh bot/backoff.ts dari Task 3, jadi urutkan Task 3 duluan") — a plan can be internally self-contradictory when a task's `Depends on:` line looks satisfied (no DB dependency) but its actual code depends on an artifact only a sibling task produces.
- Rule for future plans: when a task is non-DB/non-file-shared but consumes an interface/export from another task in the same plan, don't rely on prose buried in the task detail — add an explicit "must run sequentially, not parallel" callout in the Shared-File Risks or Estimated Order of Execution section, and re-read the execution order list after writing it to check it doesn't contradict a task's own dependency note.
- Expiry: Keep

## 2026-07-06 - Attach expected output to every validation command, not just the command

- Type: Plan Review Pattern
- Scope: any implementation plan's Validation Plan / Automated section
- Confidence: Medium
- Evidence: initial draft of `2026-07-06-whatsapp-notification-rebuild-plan.md` listed `npx tsc --noEmit`, `npm test`, `npm run build` with only a one-line comment on what each checks, no stated expected output/exit code. A subagent or fresh executor can't tell "did this pass" from "did this run" without an expected-output baseline, especially in a repo that already has pre-existing warnings (see test-command-memory.md).
- Rule for future plans: every automated validation command in a plan should state the expected result (exit code, expected pass/fail count, or "0 errors" style baseline), and should call out known pre-existing noise (warnings/errors that predate this plan) so the executor doesn't chase unrelated pre-existing issues as if they were caused by the current work.
- Expiry: Keep
