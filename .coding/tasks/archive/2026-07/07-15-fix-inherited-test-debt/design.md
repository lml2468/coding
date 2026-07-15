# Design — Fix Fork-Inherited Failing Tests

## Strategy: diagnose-first, single-root-cause hypothesis

The 16 failures are highly homogeneous (scripts emit empty output), so they
likely share ONE or TWO root causes. Fixing the root cause may clear most at
once. Approach:

1. **Instrument one representative failure** (e.g. `[workflow-state] no_task
   breadcrumb emitted`). Temporarily capture the hook's stderr + exit code in
   the harness (or run the exact harness invocation standalone) to see WHY the
   script outputs empty.
2. **Confirm the mechanism.** Prime suspects, in order of likelihood:
   - **stdin timeout race:** `inject-workflow-state.py:_load_hook_input()` reads
     stdin on a daemon thread with `result_queue.get(timeout=0.2)`. If execSync's
     piped stdin isn't scheduled within 200ms, the hook sees empty input and
     emits nothing. This would explain the workflow-state cluster. Fix candidate:
     for a piped/non-tty stdin, do a blocking read (the timeout only exists to
     survive hosts that leave stdin open with no payload — detect that case
     differently, e.g. `select` with a longer bound, or check `stdin.isatty()`).
   - **session-key mismatch:** harness writes `session_<id>.json` but resolver
     computes `claude_<id>`; single-session fallback normally saves it, but if a
     test leaves ≥2 session files (or the runtime dir has stray files) fallback
     refuses. Fix candidate: harness writes the resolver-correct filename.
   - **session-start cluster** (`Status: IN_PROGRESS` empty, first-reply notice
     JSON empty): same stdin-timeout family in `session-start.py`? It reads
     `json.loads(sys.stdin.read())` directly (no timeout) — so a different
     cause; investigate separately.
3. **Classify each of the 16** in `research/failure-classification.md` with the
   confirmed cause. Group by shared cause.
4. **Fix by group.** Root-cause fixes first (may clear a whole cluster), then
   any residual per-test fixes.
5. **task-archive** is independent — diagnose its error-path expectation
   separately.

## Boundaries / likely edit surfaces (confirm during diagnosis)

- Product (dual-write) IF a real bug: `inject-workflow-state.py`,
  `session-start.py`, `inject-subagent-context.py` (shared-hooks + live);
  `common/active_task.py` (scripts + template) for resolver issues;
  `task_store.py`/`task_utils.py` for archive error path.
- Test-only IF stale: `packages/cli/test/regression.test.ts`,
  `packages/cli/test/scripts/task-archive.integration.test.ts` (helpers:
  `writeSessionContext`, `runInjectWorkflowState`, `sessionEnv`).

## Decision rules (from prd R2/R3)

- Empty-output due to stdin timeout → **product fix** (deterministic read). It's
  a real robustness bug that also affects real hosts, not just tests.
- Empty-output due to harness writing the wrong session filename → **test fix**.
- Assertion references a removed command / old field → **test fix**.
- Never weaken an assertion to pass; if a behavior is genuinely deprecated,
  delete or rewrite the test to assert the NEW contract, with a comment.

## Verification (scrubbed env, gate-safe)

Run all suites from a script file (avoid literal git-commit in Bash):
```
env -u CODING_CONTEXT_ID -u CLAUDE_SESSION_ID -u CLAUDE_CODE_SESSION_ID \
  CODING_HOOKS=0 npx vitest run regression task-archive
```
Baseline the full `pnpm test` failure set BEFORE and AFTER to prove no new
breakage (R3/AC3).

## Risk / rollback

- A root-cause fix to a hook's stdin handling could affect live hook behavior.
  Mitigate: after fixing, manually run the hook both ways (piped input, and the
  "stdin left open, no payload" case from issue #356 which the timeout was
  originally added for — there's a test for it) to confirm BOTH still work.
- Rollback per fix is independent (test edits and product edits are separable
  commits).
