# PRD — Loop Core: Commit Gate

Child of `07-15-loop-engineering-hardening`. **Second. Depends on
`spike-loop-keystone`**: reads the `meta.loop.check_status` it writes, and relies
on the deny mechanism it verified (`research/gate-mechanism.md`).

## Goal

Turn "don't commit before check passes" into a hard gate: a `PreToolUse` hook on
`Bash` that denies `git commit` when the active task is `in_progress` and its
latest check did not pass. This is the single biggest deviation from
loop-engineering ("loop until verified") — `.claude/settings.json` currently has
no gate hook.

## Requirements

R1. **New hook** `inject-commit-gate.py` in shared-hooks, registered for Claude
Code `PreToolUse` matcher `Bash`. Use the exact output contract the spike proved
works (`research/gate-mechanism.md`) — do not assume.

R2. **Deny condition (all hold):** command contains `git commit` AND an active
task resolves AND `task.json.status == "in_progress"` AND
`meta.loop.check_status != "pass"`. Deny → the verified deny output + a reason
pointing to workflow Phase 2.2 and the escapes (`set-check pass`, `CODING_HOOKS=0`).

R3. **Fail-OPEN.** Any ambiguity/error (no active task, no `.coding/`, parse
fail, unusual command) → ALLOW. False-deny is worse than a missed catch.

R4. **Conservative commit detection.** Match common `git commit` forms
(`git commit`, `git -C x commit`, `git commit -m ...`); do not exhaustively parse
`&&` chains; when unsure whether it's a commit, allow. Documented limitation:
literal `echo "git commit"` may deny (acceptable; `CODING_HOOKS=0` escapes).

R5. **Registration (DUAL-WRITE + index):**
- hook → `templates/shared-hooks/` + live `.claude/hooks/`
- `shared-hooks/index.ts`: add to `SharedHookName` union AND
  `SHARED_HOOKS_BY_PLATFORM.claude`
- settings binding in BOTH `.claude/settings.json` (`python3`) and
  `templates/claude/settings.json` (`{{PYTHON_CMD}}`).

R6. **Kill-switch parity:** `CODING_HOOKS=0` / `CODING_DISABLE_HOOKS=1` → allow.

## Constraints

- Reuse `common.active_task.resolve_active_task` and the `meta.loop` reader
  defaults from the spike. Resolve task the way `inject-subagent-context.py` does
  (do not depend on session env in the Bash tool environment).
- `completed`-status tasks must NOT be gated (commit already happened before
  completion) — only `in_progress` denies.

## Acceptance Criteria

- [ ] AC1 (executable): active task `in_progress` + `check_status` absent/`fail`,
  payload `command:"git commit -m x"` → output denies (per verified contract).
- [ ] AC2 (executable): after `set-check pass` → same payload → allow.
- [ ] AC3 (executable): `command:"echo hi"` → allow.
- [ ] AC4 (executable): `CODING_HOOKS=0` → allow regardless.
- [ ] AC5 (executable): no active task → allow (fail-open).
- [ ] AC6: `shared-hooks/index.ts` lists the hook (union + array); both
  settings.json register the binding; `pnpm build` passes; settings diff shows
  only `{{PYTHON_CMD}}` vs `python3`.

## Out of scope

- The `set-check` writer (spike).
- A `Stop`-hook finish gate (possible follow-up).
