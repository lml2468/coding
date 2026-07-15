# Implement — Fix Fork-Inherited Failing Tests

Diagnose-first. Do NOT batch-edit assertions.

## Phase A — Diagnose (research)
- [ ] A1. Run the scrubbed suite, capture the full failing list (16 known).
- [ ] A2. Instrument ONE workflow-state failure: run the exact harness invocation
  standalone with stderr shown. Confirm why output is empty.
  - Prime suspect: `_load_hook_input()` 0.2s stdin timeout in
    `inject-workflow-state.py`. Test it: pipe input with an artificial delay, or
    add a temporary stderr print of what `_load_hook_input` returns.
- [ ] A3. Instrument one session-start failure (`Status: IN_PROGRESS` empty). Note
  `session-start.py` reads stdin WITHOUT the timeout — so likely a DIFFERENT
  cause (session-key mismatch? missing setup?). Confirm.
- [ ] A4. Diagnose task-archive: run the archive test's scenario by hand (temp
  repo + failing `.git/hooks/pre-commit`), see whether `task.py archive` returns
  non-zero + prints "Auto-commit failed". Compare to the assertion.
- [ ] A5. Write `research/failure-classification.md`: each of the 16 →
  {cause, stale-test|product-bug, planned fix, shared-group}.

## Phase B — Fix by root-cause group
- [ ] B1. Apply the highest-leverage root-cause fix first; re-run the suite to see
  how many clear. Iterate.
- [ ] B2. **CRITICAL GUARDRAIL** for any stdin fix: the failing set INCLUDES
  `[#356] inject-workflow-state.py exits when host leaves stdin open with no
  payload`. The 0.2s timeout was ADDED for issue #356 (hosts that leave stdin
  open with no payload must not hang). Any change to the stdin read MUST keep
  #356 passing (no hang, graceful empty) AND fix the piped-input case. Verify
  BOTH after the change:
  - piped JSON input → hook reads it fully and emits output (the 15 failures)
  - stdin held open, no payload → hook exits promptly with graceful empty (#356)
  A likely correct shape: block on read when stdin is a pipe with data, but bound
  the "open, silent" case (e.g. `select.select([stdin], [], [], timeout)` then
  read if ready, else empty) — verify the chosen mechanism against both cases.
- [ ] B3. Product fixes: dual-write (live + template), match the DUAL-WRITE table
  in the parent loop-engineering spec / hook-contracts.md.
- [ ] B4. Test-only fixes (stale assertions / wrong session filename): edit
  regression.test.ts / task-archive test; do NOT weaken assertions to hide bugs.
- [ ] B5. task-archive fix per A4 diagnosis.

## Phase C — Verify
- [ ] C1. `env -u CODING_CONTEXT_ID -u CLAUDE_SESSION_ID -u CLAUDE_CODE_SESSION_ID CODING_HOOKS=0 npx vitest run regression task-archive` → 0 fail (AC1/AC2).
- [ ] C2. Root `pnpm test`: confirm the 16 cleared and NO new failures (diff the
  failure set vs the pre-change baseline captured in A1) (AC3).
- [ ] C3. `pnpm build` passes; all product fixes dual-written clean (AC5).
- [ ] C4. Manually re-verify #356 both-cases and a real piped hook call (risk
  mitigation).

## Notes
- If any single failure turns out to be genuinely out-of-scope / needs a bigger
  change, `.skip` it with a comment + a follow-up note in the classification doc
  rather than forcing a risky fix (AC1 allows documented skips).
- Keep test edits and product edits in SEPARATE commits for clean rollback.
