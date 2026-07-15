# PRD — Fix Fork-Inherited Failing Tests

## Goal

Make `pnpm test` green (or explicitly, defensibly quarantined) by fixing the
16 failures that have existed since the fork's initial commit (3561044):
15 in `packages/cli/test/regression.test.ts` + 1 in
`packages/cli/test/scripts/task-archive.integration.test.ts`.

## Background (verified, not assumed)

- Confirmed against the initial commit: `regression.test.ts` had **25**
  failures at base; it is **15** now (unrelated prior work in this repo
  net-fixed 10 by completing workflow-state content). `task-archive` had its 1
  failure at base too. None were introduced by the loop-engineering work.
- **Diagnostic finding:** every regression failure shows the invoked hook/script
  producing an EMPTY string (`expected '' to contain ...`, `Unexpected end of
  JSON input`, `expected '' not to be ''`). The same hooks run CORRECTLY when
  invoked by hand in a scratch repo. So the fault is in how the tests drive the
  scripts (harness), not (primarily) in the shipped hooks — but this must be
  confirmed per-failure, not assumed.
- Candidate root-cause mechanisms to investigate (do not assume which):
  1. `inject-workflow-state.py` `_load_hook_input()` uses a 0.2s stdin-read
     timeout thread; under vitest/execSync load stdin may not be delivered in
     time → hook treats input as empty → emits nothing.
  2. Test harness stages scripts via `getAllScripts()` into a temp repo; a
     missing/renamed module or a session-key mismatch
     (`writeSessionContext("session_workflow-a")` vs resolver key
     `claude_workflow-a`) could make resolution silently yield no output.
  3. The `task-archive` test simulates a failing `pre-commit` hook and expects
     non-zero exit; product archive-error handling may have changed.

## Requirements

R1. **Diagnose each failure to a definite cause** before fixing. For each,
classify as: (a) stale test (product is correct, test asserts old behavior /
uses a removed command / wrong session key), or (b) real product bug (hook or
script misbehaves). Record the classification + evidence per failure.

R2. **Fix per classification.** Stale test → update the test to the current
contract. Real product bug → fix the product (dual-write templates) AND keep the
test. Never "fix" by weakening an assertion to hide a real bug.

R3. **If a failure is environment-flaky** (e.g. the 0.2s stdin timeout races
under load), the fix must make it deterministic — e.g. raise/remove the timeout
for the piped-input path, or make the harness robust — not just re-run until
green. A flaky test is a real defect to fix, with justification recorded.

R4. **No scope creep.** Only touch what a diagnosed failure requires. Do not
refactor passing code. Product changes that ship to users are dual-write.

R5. **task-archive failure** (`fails when archive auto-commit cannot record
tracked source deletes`): diagnose whether the archive auto-commit error path
regressed or the test's fixture (a failing pre-commit hook) no longer triggers
the expected non-zero exit; fix accordingly.

## Constraints

- DUAL-WRITE for any shipped-file (hook/script/template) product fix.
- The commit-gate is live: never put the literal string "git commit" in a Bash
  command; the check agent must run test suites from a script file.
- Verification runs in a SCRUBBED env (strip `CODING_CONTEXT_ID`,
  `CLAUDE_SESSION_ID`, etc.) so the developer's own session doesn't mask
  results — the tests' `sessionEnv()` already does this; confirm it's complete.

## Acceptance Criteria

- [ ] AC1 (executable): `cd packages/cli && env -u CODING_CONTEXT_ID -u CLAUDE_SESSION_ID -u CLAUDE_CODE_SESSION_ID CODING_HOOKS=0 npx vitest run regression` → 0 failures (or documented, justified `.skip` with a linked follow-up for any genuinely out-of-scope case).
- [ ] AC2 (executable): same for `npx vitest run task-archive` → 0 failures.
- [ ] AC3 (executable): `pnpm test` at repo root → the previously-failing 16 no longer fail; no NEW failures introduced (compare failure set before/after).
- [ ] AC4: a `research/failure-classification.md` records each of the 16 failures with its cause (stale-test vs product-bug) and the fix applied.
- [ ] AC5: every product-side fix is dual-written (live + template) and `pnpm build` passes.

## Out of scope

- Fixing tests unrelated to these 16.
- Rewriting the test harness beyond what a diagnosed failure requires.
