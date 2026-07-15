# Design — Finish Path (F3 + F4 + F5)

## Prerequisite
Spike merged: `meta.loop` + `set-check`, and `coding-check.md` already has the
authoritative `set-check pass|fail` sentence keyed to lint+typecheck (F4 amends
it to add tests).

## Edit surfaces (all dual-write unless noted)
- `inject-subagent-context.py` (shared-hooks + live): F3.2 trigger, F4 prompt
  wording, F5 finish table — ONE pass over `build_check_prompt`/`build_finish_prompt`
  + `main()`.
- `coding-check.md`, `coding-implement.md` (claude/agents): F4 tests.
- `continue.md` (common/commands), `workflow.md` (coding/): F3.1 `[finish]` dispatch.
- `coding-brainstorm` skill (common/skills): F5.1.
- `task_store.py` `_default_prd_content` (scripts — `find` template path): F5.2.
- `README.md`, `README_CN.md` (root, single copy): F4 — verify claims now true;
  soften only as fallback if in-agent test runs prove impractical.

## Key logic change (F3.2) — the only code branch
In `main()`:
```python
is_finish_phase = "[finish]" in original_prompt.lower()
if not is_finish_phase and subagent_type == AGENT_CHECK and task_dir:
    is_finish_phase = _check_status_is_pass(repo_root, task_dir)
```
Helper `_check_status_is_pass`: read task.json →
`meta.loop.check_status == "pass"`; any error → False.

## Prompt/doc edits (no other logic)
- `build_check_prompt` step 4 → "...lint, typecheck, and project tests".
- `build_finish_prompt` step 4 → same + new step: "For each AC in prd.md, run it
  if executable; render `| AC | check | result |`; mark non-executable manual."
- `coding-check.md` Step 4 → add tests + discovery/skip; amend set-check sentence
  to lint+typecheck+tests. `coding-implement.md` Verify → mention tests.
- `continue.md` `check passed → 3.3` + `workflow.md` §2.2 final pass → "dispatch
  final `coding-check` with `[finish]`".
- brainstorm skill AC guidance; `_default_prd_content` AC seed example.

## Test-command discovery (agent prose)
package.json scripts.test → pytest/pyproject → Makefile test → else explicit
"no test command found — skipped".

## Ordering / interactions
- After spike (meta.loop; set-check sentence).
- Self-contained for F3+F4+F5 — no other child touches these functions after this.

## Tradeoffs
- Nudge not gate for AC (don't break lightweight/doc tasks).
- Full-suite test runs can be slow; mid-loop may scope to affected package
  (agent judgment); final pass runs full. Documented.

## Rollback
Revert the one logic branch + doc/prompt sentences + prd seed. prd seed only
affects new tasks.
