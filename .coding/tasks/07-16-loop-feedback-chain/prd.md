# 修复 loop 反馈链断点

父任务：`07-16-fix-loop-engine-defects`

## Goal

修复 loop engineering "检查→反馈→纠正→终止"闭环中的静默断点，使 check 无论走 agent 还是技能路径都能正确驱动 `meta.loop` 状态、commit-gate 与终止守卫；让状态机存在干净的 in_progress→completed 过渡；让 `.stale` 指针不再被当有效任务。

## 源码位置（改这里，不改部署副本）

- check 技能源：`packages/cli/src/templates/common/skills/check.md`
- check agent 源：`packages/cli/src/templates/claude/agents/coding-check.md`
- commit-gate 源：`packages/cli/src/templates/shared-hooks/inject-commit-gate.py`
- 状态机/归档源：`packages/cli/src/templates/coding/scripts/common/task_store.py`、`.../common/active_task.py`
- workflow 源：`packages/cli/src/templates/coding/workflow.md`
- continue 命令源：`packages/cli/src/templates/common/commands/continue.md`

## 背景与复现（review #1 #2 #3 #4）

- **#1**：`meta.loop.check_status`/`iteration_count` 是唯一终止守卫（`iteration_count>=3 → break-loop`）与 commit-gate 依据。仅由 check **agent** 写入（agent 源 Step 5 调 `task.py set-check pass|fail`）；check **技能**源 `check.md` 全文无 `set-check`（已核实）。走技能路径 → `check_status` 恒为 `unknown` → `continue.md` 视为"未检查回 2.2"，`iteration_count` 永不递增 → 无法推进 finish、防死循环永不触发。
- **#2**：`inject-commit-gate.py` 在 `check_status != "pass"` 时 deny。与 #1 叠加：技能路径下 `unknown` 被拦，用户被迫 `CODING_HOOKS=0` 绕过，训练用户禁用门禁。
- **#3**：`cmd_archive`（部署副本 `task_store.py:413,458-459`）同一次调用写 `status=completed` 又移目录，resolver 随即丢指针，`[workflow-state:completed]`（workflow.md:224-234 自认死块）永不触发。缺 in_progress→completed 过渡。
- **#4**：resolver 标记 stale 指针，但除 `cmd_current --source` 外，`start`/`set-check`/context 生成都不检查 `.stale`，死任务指针一路穿过循环。

## Requirements

- R1（#1）：消除 check 技能与 agent 在 loop 状态记录上的不等价。技能路径也要能让 `meta.loop` 正确写入，或从机制上不再依赖用户选对路径。
- R2（#2）：commit-gate 在 unknown（从未检查）与 fail（检查失败）之间行为要合理，不能误拦正常完成检查的用户。R1、R2 的取舍需在 design.md 明确决策。
- R3（#3）：提供 in_progress→completed 干净过渡，使 completed 状态/breadcrumb 有真实触发路径；或明确移除死块并收敛 workflow.md 引用。二选一在 design.md 决策。
- R4（#4）：stale 指针在关键消费点（至少 `start`、`set-check`）被识别并拒绝或明确提示，不再静默当有效。
- R5：不破坏现有 agent 路径行为与既有 `vitest` 测试。

## Acceptance Criteria

- [ ] AC1（#1，executable）：走 check 技能路径完成一次检查后，`task.json` 的 `meta.loop.check_status` 能反映结果（非恒 unknown）。验证脚本见 implement.md。
- [ ] AC2（#2，executable）：构造 unknown/fail/pass 三态各喂给 commit-gate 一次，deny/allow 结果符合 design.md 的决策表。
- [ ] AC3（#3，executable）：存在命令/流程使任务进入 `status=completed` 且指针仍可解析、breadcrumb 能触发；或死块被移除且 `grep` 验证 workflow.md 无悬空引用。
- [ ] AC4（#4，executable）：构造一个 stale 指针后运行 `task.py start` / `set-check`，命令拒绝或给出明确 stale 提示。
- [ ] AC5（executable）：`pnpm --filter @limenglin/coding test` 退出码 0，无新增失败。
- [ ] AC6：新增/更新 `vitest` 用例覆盖 #1（技能路径 set-check）与 #4（stale 拒绝）两条回归。
