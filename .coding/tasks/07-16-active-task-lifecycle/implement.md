# Implement — 修复 active-task 会话生命周期

父任务：`07-16-fix-loop-engine-defects` · #5 #6 (+#4-c 原子写)

> 源在 `packages/cli/src/templates/coding/scripts/`。改完 `pnpm build` + `coding update` 部署验证。
> **与 child 1 串行**：都碰 `active_task.py` 生态。谁后做谁 rebase。

## 执行顺序

### 1. #6 — finish 清实际解析文件 `→ verify: 测试`
- [ ] `common/active_task.py` `clear_active_task`（约 :424）：将 `context_path = _context_path(repo_root, context_key)` 改为
  ```python
  target_key = previous.context_key or context_key
  context_path = _context_path(repo_root, target_key)
  ```
  （`previous` 已在 :423 求得）。
- verify: 测试步骤 5 的 #6 用例。

### 2. #4-c — 原子写指针 `→ verify: pnpm test 不回归`
- [ ] `common/active_task.py` `_write_json`（:262-271）：改为委托 `from common.io import write_json` 并调用之（temp+os.replace），或就地镜像其 mkstemp+os.replace。移除直接 `write_text`。
- [ ] 确认所有 `_write_json` 调用点签名不变。

### 3. #5-a — 读时节流刷新 last_seen_at `→ verify: 测试不误删`
- [ ] `common/active_task.py` 顶部加 `SESSION_TTL_DAYS = 7`。
- [ ] `resolve_active_task`（:319-324）按 context_key 解析成功后：读该文件 `last_seen_at`，若早于 60s（或缺失）→ 刷新（`os.utime` 文件 + 写回 `last_seen_at`，走原子写）。节流避免每 tick 写。

### 4. #5-b — 惰性 prune + 显式命令 `→ verify: 测试`
- [ ] 新 helper `prune_sessions(repo_root, *, exclude_key)`：扫 `*.json`，对每个：`last_seen_at` 缺失/不可解析→keep；stem == exclude_key→keep；age > SESSION_TTL_DAYS→`_remove_file`。返回删除计数。
- [ ] `resolve_active_task` 内在解析出 context_key 后调用 `prune_sessions(exclude_key=context_key)`（惰性；失败静默）。
- [ ] `task.py`：新 `cmd_prune_sessions`（打印删除数）+ subparser `prune-sessions` + dispatch（mirror `:451-452`/`:496`）。
- verify: 测试步骤 5。

### 5. 测试 `→ verify: pnpm test`
mirror `regression.test.ts`（helpers `:1014-1136`，precedent `:1542-1591`）：
- [ ] `[session-lifecycle] finish clears fallback-resolved pointer`（#6）：单 `only-session.json`（有 current_task），`CODING_CONTEXT_ID=ghost`（无 ghost.json），跑 `task.py finish`，断言 `only-session.json` 被删、输出不谎报。
- [ ] `[session-lifecycle] prune removes aged, keeps fresh+current`（#5）：写 `aged.json`（last_seen_at 超 7d）、`fresh.json`（近期）、`cur.json`（当前 context），`CODING_CONTEXT_ID=cur` 跑 `task.py prune-sessions`，断言仅 aged 被删。
- [ ] `[session-lifecycle] prune keeps all within TTL`（#5 不误删）：两个都在 TTL 内 → 都留。
- [ ] `[session-lifecycle] resolve refreshes last_seen_at`（#5-a，可选）：老化的当前 context 文件在 resolve 后 last_seen_at 被刷新，不被同轮 prune 删。

### 6. 部署 + 全量验证 `→ verify: AC1-AC5`
- [ ] `pnpm build && node packages/cli/dist/cli/index.js update`
- [ ] `pnpm --filter @limenglin/coding test` 退出码 0
- [ ] 逐条核对 prd AC1-AC5。

## Rollback / 风险
- #5 误删活跃指针是最高风险 → 三重守卫（读时刷新 / 排除当前 / 缺失即保留）+ 显式命令便于观察。测试专测"不误删"。
- 每步独立可 `git checkout` 回滚。原子写改动小且有 io.py 现成实现兜底。
