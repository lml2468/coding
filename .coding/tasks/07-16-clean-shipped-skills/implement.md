# Implement — 清除 shipped skills 泄漏内容

父任务：`07-16-fix-loop-engine-defects` · #8 #9

> 源在 `packages/cli/src/templates/common/skills/`。改完 `pnpm build` + `node packages/cli/dist/cli/index.js update` 重新部署。
> 本 child 与其他 child 无文件冲突，可独立/并行。

## 执行顺序

### 0. 先查测试断言 `→ verify: 了解约束`
- [ ] `grep -rn "break-loop\|update-spec\|Immediate Actions\|Relationship to Other" packages/cli/test/` 找出对这两个 skill body 的字符串/快照断言，记录待改项。

### 1. #8 — 改写 break-loop 尾部 `→ verify: grep`
- [ ] 编辑 `packages/cli/src/templates/common/skills/break-loop.md`，将 "After Analysis: Immediate Actions"（约 :170-188）替换为 "After Analysis: Capture the Lesson"（文案见 design.md）：
  - 去除 `src/templates/markdown/spec/` 死路径（原 :180）
  - 去除 "Commit the spec updates" 强制指令（原 :182,184-186）
  - 改为"识别 capture 内容（只用 `.coding/spec/guides/`、`.coding/spec/<layer>/` 真实路径）→ 交给 `coding-update-spec` 技能落地"
  - 明确 "Do not commit here"
- verify: `grep -n "src/templates/markdown/spec\|Commit the spec updates" packages/cli/src/templates/common/skills/break-loop.md` 无匹配。

### 2. #9 — 改 update-spec 占位符 `→ verify: grep`
- [ ] 编辑 `packages/cli/src/templates/common/skills/update-spec.md`（约 :332-340）：
  - `{{CMD_REF:break-loop}}` → `` `coding-break-loop` skill ``
  - `{{CMD_REF:update-spec}}` → `` `coding-update-spec` skill ``
  - 保留 `{{CMD_REF:finish-work}}`（:340）
- verify: `grep -n "{{CMD_REF:break-loop}}\|{{CMD_REF:update-spec}}" packages/cli/src/templates/common/skills/update-spec.md` 无匹配。

### 3. （可选 R5）修 cross-platform guide 死链 `→ verify: grep`
- [ ] 视情况：`packages/cli/src/templates/markdown/spec/guides/index.md.txt:26,62` 移除对 `cross-platform-thinking-guide.md` 的链接；或将该 guide 纳入 `markdown/index.ts`+`workflow.ts:223-236` 部署。不阻塞本 child 验收。

### 4. 更新受影响测试 `→ verify: 编译`
- [ ] 依步骤 0 记录，更新 `packages/cli/test/` 中对 break-loop/update-spec body 的断言，或新增 grep 型回归断言（渲染后无 `/coding:break-loop`、无 `src/templates`）。

### 5. 部署 + 验证 `→ verify: AC1-AC5`
- [ ] 先确认未被 skip：`grep -n "update" .coding/config.yaml`（无 skip 列表即默认全部部署）。
- [ ] `pnpm build && node packages/cli/dist/cli/index.js update`
- [ ] AC1: `grep -rn "src/templates/markdown/spec" .claude/skills/coding-break-loop/SKILL.md` 无匹配
- [ ] AC2: break-loop 副本无 "Commit the spec updates" 强制语
- [ ] AC3: `grep -rn "/coding:update-spec\|/coding:break-loop" .claude/skills` 无匹配
- [ ] AC4: diff `.claude/skills/coding-{break-loop,update-spec}/SKILL.md` 与源渲染一致
- [ ] AC5: `pnpm --filter @limenglin/coding test` 退出码 0

## Rollback / 风险
- 纯文案改动，`git checkout` 即回滚。风险仅在遗漏 test body 断言 → 步骤 0 先查规避。
