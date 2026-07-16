# Design — 修复 active-task 会话生命周期

父任务：`07-16-fix-loop-engine-defects` · 对应 #5 #6

> 源在 `packages/cli/src/templates/coding/scripts/`。改 `common/active_task.py` + `task.py`。

## 关键真相（探查确证，决定方案安全性）

**`last_seen_at` 只在 `set_active_task`（start/create）写，resolve/statusline/hook 都不刷新**（`active_task.py:375` 经 `_context_metadata`，仅 `:405` 调用）。因此：**朴素的按 `last_seen_at`/mtime 老化的 TTL 会误删仍活跃但只读的 session 指针**。这是 #5 的载重风险，必须先解决"读时刷新"才能安全上 TTL。

## 决策

| # | 决策 | 方案 |
|---|---|---|
| #6 | finish 清错文件 | `clear_active_task` 用 `previous.context_key or context_key` 定位实际解析到的文件（覆盖 fallback 路径） |
| #5-a | TTL 安全前提 | `resolve_active_task` 在按 context_key 解析成功时**节流刷新** `last_seen_at`（>60s 才重写），使活跃指针保鲜 |
| #5-b | TTL 清理 | 惰性清理（resolve 时）+ 显式 `task.py prune-sessions`（可测/手动）；TTL=7 天；**排除当前 context_key 文件**；`last_seen_at` 缺失/不可解析→保留 |
| #4-c | 原子写 | `active_task._write_json`（`:262-271` 直接 write_text）改为委托 `common/io.py:write_json`（temp+os.replace） |

## #6 — finish fallback 修复（探查确证）

- 现状：`cmd_finish`→`clear_active_task`（`active_task.py:413-427`）。`context_path` 用 `_context_path(repo_root, context_key)`（:424），即当前解析的 key。但 `previous` 可能来自 single-session fallback（`:326→333-355`），其真实文件 stem = `previous.context_key`（`:355` 已填）。二者不同→删错文件→指针存活→`cmd_finish` 仍打印 `✓ Cleared`。
- 修复（`:424`）：
  ```python
  target_key = previous.context_key or context_key
  context_path = _context_path(repo_root, target_key)
  ```
  `ActiveTask.context_key` 在 session（:322）与 session-fallback（:355）两路径都已填，覆盖两种情形，无新增管道。
- 备选（更激进）：`clear_active_task` 调 `clear_task_from_sessions(previous.task_path)` 按任务清。会连带清其他窗口指针——archive 想要的行为，但 finish 不该这么宽。**不采用**，保多窗口隔离。

## #5 — TTL 清理（三重防误删守卫，缺一不可）

1. **读时刷新**：`resolve_active_task`（`:319-324`）按 context_key 解析成功后，若文件 `last_seen_at` 早于 60s 则 `os.utime` 或重写。使活跃（含只读）session 保鲜。
2. **排除当前文件**：任何 prune pass 不删当前 `context_key`（及刚解析的 fallback 文件）。
3. **缺失即保留**：`last_seen_at` 缺失/不可解析→keep（兼容旧代码写的无该字段的指针）。

- TTL 常量：`SESSION_TTL_DAYS = 7`，置于 `active_task.py` 顶部便于覆盖。
- 惰性清理：resolve 时顺带 prune 老化兄弟文件；节流以免每 tick 都扫（可用"当前 mtime 距上次 prune"或简单每次扫但仅 unlink 命中项）。
- 显式命令：`task.py prune-sessions`（新 `cmd_prune_sessions`）——确定性入口，便于 vitest 断言与手动恢复。
- 并发：无锁，靠"排除当前文件 + 7d 大窗口 + unlink 失败当 no-op"化解 TOCTOU。

## #4-c（并入本 child）— 原子写

`active_task._write_json`（`:262-271`）直接 `write_text` 非原子；仓库已有 `common/io.py:write_json`（temp+os.replace）。改为委托，避免 TTL/prune 增写者后崩溃截断指针（`_read_json` 吞 JSONDecodeError 返回 `{}`→active task 静默消失）。

> 注：这原是 review #16/#8 的原子性关切在指针层的体现，与 #5 强相关（多写者），故并入本 child 而非留作 P2。

## 影响面

- `common/active_task.py`：`clear_active_task`（#6）、`resolve_active_task`（#5 刷新+惰性 prune）、新 `prune_sessions` helper + `SESSION_TTL_DAYS`、`_write_json`（#4-c）。
- `task.py`：新 `cmd_prune_sessions` + subparser + dispatch（mirror `:451-452`/`:496`）。
- 测试：`packages/cli/test/regression.test.ts`。

## 测试策略（探查给出可 mirror 模式）

mirror `regression.test.ts` helpers（`:1014-1136`），precedent `:1542-1591`（多指针选择性清理）：
- #6：`[session-lifecycle] finish clears fallback-resolved pointer`——写单个 `only-session.json`（有 current_task），`CODING_CONTEXT_ID=ghost`（无 ghost.json）触发 fallback，跑 `task.py finish`，断言 `only-session.json` 被删。
- #5：写多个 `sessions/*.json`，部分 `last_seen_at` 超 7d、一个当前 context 文件保鲜，跑 `task.py prune-sessions`，断言老化的删、活跃+当前的留。用**显式 last_seen_at 字符串**而非 mtime。
- #5 不误删：两个都在 TTL 内 → prune 后都在。
