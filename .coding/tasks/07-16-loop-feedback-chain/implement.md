# Implement — 修复 loop 反馈链断点

父任务：`07-16-fix-loop-engine-defects` · 决策：#2=2B、#3=B（用户已确认 2026-07-16）

> 源在 `packages/cli/src/templates/`。改完 `pnpm build` + `node packages/cli/dist/cli/index.js update` 部署到本仓库验证。
> **与 child 2 串行**：本 child 若先做，child 2 rebase 于此；若 child 2 先做，本 child rebase。两者都碰 `active_task.py` 生态。

## 执行顺序

### 1. #1 — check 技能补 set-check `→ verify: grep`
- [ ] 编辑 `packages/cli/src/templates/common/skills/check.md`：在末尾（Step 6 之后）新增 "Step 7: Record Loop State"，镜像 `claude/agents/coding-check.md:96-108` 的判据：
  - lint+typecheck+tests 全过且已修完发现 → `python3 ./.coding/scripts/task.py set-check pass`
  - 仍有无法修复的失败 → `python3 ./.coding/scripts/task.py set-check fail`
  - 注明："若你已作为 `coding-check` agent 运行，此步已由 agent 覆盖，勿重复。"
- verify: `grep -n "set-check" packages/cli/src/templates/common/skills/check.md` 有匹配。

### 2. #4 — cmd_set_check 拒绝 stale `→ verify: 测试`
- [ ] 编辑 `packages/cli/src/templates/coding/scripts/common/task_store.py` `cmd_set_check`（约 :808-824）：在 `if not active.task_path:` 之后、读 task.json 之前，加：
  ```python
  if active.stale:
      print(colored("Error: active task pointer is stale (task dir missing).", Colors.RED), file=sys.stderr)
      print("Run `python3 ./.coding/scripts/task.py finish` to clear it, then re-start the task.", file=sys.stderr)
      return 1
  ```
- [ ] （低优先）`packages/cli/src/templates/coding/scripts/task.py` `cmd_start`：若解析到的既有指针 stale，打印警告（不阻断，因 start 带显式 dir 参数）。
- verify: 见测试步骤 5。

### 3. #3(B) — 移除 completed 死块 `→ verify: grep`
- [ ] `packages/cli/src/templates/coding/workflow.md`：删除 `[workflow-state:completed]` 块（:232-234）及其上方注释（:224-230）；删 Phase Index 里 `:125-130` 的 completed scoping 注释项；更新 `:543` 定制表行（去掉 completed 行或标注已移除）。
- [ ] `packages/cli/src/templates/shared-hooks/session-start.py`：移除 `:314-319` `if task_status == "completed":` 不可达分支。
- [ ] `packages/cli/src/templates/common/bundled-skills/coding-meta/references/customize-local/change-workflow.md:19` 与 `.../local-architecture/context-injection.md:29`：移除对 `[workflow-state:completed]` 的引用。
- [ ] **保留**：`task_store.py:458`（archive 写 completed）、`tasks.py`/`session_context.py` 进度计数、`continue.md:36`、`task.py:332` --status 帮助——这些是数据模型层，非 breadcrumb。
- verify: `grep -rn "workflow-state:completed" packages/cli/src/templates` 无匹配。

### 4. #2(2B) — 无代码改动
- [ ] 确认 `inject-commit-gate.py` 保持现状（unknown/fail deny，pass allow）。#1 落地后技能路径产生 pass，问题自消。design.md 记录此决策，无需改 gate。

### 5. 测试 `→ verify: pnpm test`
- [ ] 在 `packages/cli/test/regression.test.ts` 新增用例（mirror `:1960-1986` stale 模式 + `:1014-1136` helpers）：
  - `[loop-feedback] set-check rejects stale pointer`：构造指向不存在 task dir 的 session 指针，`spawnSync(python, [taskPy, "set-check", "fail"], {env: sessionEnv({CODING_CONTEXT_ID:"s"})})`，断言 `status !== 0` 且 stderr 含 "stale"。
  - `[loop-feedback] set-check pass writes meta.loop`：正常 task，`set-check pass` 后读 task.json 断言 `meta.loop.check_status==="pass"`（回归 #1 的机制侧）。
- [ ] `grep` 断言 workflow.md 无 `workflow-state:completed`（可作为 registry/字符串测试或手工）。

### 6. 部署 + 全量验证 `→ verify: AC1-AC6`
- [ ] `pnpm build && node packages/cli/dist/cli/index.js update`
- [ ] `pnpm --filter @limenglin/coding test` 退出码 0
- [ ] 逐条核对 prd AC1-AC6。

## 回滚点
- 每步独立可回滚。#3(B) 的删除若破坏测试，`git checkout` 相关文件即可；#1 纯新增；#4 是防御性分支。

## Rollback / 风险
- 最大风险在 #3(B) 误删仍被引用的 completed 逻辑。缓解：只删 breadcrumb 相关，保留数据模型层（已在步骤 3 明确"保留"清单）；删后跑全量测试确认无回归。
