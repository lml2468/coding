# Spike Result — PreToolUse(Bash) Commit-Gate Mechanism

**Verdict: VERIFIED. The commit-gate design in `loop-core-gate` is viable as
written.** Proceed with Batch 1.

Claude Code version tested: **2.1.210**.
Source of truth: official docs https://code.claude.com/docs/en/hooks (fetched
2026-07-15) + local output-shape test of a throwaway probe.

## The working deny contract

To DENY a tool call, a `PreToolUse` hook must print to **stdout** and **exit 0**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<human-readable reason shown to Claude>"
  }
}
```

- `permissionDecision` valid values: `allow` / `deny` / `ask` / `defer`.
- JSON is processed **only on exit 0**. If the hook exits 2, JSON is ignored.

## Load-bearing facts confirmed

1. **Matcher matches tool name** — `"matcher": "Bash"` fires for the Bash tool
   (exact string match). Can further narrow with `if: "Bash(...)"` permission
   syntax, but a plain `"Bash"` matcher + in-script command inspection is what
   we use.
2. **settings.json changes take effect immediately** — file watcher picks up
   hook edits, no session restart. (Good: install works mid-session; also means
   the gate will be live for THIS repo's own dogfood commits once merged.)
3. **Fail-open shape is correct** — exit 0 with NO stdout = "defer to normal
   permission flow" (NOT auto-approve, but also NOT block). So our fail-open
   path (`sys.exit(0)` silently) correctly lets the commit proceed through the
   user's normal permission settings. Only `permissionDecision:"deny"` (or exit
   2) blocks.

## Critical caveat for OTHER children

**exit-0 stderr is NOT fed to the model.** stderr is only surfaced to Claude on
**exit 2** (blocking error). This affects `cleanup-warn-refs` F6: a warning
printed to stderr with `sys.exit(0)` may NOT reach the model/user in Claude Code.

- Implication for F6: to make the "context dropped" warning actually visible,
  either (a) exit 2 (but that BLOCKS the sub-agent dispatch — undesirable, the
  agent has a fallback path and should still run), or (b) accept that the
  warning lands in the hook debug/output log only, not inline. 
- **Recommendation recorded for cleanup-warn-refs:** keep `sys.exit(0)` (must
  not block dispatch) and document that the warning is best-effort (log-level),
  OR emit the warning as an `additionalContext` via the allow path if the
  PreToolUse output schema supports injecting context alongside allow. Revisit
  when planning that child's implementation — do NOT assume stderr is visible.

## Decision-approach constraint

Cannot mix approaches: either (exit 0 + JSON) OR (exit 2 + stderr). The
commit-gate uses **exit 0 + JSON** exclusively (deny JSON to block, silent exit
0 to defer). Never exit 2 from the gate (would block via error path and ignore
our reason JSON).

## Probe method

A throwaway `_probe_gate.py` produced the deny JSON above for a `git commit`
command and empty output for `echo hi`; JSON shape validated against the
documented contract. The probe was NOT wired into live settings (that would
block this session's own commits); the contract is authoritative from docs +
shape-verified locally. Probe discarded.
