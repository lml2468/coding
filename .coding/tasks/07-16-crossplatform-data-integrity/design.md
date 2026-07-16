# Design — 修复跨平台与数据完整性

父任务：`07-16-fix-loop-engine-defects` · #10 #12 #13

> 源在 `packages/cli/src/templates/coding/scripts/`。三项独立，无共享文件冲突。

## 关键真相（探查修正了 #10 的原始判断）

- **#10 守卫已存在**：`common/__init__.py:36-39` 在 `sys.platform=="win32"` 时重配置 stdout/stderr/stdin。所有主入口首句 `from common...`→包导入即触发→已覆盖 `get_context.py`/`add_session.py`/`task.py`/`get_developer.py`/`init_developer.py`。
- **唯一缺口**：`hooks/linear_sync.py` 不 import common（仅 stdlib），却 print 动态非 ASCII（Linear id/title/task 名，`:158/167/177/197`）→ Windows 崩。
- **可测性缺陷**：`common/__init__.py:36` 的 `win32`-only 门禁使 POSIX 下 `PYTHONIOENCODING=cp1252` 测不到守卫 → 放宽为"流编码非 utf-8 即重配置"。

## 决策

| # | 决策 | 方案 |
|---|---|---|
| #10 | 编码守卫 | ① `linear_sync.py` 内联 shared-hook per-stream idiom；② 放宽 `common/__init__.py:36` 门禁为非 win32-only（流编码非 utf-8 即重配） |
| #12 | cmd_create 覆盖 | abort（镜像 archived 守卫），条件 `task_json_path.exists()` + `mkdir(exist_ok=True)` |
| #13 | YAML 空标量 | 改 `_parse_yaml_block`（:131/:147）空标量→`""` 而非 `{}`；`get_session_commit_message`(:202) 加 `or DEFAULT` |

## #10 — 编码守卫（探查确证）

- **不要**在各主入口重复 `common/__init__.py` 已有守卫（option a 被否）。
- `linear_sync.py`：在 `import sys` 后内联 `shared-hooks/inject-workflow-state.py:37-52` 的 per-stream 块（reconfigure→detach/TextIOWrapper fallback，各 try/except）。
- `common/__init__.py:36`：门禁由 `if sys.platform=="win32":` 放宽为"当 stream.encoding 非 utf-8 时重配置"（保留 win32 覆盖），使 POSIX cp1252 子进程测试能验证。注意仍需 try/except 非致命。

## #12 — cmd_create abort（探查确证）

- 现状（`task_store.py:268-316`）：`task_dir.exists()` 只 warn（:269）→ fall through 到无条件 `write_json`（:316）覆盖。archived 守卫（:261-266）已是正确范式（error+return 1）。
- 方案（:268-271）：
  ```python
  if task_dir.exists() and task_json_path.exists():
      print(colored(f"Error: Task already exists: {dir_name}", Colors.RED), file=sys.stderr)
      print(f"Located at: {_repo_relative_path(task_dir, repo_root)}", file=sys.stderr)
      print("Use a new slug if you intend to create a new task.", file=sys.stderr)
      return 1
  task_dir.mkdir(parents=True, exist_ok=True)
  ```
  用 `task_json_path.exists()` 而非仅 `task_dir.exists()`，保留"目录已建但 task.json 未写"的恢复路径；`exist_ok=True` 使该恢复安全。

## #13 — YAML 空标量（探查确证）

- 现状（`config.py:116-148`）：`key:` 空值 → `:123 if value:` False → `else`（:127）→ EOF（:130-132）或同/浅缩进（:147）赋 `{}`。经 `get_session_commit_message`(:199-202) `.get(key, DEFAULT)` 因 key 存在返回 `{}` → `add_session.py:443` `git commit -m <dict>` 抛 TypeError。`get_max_journal_lines`(:205-212) 有 int try/except 免疫。
- 方案：
  - `:131` EOF 分支、`:147` 空标量分支：`{}` → `""`（区分空标量与空映射）。下游映射 getter（`get_hooks`:258 / `get_packages`:283 / `get_spec_scope`:435）均已 `isinstance` 保护，安全。
  - `:202`：`return config.get("session_commit_message") or DEFAULT_SESSION_COMMIT_MESSAGE`（空值回落默认，最佳 UX）。

## 影响面

- `coding/scripts/hooks/linear_sync.py`（#10 内联）
- `coding/scripts/common/__init__.py`（#10 门禁放宽）
- `coding/scripts/common/task_store.py`（#12 abort）
- `coding/scripts/common/config.py`（#13 parser + getter）
- 测试：`packages/cli/test/scripts/*.integration.test.ts`（新增，mirror `add-session.integration.test.ts`）

## 测试策略（探查给出可 mirror 模式）

mirror `packages/cli/test/scripts/add-session.integration.test.ts`（`hasPython()` gate、`fs.cpSync(TEMPLATE_SCRIPTS)`、`spawnSync("python3", [...], {cwd, env})`）：
- #10：`spawnSync(python, ["get_context.py",...], {env:{...process.env, PYTHONIOENCODING:"cp1252"}})`，先播种非 ASCII（中文 task 标题/prd），断言 `status===0` 且 stderr 无 `UnicodeEncodeError`。门禁放宽后 POSIX 可验。linear_sync 同理（或退化为单元级 import 验证）。
- #12：create 一个 task→改其 task.json（set status/branch）→同 slug 再 create→断言 rc≠0 且 task.json 未变。mirror `task-archive.integration.test.ts:96-98`。
- #13：写 `config.yaml` `session_commit_message:`（空）→跑 `add_session.py`→断言 rc0 且 auto-commit 成功；或 `python3 -c "...parse_simple_yaml('key:\n')..."` 断言输出 `{'key': ''}`。

## 风险
- #10 门禁放宽须保证 try/except 非致命，不影响正常 utf-8 环境。
- #13 parser 改动影响所有空标量 key——已确认下游映射 getter 有 isinstance 保护；测试覆盖 commit-msg 路径。
