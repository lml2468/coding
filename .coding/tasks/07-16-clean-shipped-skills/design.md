# Design — 清除 shipped skills 泄漏内容

父任务：`07-16-fix-loop-engine-defects` · #8 #9

> 源在 `packages/cli/src/templates/common/skills/`。改源 markdown，再 `pnpm build` + `coding update` 重新部署。

## 关键真相（探查修正了原始判断）

- **#9 不是"部署副本陈旧"**：源 `update-spec.md:332,334,338,339` 用 `{{CMD_REF:break-loop}}`/`{{CMD_REF:update-spec}}` 占位符，`resolvePlaceholders`（`configurators/shared.ts:141-144`）+ claude `cmdRefPrefix="/coding:"`（`types/ai-tools.ts:106`）渲染成 `/coding:break-loop`。部署副本是源的**忠实渲染**。根因：break-loop/update-spec 是 **skill**（`common/skills/`），不是 command（真 command 只有 continue/finish-work/start），却被当 command 处理。修**源占位符**。
- **#8 不是同步问题**：泄漏尾部（`break-loop.md:170-188`）在源里就存在，逐字 ship。改**源模板**。
- **部署链正确**：`getSkillTemplates`（`common/index.ts:77-83`）→ `resolveSkills`（`shared.ts:423-431`）→ `writeSkills`（`claude.ts:140-144`），由 `coding update` 驱动。重新部署会忠实重现源——所以必须先改源。
- **附带**：`cross-platform-thinking-guide.md` 对用户是死引用（`markdown/index.ts:89-97` 只导出 3 个 guide，`workflow.ts:223-236` 只写 3 个，cross-platform 从不部署）。`guides/index.md.txt:26,62` 仍链接它——latent 不一致（R5，可选）。

## 决策

| # | 决策 | 方案 |
|---|---|---|
| #8 | break-loop 泄漏尾部 | 改写 `break-loop.md:170-188`：去 `src/templates/...` 死路径、去自行 commit 指令，改为"交给 update-spec 落地" |
| #9 | update-spec 假 slash | `update-spec.md` 把 `{{CMD_REF:break-loop}}`/`{{CMD_REF:update-spec}}` 改技能名表述，保留 `{{CMD_REF:finish-work}}` |
| C2 边界 | break-loop vs update-spec 职责 | break-loop 只揭示，update-spec 落地——文案对齐 |
| R5 | cross-platform guide 死链 | 可选：修 `index.md.txt` 死链或纳入部署；不阻塞验收 |

## #8 替换文案（探查已起草，实现时微调）

将 `break-loop.md` 的 "After Analysis: Immediate Actions"（:170-188）替换为 "After Analysis: Capture the Lesson"：
- 保留"分析不能只停在对话、要落成 spec"的意图；
- 第 1 步：识别该 capture 什么（cross-cutting→`.coding/spec/guides/`；具体契约→`.coding/spec/<layer>/`）——**只用真实用户路径**；
- 第 2 步：交给 update-spec 技能落地（break-loop 揭示、update-spec 应用）；
- 明确："Do not commit here"——提交是用户/finish 阶段的事。

## #9 替换（源）

`update-spec.md:332-340` "Relationship to Other Commands"：
- `{{CMD_REF:break-loop}}` → `` `coding-break-loop` skill ``
- `{{CMD_REF:update-spec}}` → `` `coding-update-spec` skill ``
- `{{CMD_REF:finish-work}}`（:340）**保留**（真 command）。

## 部署链与验证

- 部署命令（探查确证）：`pnpm build`（含 copy-templates）→ `node packages/cli/dist/cli/index.js update`（等价 `packages/cli/bin/coding.js update`）→ `configureClaude`/`collectPlatformTemplates("claude-code")` 重写 `.claude/skills/coding-*/SKILL.md`。
- 部署前确认 break-loop/update-spec 未被 `config.yaml` 的 `update.skip` 列入（`update.ts:505-518`）。
- 探查提示：`packages/cli/test/` 可能有对 break-loop/update-spec body 的字符串/快照断言（`shared.ts:239-256` 的 SKILL_DESCRIPTIONS 不受影响，但 body 断言可能有）——改前先查，改后同步。

## 影响面

- 改源：`common/skills/break-loop.md`（尾部）、`common/skills/update-spec.md`（占位符）。
- 可选：`markdown/spec/guides/index.md.txt`（死链）。
- 部署产物：`.claude/skills/coding-{break-loop,update-spec}/SKILL.md`。
- 测试：若有 body 断言则更新，否则加 grep 型断言。

## 风险

- 纯文案/占位符改动，无逻辑风险。主要风险是遗漏某处 body 断言导致测试红 → 步骤含"先查 test 断言"。
