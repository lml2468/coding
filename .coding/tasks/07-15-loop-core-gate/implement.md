# Implement — Loop Core: Commit Gate

**Prerequisite: `spike-loop-keystone` merged.** Read its
`research/gate-mechanism.md` and use the verified deny contract.

## 1. Write the hook
- [ ] `templates/shared-hooks/inject-commit-gate.py` — fail-open logic + Windows
  UTF-8 guard + kill-switch parity + verified deny output.
- [ ] Copy identically to `.claude/hooks/inject-commit-gate.py`.
- **Verify:** AC1/AC3/AC4/AC5 payloads.

## 2. Register in TS index
- [ ] `shared-hooks/index.ts`: add `"inject-commit-gate.py"` to `SharedHookName`
  union AND `SHARED_HOOKS_BY_PLATFORM.claude`.
- **Verify:** `pnpm build` typechecks.

## 3. Settings binding (DUAL-WRITE, placeholder-aware)
- [ ] `.claude/settings.json`: PreToolUse matcher `Bash`, command
  `python3 .claude/hooks/inject-commit-gate.py`, timeout 15.
- [ ] `templates/claude/settings.json`: same, `{{PYTHON_CMD}}`.
- **Verify:** `diff` → only `{{PYTHON_CMD}}` vs `python3` differs.

## 4. Build
- [ ] `pnpm build`.

## Validation
```bash
H=.claude/hooks/inject-commit-gate.py
python3 ./.coding/scripts/task.py set-check fail
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"'$PWD'"}' | python3 $H | grep -qi deny && echo AC1_OK
python3 ./.coding/scripts/task.py set-check pass
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"'$PWD'"}' | python3 $H | grep -qi deny && echo AC2_BAD || echo AC2_OK
echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"},"cwd":"'$PWD'"}' | python3 $H | grep -qi deny && echo AC3_BAD || echo AC3_OK
CODING_HOOKS=0 sh -c "echo '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m x\"},\"cwd\":\"$PWD\"}' | python3 $H" | grep -qi deny && echo AC4_BAD || echo AC4_OK
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"/tmp"}' | python3 $H | grep -qi deny && echo AC5_BAD || echo AC5_OK
diff .claude/settings.json packages/cli/src/templates/claude/settings.json
grep -c inject-commit-gate packages/cli/src/templates/shared-hooks/index.ts   # >=2
pnpm build
```
> End-to-end (real commit block) validation: exercise via the actual Bash tool
> per the spike's method — the payload tests above cover the hook's decision;
> the spike already proved Claude Code honors the deny.
> Leave meta.loop at `pass` after AC runs.

## Rollback points
- ⏪ Logic wrong: fix hook only.
- ⏪ Settings diverge: revert BOTH; never leave live/template out of parity.
