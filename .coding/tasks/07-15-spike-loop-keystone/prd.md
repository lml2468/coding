# PRD — Spike: Verify Gate Mechanism + Land Loop-State Keystone

Child of `07-15-loop-engineering-hardening`. **FIRST. Gates all other children.**

## Why this is a spike, not just a feature

The entire commit-gate design (`loop-core-gate`) rests on one unverified
assumption: that a Claude Code `PreToolUse` hook matching `Bash` can return
`permissionDecision:"deny"` and actually **stop** a `git commit`. Loop
engineering says verify the load-bearing assumption before building on it. This
task proves the mechanism with a throwaway probe, THEN lands the durable
keystone (`meta.loop` + `set-check`) that both the gate and the finish-path
depend on. If the deny mechanism does not work as assumed, we learn it here and
redesign the gate — cheaply.

## Part A — Spike (verify, then discard the probe)

A1. Write a minimal throwaway `PreToolUse(Bash)` hook that denies any command
containing `git commit`, register it, and confirm empirically whether Claude
Code blocks the commit. Capture the exact output contract that works
(`permissionDecision` vs `decision`, field names, stderr behavior).

A2. Record the verified contract in this task's `research/` so `loop-core-gate`
builds on fact, not assumption. Remove the throwaway hook after.

A3. If deny does NOT work: document the actual behavior and STOP before Part B's
dependents — surface to the user that `loop-core-gate` needs redesign (e.g.
warn-only, or a different event).

## Part B — Keystone (durable, kept)

B1. **State location:** `task.json.meta.loop` (existing free-form `meta`,
`schema.ts:37`), NOT the gitignored runtime session files. Shape:
`{ "check_status": "pass"|"fail"|"unknown", "iteration_count": int, "last_check_at": ISO8601 }`.

B2. **Writer:** `task.py set-check <pass|fail>` on the active task —
`fail` → status=fail, iteration_count += 1; `pass` → status=pass,
iteration_count = 0; both stamp `last_check_at`. Fail-safe: no active task /
identity → stderr + exit 1, no write. Absent `meta.loop` reads as unknown/0.

B3. **Check-agent wiring (DUAL-WRITE):** `coding-check.md` tells the agent to
call `set-check pass` only when verification passes, else `set-check fail`. This
is the single authoritative statement (finish-path will later amend it to add
"tests").

B4. **Routing (DUAL-WRITE):** `continue.md` gains: `check_status=fail` →
re-implement (2.1); `iteration_count >= 3` → `coding-break-loop`;
`check_status=pass` → 3.3/3.4.

## Constraints

- DUAL-WRITE: `coding-check.md` (`templates/claude/agents/`), `continue.md`
  (`templates/common/commands/`), scripts (`task_store.py`/`task.py` — `find`
  template path first).
- No `packages/core` schema change (reuse `meta`).

## Acceptance Criteria

- [ ] AC1 (spike, executable): a documented probe run shows whether
  `PreToolUse(Bash)` deny blocks `git commit`; the working output contract is
  written to `research/gate-mechanism.md`. Probe hook removed after.
- [ ] AC2 (executable): `task.py set-check fail` → task.json
  `meta.loop.check_status=="fail"`, `iteration_count==1`.
- [ ] AC3 (executable): `set-check fail` again → count 2; `set-check pass` →
  status `pass`, count 0.
- [ ] AC4 (executable): `set-check` with no active task → exit non-zero, task.json
  unchanged.
- [ ] AC5: `continue.md` (both copies) has the 3 routes; `coding-check.md` (both
  copies) has the set-check instruction.
- [ ] AC6: `pnpm build` passes; `task.py --help` lists `set-check`.

## Out of scope

- The real commit-gate hook (that is `loop-core-gate`, unblocked by AC1).
- Test execution in the check verb (that is `finish-path`).
