# Claude Code Hook Contracts

> Executable contracts for the Claude Code hooks Coding installs
> (`.claude/hooks/*.py`, shipped from `packages/cli/src/templates/shared-hooks/`).
> These are non-obvious behaviors verified against the official docs
> (https://code.claude.com/docs/en/hooks) and Claude Code 2.1.210. Get one wrong
> and a hook silently no-ops or blocks the wrong thing.

---

## PreToolUse decision contract

**Scope / Trigger:** any hook wired to `PreToolUse` (e.g. a commit gate, a
context injector, a dispatch warner).

### To DENY a tool call
Print JSON to **stdout** and **exit 0**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<reason shown to Claude>"
  }
}
```
- `permissionDecision` values: `allow` / `deny` / `ask` / `defer`.
- JSON is processed **only on exit 0**. On exit 2 the JSON is ignored.

### Fields inside `hookSpecificOutput` (PreToolUse)
`hookEventName` (required, `"PreToolUse"`), `permissionDecision`,
`permissionDecisionReason`, `additionalContext`, `updatedInput`.

### Matcher
Matches on **tool name**, exact string. `"matcher": "Bash"` fires only for the
Bash tool; `"Task"` / `"Agent"` for sub-agent dispatch. Regex like `mcp__.*` is
allowed.

### settings.json edits are hot-reloaded
The file watcher picks up hook changes immediately — no session restart. (So a
gate installed mid-session is live for this repo's own next commit.)

---

## GOTCHA: exit-0 stderr is NOT shown to the model

> **Warning:** For a PreToolUse hook, `stderr` is fed back to Claude ONLY on
> **exit 2** (a blocking error). On **exit 0**, stderr is discarded from the
> model's view — it lands only in the hook debug/output log.

Consequence: `print(msg, file=sys.stderr); sys.exit(0)` does **not** surface
`msg` to the model or user. This silently defeated the first design of the
sub-agent-context-drop warning.

### Wrong
```python
# Warning the model will never see:
print("[coding] no active task — running without context", file=sys.stderr)
sys.exit(0)
```

### Correct — non-blocking, model-visible: `additionalContext`
```python
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",          # see caveat below
    "additionalContext": "coding: no active task resolved — read the "
                         "`Active task:` line and load context yourself.",
}}))
sys.exit(0)
```
Claude Code wraps `additionalContext` in a system-reminder and injects it next
to the tool result, without blocking the call.

**Caveat:** emitting `permissionDecision:"allow"` *affirmatively approves* the
call, SKIPPING the user's normal permission prompt for it. Silent `exit 0` with
NO stdout instead means "defer to the normal permission flow" (not auto-approve,
not block). If you want the reminder WITHOUT changing permission behavior, test
whether `additionalContext` alone (no `permissionDecision`) is honored by the
installed Claude Code version before relying on it.

- Do NOT use `exit 2` just to show a message: for PreToolUse it BLOCKS the tool
  call. Only block when you actually intend to.

---

## Fail-open / fail-closed convention (Coding hooks)

Coding's context/injection/warn hooks are **fail-open**: on any ambiguity (no
`.coding/`, unparsable stdin, unresolved task) they `sys.exit(0)` and let the
action proceed. A GATE hook (deny) is the deliberate exception and denies only
when all its conditions are certain. Honor the kill switches at the top of
`main`: `CODING_HOOKS=0` and `CODING_DISABLE_HOOKS=1` → exit 0 / allow.

---

## Where a new shared hook must be registered (all 4)

Adding a hook that ships to users touches four surfaces — miss one and it
installs but never fires, or fires only in this repo:

1. `packages/cli/src/templates/shared-hooks/<name>.py` (source) + live
   `.claude/hooks/<name>.py`.
2. `packages/cli/src/templates/shared-hooks/index.ts`: add to the
   `SharedHookName` union AND `SHARED_HOOKS_BY_PLATFORM.claude`.
3. `.claude/settings.json` event binding — command `python3 .claude/hooks/<name>.py`.
4. `packages/cli/src/templates/claude/settings.json` — same binding but command
   `{{PYTHON_CMD}} .claude/hooks/<name>.py` (template uses the placeholder; the
   live copy uses `python3`). This `{{PYTHON_CMD}}` / `{{CLI_FLAG}}` divergence
   is the EXPECTED diff between a live file and its template — not a parity bug.
