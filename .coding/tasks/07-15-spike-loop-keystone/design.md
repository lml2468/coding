# Design — Spike + Loop-State Keystone

## Part A — spike mechanics

- Throwaway hook `/.claude/hooks/_probe_gate.py`: reads stdin JSON, if
  `tool_input.command` contains `git commit` → print
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"probe"}}`.
- Register a temporary `PreToolUse` matcher `Bash` in `.claude/settings.json`
  (live only — do NOT touch template for the probe).
- Test: attempt an actual `git commit` in a scratch state and observe whether it
  is blocked. Also test the alternative output schema if the first doesn't work
  (`{"decision":"block","reason":...}` is the older Claude Code shape — try both,
  record which the installed version honors).
- Deliverable: `research/gate-mechanism.md` with the exact working JSON, plus any
  quirks (does stderr show? does exit code matter? does matcher `Bash` fire for
  `git` commands?).
- Cleanup: remove `_probe_gate.py` and its settings entry before finishing.

## Part B — keystone (identical to prior loop-state-tracking design)

### `task.py set-check <pass|fail>`
- New `cmd_set_check` in `task_store.py`; argparse subparser in `task.py`
  (positional `state` choices `pass`/`fail`).
- Resolve active task via `common.active_task.resolve_active_task` (same as
  `cmd_current`). None/no-identity → stderr, return 1, no write.
- Read task.json; ensure `meta` dict; ensure `meta.loop` with defaults
  (`check_status="unknown"`, `iteration_count=0`).
- `fail`: status=fail, count += 1. `pass`: status=pass, count = 0. Both:
  `last_check_at = utc ISO8601 Z`.
- `write_json` (meta is last in `TASK_RECORD_FIELD_ORDER`, so appending inside it
  preserves canonical order).

### Docs
- `coding-check.md` Step 4: after verification passes → `set-check pass`, else
  `set-check fail`. (Authoritative; finish-path amends to add tests.)
- `continue.md` Step 3: the 3 routes.

## Dual-write template paths
- `coding-check.md` → `packages/cli/src/templates/claude/agents/coding-check.md`
- `continue.md` → `packages/cli/src/templates/common/commands/continue.md`
- scripts → `find packages/cli/src/templates -name task_store.py` FIRST.

## Why meta.loop not runtime session
Runtime session files are gitignored + per-window; loop state must survive
session end and be readable by the gate from any window. `meta` is canonical and
free-form — no schema migration, no `packages/core` change.

## Rollback
- Part A: remove probe hook + settings entry (always, it's throwaway).
- Part B: revert task_store.py/task.py hunks + doc edits. Stray `meta.loop` is
  inert.
