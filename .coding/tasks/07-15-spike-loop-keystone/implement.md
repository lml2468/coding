# Implement — Spike + Loop-State Keystone

## Part A — spike (do FIRST, discard after)
- [ ] Write throwaway `.claude/hooks/_probe_gate.py` (deny on `git commit`).
- [ ] Add temporary PreToolUse Bash matcher to `.claude/settings.json` (live only).
- [ ] Attempt a real `git commit`; observe block/allow. Try both output schemas
  (`permissionDecision:"deny"` and legacy `decision:"block"`) if the first fails.
- [ ] Write `research/gate-mechanism.md` with the working contract + quirks.
- [ ] **Decision gate:** if deny works → proceed to Part B. If NOT → stop, tell
  the user `loop-core-gate` needs redesign, keep Part B (keystone still useful).
- [ ] Remove `_probe_gate.py` and its settings entry.
- **Verify:** `grep _probe_gate .claude/settings.json` returns nothing.

## Part B — keystone
### 1. set-check writer
- [ ] `cmd_set_check` in `task_store.py`; subparser in `task.py`.
- **Verify:** AC2/AC3/AC4 commands below.

### 2. Docs (DUAL-WRITE)
- [ ] `find packages/cli/src/templates -name task_store.py` — confirm scripts
  dual-write need; edit true source (+ template if present).
- [ ] `coding-check.md` set-check instruction — `.claude/agents/` +
  `templates/claude/agents/`.
- [ ] `continue.md` 3 routes — `.claude/commands/coding/` +
  `templates/common/commands/`.
- **Verify:** `diff` each pair.

### 3. Build
- [ ] `pnpm build`; `task.py --help | grep set-check`.

## Validation
```bash
T=.coding/tasks/07-15-spike-loop-keystone
python3 ./.coding/scripts/task.py set-check fail
python3 -c "import json;m=json.load(open('$T/task.json'))['meta']['loop'];print(m['check_status'],m['iteration_count'])"  # fail 1
python3 ./.coding/scripts/task.py set-check fail
python3 ./.coding/scripts/task.py set-check pass
python3 -c "import json;m=json.load(open('$T/task.json'))['meta']['loop'];print(m['check_status'],m['iteration_count'])"  # pass 0
grep -c "break-loop" .claude/commands/coding/continue.md   # >=1
diff .claude/agents/coding-check.md packages/cli/src/templates/claude/agents/coding-check.md
diff .claude/commands/coding/continue.md packages/cli/src/templates/common/commands/continue.md
pnpm build && python3 ./.coding/scripts/task.py --help | grep set-check
```
> Leave this task's meta.loop at `pass` after AC runs (so its own commit isn't
> blocked once loop-core-gate is active).

## Rollback points
- ⏪ Probe: always remove (throwaway).
- ⏪ Writer wrong: revert task_store.py + task.py.
- ⏪ Doc parity broken: revert both copies.
