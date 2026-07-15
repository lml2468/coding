# Design — Loop Core: Commit Gate

## Prerequisite
`spike-loop-keystone` merged: `set-check` exists (tasks can reach `pass`) and
`research/gate-mechanism.md` records the working deny contract. **Use that
contract verbatim** — the JSON below is the assumed shape; reconcile with the
spike's finding before coding.

## Registration surfaces (all required)
1. `templates/shared-hooks/inject-commit-gate.py` (source)
2. `.claude/hooks/inject-commit-gate.py` (live)
3. `shared-hooks/index.ts` — `SharedHookName` union + `SHARED_HOOKS_BY_PLATFORM.claude`
4. `.claude/settings.json` PreToolUse Bash binding (`python3`)
5. `templates/claude/settings.json` PreToolUse Bash binding (`{{PYTHON_CMD}}`)

## Decision logic (fail-open)
```
kill-switch env → exit 0
parse stdin; fail → exit 0
tool_name != Bash → exit 0
cmd = tool_input.command; not str → exit 0
not looks_like_git_commit(cmd) → exit 0
root = find_coding_root(cwd); None → exit 0
active = resolve_active_task(root); none/stale → exit 0
status != "in_progress" → exit 0            # completed/planning never gated
check_status == "pass" → exit 0
else → print deny (verified contract); exit 0
```

## `looks_like_git_commit(cmd)` — conservative
Regex on token boundary: `\bgit\b(?:\s+-C\s+\S+|\s+--?\S+)*\s+commit\b`.
No quote-stripping / `&&` splitting. Commit-shaped → deny path; everything else →
allow. Documented false-positive on `echo "git commit"`.

## Deny output (RECONCILE with spike)
Assumed:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
 "permissionDecisionReason":"Coding: the active in_progress task has not passed check. Run Phase 2.2 (coding-check) until set-check pass, or override with CODING_HOOKS=0."}}
```
If the spike found a different working shape, use that instead.

## Allow path
Prefer silent `exit 0` (no stdout) so we never interfere with other PreToolUse
hooks; absence of deny = allow in Claude Code.

## Reuse
`find_coding_root`, `resolve_active_task`, `meta.loop` reader — same imports as
`inject-subagent-context.py` / `inject-workflow-state.py`.

## Ordering / compatibility
- Must land AFTER the spike (else no task can reach `pass` → every in_progress
  commit denied).
- Additive settings.json entry; keep byte-parity (`coding update` re-derives
  settings.json — template stays canonical with `{{PYTHON_CMD}}`).

## Rollback
Remove the 5 surfaces. No persistent state written by the hook.
