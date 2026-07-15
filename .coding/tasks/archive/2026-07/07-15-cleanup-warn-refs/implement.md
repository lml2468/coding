# Implement — Cleanup: Warning + Dangling Refs

Two commits in one task: (1) F6 warning, (2) F7 dangling refs.

## Commit 1 — F6 warning (DUAL-WRITE)
- [ ] Add the two `additionalContext` warning emitters (exit 0 + stdout JSON,
  NOT stderr, NOT exit 2) to `inject-subagent-context.py` per design.md.
- [ ] Probe first: confirm whether `additionalContext` is honored WITHOUT an
  accompanying `permissionDecision`; if not, use the explicit-`allow` form.
- [ ] Mirror to `templates/shared-hooks/inject-subagent-context.py`.
- **Verify:** AC1/AC2/AC3 payloads; `diff` copies.

## Commit 2 — F7 dangling refs
- [ ] F7.1: remove `/coding:start` bullet in `init.ts` `getJoinerPrdContent`.
- [ ] F7.2: generalize `mcp__exa__*` in both hook copies (keep search guidance).
- **Verify:** AC4/AC5/AC6.

## Build
- [ ] `pnpm build`.

## Validation
```bash
H=.claude/hooks/inject-subagent-context.py
ctx(){ python3 -c "import sys,json;print(json.load(sys.stdin)['hookSpecificOutput'].get('additionalContext','').lower())"; }
# F6 — AC1: no-task check → additionalContext mentions active task (stdout, exit 0)
echo '{"tool_name":"Task","tool_input":{"subagent_type":"coding-check","prompt":"x"},"cwd":"/tmp"}' | python3 $H | ctx | grep -q "active task" && echo AC1_OK
# AC2: research, no task → no additionalContext warning
echo '{"tool_name":"Task","tool_input":{"subagent_type":"coding-research","prompt":"x"},"cwd":"/tmp"}' | python3 $H | ctx | grep -q "active task" && echo AC2_BAD || echo AC2_OK
# AC3: normal case → normal updatedInput, no warning context
echo '{"tool_name":"Task","tool_input":{"subagent_type":"coding-check","prompt":"x"},"cwd":"'$PWD'"}' | python3 $H 1>/tmp/o; grep -q updatedInput /tmp/o && ! (cat /tmp/o | ctx | grep -q "active task") && echo AC3_OK
# F7
grep -rn "coding:start" packages/cli/src/ && echo AC4_BAD || echo AC4_OK
grep -rn "mcp__exa" .claude/hooks packages/cli/src/templates/shared-hooks && echo AC5_BAD || echo AC5_OK
grep -qi "glob\|grep" <(python3 $H <<<'{"tool_name":"Task","tool_input":{"subagent_type":"coding-research","prompt":"x"},"cwd":"'$PWD'"}') && echo AC6_OK
diff .claude/hooks/inject-subagent-context.py packages/cli/src/templates/shared-hooks/inject-subagent-context.py && echo PARITY_OK
pnpm build
```
> AC3 assumes this task is active with curated jsonl so injection succeeds.
> Note: AC1 no-task case emits `additionalContext` — confirm this does NOT also
> block the dispatch (the JSON must let the Task proceed).

## Rollback points
- ⏪ F6: revert both hook copies.
- ⏪ F7: restore init.ts bullet / exa names.
