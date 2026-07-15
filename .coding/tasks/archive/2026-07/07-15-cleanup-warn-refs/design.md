# Design — Cleanup: Warning + Dangling Refs

## Surfaces
- `inject-subagent-context.py` (shared-hooks + live): F6 warnings + F7.2 exa.
- `packages/cli/src/commands/init.ts`: F7.1 `/coding:start` (single-source).

## F6 — REVISED after spike-loop-keystone finding

**Spike finding (`spike-loop-keystone/research/gate-mechanism.md`):** in Claude
Code, a PreToolUse hook's **stderr is only surfaced to the model on exit 2**
(blocking error). On `exit 0`, stderr is NOT fed to the model — it lands only in
the hook debug/output log. So the original plan (`print(..., file=sys.stderr)` +
`sys.exit(0)`) does **not** make the warning visible to the model/user. And we
must NOT use exit 2 here — that would BLOCK the sub-agent dispatch, but the
agents have a documented fallback (read `Active task:` first line) and should
still run.

**Better mechanism (confirmed via docs):** a PreToolUse hook can emit, on exit 0,
`hookSpecificOutput.additionalContext` — a string Claude Code wraps in a
system-reminder and injects into the model's context "next to the tool result",
WITHOUT blocking. This is exactly the visible, non-blocking channel F6 needs.

### Caveat that shapes the choice
Today the two `sys.exit(0)` paths emit **no stdout** → spike confirmed that means
"defer to the normal permission flow" (the tool call still goes through the
user's normal permission settings; it is not auto-approved). If we switch to
emitting `{"permissionDecision":"allow","additionalContext":...}`, we would be
**affirmatively allowing** the Task dispatch and thereby SKIPPING the user's
normal permission prompt for that call. For a `Task`/`Agent` dispatch that is
almost always fine (sub-agent dispatch is rarely gated), but it is a behavior
change worth being deliberate about.

### Decision (chosen): additionalContext + explicit allow
Emit, for each of the two unresolved-task cases:
```python
def _emit_warning(subagent_type, message):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "permissionDecisionReason": "coding: dispatching without injected task context",
        "additionalContext": message,
    }}))
    sys.exit(0)
```
- case `not task_dir` → message: "coding: no active task resolved for
  `<subagent_type>` — running WITHOUT injected prd/spec. Read the `Active task:`
  first line of your prompt and load that task's jsonl + prd/design/implement
  yourself. If unexpected, check for multiple open windows (multi-session
  active-task resolution is skipped for safety)."
- case `not exists` → message: "coding: active task path `<task_dir>` does not
  exist — running WITHOUT injected context; the pointer may be stale (run
  `task.py finish` or re-`start`)."

This makes the warning reach the model (so the sub-agent actually acts on its
fallback) while not blocking. The explicit `allow` is acceptable for Task/Agent
dispatch.

### Fallback if explicit-allow is judged too intrusive
Keep `additionalContext` but omit `permissionDecision` — per docs the reminder
still injects, and behavior stays "defer to normal permission flow". Confirm
empirically during implement that `additionalContext` is honored WITHOUT an
accompanying `permissionDecision`; if Claude Code ignores context-only output
that lacks a decision, fall back to the explicit-allow form above. Decide with a
quick probe, don't assume.

### Verification requirement (updated AC)
The implement/check ACs for F6 must assert the **stdout JSON** contains
`additionalContext` with "Active task"/"active task" wording (not stderr), e.g.:
`... | python3 -c "import sys,json;print('Active task' in (json.load(sys.stdin)['hookSpecificOutput'].get('additionalContext','')))"`.
Update prd.md AC1 accordingly (it currently greps stderr).

Research branch untouched (not in `AGENTS_REQUIRE_TASK`) → R6.3 automatic.
Kill-switch already at top of `main` → R6.4.

## F7.1 change (init.ts)
- In `getJoinerPrdContent`, remove the `/coding:start` bullet (the surrounding
  text already says "not needed here"). Leave `/coding:continue` and
  `/coding:finish-work` (they exist).

## F7.2 change (hook)
- `get_research_context` project-structure text (~468) and `build_research_prompt`
  tool table (~513-514): replace the two `mcp__exa__*` names with a generic
  "web-search MCP tool (if one is configured in your environment)". Keep the
  Glob/Grep/Read guidance intact (R7 / AC6).

## Ordering
Independent of other children; can land any time after the spike (no dependency
on loop state). Groups two unrelated small fixes for commit economy — implement
as TWO commits (F6, F7) within one task.

## Rollback
- F6: revert the two `_emit_warning` (additionalContext) blocks (both hook copies).
- F7.1: restore the init.ts bullet. F7.2: restore tool names (both hook copies).
