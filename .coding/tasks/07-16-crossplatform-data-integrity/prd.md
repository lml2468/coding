# 修复跨平台与数据完整性

父任务：`07-16-fix-loop-engine-defects`

## Goal

修复三个独立但同属"健壮性"的缺陷：Python 脚本 stdout 无编码守卫导致传统 Windows 控制台崩溃/乱码（#10）、`cmd_create` 对已存在任务静默覆盖 `task.json`（#12）、`config.py` 空 YAML 标量击穿默认值（#13）。

## 源码位置

- 脚本源：`packages/cli/src/templates/coding/scripts/**/*.py`
  - stdout 编码：`get_context.py` / `common/git_context.py`、`common/task_context.py`、`add_session.py`、`common/log.py` 等所有裸 `print()` 的入口
  - `cmd_create`：`common/task_store.py`（约 :268-316）
  - YAML 解析：`common/config.py`（`parse_simple_yaml` 约 :127-148；getter 约 :202）
- 测试：`packages/cli/test/`

## 背景与复现（review #10 #12 #13）

- **#10（HIGH，探查后修正）**：初判"所有脚本裸 print 无守卫"**不准确**。真相：UTF-8 守卫**已存在**于 `common/__init__.py:36-39`（`sys.platform=="win32"` 时重配置 stdout/stderr/stdin），而所有主入口（`get_context.py`、`add_session.py`、`task.py`、`get_developer.py`、`init_developer.py`）第一条语句都是 `from common...`，包导入即触发守卫——已覆盖。**唯一真实缺口**是 `scripts/hooks/linear_sync.py`：它不 import common（只 stdlib），却 print 动态非 ASCII（Linear identifier/title、task 名，`:158/167/177/197`），传统 Windows 控制台会 `UnicodeEncodeError`。**附带缺陷**：`common/__init__.py:36` 的 `win32`-only 门禁使 POSIX 下 `PYTHONIOENCODING=cp1252` 无法验证该守卫——为可测性应放宽为"流编码非 utf-8 即重配置"。
- **#12（HIGH）**：`cmd_create`（`task_store.py:268-316`）目录已存在时只 warn 就 fall through 到无条件 `write_json`（:316），用全默认记录（status 重置 planning、branch/pr_url/subtasks/children/meta 清空）覆盖。同日同 slug 重跑 `create`（MM-DD 前缀相同，极易发生）摧毁已有任务元数据。而 `prd.md` 有 `if not exists` 守卫（:319）——不一致本身说明覆盖是意外。
- **#13（HIGH）**：`config.py` 空标量（`session_commit_message:` 留空）在 `_parse_yaml_block` 的 `:131`/`:147` 被赋成 `{}`（把"空标量"误当"空映射"），`config.get(key, DEFAULT)` 因 key 存在而不取默认，dict 流到 `add_session.py:443` `git commit -m <dict>` 抛 `TypeError`。`get_max_journal_lines`（:205-212）已有 `int()` try/except 免疫；受害的是字符串 getter。

## Requirements

- R1（#10）：仅需为唯一缺口 `hooks/linear_sync.py` 内联 shared-hook 的 per-stream 重配置块（`inject-workflow-state.py:37-52` 的 idiom）；不要在其他入口重复 `common/__init__.py` 已有的守卫。并放宽 `common/__init__.py:36` 的 `win32`-only 门禁为"流编码非 utf-8 即重配置"以便 POSIX 可测。
- R2（#12）：`cmd_create` 遇已存在 `task.json` 时**中止**（对齐 archived-collision 守卫 `:261-266`），禁止静默覆盖。守卫条件用 `task_json_path.exists()`（非仅 `task_dir.exists()`）+ `mkdir(exist_ok=True)`，保留"目录已建但 task.json 未写"的恢复路径。
- R3（#13）：修 `_parse_yaml_block`（`:131`/`:147`）使空标量解析为 `""` 而非 `{}`（下游映射 getter 均已 `isinstance` 保护，安全）；并给 `get_session_commit_message`（:202）加 `or DEFAULT` 使空值回落默认。
- R4：不破坏既有配置解析、任务创建、session 记录流程与既有测试。

## Acceptance Criteria

- [ ] AC1（#10，executable）：放宽门禁后，`PYTHONIOENCODING=cp1252 python3 .coding/scripts/get_context.py --mode phase --step 1.0` 与含非 ASCII 内容的 `add_session.py` 路径在 POSIX 上不抛 `UnicodeEncodeError`（降级 replace 但不崩）；`hooks/linear_sync.py` 打印非 ASCII 时同样不崩。
- [ ] AC2（#12，executable）：对已存在任务重跑 `task.py create <same-slug>`，命令退出码 ≠0 且原 `task.json` 的 branch/subtasks/status 保持不变（构造后 diff 校验）。
- [ ] AC3（#13，executable）：`config.yaml` 中 `session_commit_message:` 留空时，`parse_simple_yaml` 产出 `""` 而非 `{}`，`get_session_commit_message` 返回默认字符串（断言类型为 str）。
- [ ] AC4（executable）：`pnpm --filter @limenglin/coding test` 退出码 0。
- [ ] AC5：新增 integration 测试（mirror `packages/cli/test/scripts/add-session.integration.test.ts`）覆盖 #10（cp1252 env 不崩）、#12（不覆盖）、#13（空标量取默认）。

## Notes

- 三项互相独立，可任意顺序实现。#10 只改 `linear_sync.py` + `common/__init__.py` 门禁；#12 只改 `task_store.py`；#13 只改 `config.py`——彼此无文件冲突，与其他 child 也不共享文件。
- 探查已确认测试可在 POSIX CI 用 `PYTHONIOENCODING=cp1252` 复现 Windows 失败（前提是门禁放宽为非 win32-only）。
