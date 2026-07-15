# Implement — Finish Path (F3 + F4 + F5)

**After spike.** One coherent pass — no re-amend of the same function later.

## 0. Confirm scripts template path
- [ ] `find packages/cli/src/templates -name task_store.py` (for F5.2 dual-write).

## 1. Hook: F3.2 trigger + F4 wording + F5 table (DUAL-WRITE)
- [ ] `inject-subagent-context.py`: add `_check_status_is_pass` + extend
  `is_finish_phase`; add "project tests" to `build_check_prompt` &
  `build_finish_prompt` step 4; add per-AC table step to `build_finish_prompt`.
- [ ] Mirror to `templates/shared-hooks/inject-subagent-context.py`.
- **Verify:** AC1/AC2/AC3 payloads; `diff` copies.

## 2. Agents (DUAL-WRITE)
- [ ] `coding-check.md`: Step 4 add tests + discovery/skip; amend set-check
  sentence → lint+typecheck+tests. Both copies.
- [ ] `coding-implement.md`: Verify mentions tests. Both copies.
- **Verify:** `diff` each pair.

## 3. Routing docs (DUAL-WRITE)
- [ ] `continue.md` + `workflow.md`: final check dispatched with `[finish]`.
  Both copies each.
- **Verify:** `diff` each pair.

## 4. Brainstorm + prd seed
- [ ] brainstorm skill AC guidance (both copies).
- [ ] `_default_prd_content` AC `(executable)` seed (true source + template).
- **Verify:** AC5 throwaway-task grep.

## 5. README accuracy
- [ ] Confirm `README.md`/`README_CN.md` test claims now supported; fallback
  soften if needed (document reason).

## 6. Build
- [ ] `pnpm build`.

## Validation
```bash
H=.claude/hooks/inject-subagent-context.py
FIN='{"tool_name":"Task","tool_input":{"subagent_type":"coding-check","prompt":"[finish] x"},"cwd":"'$PWD'"}'
PL='{"tool_name":"Task","tool_input":{"subagent_type":"coding-check","prompt":"x"},"cwd":"'$PWD'"}'
chk(){ python3 -c "import sys,json;p=json.load(sys.stdin)['hookSpecificOutput']['updatedInput']['prompt'];print('FIN' if p.startswith('# Finish Agent Task') else 'CHK')"; }
echo "$FIN" | python3 $H | chk   # AC1 FIN
python3 ./.coding/scripts/task.py set-check pass; echo "$PL" | python3 $H | chk   # AC2 FIN
python3 ./.coding/scripts/task.py set-check fail; echo "$PL" | python3 $H | chk   # AC3 CHK
# AC5
python3 ./.coding/scripts/task.py create "ac probe" --slug ac-probe >/dev/null 2>&1
grep -q executable .coding/tasks/*ac-probe*/prd.md && echo AC5_OK; rm -rf .coding/tasks/*ac-probe*
# parity
for f in coding-check.md coding-implement.md; do diff .claude/agents/$f packages/cli/src/templates/claude/agents/$f; done
diff .claude/hooks/inject-subagent-context.py packages/cli/src/templates/shared-hooks/inject-subagent-context.py
diff .coding/workflow.md packages/cli/src/templates/coding/workflow.md
diff .claude/commands/coding/continue.md packages/cli/src/templates/common/commands/continue.md
grep -n test README.md README_CN.md
pnpm build
```
> AC2/AC3 mutate this task's loop state — reset to `pass` after. Fully remove the
> ac-probe throwaway task.

## Rollback points
- ⏪ Hook branch wrong: revert both hook copies.
- ⏪ Any doc pair diverges: revert both copies of that file.
