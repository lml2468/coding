# Research: Failure classification — 16 inherited failing tests

- **Query**: Diagnose root cause of 16 failing tests (15 in `packages/cli/test/regression.test.ts`, 1 in `packages/cli/test/scripts/task-archive.integration.test.ts`); classify each as stale-test vs product-bug; answer the #356 stdin constraint.
- **Scope**: internal (code + test harness + live experiments)
- **Date**: 2026-07-15

## TL;DR

There are exactly **two** independent root causes, and **both are test-harness / environment problems, not product bugs**:

| Group | Count | Root cause | Classification |
|---|---|---|---|
| **Group 1 — CODING_HOOKS leak** | 15 | The repro command exports `CODING_HOOKS=0`, which leaks into every hook subprocess (neither `test/setup.ts` nor the harness `sessionEnv()` scrubs it). Every hook honors the gate and exits with empty stdout. | **stale-test** (harness/repro-env) |
| **Group 2 — global core.hooksPath** | 1 | The archive test installs a repo-local `.git/hooks/pre-commit` to force a commit failure, but this dev machine has a global `core.hooksPath` that overrides repo-local hooks, so the intended failure never fires and the auto-commit succeeds. | **stale-test** (environment-fragile) |

**The entire "empty stdout" symptom cluster is caused by `CODING_HOOKS=0` in the reproduction command, NOT by the `inject-workflow-state.py` stdin 0.2s timeout.** This was proven by experiment (see Group 1 evidence and the #356 section).

---

## Reproduction

From `packages/cli/`:

```
# As given in the task — 16 failures:
env -u CODING_CONTEXT_ID -u CLAUDE_SESSION_ID -u CLAUDE_CODE_SESSION_ID CODING_HOOKS=0 npx vitest run regression task-archive
  → Tests 16 failed | 141 passed

# Same, but WITHOUT CODING_HOOKS=0 — only 1 failure:
env -u CODING_CONTEXT_ID -u CLAUDE_SESSION_ID -u CLAUDE_CODE_SESSION_ID npx vitest run regression task-archive
  → Tests 1 failed | 156 passed

# The canonical `pnpm test` command (no env manipulation) — also only 1 failure:
npx vitest run regression task-archive
  → Tests 1 failed | 156 passed   (the archive test)
```

The delta of 15 failures is entirely attributable to the `CODING_HOOKS=0` prefix.

---

## Group 1: CODING_HOOKS leak (15 tests)

### Mechanism (confirmed)

1. The repro command sets `CODING_HOOKS=0` in the vitest parent process env.
2. `test/setup.ts` (`packages/cli/test/setup.ts`) deletes `CODING_CONTEXT_ID`, `OPENCODE_RUN_ID`, and several `*_PROJECT_DIR` vars — but **does NOT delete `CODING_HOOKS`**.
3. The harness helper `sessionEnv()` (`regression.test.ts:1078`) copies `process.env` minus `SESSION_ENV_KEYS` (`regression.test.ts:1047-1076`). That list has 25+ session/transcript keys but **does NOT include `CODING_HOOKS`**.
4. Every hook invocation in these tests goes through `runPython()` (`regression.test.ts:1122`) → `execSync(..., { env: sessionEnv(...) })`, so `CODING_HOOKS=0` is inherited by the Python child.
5. Both hooks short-circuit to empty output on that gate:
   - `inject-workflow-state.py:208`: `if os.environ.get("CODING_HOOKS") == "0" ...: return 0` (before any `print`).
   - `session-start.py:127`: `if os.environ.get("CODING_HOOKS") == "0": ...` (early return, no stdout, and it never writes the env file).

Result: empty stdout → `JSON.parse('')` throws `Unexpected end of JSON input`; `.toContain(...)` on `''` fails; the env-file test gets ENOENT because the file is never written.

### Evidence

- Real hook run by hand with a piped payload and `CODING_HOOKS` unset produces the full `<workflow-state>` block (exit 0).
- 20/20 piped-payload trials with stdin closed (execSync-style) all produced the block — **0 empty results**.
- With `CODING_HOOKS=0`, the same piped invocation produces **0-length output**.
- `session-start.py` honors the same gate and returns empty (verified: `echo '{...}' | CODING_HOOKS=0 python3 session-start.py` → empty).

### The 15 tests

All are in `regression.test.ts` > `regression: current-task path normalization`:

| # | Test title | Error (assertion @ line) | Path to empty output |
|---|---|---|---|
| 1 | `[session-current-task] Python session-start hooks resolve session backslash refs without stale pointer` | `expected '' to contain 'Status: IN_PROGRESS'` | session-start.py gated |
| 2 | `[session-current-task] Claude SessionStart persists CODING_CONTEXT_ID for Bash commands` | `ENOENT ... claude-env.sh` (@2205) | session-start.py gated → env file never written |
| 3 | `[session-start-proof] shared context includes one-shot first-reply notice without changing payload shape` | `Unexpected end of JSON input` (@~2219) | session-start.py gated |
| 4 | `[workflow-v2] shared session-start summarizes in-progress context without auto-dispatch approval` | `expected '' to contain 'Status: IN_PROGRESS'` (@2255) | session-start.py gated |
| 5 | `[coding-hooks-env] runtime: shared hooks emit no additionalContext when CODING_HOOKS=0` | `expected '' to contain 'hookSpecificOutput'` (@~2300) | see note below |
| 6 | `[workflow-state] missing/empty workflow.md degrades to generic line (post-R5: no fallback dict)` | `Unexpected end of JSON input` (@2463) | inject-workflow-state.py gated |
| 7 | `[workflow-state] in_progress tag in workflow.md mentions Phase 3.4 commit (R1 invariant)` | `Unexpected end of JSON input` | inject-workflow-state.py gated |
| 8 | `[workflow-state] workflow.md tag overrides hardcoded fallback` | `Unexpected end of JSON input` (@2507) | inject-workflow-state.py gated |
| 9 | `[workflow-state] custom status with hyphen matches via regex` | `Unexpected end of JSON input` (@2535) | inject-workflow-state.py gated |
| 10 | `[workflow-state] unknown status with no tag emits generic fallback, not silent` | `expected '' not to be ''` (@2554) | inject-workflow-state.py gated |
| 11 | `[workflow-state] CWD drift: hook finds .coding/ when invoked from subdirectory` | `Unexpected end of JSON input` (@2574) | inject-workflow-state.py gated |
| 12 | `[workflow-state] no_task breadcrumb emitted when no session active task exists` | `expected '' not to be ''` (@2598) | inject-workflow-state.py gated |
| 13 | `[#356] inject-workflow-state.py exits when host leaves stdin open with no payload` | `expected '' to contain '<workflow-state>'` (@2703) | inject-workflow-state.py gated (see #356 section) |
| 14 | `[workflow-v2] session-start.py <coding-workflow> block contains compact Phase Index` | `Unexpected end of JSON input` (@3184) | session-start.py gated |
| 15 | `[workflow-v2] session-start.py <guidelines> block lists context order and spec paths` | `Unexpected end of JSON input` (@3233) | session-start.py gated |

**Note on #5** (`[coding-hooks-env] ... emit no additionalContext when CODING_HOOKS=0`): this test *intentionally* sets `CODING_HOOKS: "0"` in a couple of its own invocations to assert empty output, but it *also* has a first invocation (~line 2290) that expects real output containing `hookSpecificOutput` — that first one is broken by the ambient leak. So this test is self-contradicting only under the leak.

### Secondary (masked) observation — session key filename mismatch

The brief flagged: `writeSessionContext("session_workflow-a", ...)` writes `.coding/.runtime/sessions/session_workflow-a.json`, but `resolve_context_key({session_id:"workflow-a"}, platform="claude")` computes key `claude_workflow-a` (`active_task.py:237` → `_context_key`), i.e. filename mismatch.

**Verified harmless**: `_resolve_single_session_fallback` (`active_task.py:333-355`) returns the sole session file when exactly one exists (`len(session_files) != 1` guard at line 345). Each workflow-state test writes exactly one session file, so the fallback covers the mismatch. Proof: with the `CODING_HOOKS` leak removed, all 15 of these tests **pass** — resolution succeeds. So this is not a contributing cause; it is only latent design fragility (would break with ≥2 session files, but no test exercises that here).

### Proposed fix (Group 1) — test-only

Scrub `CODING_HOOKS` (and `CODING_DISABLE_HOOKS`) so the ambient value cannot leak into hook subprocesses. Two equivalent options:

- **Preferred**: add `CODING_HOOKS` and `CODING_DISABLE_HOOKS` to the deletions in `packages/cli/test/setup.ts` (mirrors how it already strips `CODING_CONTEXT_ID`). This fixes it for the whole suite.
- **Alternatively / additionally**: add both keys to `SESSION_ENV_KEYS` in `regression.test.ts:1047` so `sessionEnv()` strips them, and let tests that need the gate pass it explicitly via `envOverrides` (which they already do — test #5 passes `{ CODING_HOOKS: "0" }` per-call).

This is **test-only**; no product change. The product already behaves correctly (proven by hand + 20/20 piped trials).

---

## Group 2: global core.hooksPath (1 test)

### Test
`test/scripts/task-archive.integration.test.ts` > `task.py archive auto-commit` > **`fails when archive auto-commit cannot record tracked source deletes`** (assertion `expect(r.status).not.toBe(0)` @ line 256).

### Mechanism (confirmed)
The test (lines 235-263) installs a repo-local failing hook at `<tmp>/.git/hooks/pre-commit` (`exit 1`) to force the archive auto-commit to fail, then asserts:
- `r.status !== 0`
- stderr contains `Archive moved on disk` and `Auto-commit failed`
- `git status` shows both the tracked source and archive paths (the phantom-delete state).

On this dev machine, `git config --global core.hooksPath` is set to `/Users/mlamp/.git-global-hooks`. When `core.hooksPath` is configured, **git ignores the repo-local `.git/hooks/` directory entirely**. So the test's `pre-commit` never runs, the commit in `_auto_commit_archive` (`common/task_store.py:592`) succeeds, and `task.py archive` returns 0.

### Evidence
- With global `core.hooksPath` active (this machine): archive prints `[OK] Auto-committed: chore(task): archive tracked`, exits 0. → test's `expect(status).not.toBe(0)` fails.
- With a clean git env (`GIT_CONFIG_GLOBAL` pointed at an empty file, no `core.hooksPath`): archive prints `[WARN] Auto-commit failed: archive commit blocked` + `Archive moved on disk, but git auto-commit did not complete.`, exits 1, and `git status` shows the `R`/`A`/`D` phantom-delete rows. → test passes.

(Product path confirmed correct: `common/task_store.py:592-598` returns failure and the caller at `task_store.py:494-503` prints "Archive moved on disk..." and returns 1. `common/git.py:run_git` does **not** pass `--no-verify`, so a working pre-commit hook does block the commit — the product is right.)

### Classification
**stale-test** (environment-fragile). Product is correct; the test is not hermetic against a developer's global git config.

### Proposed fix (Group 2) — test-only
Make the test hermetic by neutralizing `core.hooksPath` for the tmp repo. Options:
- Set `git -C <tmp> config core.hooksPath .git/hooks` **and** ensure git resolves it (note: a repo-local `core.hooksPath` does override the global one, so setting it in the tmp repo to `.git/hooks` is sufficient — I confirmed the global value wins only when the repo does not set its own). Simplest: after `git init`, run `git config core.hooksPath .git/hooks` in the tmp repo.
- Or run the spawned `task.py` with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` pointed at throwaway files so no global config applies.

Test-only; no product change.

---

## The #356 constraint (highest-value answer)

**Question**: For test #13 `[#356] inject-workflow-state.py exits when host leaves stdin open with no payload` — is the empty output the 0.2s stdin timeout, and can a fix satisfy both (a) piped input read fully and (b) stdin-open-with-no-payload doesn't hang?

**Answer: the 0.2s timeout is NOT the cause of any failure here. #356 fails for the exact same reason as the rest of Group 1 — `CODING_HOOKS=0` leaked in via `sessionEnv()` (the test spawns with `env: sessionEnv({ KIRO_PROJECT_DIR: tmpDir })`, `regression.test.ts:2667`), so the hook exits at line 208 before it ever reads stdin.** The assertion `expected '' to contain '<workflow-state>'` is the gate short-circuit, not a stdin race.

**Proof (real hook, CODING_HOOKS unset):**
- Piped payload + stdin closed, 20 trials: `<workflow-state>` present in all 20, 0 empty. The 0.2s `result_queue.get(timeout=0.2)` reads the full piped payload well within 200ms on execSync.
- Stdin left OPEN with no payload (the #356 host behavior): the process exits `rc=0` with `<workflow-state>` present after ~200ms (the timeout fires, `_load_hook_input` returns `{}`, and the hook still emits the `no_task`/active-task breadcrumb because output does not depend on stdin content). It does **not** hang.

So the current 0.2s-timeout design **already satisfies both (a) and (b)** in a clean environment. No product change is required to make #356 pass — fixing the `CODING_HOOKS` leak (Group 1 fix) makes it green.

**On the design tension itself** (for future hardening, not required by these failures): the 0.2s timeout is a heuristic — a slow host that pipes a large payload later than 200ms would be misread as "no payload". A more robust mechanism that satisfies both constraints without a fixed race window is `select.select([sys.stdin], [], [], timeout)` on the fd:
- If stdin has data ready → `read()` it fully (loop until EOF) → satisfies (a) with no fixed latency ceiling for the common closed-stdin case.
- If `select` reports not-ready within the timeout and the host is holding stdin open with nothing to send → fall through to `{}` → satisfies (b), no hang.

Constraint/caveat: `select` on stdin is **POSIX-only** (does not work on Windows pipes), so it would need a platform guard with the current thread+queue approach retained as the Windows fallback. Given that the current design already passes both cases in practice, this is optional hardening, not a fix for the 16 failures.

---

## Caveats / Not found

- The top-level stderr line `Error: task.py init-context was removed in v0.5.0-beta.12.` seen during the run is **expected** — it is emitted by the passing test `[init-context-removal] task.py init-context is deprecated with clear pointer to planning artifacts` (`regression.test.ts:2783`, deprecation guard at `task.py:361`). Not a failure.
- Confirmed via commit history claim in the brief: these are inherited from the fork's initial state; the fixes above are both test-only and do not touch product hooks/scripts.
- All experiments were run against COPIES / the real hooks read-only; no product files were modified. Scratch experiments live under `/tmp/` (`/tmp/arch_experiment.sh`, `/tmp/arch_clean.sh`, `/tmp/stdin_experiment.sh`).
