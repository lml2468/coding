# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | To fill |
| [Database Guidelines](./database-guidelines.md) | ORM patterns, queries, migrations | To fill |
| [Error Handling](./error-handling.md) | Error types, handling strategies | To fill |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | To fill |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | To fill |
| [Hook Contracts](./hook-contracts.md) | Claude Code PreToolUse decision contract, exit-0 stderr gotcha, shared-hook registration surfaces | Filled |

---

## task.json runtime state: `meta.loop`

The execution loop stores check state in the active task's `task.json` under the
free-form `meta` object (NOT the gitignored `.coding/.runtime/sessions/*.json`,
which are per-window and ephemeral). Written by `task.py set-check <pass|fail>`.

Shape:
```json
{ "check_status": "pass" | "fail" | "unknown",
  "iteration_count": 0,
  "last_check_at": "2026-07-15T12:24:07Z" }
```
- `set-check fail` → `check_status="fail"`, `iteration_count += 1`.
- `set-check pass` → `check_status="pass"`, `iteration_count = 0`.
- Absent `meta.loop` reads as `check_status="unknown"`, `iteration_count=0`
  (back-compat for tasks created before this field existed).
- `meta` is the LAST field in the canonical `task.json` order
  (`packages/core/src/task/schema.ts` `TASK_RECORD_FIELD_ORDER`), so mutating
  keys inside it preserves field order — no `packages/core` schema change needed.

Consumers: `/coding:continue` routing (fail→re-implement, ≥3→break-loop,
pass→3.3) and the commit gate (denies commit while `in_progress` and
`check_status != "pass"`).

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
