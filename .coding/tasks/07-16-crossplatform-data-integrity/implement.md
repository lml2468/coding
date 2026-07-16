# Implement — 修复跨平台与数据完整性

父任务：`07-16-fix-loop-engine-defects` · #10 #12 #13

> 源在 `packages/cli/src/templates/coding/scripts/`。改完 `pnpm build` + `coding update` 部署验证。
> 三项独立、无共享文件、与其他 child 不冲突。

## 执行顺序（可任意序）

### 1. #10 — 编码守卫 `→ verify: cp1252 测试`
- [ ] `common/__init__.py`（约 :36）：将 `if sys.platform=="win32":` 门禁放宽为"stream.encoding 非 utf-8 即重配置"（保留 win32 覆盖），使 POSIX cp1252 可触发。`_configure_stream` 保持 try/except 非致命。
- [ ] `hooks/linear_sync.py`（`import sys` 后，约 :35）：内联 `shared-hooks/inject-workflow-state.py:37-52` 的 per-stream 重配置块。
- verify: 步骤 4 的 #10 用例。

### 2. #12 — cmd_create abort `→ verify: 测试`
- [ ] `common/task_store.py`（:268-271）：替换 warn+fall-through 为 abort：
  ```python
  if task_dir.exists() and task_json_path.exists():
      print(colored(f"Error: Task already exists: {dir_name}", Colors.RED), file=sys.stderr)
      print(f"Located at: {_repo_relative_path(task_dir, repo_root)}", file=sys.stderr)
      print("Use a new slug if you intend to create a new task.", file=sys.stderr)
      return 1
  task_dir.mkdir(parents=True, exist_ok=True)
  ```
  （注意 `task_json_path` 需在此前已定义；若定义在 :316 附近，前移其定义。）
- verify: 步骤 4 的 #12 用例。

### 3. #13 — YAML 空标量 `→ verify: 测试`
- [ ] `common/config.py`：`_parse_yaml_block` 的 `:131`（EOF）与 `:147`（同/浅缩进）两处 `target[key] = {}` → `target[key] = ""`。
- [ ] `get_session_commit_message`（:202）：`return config.get("session_commit_message") or DEFAULT_SESSION_COMMIT_MESSAGE`。
- verify: 步骤 4 的 #13 用例。

### 4. 测试 `→ verify: pnpm test`
新增 `packages/cli/test/scripts/*.integration.test.ts`（mirror `add-session.integration.test.ts`：`hasPython()` gate、`fs.cpSync(TEMPLATE_SCRIPTS)`、`spawnSync`）：
- [ ] #10：播种含中文的 task 标题/prd，`spawnSync(python,["get_context.py",...],{env:{...process.env,PYTHONIOENCODING:"cp1252"}})`，断言 `status===0` 且 `!/UnicodeEncodeError/.test(stderr)`。
- [ ] #12：create→改 task.json（status/branch）→同 slug 再 create→断言 rc≠0 且 task.json 内容未变。
- [ ] #13：`python3 -c "import sys;sys.path.insert(0,'.coding/scripts');from common.config import parse_simple_yaml;print(repr(parse_simple_yaml('key:\\n')))"` 断言 `{'key': ''}`；并集成测 `session_commit_message:` 空值时 add_session 提交成功。

### 5. 部署 + 全量验证 `→ verify: AC1-AC5`
- [ ] `pnpm build && node packages/cli/dist/cli/index.js update`
- [ ] `pnpm --filter @limenglin/coding test` 退出码 0
- [ ] 逐条核对 prd AC1-AC5。

## Rollback / 风险
- 三项独立，任一出问题单独 `git checkout` 回滚。
- #10 门禁放宽须保证不影响正常 utf-8 环境（try/except 兜底）。
- #13 parser 改动面较广（所有空标量 key）→ 已确认下游映射 getter 有 isinstance 保护，测试覆盖 commit-msg 路径确认无回归。
