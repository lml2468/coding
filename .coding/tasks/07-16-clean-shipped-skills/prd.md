# 清除 shipped skills 泄漏内容

父任务：`07-16-fix-loop-engine-defects`

## Goal

清除 ship 给用户项目的 skills 里泄漏的上游开发仓库内容与不存在的 slash command 引用，并修复源与部署副本脱节的同步链，使部署产物与源一致。

## 源码位置

- break-loop 源：`packages/cli/src/templates/common/skills/break-loop.md`
- update-spec 源：`packages/cli/src/templates/common/skills/update-spec.md`
- 部署逻辑：`packages/cli/src/configurators/*.ts`、`packages/cli/src/templates/common/index.ts`
- 部署副本（本仓库 dogfood）：`.claude/skills/coding-break-loop/SKILL.md`、`.claude/skills/coding-update-spec/SKILL.md`

## 背景与复现（review #8 #9）

- **#8（HIGH）**：`break-loop.md` 强制尾部（源 `break-loop.md:180,182`，部署副本 `.claude/skills/coding-break-loop/SKILL.md:174-188`）用 "you MUST immediately" 要求：
  - `Sync templates - After updating .coding/spec/, sync to src/templates/markdown/spec/`（180）——`src/templates/...` 只在**上游 monorepo** 存在，ship 到用户项目就是死路径。
  - `Commit the spec updates`（182）——违反 Phase 3.4 独占提交 + sub-agent 禁止 commit 边界。
  - 更新 `cross-platform-thinking-guide.md` 等——该 guide 在模板里存在（`.txt` 源），但对普通用户项目的实际 `.coding/spec/guides/` 未必部署了它。
  - 本质：这段是"上游开发语境正确、ship 出去错误"的内容，须区分语境处理。
- **#9（HIGH，探查后修正）**：初判"源里已无 slash 引用、部署副本陈旧"**是错的**。真相：源 `update-spec.md:332,334,338,339` 用 `{{CMD_REF:break-loop}}`/`{{CMD_REF:update-spec}}` 占位符，`resolvePlaceholders`（`configurators/shared.ts:141-144`）+ claude 的 `cmdRefPrefix="/coding:"`（`types/ai-tools.ts:106`）将其渲染成 `/coding:break-loop` 等。部署副本是源的**忠实渲染**，重新构建会一模一样重现。根因：break-loop / update-spec 是 **skill**（在 `common/skills/`），不是 slash command（真正的 command 只有 `continue`、`finish-work`、`start`），却被 `{{CMD_REF}}` 当 command 处理。`{{CMD_REF:finish-work}}`（:340）是唯一合法的。修复须改**源占位符**，非"重新部署"。
- **附带（探查发现）**：`cross-platform-thinking-guide.md` 对普通用户项目是**死引用**——`markdown/index.ts:89-97` 只导出 index / cross-layer / code-reuse 三个 guide，`workflow.ts:223-236` 只写这三个，cross-platform 从不部署（`.txt` 源仅上游存在）。但 `guides/index.md.txt:26,62` 仍链接它——独立的 latent 不一致。

## Requirements

- R1（#8）：break-loop 源移除或改写"上游专属"的强制尾部，使 ship 给用户的技能不含死路径（`src/templates/...`）、不含越权 commit 指令。若要保留"更新 spec"意图，须改为与 `coding-update-spec` 边界一致的表述（分析 → 交给 update-spec，而非自行 commit）。
- R2（#8）：与 review C2 一致——澄清 break-loop 与 update-spec 的职责边界，break-loop 只揭示需更新项，update-spec 负责落地，避免两者都声称拥有 spec 写入 + commit。
- R3（#9）：修复源 `update-spec.md` 把 skill 名当 slash command 的占位符——`{{CMD_REF:break-loop}}`/`{{CMD_REF:update-spec}}` 改为技能名表述（保留 `{{CMD_REF:finish-work}}`）。改源后重新部署使副本与源一致。
- R4：改动不破坏 break-loop / update-spec 的核心分析能力与既有测试。
- R5（附带，可选）：修复 `guides/index.md.txt` 对未部署的 `cross-platform-thinking-guide.md` 的死链接，或将该 guide 纳入部署。若纳入则同时移除 break-loop 对它的引用问题。此项为 nice-to-have，不阻塞 child 验收。

## Acceptance Criteria

- [ ] AC1（#8，executable）：`grep -rn "src/templates/markdown/spec" packages/cli/src/templates/common/skills/break-loop.md` 无匹配；重新部署后 `.claude/skills/coding-break-loop/SKILL.md` 亦无匹配。
- [ ] AC2（#8，executable）：break-loop 源与部署副本中不再有"自行 commit spec"的强制指令（`grep` 校验关键短语），改为交由 update-spec 的表述。
- [ ] AC3（#9，executable）：源 `update-spec.md` 无 `{{CMD_REF:break-loop}}`/`{{CMD_REF:update-spec}}`；重新部署后 `grep -rn "/coding:update-spec\|/coding:break-loop" .claude/skills` 无匹配。剩余 `/coding:*` 仅指向真实 command（finish-work/continue/start）。
- [ ] AC4（executable）：重新部署（`pnpm build` + `node packages/cli/dist/cli/index.js update`）后，`.claude/skills/coding-{break-loop,update-spec}/SKILL.md` 与源渲染一致（抽查 diff）。先确认二者未被 `config.yaml` 的 `update.skip` 列入。
- [ ] AC5（executable）：`pnpm --filter @limenglin/coding test` 退出码 0；若 `packages/cli/test/` 有对 break-loop/update-spec body 的字符串/快照断言，同步更新。

## Notes

- 部署命令已核实：`pnpm build`（含 `copy-templates`）→ `node packages/cli/dist/cli/index.js update`（等价 `packages/cli/bin/coding.js update`），走 `configureClaude`/`collectPlatformTemplates("claude-code")` 重写 `.claude/skills/coding-*/SKILL.md`。
- break-loop/update-spec 的替换文案已在探查中起草，见 design.md。
