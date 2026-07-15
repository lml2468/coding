# PRD — Close the Execution Loop (Loop-Engineering Hardening)

**Parent task.** Owns the source requirement set, the child-task map, and the
cross-child acceptance criteria. It has no direct implementation work; each
deliverable is implemented, checked, and archived in its own child task.

## FINAL RESULT (integration verified 2026-07-15)

All 4 children implemented, checked, committed, archived. Parent cross-child AC
suite: **9/9 pass** (run end-to-end against the live hooks). The full loop is
verified live: a commit while `in_progress` with `check_status != pass` is
DENIED by the gate; after `set-check pass` it is ALLOWED — the soft "check
before commit" breadcrumb is now a hard gate.

Children (all archived under `archive/2026-07/`):
- `spike-loop-keystone` — verified PreToolUse deny contract + `task.py set-check`/`meta.loop`.
- `loop-core-gate` — `inject-commit-gate.py` hard commit gate.
- `finish-path` — activated the dead `[finish]` path (F3), tests in verification (F4), executable AC (F5).
- `cleanup-warn-refs` — context-drop warning via `additionalContext` (F6), dangling refs removed (F7).

Regression found + fixed during finish-path: the commit-gate (loop-core-gate)
added `inject-commit-gate.py` to shared-hooks but not to
`shared-hooks.test.ts` `ALL_HOOK_FILES` — a 5th registration surface the spec's
"register in 4 places" note missed. Fixed; that spec note should be updated to
name the test table too (follow-up).

Out-of-scope pre-existing failures (NOT introduced here, confirmed against the
initial commit): `regression.test.ts` had 25 failures at base, 15 now (this
work net-fixed 10 by completing workflow-state content); `task-archive`
integration test 1 failure at base. Both are fork-inherited tech debt worth a
separate task.

F8 (completed-state machine) was deferred by decision (see Structure section).


## Source problem

An audit of Coding's runtime (see the analysis that produced this task) found
that Coding's **cross-session memory loop** is solid, but its **in-task
execution→verification loop** is open-loop and enforced only by soft prose
breadcrumbs. Against the project's own loop-engineering definition
(`CLAUDE.md` §4: *define success criteria → act → verify → loop until
verified*), the runtime lacks hard gates, behavior-level verification, a
working finish step, and any automatic re-loop on failure.

Every finding below is evidence-backed (file + line or reproduced behavior),
not speculative.

## Structure (revised after reflection)

The original 8-issue-per-child split was reorganized **by change-surface, not
by issue**, because the 8 findings collided on the same files (`build_finish_prompt`
was edited by 3 of them; `continue.md` by 3; `inject-subagent-context.py` by 4).
Splitting by issue forced serial "edit-then-amend the same function" chains and
triple dual-write verification. The revised tree groups edits that touch the
same surface into one child, and front-loads the one unverified assumption.

The 8 findings (all evidence-backed) are preserved and mapped into 4 children:

| Original finding (evidence) | Now in |
|---|---|
| F1 loop-state / auto-loop (`coding-check.md:16-17`) | spike-loop-keystone |
| F2 no hard gate (`.claude/settings.json`; `workflow.md:112-118`) | loop-core-gate |
| F3 dead `[finish]` branch (`inject-subagent-context.py:602,386-425`) | finish-path |
| F4 README claims tests, agents don't (`README.md:58,67` vs `coding-check.md:41,82`) | finish-path |
| F5 prose AC, no machine termination (`CLAUDE.md` §4) | finish-path |
| F6 silent context drop (`active_task.py:333-355`→`inject-subagent-context.py:594-600`) | cleanup-warn-refs |
| F7 dangling `/coding:start` + `mcp__exa__*` (`init.ts:671`; hook `:468,513-514`) | cleanup-warn-refs |
| F8 dead `completed` state (`workflow.md:224-234`) | **DEFERRED** (see below) |

### Children

1. **`spike-loop-keystone`** — FIRST. Verify the load-bearing assumption
   (PreToolUse Bash `deny` actually blocks `git commit`) AND land the keystone
   (`task.json.meta.loop` + `task.py set-check`). If the deny mechanism does not
   work, the whole gate design changes — so this is a gate for the rest.
2. **`loop-core-gate`** — the commit-gate hook. Depends on the spike (reads
   `set-check` state; relies on the verified deny mechanism).
3. **`finish-path`** — F3+F4+F5 together, because all three edit
   `build_finish_prompt` / verification wording. One coherent pass, no
   serial amend.
4. **`cleanup-warn-refs`** — F6+F7, both small, independent, low-risk.

### F8 deferred (decision)

`completed-state-machine` is **dropped from active scope**. Rationale: it would
add a new *manual* command (`task.py complete`) to activate a state the
maintainers deliberately marked "kept for a future transition" — using a soft
step to fix a soft step, contradicting the parent goal. Lower ROI than the
other four. Revisit only if a `Stop`-hook finish gate is later built that needs
the state. Recorded here so the finding is not lost.

## Cross-child ordering (authoritative; also in each child's artifacts)

`spike-loop-keystone` → `loop-core-gate` → `finish-path` → `cleanup-warn-refs`.
The spike must land first (verifies the gate mechanism + writes the state the
gate reads). `finish-path` and `cleanup-warn-refs` are independent of each other
and could run in either order after the gate.

## Cross-cutting constraint: DUAL-WRITE

Runtime files exist in two places:
- `.claude/**` + `.coding/**` — this repo's live dogfood copy
- `packages/cli/src/templates/{claude,shared-hooks,common,coding}/**` — what
  `coding init` ships to users

CONFIRMED template paths (verified during planning):
- hooks → `templates/shared-hooks/` (register in `shared-hooks/index.ts`:
  `SharedHookName` union + `SHARED_HOOKS_BY_PLATFORM.claude`)
- agents → `templates/claude/agents/`
- commands (continue/finish-work) → `templates/common/commands/` (NOT claude/)
- skills → `templates/common/skills/`
- workflow.md → `templates/coding/workflow.md`
- settings.json → `templates/claude/settings.json` (uses `{{PYTHON_CMD}}`
  placeholder; live copy uses `python3`)
- scripts (`task_store.py`/`task.py`) → template path UNCONFIRMED; `find` before
  editing.

Any change to a shipped file MUST hit BOTH copies + `pnpm build`. Each child's
`implement.md` carries this.

## Cross-child acceptance criteria (parent-level integration)

The parent is done only when ALL hold (each maps to a finding, not a child name):

1. A commit made while `status=in_progress` with no passing check is **denied
   by a hook** (not just discouraged by prose). — F1+F2 (spike + loop-core-gate).
2. Dispatching a finish-phase check **provably** injects `build_finish_prompt`
   (finish context), verifiable via a hook signal. — F3 (finish-path).
3. README's stated verification scope and the agent instructions **agree**, and
   the stated scope is what actually runs. — F4 (finish-path).
4. A sample task's `prd.md` acceptance criteria include at least one
   machine-runnable check, and the finish report renders per-AC pass/fail. —
   F5 (finish-path).
5. With ≥2 session files present, an implement/check dispatch that cannot
   resolve the active task produces a **visible** warning, not silent
   drop. — F6 (cleanup-warn-refs).
6. `grep -r "coding:start"` and hardcoded `mcp__exa__` tool assertions are
   gone or made conditional. — F7 (cleanup-warn-refs).
7. Every dual-write change is present in both the live copy and the template,
   confirmed by `pnpm build` passing and a diff check. — cross-cutting.

(F8 deferred — see Structure section; not a parent completion gate.)

## Out of scope

- Rewriting the cross-session memory loop (it works).
- New platforms (Coding is intentionally Claude-Code-only).
- Any change to `packages/core` task schema (the loop state reuses the existing
  free-form `meta` field — no schema change).
- F8 `completed` state machine (deferred; rationale in Structure section).
