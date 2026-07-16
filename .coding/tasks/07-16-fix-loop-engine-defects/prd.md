# 修复 Coding loop 引擎缺陷 (P0+P1)

## Goal

针对 2026-07-16 对 `.coding` / `.claude` 框架的系统性 review，修复其中 P0/P1 级缺陷。核心目标：**修复 loop engineering 反馈链的静默断点**，并消除多 session 长期运行下的累积性劣化、shipped skills 里泄漏的上游内容、以及跨平台与数据完整性风险。

这是一个 **parent 任务**：拥有源需求集、child 映射、跨 child 验收标准与最终集成 review。parent 本身不承担直接实现工作，实现落在各 child。

## 源需求集（本轮纳入 P0 + P1，按主题域切 4 个 child）

编号沿用 review 报告（#n）。

### P0（loop 反馈链 + 上游泄漏）
- **#1** `coding-check` 技能缺 `set-check`，与 check agent 不等价 → loop 终止守卫/commit-gate 失效
- **#2** commit-gate fail-open 与 check 缺失叠加 → 走技能路径时 `unknown≠pass` 反而拦截提交
- **#3** `[workflow-state:completed]` 是死块，缺 in_progress→completed 干净过渡
- **#4** `.stale` 标志几乎无消费者，死任务指针被当有效任务穿过循环
- **#8** `coding-break-loop` 强制尾部指向不存在的文件（`cross-platform-thinking-guide.md`、根 `src/templates/...`）并要求越权 commit
- **#9** `coding-update-spec` 宣传不存在的 slash command（`/coding:update-spec`、`/coding:break-loop`）

### P1（会话生命周期 + 跨平台/数据完整性）
- **#5** session 指针只增不减，泄漏后永久禁用 single-session fallback（`last_seen_at` 未用于 TTL）
- **#6** `finish` 在 fallback 路径下不删实际解析到的指针，却打印"已清除"
- **#10** `.coding/scripts/` 下裸 `print()` 无 stdout 编码守卫 → 传统 Windows 控制台崩溃/乱码
- **#12** `cmd_create` 对已存在任务只 warn 就无条件覆盖 `task.json`
- **#13** `config.py` 空 YAML 标量解析成 `{}`，击穿 `.get(key, default)` 默认值

## 源码布局与部署（关键约束）

本仓库是 Coding 框架的**开发 monorepo**，不是普通用户项目。核实结论：

- 真正的源在 `packages/cli/src/templates/`；`.coding/` + `.claude/` 是 dogfooding 的**部署副本**。
- Skill 源：`packages/cli/src/templates/common/skills/{check,break-loop,update-spec,brainstorm,before-dev}.md`（部署时被 configurator 改写成各平台的 `SKILL.md` / command）。
- Agent 源：`packages/cli/src/templates/claude/agents/*.md`。
- Hook 源：`packages/cli/src/templates/shared-hooks/*.py`。
- 脚本源：`packages/cli/src/templates/coding/scripts/**`。
- workflow 源：`packages/cli/src/templates/coding/workflow.md`。
- 部署逻辑：`packages/cli/src/configurators/*.ts`（`claude.ts` / `shared.ts` / `index.ts`）+ `packages/cli/src/templates/common/index.ts`、`shared-hooks/index.ts`。
- 构建/部署：`pnpm build`（内部 `tsc` + `scripts/copy-templates.js`）。测试：`vitest`（`packages/cli/test/`，含 `regression.test.ts`）。

**核实到的源 vs 副本状态**（决定各 child 修复位置）：
- #1（check 缺 set-check）：源 `common/skills/check.md` 里**也无** → 源缺陷，需改源。
- #8（break-loop 泄漏尾部）：源 `common/skills/break-loop.md:180,182` **确有** → 源缺陷，需改源。
- #9（update-spec slash 引用）：源里**已无**，只在部署副本 `.claude/skills/coding-update-spec/SKILL.md` 残留 → 副本与源脱节，需重新部署 + 核对同步链。

**含义**：所有实现改动落在 `packages/cli/src/`（模板源 + configurators + 测试）。本仓库的 `.coding/` `.claude/` 副本通过 `pnpm build` + 重新部署刷新，用于本地验证。

## Child 映射

| Child 目录 | 主题域 | 纳入发现 |
|---|---|---|
| `07-16-loop-feedback-chain` | loop 反馈链（check 等价性、gate、状态机、stale） | #1 #2 #3 #4 |
| `07-16-active-task-lifecycle` | active-task 会话生命周期 | #5 #6 |
| `07-16-clean-shipped-skills` | shipped skills 泄漏内容 | #8 #9 |
| `07-16-crossplatform-data-integrity` | 跨平台输出 + 数据完整性 | #10 #12 #13 |

## 显式排除（本轮不做）

P2 收尾项：#7（set-check platform 参数统一）、#11（`_MARKER_RE` 与 workflow-state 冲突，当前 latent）、#14（删死代码 `coding_config.py`）、#15（archive 原子性）、#16（setter 检查 write_json 返回值）、#17-#19（sub-agent 冗余段/附录精简/research 越界通道）、#20（版本号不一致）。

> 例外：#7 若在实现 child 1/2 时被顺带触及可一并修，但不作为本轮验收项。

## 依赖与顺序

parent/child 结构不是依赖系统。本轮各 child **可独立实现、检查、归档**，无强制先后。唯一软约束：child 1（#4 `.stale` 消费）与 child 2（#5/#6 指针清理）都触碰 `active_task.py`，建议串行实现以减少冲突——该约束写入两个 child 的 implement.md，不靠树位置隐含。

## 跨 Child 验收标准（parent 拥有）

- [ ] AC-P1（executable）：4 个 child 全部 `status=completed` 且各自 AC 全绿 → `python3 ./.coding/scripts/task.py list` 显示 4 child completed
- [ ] AC-P2（executable）：现有测试套件在全部改动后仍通过 → 运行仓库测试命令，退出码 0，无新增失败
- [ ] AC-P3（集成）：走一遍完整 loop（create→plan→start→implement→check→set-check pass→commit）验证反馈链闭环，check 技能与 agent 路径都能正确写入/读取 `meta.loop`
- [ ] AC-P4：`grep -rn "cross-platform-thinking-guide\|src/templates/markdown/spec\|/coding:update-spec\|/coding:break-loop" packages/cli/src/templates/common/skills` 无残留泄漏引用（源侧）；重新部署后 `.claude/skills` 副本亦无残留
- [ ] AC-P5：所有实现改动限定在 `packages/cli/src/`（模板源 / configurators / 测试）范围内，不触碰用户业务代码；`.coding/` `.claude/` 变更仅为 build 重新部署的产物

## Notes

- 本仓库即 Coding 框架自身，改动直接作用于框架代码。
- review 全文见本轮会话；每个 child 的 prd 内含对应发现的精确 file:line 复现依据。
