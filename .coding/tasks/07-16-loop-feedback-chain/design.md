# Design — 修复 loop 反馈链断点

父任务：`07-16-fix-loop-engine-defects` · 对应 prd 的 R1-R5 / #1-#4

> 所有改动落在 `packages/cli/src/templates/`（源），经 `pnpm build` + `coding update` 部署到本仓库 `.coding/.claude` 验证。

## 决策一览（含待用户确认项）

| # | 决策点 | 推荐 | 备选 |
|---|---|---|---|
| #1 | check 技能补 set-check | **改 `common/skills/check.md` 加 Step 7 记录 loop 状态**（与 agent 幂等，纯 markdown） | 废弃 check 技能只留 agent（破坏性大，改 workflow/continue 多处） |
| #2 | commit-gate unknown 行为 | **2B：保持 unknown/fail 都 deny，靠 #1 让技能路径产生 pass**（保住硬门禁语义） | 2A：unknown 放行（门禁降级为"已知失败"拦截器） |
| #3 | in_progress→completed | **B：移除死块 + 清引用**（收敛，最小） | A：新增 `task.py complete` 显式过渡（激活现有 breadcrumb 与 session-start 读路径，但增步骤且与 gate 时序耦合） |
| #4 | stale 消费点 | **cmd_set_check 加 stale 拒绝**（loop 写路径，最高优先）；cmd_start 加 stale 警告 | 仅 set_check |

**#2 与 #3 需你确认**（见下）。#1、#4 方向明确，无需确认。

## #1 — check 技能/agent set-check 等价（探查确证）

- 事实：技能源 `common/skills/check.md` 与 agent 源 `claude/agents/coding-check.md` **独立撰写、无共享片段**（`common/index.ts:77-83` 逐字读取）。agent Step 5（`coding-check.md:96-108`）调 `task.py set-check pass|fail`；技能止于 Step 6，全无 set-check。
- `cmd_set_check`（`task_store.py:802`）自行解析 active task、无需额外参数，故技能只需新增一步 markdown 即可。两条路径写同一字段、幂等。
- 名称冲突（技能与 agent 同名 `coding-check`）不在本 child 处理范围，仅在技能新步骤里注明"若你已作为 coding-check agent 运行则此步已覆盖"避免歧义。

**方案**：在 `check.md` 末尾新增 "Step 7: Record Loop State"，镜像 agent Step 5 的 pass/fail 判据与命令。

## #2 — commit-gate 决策表（**待确认**）

当前（`inject-commit-gate.py:159-165`）：`pass`→allow，`fail`/`unknown`→deny。问题：技能路径 `unknown` 被误拦。

- **推荐 2B**：不改 gate，靠 #1 让技能路径也产生 `pass`。保住 docstring 承诺的"无 pass 不许提交"硬语义。代价：从未检查过的旧 in_progress 任务首次仍被拦（合理——本就该先检查）。
- 备选 2A：改 `:162` 为 `if check_status in ("pass","unknown"): return 0`，`unknown` 放行。门禁降级为仅拦"已知失败"。代价：真未检查也放行，弱化保证。

两者可叠加（做 2B，unknown 仍 deny）。我推荐纯 2B——它让 #1 成为 #2 的真正修复，改动面最小且不弱化安全属性。

## #3 — completed 过渡（**待确认**）

探查确证 `[workflow-state:completed]` 在正常流是死块（`cmd_archive` 同调用写 completed + 移目录 + 清指针，resolver 随即丢指针）。但 `session-start.py:314-319` 的读路径已为 completed 接好线。

- **推荐 B（移除死块 + 清引用）**：删 `workflow.md:224-234` 块与 `:125-130` 注释、更新 `:543` 表与 `change-workflow.md:19`/`context-injection.md:29`、移除 `session-start.py:314-319` 不可达分支。**保留**数据模型层 completed 写入/读取（`task_store.py:458`、`tasks.py`/`session_context.py` 进度计数、`continue.md:36`）。收敛、去误导。
- 备选 A（新增 `task.py complete`）：设一个只写 `status=completed` 不移目录/不清指针的命令，激活现有 breadcrumb + session-start 读路径。代价：增 workflow 步骤；且 completed 后 gate 不再 fire（`:156` 只 gate in_progress），提交会被静默放行，时序需额外处理。

我推荐 B——A 引入的 gate 时序副作用得不偿失，且没有已知的"必须要 completed 停留态"的需求。

## #4 — stale 指针消费（探查确证）

- stale 计算：`_active_from_ref`（`active_task.py:296`）`stale = resolved is None or not resolved.is_dir()`。
- 现检查 stale 者：statusline（显示）、inject-workflow-state（路由 pseudo-status）、inject-commit-gate（`:149` stale→allow）、session-start（`:291` 提示）、`cmd_current --source`。
- 缺口：`cmd_set_check`（`task_store.py:808-809`）只查 `not active.task_path`，**不查 stale**→stale 时 `task_json_path` 指向不存在文件，报模糊的"task.json not found"。`cmd_start` 同样不查。

**方案**：`cmd_set_check` 在读 task.json 前加 `if active.stale:` 分支，输出与 session-start 一致的"stale pointer；请运行 task.py finish"并返回非零。`cmd_start` 加对既有 stale 指针的警告（低优先）。

## 与 child 2 的协调

本 child 的 #4 改 `active_task.py`（消费侧 `cmd_set_check` 在 task_store.py，但可能读 `ActiveTask.stale`）；child 2（#5/#6）改 `active_task.py` 的 `clear_active_task`/`resolve_active_task`/`_write_json`。两者串行实现，后者 rebase 于前者。约束写入两个 implement.md。

## 测试策略

mirror `packages/cli/test/regression.test.ts`（Pattern 1：`writeCodingScripts()` + `setupTaskRepo()` + `sessionEnv({CODING_CONTEXT_ID})` + `spawnSync`）：
- #1：技能路径无法直接测（技能是 AI 行为）→ 退而测 `set-check` 命令本身写 `meta.loop` 正确（已有能力），并在技能 markdown 加步骤后由 finish 阶段人工确认。核心可测项是 #4。
- #4：构造 stale 指针（指向不存在 task dir）后 `spawnSync task.py set-check fail`，断言退出码≠0 且 stderr 含 stale 提示。mirror `regression.test.ts:1960-1986`。
- #2/#3：若选 2B/B，gate 行为不变（2B 无代码改动），只需 #1 落地；B 的删除用 grep 断言 workflow.md 无 `workflow-state:completed`。

## 影响面

- 改 markdown：`common/skills/check.md`。
- 改脚本：`coding/scripts/common/task_store.py`（cmd_set_check stale 分支）、`coding/scripts/task.py`（cmd_start 警告，低优先）。
- 若选 B：`coding/workflow.md`、`shared-hooks/session-start.py`、`common/bundled-skills/coding-meta/references/*`、`common/commands/continue.md`。
- 新增测试：`packages/cli/test/regression.test.ts`（或新 spec 文件）。
