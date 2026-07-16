# 修复 active-task 会话生命周期

父任务：`07-16-fix-loop-engine-defects`

## Goal

消除多 session 长期运行下 active-task 指针的累积性劣化：指针泄漏导致 single-session fallback 永久失效（#5），以及 `finish` 在 fallback 路径下不删实际指针却谎报"已清除"（#6）。

## 源码位置

- 指针解析/读写：`packages/cli/src/templates/coding/scripts/common/active_task.py`
- finish 命令：`packages/cli/src/templates/coding/scripts/task.py`（`cmd_finish`）
- 测试：`packages/cli/test/`（vitest 通过驱动脚本或直接断言 runtime 文件）

## 背景与复现（review #5 #6）

- **#5（HIGH）**：session 指针在 `start`/`create` 时创建（`set_active_task`），只在显式 `finish`/`archive` 时删除。任何异常退出（崩溃、关窗、`--continue`）永久泄漏一个 `.coding/.runtime/sessions/*.json`。子 agent 的 single-session fallback 只在"恰好一个 session 文件"时生效（`active_task.py:333-355`）；累积 ≥2 个僵尸指针后 fallback 永久返回 None，不继承父 session id 的子 agent 静默丢失 active task。`_context_metadata` 已写 `last_seen_at`（`active_task.py:375`）但从未用于 TTL 清理。
- **#6（HIGH）**：`clear_active_task`（`active_task.py:413-427`）只删自己解析出的 `context_key` 对应文件，但 `cmd_finish`（`task.py:144-162`）拿到的 `previous` 可能来自 single-session fallback（另一个 stem≠key 的文件）。此时什么都没删，却打印 `✓ Cleared current task (was: X)`。指针存活，"已清除"任务下一轮仍 active。

## Requirements

- R1（#5）：为 session 指针引入基于 `last_seen_at` 的 TTL 清理机制，使僵尸指针不会永久累积、不会永久禁用 fallback。TTL 值与清理触发点（读时惰性清理 vs 显式命令 vs 两者）在 design.md 决策。
- R2（#5）：清理必须安全——不得误删仍活跃 session 的指针（活跃判定标准在 design.md 明确）。
- R3（#6）：`finish` 必须清除它**实际解析到**的指针（含 fallback 路径解析到的文件），或在无法确定时如实报告未清除，禁止谎报成功。
- R4：不破坏单 session 正常 start→finish 流程与既有测试。

## Acceptance Criteria

- [ ] AC1（#6，executable）：构造 fallback 场景（指针文件 stem ≠ 当前 context_key）后运行 `task.py finish`，实际指针文件被删除，或输出如实反映未清除；不得出现"文件仍在却报已清除"。
- [ ] AC2（#5，executable）：构造 2 个 session 指针、其中一个 `last_seen_at` 超过 TTL，触发清理后仅剩活跃的一个，single-session fallback 恢复可用。
- [ ] AC3（#5，executable）：构造 2 个均在 TTL 内的活跃指针，清理不删除任何一个（无误删）。
- [ ] AC4（executable）：`pnpm --filter @limenglin/coding test` 退出码 0。
- [ ] AC5：新增 vitest 用例覆盖 #5（TTL 清理 + 不误删）与 #6（fallback 路径 finish 正确清除）。

## 与 child 1 的协调

本 child 与 `07-16-loop-feedback-chain` 都触碰 `active_task.py`。软约束：两者串行实现（先其一，后其二基于最新代码），避免并行改同一文件产生冲突。该约束同时写入两个 child 的 implement.md，不靠树位置隐含。
