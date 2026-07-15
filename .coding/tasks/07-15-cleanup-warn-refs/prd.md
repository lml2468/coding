# PRD — Cleanup: Concurrent-Context Warning + Dangling Refs

Child of `07-15-loop-engineering-hardening`. **Last.** Two small, independent,
low-risk findings (F6, F7) grouped because both are quick and touch
`inject-subagent-context.py`.

## F6 — Warn instead of silently dropping sub-agent context

`inject-subagent-context.py:594-600`: when an implement/check sub-agent is
dispatched but the active task can't resolve (e.g. `active_task.py:333-355`
returns None for ≥2 session files), the hook does `sys.exit(0)` silently → the
sub-agent runs with no prd/spec and nobody is told.
- R6.1: before each `sys.exit(0)` in the `AGENTS_REQUIRE_TASK` branch, emit a
  warning that is **actually visible to the model**. Per the spike finding
  (`spike-loop-keystone/research/gate-mechanism.md`), exit-0 stderr is NOT fed to
  the model in Claude Code — so use `hookSpecificOutput.additionalContext` (a
  non-blocking system-reminder injected into context) on exit 0, NOT stderr, and
  NOT exit 2 (which would block the dispatch). Two distinct messages
  (`not task_dir` vs `not exists`). See design.md for the exact JSON + the
  explicit-allow behavior note.
- R6.2: warning only — still `exit 0`, must NOT block the dispatch (the agent's
  `Active task:` fallback path takes over).
- R6.3: research agent (not in `AGENTS_REQUIRE_TASK`) must not warn.
- R6.4: after kill-switch check.

## F7 — Remove dangling references

- R7.1: `init.ts` `getJoinerPrdContent` (~line 671) references `/coding:start`,
  which does not exist. Remove/replace. Verify no other real source references it.
- R7.2: `inject-subagent-context.py` (~468, 513-514, both copies) hardcodes
  `mcp__exa__web_search_exa` / `mcp__exa__get_code_context_exa`, unconfigured in
  this repo. Generalize ("a web-search MCP tool, if configured") or drop the tool
  names. Keep `coding-research.md` frontmatter `tools: ... mcp__*` wildcard (not
  a false claim). Research agent must still work without exa.

## Constraints

- DUAL-WRITE: `inject-subagent-context.py` (shared-hooks + live) for F6 & F7.2.
  `init.ts` is single-source. README single-source.
- F6 emits `additionalContext` via stdout JSON on exit 0 (the model-visible,
  non-blocking channel) — NOT stderr (invisible on exit 0), NOT exit 2 (blocks).
- Do not change the multi-session fallback in `active_task.py` (deliberate
  isolation contract) — only surface the condition.

## Acceptance Criteria

- [ ] AC1 (executable): `coding-check` payload with `cwd:/tmp` (no task) → exit 0
  + stdout JSON `hookSpecificOutput.additionalContext` contains "active task"
  (case-insensitive). Verify:
  `... | python3 -c "import sys,json;print('active task' in json.load(sys.stdin)['hookSpecificOutput'].get('additionalContext','').lower())"` → True.
- [ ] AC2 (executable): `coding-research` payload, no task → no warning /
  no additionalContext, exit 0.
- [ ] AC3 (executable): normal case (task resolves) → normal `updatedInput`
  emitted, no warning additionalContext.
- [ ] AC4 (executable): `grep -rn "coding:start" packages/cli/src/` → nothing.
- [ ] AC5 (executable): `grep -rn "mcp__exa" .claude/hooks packages/cli/src/templates/shared-hooks`
  → nothing (or only generalized non-tool-name mention).
- [ ] AC6: research prompt still has its Glob/Grep/Read search-guidance section;
  both hook copies diff-clean; `pnpm build` passes.

## Out of scope

- Adding/ documenting exa MCP support.
- Changing `active_task.py` resolution.
