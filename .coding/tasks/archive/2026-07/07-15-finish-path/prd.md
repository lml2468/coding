# PRD — Finish Path: Activate + Tests + Executable AC

Child of `07-15-loop-engineering-hardening`. **Third.** Combines findings
F3+F4+F5 because all three touch the same surfaces (`build_finish_prompt`,
`build_check_prompt`, verification wording) — doing them together avoids the
serial "edit-then-amend the same function" chain the 8-child split created.
Depends on the spike (uses `meta.loop.check_status` for the F3 trigger and the
authoritative `set-check` wording it added to `coding-check.md`).

## F3 — Activate the dead `[finish]` path

The finish prompt (`inject-subagent-context.py:386-425`, selected at `:602` by
`"[finish]" in prompt`) is dead — nothing emits the marker.
- R3.1: emit `[finish]` where the final check is dispatched — workflow §2.2 final
  pass + `continue.md` `check passed → 3.3` route.
- R3.2: belt-and-suspenders — also load finish context when
  `meta.loop.check_status == "pass"` (loop already green ⇒ next check is the final
  pass), keeping `[finish]` as explicit override.

## F4 — Tests in verification

README (`README.md:58,67`, `README_CN.md:58,67`) claims check runs tests; agents
run only lint+typecheck. Align implementation to the promise.
- R4.1: `coding-check.md` Step 4 + `build_check_prompt`/`build_finish_prompt`
  workflows instruct running the project test command after lint/typecheck.
- R4.2: `set-check pass` only when lint+typecheck+**tests** pass (amend the
  authoritative sentence the spike added to `coding-check.md`).
- R4.3: test-command discovery with explicit skip ("no test command found —
  skipped"), no invented commands. `coding-implement.md` Verify mentions tests too.

## F5 — Machine-checkable acceptance criteria

- R5.1: `coding-brainstorm` guidance — write verifiable AC, ≥1 executable check
  when the task has a runtime surface.
- R5.2: `task_store.py:_default_prd_content` seeds an `(executable)` AC example.
- R5.3: `build_finish_prompt` instructs rendering a per-AC pass/fail table
  (`| AC | check | result |`; non-executable marked manual). Nudge, not gate —
  do NOT block `task.py start` on AC form.

## Constraints

- DUAL-WRITE: `inject-subagent-context.py` (shared-hooks), `coding-check.md` +
  `coding-implement.md` (claude/agents), `continue.md` (common/commands),
  `workflow.md` (coding/), `coding-brainstorm` skill (common/skills), scripts
  (`find` template path first). README/README_CN are single-copy root files.
- One coherent edit of `build_finish_prompt`/`build_check_prompt` covering F3+F4+F5
  — no re-amend.
- F3.2 depends on the spike's `meta.loop`; fail toward regular check if absent.

## Acceptance Criteria

- [ ] AC1 (executable): `coding-check` Task payload with `[finish]` → injected
  prompt starts with `# Finish Agent Task`.
- [ ] AC2 (executable): no marker + `meta.loop.check_status=pass` → Finish prompt.
- [ ] AC3 (executable): no marker + fail/unknown → `# Check Agent Task`.
- [ ] AC4: `build_check_prompt` + `build_finish_prompt` (both hook copies) mention
  running tests; `coding-check.md` set-check sentence now says lint+typecheck+tests.
- [ ] AC5 (executable): fresh `task.py create` → prd.md AC section has an
  "(executable)" example (throwaway task, then delete).
- [ ] AC6: `build_finish_prompt` instructs the per-AC pass/fail table; brainstorm
  guidance present.
- [ ] AC7: all dual-write pairs diff-clean except intended; `workflow.md` +
  `continue.md` instruct `[finish]` dispatch; README claims now supported;
  `pnpm build` passes.

## Out of scope

- A hook that enforces AC pass/fail (finish check renders; gate/human decides).
- F8 completed-state (deferred at parent level).
