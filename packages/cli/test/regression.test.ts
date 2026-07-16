/**
 * Regression Tests — Historical Bug Prevention
 *
 * Each test references a specific version where the bug was introduced/fixed.
 * Prevents recurrence of bugs from beta.2 through beta.16.
 *
 * Categories:
 * 1. Windows / Encoding (beta.2, beta.7, beta.10, beta.11, beta.12, beta.16)
 * 2. Path Issues (0.2.14, 0.2.15, beta.13)
 * 3. Semver / Migration Engine (beta.5, beta.14, beta.16)
 * 4. Template Integrity (beta.0, beta.7, beta.12)
 * 5. Platform Registry (beta.9, beta.13, beta.16)
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isManagedPath } from "../src/configurators/index.js";
import { AI_TOOLS } from "../src/types/ai-tools.js";
import { PATHS } from "../src/constants/paths.js";
import {
  settingsTemplate as claudeSettingsTemplate,
  getAllAgents as getClaudeAgents,
  getStatuslineHook,
} from "../src/templates/claude/index.js";
import { getSharedHookScripts } from "../src/templates/shared-hooks/index.js";
import {
  getCommandTemplates,
  getSkillTemplates,
} from "../src/templates/common/index.js";
import {
  commonInit,
  taskScript,
  addSessionScript,
  commonTaskUtils,
  commonDeveloper,
  commonConfig,
  commonGitContext,
  commonSessionContext,
  getAllScripts,
} from "../src/templates/coding/index.js";
import {
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../src/configurators/index.js";
import {
  workspaceIndexContent,
} from "../src/templates/markdown/index.js";
import * as markdownExports from "../src/templates/markdown/index.js";

// =============================================================================
// 1. Windows / Encoding Regressions
// =============================================================================

describe("regression: Windows encoding (beta.10, beta.11, beta.16)", () => {
  it("[beta.10] common/__init__.py has _configure_stream function", () => {
    expect(commonInit).toContain("def _configure_stream");
  });

  it('[beta.10] common/__init__.py has reconfigure(encoding="utf-8") pattern', () => {
    expect(commonInit).toContain('reconfigure(encoding="utf-8"');
  });

  it("[beta.10] common/__init__.py has TextIOWrapper fallback", () => {
    expect(commonInit).toContain("TextIOWrapper");
  });

  it('[beta.10] common/__init__.py has sys.platform == "win32" guard', () => {
    expect(commonInit).toContain('sys.platform == "win32"');
  });

  it("[beta.10] common/__init__.py configures both stdout AND stderr", () => {
    expect(commonInit).toContain("sys.stdout");
    expect(commonInit).toContain("sys.stderr");
  });

  it("[beta.16] _configure_stream handles stream with reconfigure method", () => {
    // The function should try reconfigure() first, then fallback to detach()
    expect(commonInit).toContain('hasattr(stream, "reconfigure")');
    expect(commonInit).toContain('hasattr(stream, "detach")');
  });

  it("[beta.16] _configure_stream is idempotent (won't crash on double call)", () => {
    // The reconfigure pattern is safe to call multiple times
    // The function should NOT use detach() unconditionally (beta.16 bug root cause)
    // It should check hasattr(stream, "reconfigure") FIRST
    const reconfigureIndex = commonInit.indexOf(
      'hasattr(stream, "reconfigure")',
    );
    const detachIndex = commonInit.indexOf('hasattr(stream, "detach")');
    expect(reconfigureIndex).toBeLessThan(detachIndex);
  });

  it("[beta.10] common/__init__.py has centralized encoding fix", () => {
    // Encoding fix was centralized from individual scripts to common/__init__.py (#67)
    expect(commonInit).toContain('sys.platform == "win32"');
    expect(commonInit).toContain("reconfigure");
  });

  it("[beta.10] task.py imports from common (gets encoding fix via __init__.py)", () => {
    expect(taskScript).toContain("from common");
  });

  it("[rc.2] add_session.py table separator detection uses regex (not startswith)", () => {
    // Bug: startswith("|---") breaks when formatters add spaces: "| ---- |"
    // Fix: use re.match with a character-class pattern to allow optional whitespace/spaces
    expect(addSessionScript).not.toContain('startswith("|---")');
    expect(addSessionScript).toContain(
      String.raw`re.match(r"^\|[-| ]+\|\s*$", line)`,
    );
  });
});

describe("regression: branch context in session records (issue-106)", () => {
  it("[issue-106] add_session.py accepts --branch CLI arg", () => {
    expect(addSessionScript).toContain("--branch");
    expect(addSessionScript).not.toContain("--base-branch");
  });

  it("[issue-106] add_session.py auto-detects branch via git branch --show-current", () => {
    expect(addSessionScript).toContain("branch --show-current");
  });

  it("[issue-106] add_session.py reads branch from task.json when available", () => {
    expect(addSessionScript).toContain('task_data.raw.get("branch")');
    expect(addSessionScript).not.toContain('task_data.raw.get("base_branch")');
  });

  it("[issue-106] add_session.py session content includes **Branch** field only", () => {
    expect(addSessionScript).toContain("**Branch**");
    expect(addSessionScript).not.toContain("**Base Branch**");
  });

  it("[issue-106] add_session.py index table header has 5 columns including Branch", () => {
    expect(addSessionScript).toContain(
      "| # | Date | Title | Commits | Branch |",
    );
    expect(addSessionScript).not.toContain(
      "| # | Date | Title | Commits | Branch | Base Branch |",
    );
  });

  it("[issue-106] add_session.py migrates old 4/6-column headers to 5-column", () => {
    expect(addSessionScript).toMatch(
      /re\.match\(\r?\n\s+r"\^\\\|\\s\*#\\s\*\\\|\\s\*Date\\s\*\\\|\\s\*Title\\s\*\\\|\\s\*Commits\\s\*\\\|\\s\*Branch\\s\*\\\|\\s\*Base Branch\\s\*\\\|\\s\*\$",/,
    );
    expect(addSessionScript).toContain(
      String.raw`re.match(r"^\|\s*#\s*\|\s*Date\s*\|\s*Title\s*\|\s*Commits\s*\|\s*Branch\s*\|\s*$", line)`,
    );
  });

  it("[issue-106] developer.py init template has 5-column session history table", () => {
    expect(commonDeveloper).toContain(
      "| # | Date | Title | Commits | Branch |",
    );
    expect(commonDeveloper).toContain(
      "|---|------|-------|---------|--------|",
    );
  });

  it("[issue-106] workspace-index.md template documents Branch field only for session records", () => {
    expect(workspaceIndexContent).toContain(
      "Branch: Which branch the work was done on",
    );
    expect(workspaceIndexContent).toContain("**Branch**: `{branch-name}`");
    expect(workspaceIndexContent).not.toContain(
      "**Base Branch**: `{base-branch-name}`",
    );
  });
});

describe("regression: add_session.py runtime branch context (issue-106)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-session-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeCodingScripts(): void {
    const scriptsDir = path.join(tmpDir, ".coding", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content);
    }
  }

  function createWorkspaceIndex(
    headerMode: "legacy4" | "legacy6" | "current5",
  ): void {
    let header = "| # | Date | Title | Commits | Branch |";
    let separator = "|---|------|-------|---------|--------|";
    if (headerMode === "legacy4") {
      header = "| # | Date | Title | Commits |";
      separator = "|---|------|-------|---------|";
    } else if (headerMode === "legacy6") {
      header = "| # | Date | Title | Commits | Branch | Base Branch |";
      separator = "|---|------|-------|---------|--------|-------------|";
    }
    const indexContent = `# Workspace Index - test-dev

## Current Status

<!-- @@@auto:current-status -->
- **Active File**: \`journal-1.md\`
- **Total Sessions**: 0
- **Last Active**: -
<!-- @@@/auto:current-status -->

## Active Documents

<!-- @@@auto:active-documents -->
| File | Lines | Status |
|------|-------|--------|
| \`journal-1.md\` | ~0 | Active |
<!-- @@@/auto:active-documents -->

## Session History

<!-- @@@auto:session-history -->
${header}
${separator}
<!-- @@@/auto:session-history -->
`;
    fs.writeFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "index.md"),
      indexContent,
      "utf-8",
    );
  }

  function setupSessionRepo(options?: {
    gitBranch?: string;
    headerMode?: "legacy4" | "legacy6" | "current5";
    taskBranch?: string;
    taskBaseBranch?: string;
  }): void {
    writeCodingScripts();

    fs.mkdirSync(path.join(tmpDir, ".coding", "workspace", "test-dev"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-22T00:00:00\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "journal-1.md"),
      "# Journal - test-dev (Part 1)\n\n---\n",
      "utf-8",
    );
    createWorkspaceIndex(options?.headerMode ?? "current5");

    if (options?.taskBranch || options?.taskBaseBranch) {
      const taskDir = path.join(tmpDir, ".coding", "tasks", "issue-106");
      fs.mkdirSync(taskDir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".coding", ".runtime", "sessions"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(tmpDir, ".coding", ".runtime", "sessions", "session-a.json"),
        JSON.stringify(
          {
            current_task: ".coding/tasks/issue-106",
            platform: "test",
          },
          null,
          2,
        ),
        "utf-8",
      );
      fs.writeFileSync(
        path.join(taskDir, "task.json"),
        JSON.stringify(
          {
            title: "Issue 106 task",
            status: "in_progress",
            package: null,
            branch: options.taskBranch ?? null,
            base_branch: options.taskBaseBranch ?? null,
          },
          null,
          2,
        ),
        "utf-8",
      );
    }

    if (options?.gitBranch) {
      execSync("git init -q", { cwd: tmpDir });
      execSync(`git branch -m ${JSON.stringify(options.gitBranch)}`, {
        cwd: tmpDir,
      });
    }
  }

  function runAddSession(title: string, options?: { branch?: string }): void {
    const command = [
      "python3",
      JSON.stringify(
        path.join(tmpDir, ".coding", "scripts", "add_session.py"),
      ),
      "--title",
      JSON.stringify(title),
      "--summary",
      JSON.stringify("Regression test session"),
      "--no-commit",
    ];
    if (options?.branch) {
      command.push("--branch", JSON.stringify(options.branch));
    }

    execSync(command.join(" "), {
      cwd: tmpDir,
      encoding: "utf-8",
      env: { ...process.env, CODING_CONTEXT_ID: "session-a" },
    });
  }

  function createLocalBranch(branch: string): void {
    execSync("git config user.email test@example.com", { cwd: tmpDir });
    execSync("git config user.name Test", { cwd: tmpDir });
    execSync("git commit --allow-empty -q -m init", { cwd: tmpDir });
    execSync(`git branch ${JSON.stringify(branch)}`, { cwd: tmpDir });
  }

  it("[issue-106] prefers explicit CLI branch over task.json and git", () => {
    setupSessionRepo({
      gitBranch: "feature/from-git",
      taskBranch: "task/from-task",
      taskBaseBranch: "main",
    });

    runAddSession("CLI branch wins", { branch: "cli/from-arg" });

    const journal = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `cli/from-arg`");
    expect(journal).not.toContain("**Base Branch**:");
    expect(journal).not.toContain("task/from-task");
    expect(journal).not.toContain("feature/from-git");
    expect(index).toContain("`cli/from-arg` |");
    expect(index).not.toContain("`task/from-task`");
    expect(index).not.toContain("`feature/from-git`");
  });

  it("[issue-106] prefers task.json branch over current git branch and ignores task base_branch", () => {
    setupSessionRepo({
      gitBranch: "feature/from-git",
      taskBranch: "task/from-task",
      taskBaseBranch: "main",
    });
    createLocalBranch("task/from-task");

    runAddSession("Task branch wins");

    const journal = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `task/from-task`");
    expect(journal).not.toContain("**Base Branch**:");
    expect(journal).not.toContain("feature/from-git");
    expect(index).toContain("`task/from-task` |");
    expect(index).not.toContain("`feature/from-git`");
  });

  it("[issue-106] falls back to git branch and migrates old 6-column session history", () => {
    setupSessionRepo({
      gitBranch: "feature/from-git",
      headerMode: "legacy6",
    });

    runAddSession("Git branch fallback");

    const journal = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `feature/from-git`");
    expect(journal).not.toContain("**Base Branch**:");
    expect(index).toContain("| # | Date | Title | Commits | Branch |");
    expect(index).toContain("|---|------|-------|---------|--------|");
    expect(index).toContain("`feature/from-git` |");
    expect(index).not.toContain(
      "| # | Date | Title | Commits | Branch | Base Branch |\n|---|------|-------|---------|--------|-------------|",
    );
  });

  it("[issue-106] migrates old 4-column session history directly to 5 columns", () => {
    setupSessionRepo({
      headerMode: "legacy4",
    });

    runAddSession("Legacy 4-column migration");

    const index = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(index).toContain("| # | Date | Title | Commits | Branch |");
    expect(index).toContain("|---|------|-------|---------|--------|");
    expect(index).not.toContain(
      "| # | Date | Title | Commits |\n|---|------|-------|---------|",
    );
  });

  it("[issue-106] records a session even when no branch information is available", () => {
    setupSessionRepo();

    runAddSession("No branch available");

    const journal = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmpDir, ".coding", "workspace", "test-dev", "index.md"),
      "utf-8",
    );

    expect(journal).not.toContain("**Branch**:");
    expect(journal).not.toContain("**Base Branch**:");
    expect(index).toContain("`-` |");
    expect(index).toContain("- **Total Sessions**: 1");
  });
});

// Windows subprocess flags tests removed — multi_agent pipeline removed

describe("regression: Windows path separator (beta.12)", () => {
  it("[beta.12] isManagedPath handles Windows backslash paths", () => {
    expect(isManagedPath(".claude\\commands\\foo.md")).toBe(true);
    expect(isManagedPath(".coding\\spec\\backend")).toBe(true);
  });

  it("[beta.12] isManagedPath handles mixed separators", () => {
    expect(isManagedPath(".claude\\commands/foo.md")).toBe(true);
  });
});

// =============================================================================
// 2. Path Issues Regressions
// =============================================================================

describe("regression: task directory paths (0.2.14, 0.2.15, beta.13)", () => {
  it("[0.2.15] PATHS.TASKS is .coding/tasks (not .coding/workspace/*/tasks)", () => {
    expect(PATHS.TASKS).toBe(".coding/tasks");
    expect(PATHS.TASKS).not.toContain("workspace");
  });

  it("[0.2.14] Claude agent templates do not contain hardcoded .coding/workspace/*/tasks/ paths", () => {
    const agents = getClaudeAgents();
    for (const agent of agents) {
      expect(agent.content).not.toMatch(/\.coding\/workspace\/[^/]+\/tasks\//);
    }
  });

  it("[0.2.15] no script templates contain hardcoded 'taosu' in path patterns", () => {
    const scripts = getAllScripts();
    for (const [name, content] of scripts) {
      // Check for hardcoded username in path patterns (workspace/taosu, /Users/taosu)
      // but allow usage examples like "python3 status.py -a taosu"
      expect(
        content,
        `${name} should not contain hardcoded username in paths`,
      ).not.toMatch(/workspace\/taosu|\/Users\/taosu/);
    }
  });
});

describe("regression: resolve_task_dir path handling", () => {
  it("[beta.12] resolve_task_dir handles .coding prefix", () => {
    // The function should recognize .coding-prefixed paths as relative paths
    expect(commonTaskUtils).toContain('.startswith(".coding")');
  });

  it("[current-task] resolve_task_dir normalizes backslash separators before path classification", () => {
    expect(commonTaskUtils).toContain('target_dir.replace("\\\\", "/")');
  });
});

// =============================================================================
// 3. Template Integrity (statusline opt-in)
// =============================================================================

describe("regression: statusline opt-in stays out of template walk", () => {
  it("[statusline-opt-in] statusline.py is not in claude's collected templates (update must not force-install it)", () => {
    // The opt-in statusline (`coding init --with-statusline`) must stay out
    // of the unconditional template walk: analyzeChanges() classifies any
    // collected-but-absent file as `newFiles` and installs it on update,
    // which would force statusline onto opted-out projects.
    const templates = collectPlatformTemplates("claude-code");
    expect(templates).toBeDefined();
    expect([...(templates?.keys() ?? [])]).not.toContain(
      ".claude/hooks/statusline.py",
    );
  });
});

describe("regression: update only configured platforms (beta.16)", () => {
  // NOTE: v0.5.0-beta.8 added collectTemplates for opencode. Before that,
  // opencode was the only configured platform with no update tracking —
  // `coding update` silently ignored .opencode/, so CLI-side changes to
  // opencode plugins / agents / package.json never reached installed projects.
  // That was a bug, not a design choice. This test used to assert the bug;
  // now it asserts the fix.
  it("[beta.16] collectPlatformTemplates returns Map for platforms with tracking", () => {
    const withTracking = ["claude-code"] as const;
    for (const id of withTracking) {
      const result = collectPlatformTemplates(id);
      expect(result, `${id} should have template tracking`).toBeInstanceOf(Map);
    }
  });
});

// dispatch agent removed — parallel/worktree now handled by platform-native features

// =============================================================================
// 4. Template Integrity Regressions
// =============================================================================

describe("regression: shell to Python migration (beta.0)", () => {
  it("[beta.0] no .sh scripts remain in coding templates", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".sh"), `${name} should not end with .sh`).toBe(
        false,
      );
    }
  });

  it("[beta.0] all script keys end with .py", () => {
    const scripts = getAllScripts();
    for (const [name] of scripts) {
      expect(name.endsWith(".py"), `${name} should end with .py`).toBe(true);
    }
  });

  it("[beta.3] getAllScripts covers every .py file in templates/coding/scripts/", () => {
    // Bug: update.ts had a hand-maintained file list that missed 11 scripts.
    // Fix: update.ts now uses getAllScripts() directly. This test ensures
    // getAllScripts() itself stays in sync with the filesystem.
    const scriptsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/templates/coding/scripts",
    );
    const fsFiles = new Set<string>();
    function walk(dir: string, prefix: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith(".py")) {
          fsFiles.add(`${prefix}${entry.name}`);
        }
      }
    }
    walk(scriptsDir, "");

    const scripts = getAllScripts();
    const registeredKeys = new Set(scripts.keys());

    // Known exclusions: files intentionally not in getAllScripts()
    const excluded = new Set(["hooks/linear_sync.py"]);

    for (const file of fsFiles) {
      if (excluded.has(file)) continue;
      expect(
        registeredKeys.has(file),
        `${file} exists on disk but is missing from getAllScripts()`,
      ).toBe(true);
    }
  });
});

describe("regression: hook JSON format (beta.7)", () => {
  it("[beta.7] Claude settings.json is valid JSON", () => {
    expect(() => JSON.parse(claudeSettingsTemplate)).not.toThrow();
  });

  it("[beta.7] Claude settings.json has correct hook structure", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    expect(settings).toHaveProperty("hooks");
    expect(settings).not.toHaveProperty("statusLine");
    expect(settings.hooks).toHaveProperty("SessionStart");
    expect(Array.isArray(settings.hooks.SessionStart)).toBe(true);

    // Each hook entry should have matcher and hooks array
    for (const entry of settings.hooks.SessionStart) {
      expect(entry).toHaveProperty("hooks");
      expect(Array.isArray(entry.hooks)).toBe(true);
      for (const hook of entry.hooks) {
        expect(hook).toHaveProperty("type", "command");
        expect(hook).toHaveProperty("command");
        expect(hook).toHaveProperty("timeout");
      }
    }
  });

  it("[beta.7] hook commands use {{PYTHON_CMD}} placeholder (not hardcoded python3)", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    const allHookEntries = [
      ...settings.hooks.SessionStart,
      ...settings.hooks.PreToolUse,
    ];
    for (const entry of allHookEntries) {
      for (const hook of entry.hooks) {
        expect(hook.command).toContain("{{PYTHON_CMD}}");
        expect(hook.command).not.toMatch(/^python3?\s/);
      }
    }
  });
});

describe("regression: SessionStart reinject on clear/compact (MIN-231)", () => {
  it("[MIN-231] Claude SessionStart hooks cover startup, clear, and compact", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    const matchers = settings.hooks.SessionStart.map(
      (e: { matcher: string }) => e.matcher,
    );
    expect(matchers).toEqual(
      expect.arrayContaining(["startup", "clear", "compact"]),
    );
  });

  it("[MIN-231] all SessionStart matchers invoke session-start.py", () => {
    const settings = JSON.parse(claudeSettingsTemplate);
    for (const entry of settings.hooks.SessionStart) {
      expect(
        entry.hooks[0].command,
        `claude ${entry.matcher} should invoke session-start.py`,
      ).toContain("session-start.py");
    }
  });
});

describe("regression: agent-session Coding update hint", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-update-hint-"));
    const scriptsDir = path.join(tmpDir, ".coding", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.mkdirSync(path.join(tmpDir, ".coding", "tasks"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-05-09T00:00:00Z\n",
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runContextWithCodingOutput(
    currentVersion: string,
    codingVersionOutput: string | null,
  ): string {
    fs.writeFileSync(
      path.join(tmpDir, ".coding", ".version"),
      `${currentVersion}\n`,
      "utf-8",
    );
    const runnerPath = path.join(tmpDir, "run-context.py");
    fs.writeFileSync(
      runnerPath,
      [
        "import os",
        "import sys",
        "from pathlib import Path",
        "sys.path.insert(0, str(Path.cwd() / '.coding' / 'scripts'))",
        "from common import session_context",
        "output = os.environ.get('CODING_VERSION_OUTPUT')",
        "session_context._fetch_coding_version_output = lambda: None if output == '__NONE__' else output",
        "session_context.output_text(Path.cwd())",
        "",
      ].join("\n"),
      "utf-8",
    );
    return execSync(`${pythonCmd} ${JSON.stringify(runnerPath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        CODING_VERSION_OUTPUT: codingVersionOutput ?? "__NONE__",
        CODING_CONTEXT_ID: "test-update-session",
      },
    });
  }

  function pythonFunctionBody(source: string, name: string): string {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(
      new RegExp(`def ${escapedName}\\([\\s\\S]*?\\n(?=def |# =|$)`),
    );
    return match?.[0] ?? "";
  }

  it("shows a concise update hint when coding --version reports a newer version", () => {
    const output = runContextWithCodingOutput(
      "0.5.0",
      "Coding update available: 0.5.0 → 0.5.9\nRun: coding update\n0.5.9",
    );

    expect(output).toContain("Coding update available: 0.5.0 -> 0.5.9");
    expect(output).toContain("run coding update");
    expect(output).not.toContain("run coding upgrade");
    expect(output).toContain("SESSION CONTEXT");
  });

  it("does not show a hint when installed version is equal or newer", () => {
    expect(runContextWithCodingOutput("0.5.9", "0.5.9")).not.toContain(
      "Coding update available",
    );
    fs.rmSync(path.join(tmpDir, ".coding", ".runtime"), {
      recursive: true,
      force: true,
    });
    expect(runContextWithCodingOutput("0.6.0", "0.5.9")).not.toContain(
      "Coding update available",
    );
  });

  it("silently skips the hint when coding --version fails or version parsing fails", () => {
    expect(runContextWithCodingOutput("0.5.0", null)).not.toContain(
      "Coding update available",
    );
    fs.rmSync(path.join(tmpDir, ".coding", ".runtime"), {
      recursive: true,
      force: true,
    });
    expect(runContextWithCodingOutput("not-a-version", "0.5.9")).not.toContain(
      "Coding update available",
    );
  });

  it("does not burn the once-per-session marker when version lookup fails", () => {
    expect(runContextWithCodingOutput("0.5.0", null)).not.toContain(
      "Coding update available",
    );

    const output = runContextWithCodingOutput("0.5.0", "0.5.9");

    expect(output).toContain("Coding update available: 0.5.0 -> 0.5.9");
  });

  it("uses the final coding --version token when no update line is present", () => {
    const output = runContextWithCodingOutput("0.5.0", "0.5.9");

    expect(output).toContain("Coding update available: 0.5.0 -> 0.5.9");
  });

  it("only attempts the default text update hint once per session", () => {
    const first = runContextWithCodingOutput("0.5.0", "0.5.9");
    const second = runContextWithCodingOutput("0.5.0", "0.5.9");

    expect(first).toContain("Coding update available: 0.5.0 -> 0.5.9");
    expect(second).not.toContain("Coding update available");
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".coding",
          ".runtime",
          "update-check-test-update-session.marker",
        ),
      ),
    ).toBe(true);
  });

  it("keeps the update hint out of JSON, record, packages, and phase paths", () => {
    expect(pythonFunctionBody(commonSessionContext, "output_text")).toContain(
      "_get_update_hint",
    );
    for (const functionName of [
      "get_context_json",
      "output_json",
      "get_context_record_json",
      "get_context_text_record",
    ]) {
      expect(
        pythonFunctionBody(commonSessionContext, functionName),
        `${functionName} should not check Coding updates`,
      ).not.toContain("_get_update_hint");
    }
    expect(commonGitContext).toContain('if args.mode == "record":');
    expect(commonGitContext).toContain('elif args.mode == "packages":');
    expect(commonGitContext).toContain('elif args.mode == "phase":');
    expect(commonGitContext).toContain("else:");
    expect(commonGitContext).toContain("output_text()");
  });
});

describe("regression: issue #252 polyrepo Git context", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-polyrepo-git-"));
    const scriptsDir = path.join(tmpDir, ".coding", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
    fs.mkdirSync(path.join(tmpDir, ".coding", "tasks"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".coding", "workspace", "test-dev"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".coding", ".developer"),
      "name=test-dev\n",
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfigYaml(content: string): void {
    fs.writeFileSync(
      path.join(tmpDir, ".coding", "config.yaml"),
      content,
      "utf-8",
    );
  }

  function initChildRepo(relativePath: string, commitMessage: string): void {
    const repoPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync("git init -q", { cwd: repoPath });
    execSync("git config user.email test@example.com", { cwd: repoPath });
    execSync("git config user.name Test", { cwd: repoPath });
    fs.writeFileSync(path.join(repoPath, "README.md"), `${commitMessage}\n`);
    execSync("git add README.md", { cwd: repoPath });
    execSync(`git commit -q -m ${JSON.stringify(commitMessage)}`, {
      cwd: repoPath,
    });
  }

  function runSessionContext(kind: "text" | "record" | "json"): string {
    const runnerPath = path.join(tmpDir, "run-context.py");
    let expression = "print(session_context.get_context_text(Path.cwd()))";
    if (kind === "record") {
      expression = "print(session_context.get_context_text_record(Path.cwd()))";
    } else if (kind === "json") {
      expression =
        "print(json.dumps(session_context.get_context_json(Path.cwd())))";
    }
    fs.writeFileSync(
      runnerPath,
      [
        "import json",
        "import sys",
        "from pathlib import Path",
        "sys.path.insert(0, str(Path.cwd() / '.coding' / 'scripts'))",
        "from common import session_context",
        expression,
        "",
      ].join("\n"),
      "utf-8",
    );
    return execSync(`${pythonCmd} ${JSON.stringify(runnerPath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
    });
  }

  it("does not render root as unknown/clean when configured package repos exist", () => {
    writeConfigYaml(
      [
        "packages:",
        "  module_a:",
        "    path: module-a",
        "    git: true",
        "",
      ].join("\n"),
    );
    initChildRepo("module-a", "init module a");

    const output = runSessionContext("text");
    const rootBlock = output.slice(
      output.indexOf("## GIT STATUS"),
      output.indexOf("## GIT STATUS (module_a: module-a)"),
    );

    expect(rootBlock).toContain("Root is not a Git repository.");
    expect(rootBlock).toContain(
      "Run Git commands from the package repository paths listed below.",
    );
    expect(rootBlock).not.toContain("Branch: unknown");
    expect(rootBlock).not.toContain("Working directory: Clean");
    expect(output).toContain("## GIT STATUS (module_a: module-a)");
    expect(output).toContain("init module a");
  });

  it("uses the same non-Git root rendering in record mode", () => {
    writeConfigYaml(
      [
        "packages:",
        "  module_a:",
        "    path: module-a",
        "    git: true",
        "",
      ].join("\n"),
    );
    initChildRepo("module-a", "init module a");

    const output = runSessionContext("record");
    const rootBlock = output.slice(
      output.indexOf("## GIT STATUS"),
      output.indexOf("## GIT STATUS (module_a: module-a)"),
    );

    expect(rootBlock).toContain("Root is not a Git repository.");
    expect(rootBlock).not.toContain("Branch: unknown");
    expect(rootBlock).not.toContain("Working directory: Clean");
  });

  it("discovers unconfigured child Git repos when root is not a Git repo", () => {
    writeConfigYaml("# no packages configured\n");
    initChildRepo("module-a", "init module a");
    initChildRepo(path.join("services", "module-b"), "init module b");

    const output = runSessionContext("text");

    expect(output).toContain("Root is not a Git repository.");
    expect(output).toContain("## GIT STATUS (module-a: module-a)");
    expect(output).toContain(
      "## GIT STATUS (services_module-b: services/module-b)",
    );
    expect(output).toContain("init module a");
    expect(output).toContain("init module b");
  });

  it("marks JSON root Git state as non-repo instead of clean", () => {
    writeConfigYaml(
      [
        "packages:",
        "  module_a:",
        "    path: module-a",
        "    git: true",
        "",
      ].join("\n"),
    );
    initChildRepo("module-a", "init module a");

    const context = JSON.parse(runSessionContext("json")) as {
      git: { isRepo: boolean; branch: string; isClean: boolean };
      packageGit: { name: string; path: string }[];
    };

    expect(context.git).toEqual(
      expect.objectContaining({
        isRepo: false,
        branch: "",
        isClean: false,
      }),
    );
    expect(context.packageGit).toEqual([
      expect.objectContaining({ name: "module_a", path: "module-a" }),
    ]);
  });
});

describe("regression: current-task path normalization", () => {
  let tmpDir: string;
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const claudeSessionStart = getSharedHookScripts().find(
    (hook) => hook.name === "session-start.py",
  )?.content;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-current-task-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeCodingScripts(): void {
    const scriptsDir = path.join(tmpDir, ".coding", "scripts");
    for (const [relativePath, content] of getAllScripts()) {
      const absPath = path.join(scriptsDir, relativePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf-8");
    }
  }

  function writeProjectFile(relativePath: string, content: string): void {
    const absPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf-8");
  }

  function writeLegacyCurrentTask(taskRef: string): void {
    writeProjectFile(path.join(".coding", ".current-task"), `${taskRef}\n`);
  }

  function writeSessionContext(contextKey: string, taskRef: string): void {
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", `${contextKey}.json`),
      JSON.stringify(
        {
          current_task: taskRef,
          platform: "test",
        },
        null,
        2,
      ),
    );
  }

  const SESSION_ENV_KEYS = [
    "CODING_CONTEXT_ID",
    "CLAUDE_SESSION_ID",
    "CLAUDE_CODE_SESSION_ID",
    "CODEX_SESSION_ID",
    "CODEX_THREAD_ID",
    "CURSOR_SESSION_ID",
    "CURSOR_CONVERSATION_ID",
    "CURSOR_CONVERSATIONID",
    "OPENCODE_SESSION_ID",
    "OPENCODE_SESSIONID",
    "OPENCODE_RUN_ID",
    "GEMINI_SESSION_ID",
    "FACTORY_SESSION_ID",
    "DROID_SESSION_ID",
    "QODER_SESSION_ID",
    "CODEBUDDY_SESSION_ID",
    "KIRO_SESSION_ID",
    "COPILOT_SESSION_ID",
    "COPILOT_SESSIONID",
    "PI_SESSION_ID",
    "CLAUDE_TRANSCRIPT_PATH",
    "CODEX_TRANSCRIPT_PATH",
    "CURSOR_TRANSCRIPT_PATH",
    "GEMINI_TRANSCRIPT_PATH",
    "FACTORY_TRANSCRIPT_PATH",
    "DROID_TRANSCRIPT_PATH",
    "QODER_TRANSCRIPT_PATH",
    "CODEBUDDY_TRANSCRIPT_PATH",
    "CODING_HOOKS",
    "CODING_DISABLE_HOOKS",
  ] as const;

  function sessionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const blocked = new Set<string>(SESSION_ENV_KEYS);
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!blocked.has(key)) {
        env[key] = value;
      }
    }
    return { ...env, ...overrides };
  }

  function setupTaskRepo(): void {
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".coding", "workflow.md"), "# Workflow\n");
    writeProjectFile(
      path.join(".coding", "spec", "guides", "index.md"),
      "# Guides\n",
    );
    writeProjectFile(
      path.join(".coding", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
          title: "Issue 106 task",
          status: "in_progress",
          package: null,
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".coding", "tasks", "issue-106", "prd.md"),
      "# PRD\n",
    );
    writeProjectFile(
      path.join(".coding", "tasks", "issue-106", "implement.jsonl"),
      '{"file":"src/example.ts","reason":"runtime regression"}\n',
    );
  }

  function runPython(
    relativeScriptPath: string,
    input?: string,
    envOverrides: NodeJS.ProcessEnv = {},
  ): string {
    const scriptPath = path.join(tmpDir, relativeScriptPath);
    return execSync(`${pythonCmd} ${JSON.stringify(scriptPath)}`, {
      cwd: tmpDir,
      input,
      encoding: "utf-8",
      env: sessionEnv(envOverrides),
    });
  }

  function expectTemplateContent(
    content: string | undefined,
    label: string,
  ): string {
    expect(content, `${label} template should exist`).toBeTruthy();
    return content ?? "";
  }

  it("[session-current-task] task.py start without context key enters degraded mode (returns 0, no pointer)", () => {
    // 0.5.3 hotfix: task.py start no longer hard-fails when no session identity
    // is available (Windows + Claude Code, --continue resume, etc.). Instead it
    // prints a degraded-mode warning and returns 0 so the AI workflow can
    // proceed.
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".coding\\\\tasks\\\\issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    expect(output).toContain("Session identity not available");
    expect(output).toContain("degraded");
    expect(output).toContain("conversation context");
    expect(output).toContain("CODING_CONTEXT_ID");

    // No active-task pointer written
    expect(fs.existsSync(path.join(tmpDir, ".coding", ".current-task"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, ".coding", ".runtime"))).toBe(
      false,
    );

    // task.json.status remains in_progress (was already in_progress; degraded
    // mode preserves the existing status when not planning)
    const taskJsonPath = path.join(
      tmpDir,
      ".coding",
      "tasks",
      "issue-106",
      "task.json",
    );
    const taskJson = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    expect(taskJson.status).toBe("in_progress");
  });

  it("[session-current-task] task.py start in degraded mode flips planning → in_progress", () => {
    // Verify the status flip path of degraded mode by setting up a task with
    // status=planning explicitly, then asserting the flip happened without a
    // session identity being available.
    setupTaskRepo();
    const taskJsonPath = path.join(
      tmpDir,
      ".coding",
      "tasks",
      "issue-106",
      "task.json",
    );
    const taskJson = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    taskJson.status = "planning";
    fs.writeFileSync(taskJsonPath, JSON.stringify(taskJson, null, 2), "utf-8");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".coding\\\\tasks\\\\issue-106")}`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(output).toContain("planning → in_progress");
    const after = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
    expect(after.status).toBe("in_progress");
  });

  it("[session-current-task] task.py start writes session runtime state when CODING_CONTEXT_ID is set", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".coding\\\\tasks\\\\issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "session-a" }),
      },
    );

    expect(output).toContain("Source: session:session-a");
    expect(output).not.toContain("Fallback:");
    const contextPath = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "session-a.json",
    );
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(".coding/tasks/issue-106");
    expect(fs.existsSync(path.join(tmpDir, ".coding", ".current-task"))).toBe(
      false,
    );
  });

  it("[session-current-task] task.py finish deletes the session runtime context", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const contextPath = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "session-finish.json",
    );

    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".coding/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "session-finish" }),
      },
    );
    expect(fs.existsSync(contextPath)).toBe(true);

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "session-finish" }),
      },
    );

    expect(output).toContain("Cleared current task");
    expect(output).toContain("Source: session:session-finish");
    expect(fs.existsSync(contextPath)).toBe(false);
  });

  it("[workflow-state-r7] task.py create auto-sets session pointer when CODING_CONTEXT_ID is set (planning breadcrumb reachable)", () => {
    // Pre-R7 (v0.5.0-beta.19 and earlier), `task.py create` only created the
    // task directory; the session pointer was set by `task.py start`. That
    // made the [workflow-state:planning] block dead text — the breadcrumb
    // stayed at no_task during brainstorm + jsonl curation. R7 hooked
    // set_active_task into cmd_create so the planning breadcrumb fires
    // immediately when session identity is available.
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".coding", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-auto-active" --slug r7-auto --assignee test-dev`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "r7-session" }),
      },
    );

    // Resolve the new task directory (MM-DD-r7-auto)
    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".coding", "tasks"))
      .find((d) => d.includes("r7-auto"));
    expect(taskDir).toBeDefined();

    const contextPath = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "r7-session.json",
    );
    expect(fs.existsSync(contextPath)).toBe(true);
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(`.coding/tasks/${taskDir}`);
  });

  it("[issue-397] task.py create warns on blank description and reports session activation", () => {
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".coding", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",
        "blank description task",
        "--slug",
        "blank-description",
        "--assignee",
        "test-dev",
      ],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "issue-397-session" }),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("task description is empty");
    expect(result.stderr).toContain("Activated task for this session");
    expect(result.stderr).toContain("Source: session:issue-397-session");

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".coding", "tasks"))
      .find((d) => d.includes("blank-description"));
    expect(taskDir).toBeDefined();
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".coding", "tasks", taskDir as string, "task.json"),
        "utf-8",
      ),
    ) as { description: string };
    expect(taskJson.description).toBe("");
  });

  it("[issue-397] task.py create --no-start does not move the session pointer", () => {
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".coding", "workflow.md"), "# Workflow\n");
    writeSessionContext("batch-session", ".coding/tasks/existing-task");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",
        "batch backlog task",
        "--slug",
        "batch-backlog",
        "--assignee",
        "test-dev",
        "--description",
        "   ",
        "--no-start",
      ],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "batch-session" }),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Skipped session activation (--no-start)");
    const context = JSON.parse(
      fs.readFileSync(
        path.join(
          tmpDir,
          ".coding",
          ".runtime",
          "sessions",
          "batch-session.json",
        ),
        "utf-8",
      ),
    ) as { current_task: string };
    expect(context.current_task).toBe(".coding/tasks/existing-task");

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".coding", "tasks"))
      .find((d) => d.includes("batch-backlog"));
    expect(taskDir).toBeDefined();
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".coding", "tasks", taskDir as string, "task.json"),
        "utf-8",
      ),
    ) as { description: string };
    expect(taskJson.description).toBe("");
  });

  it("[workflow-state-r7] task.py create degrades silently without session identity (no .runtime side effect)", () => {
    // R7 contract: best-effort activation. No context key (CLI shell with no
    // session env) → task is still created, but no .runtime/sessions/ file is
    // written. Pre-R7 behavior parity for headless CLI usage.
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".coding", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    // sessionEnv() with no overrides drops every session-identity env var.
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-cli-only" --slug r7-cli --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".coding", "tasks"))
      .find((d) => d.includes("r7-cli"));
    expect(taskDir).toBeDefined();

    const sessionsDir = path.join(tmpDir, ".coding", ".runtime", "sessions");
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      expect(files).toEqual([]);
    }
  });

  it("[workflow-state-r7] task.py create then task.py start is idempotent (pointer + status flip)", () => {
    // Finding 6: R7 made cmd_create auto-call set_active_task. cmd_start also
    // calls set_active_task. The second call must not error, and status must
    // still flip planning → in_progress correctly.
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".coding", "workflow.md"), "# Workflow\n");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "r7-idem" --slug r7-idem --assignee test-dev`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "r7-idem-session" }),
      },
    );

    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".coding", "tasks"))
      .find((d) => d.includes("r7-idem"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".coding", "tasks", taskDir as string);

    // Status should be planning after create.
    const taskJsonPath = path.join(
      tmpDir,
      ".coding",
      "tasks",
      taskDir as string,
      "task.json",
    );
    const beforeStart = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
    };
    expect(beforeStart.status).toBe("planning");

    // Now run start with the same session — must not error.
    let startStatus = 0;
    let startOutput = "";
    try {
      startOutput = execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(relTaskDir)}`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv({ CODING_CONTEXT_ID: "r7-idem-session" }),
        },
      );
    } catch (err) {
      const e = err as { status?: number; stderr?: string; stdout?: string };
      startStatus = e.status ?? 1;
      startOutput = (e.stdout ?? "") + (e.stderr ?? "");
    }
    expect(startStatus).toBe(0);
    expect(startOutput).toContain("planning → in_progress");

    // Status flipped to in_progress.
    const afterStart = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
    };
    expect(afterStart.status).toBe("in_progress");

    // Pointer still points at the same task.
    const contextPath = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "r7-idem-session.json",
    );
    expect(fs.existsSync(contextPath)).toBe(true);
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(relTaskDir);
  });

  it("[session-current-task] task.py archive deletes runtime sessions pointing at the archived task", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const contextA = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "session-a.json",
    );
    const contextB = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "session-b.json",
    );
    const contextOther = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "session-other.json",
    );
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", "session-a.json"),
      JSON.stringify({ current_task: ".coding/tasks/issue-106" }, null, 2),
    );
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", "session-b.json"),
      JSON.stringify({ current_task: "issue-106" }, null, 2),
    );
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", "session-other.json"),
      JSON.stringify({ current_task: ".coding/tasks/other-task" }, null, 2),
    );

    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive issue-106 --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    expect(fs.existsSync(contextA)).toBe(false);
    expect(fs.existsSync(contextB)).toBe(false);
    expect(fs.existsSync(contextOther)).toBe(true);
  });

  it("[session-lifecycle] finish clears the fallback-resolved pointer (#6)", () => {
    // finish resolves the active task via the single-session fallback when the
    // current context key has no file. The pointer it deletes must be the file
    // it actually resolved (stem "only-session"), not the current-key file
    // ("ghost", which doesn't exist) — otherwise the pointer survives while
    // finish reports "✓ Cleared".
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    writeSessionContext("only-session", ".coding/tasks/issue-106");
    const pointerPath = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "only-session.json",
    );
    expect(fs.existsSync(pointerPath)).toBe(true);

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "ghost" }),
      },
    );

    expect(output).toContain("Cleared current task");
    expect(output).toContain(".coding/tasks/issue-106");
    // The actually-resolved pointer file is gone (no false "cleared" report).
    expect(fs.existsSync(pointerPath)).toBe(false);
  });

  it("[session-lifecycle] prune-sessions removes aged, keeps fresh + current (#5)", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const fresh = new Date(Date.now() - 60_000)
      .toISOString()
      .replace(/\.\d+Z$/, "Z");
    const sessionsDir = path.join(".coding", ".runtime", "sessions");
    // aged: last_seen well beyond the 7-day TTL → pruned.
    writeProjectFile(
      path.join(sessionsDir, "aged.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/issue-106", last_seen_at: "2020-01-01T00:00:00Z" },
        null,
        2,
      ),
    );
    // fresh: within TTL → kept.
    writeProjectFile(
      path.join(sessionsDir, "fresh.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/issue-106", last_seen_at: fresh },
        null,
        2,
      ),
    );
    // cur: current context — kept even though aged, via the exclude guard.
    writeProjectFile(
      path.join(sessionsDir, "cur.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/issue-106", last_seen_at: "2020-01-01T00:00:00Z" },
        null,
        2,
      ),
    );

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} prune-sessions`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "cur" }),
      },
    );

    const abs = (name: string) => path.join(tmpDir, sessionsDir, name);
    expect(fs.existsSync(abs("aged.json"))).toBe(false);
    expect(fs.existsSync(abs("fresh.json"))).toBe(true);
    expect(fs.existsSync(abs("cur.json"))).toBe(true);
    expect(output).toContain("Pruned 1");
  });

  it("[session-lifecycle] prune-sessions keeps all pointers within TTL (#5 no false delete)", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const fresh = new Date(Date.now() - 60_000)
      .toISOString()
      .replace(/\.\d+Z$/, "Z");
    const sessionsDir = path.join(".coding", ".runtime", "sessions");
    writeProjectFile(
      path.join(sessionsDir, "one.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/issue-106", last_seen_at: fresh },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(sessionsDir, "two.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/issue-106", last_seen_at: fresh },
        null,
        2,
      ),
    );

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} prune-sessions`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "other" }),
      },
    );

    const abs = (name: string) => path.join(tmpDir, sessionsDir, name);
    expect(fs.existsSync(abs("one.json"))).toBe(true);
    expect(fs.existsSync(abs("two.json"))).toBe(true);
    expect(output).toContain("Pruned 0");
  });

  it("[session-lifecycle] prune restores the single-session fallback (#5 AC2)", () => {
    // Two pointers: an aged zombie (leaked by a crash) plus the real session.
    // With ≥2 files the exactly-one fallback returns nothing. Pruning the
    // zombie leaves exactly one file, so `current` (no session identity)
    // recovers the active task via the single-session fallback.
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const fresh = new Date(Date.now() - 60_000)
      .toISOString()
      .replace(/\.\d+Z$/, "Z");
    const sessionsDir = path.join(".coding", ".runtime", "sessions");
    writeProjectFile(
      path.join(sessionsDir, "zombie.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/issue-106", last_seen_at: "2020-01-01T00:00:00Z" },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(sessionsDir, "real.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/issue-106", last_seen_at: fresh },
        null,
        2,
      ),
    );

    // Before prune: two files → fallback refuses to guess.
    let before = 1;
    try {
      execSync(`${pythonCmd} ${JSON.stringify(taskScriptPath)} current`, {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      });
      before = 0;
    } catch (err) {
      before = (err as { status?: number }).status ?? 1;
    }
    expect(before).toBe(1);

    execSync(`${pythonCmd} ${JSON.stringify(taskScriptPath)} prune-sessions`, {
      cwd: tmpDir,
      encoding: "utf-8",
      env: sessionEnv(),
    });

    const abs = (name: string) => path.join(tmpDir, sessionsDir, name);
    expect(fs.existsSync(abs("zombie.json"))).toBe(false);
    expect(fs.existsSync(abs("real.json"))).toBe(true);

    // After prune: exactly one file → fallback resolves the active task.
    const currentOut = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} current`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );
    expect(currentOut.trim()).toBe(".coding/tasks/issue-106");
  });

  it("[task-lifecycle] task.py create refuses an archived task dir-name collision", () => {
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    writeProjectFile(path.join(".coding", "workflow.md"), "# Workflow\n");
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const createArgs = [
      taskScriptPath,
      "create",
      "web auth retry",
      "--slug",
      "web-auth-retry",
      "--assignee",
      "test-dev",
    ];
    const env = sessionEnv({ CODING_CONTEXT_ID: "archive-collision" });

    execSync(
      `${pythonCmd} ${createArgs.map((arg) => JSON.stringify(arg)).join(" ")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env,
      },
    );

    const tasksDir = path.join(tmpDir, ".coding", "tasks");
    const taskDirName = fs
      .readdirSync(tasksDir)
      .find((entry) => entry.endsWith("-web-auth-retry"));
    expect(taskDirName).toBeDefined();
    const activeTaskDir = path.join(tasksDir, taskDirName as string);
    fs.writeFileSync(path.join(activeTaskDir, "prd.md"), "# PRD\n", "utf-8");

    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${JSON.stringify(taskDirName)} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env,
      },
    );

    const archiveRoot = path.join(tasksDir, "archive");
    let archivedTaskDir: string | undefined;
    for (const monthDir of fs.readdirSync(archiveRoot)) {
      const candidate = path.join(archiveRoot, monthDir, taskDirName as string);
      if (fs.existsSync(candidate)) {
        archivedTaskDir = candidate;
      }
    }
    expect(archivedTaskDir).toBeDefined();
    const archivedTaskJsonPath = path.join(
      archivedTaskDir as string,
      "task.json",
    );
    const archivedPrdPath = path.join(archivedTaskDir as string, "prd.md");
    const archivedTaskJsonBefore = fs.readFileSync(
      archivedTaskJsonPath,
      "utf-8",
    );
    const archivedPrdBefore = fs.readFileSync(archivedPrdPath, "utf-8");
    const archivedTaskJson = JSON.parse(archivedTaskJsonBefore) as {
      status: string;
      completedAt: string | null;
    };
    expect(archivedTaskJson.status).toBe("completed");
    expect(archivedTaskJson.completedAt).not.toBeNull();

    const contextPath = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "archive-collision.json",
    );
    expect(fs.existsSync(contextPath)).toBe(false);

    const result = spawnSync(pythonCmd, createArgs, {
      cwd: tmpDir,
      encoding: "utf-8",
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Task already archived");
    expect(result.stderr).toContain(taskDirName as string);
    expect(result.stderr).toContain(".coding/tasks/archive/");
    expect(fs.existsSync(path.join(tasksDir, taskDirName as string))).toBe(
      false,
    );
    expect(fs.readFileSync(archivedTaskJsonPath, "utf-8")).toBe(
      archivedTaskJsonBefore,
    );
    expect(fs.readFileSync(archivedPrdPath, "utf-8")).toBe(archivedPrdBefore);
    expect(fs.existsSync(contextPath)).toBe(false);
  });

  it("[issue-377] task.py create normalizes a --slug carrying today's date prefix", () => {
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const now = new Date();
    const todayPrefix = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",
        "Example Task",
        "--slug",
        `${todayPrefix}-example-task`,
        "--assignee",
        "test-dev",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("normalized to");
    const tasksDir = path.join(tmpDir, ".coding", "tasks");
    expect(
      fs.existsSync(path.join(tasksDir, `${todayPrefix}-example-task`)),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tasksDir, `${todayPrefix}-${todayPrefix}-example-task`),
      ),
    ).toBe(false);
  });

  it("[issue-377] task.py create rejects a --slug carrying a different date prefix", () => {
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const now = new Date();
    // Pick a valid date prefix that is guaranteed not to be today.
    const otherPrefix =
      now.getMonth() + 1 === 1 && now.getDate() === 1 ? "02-02" : "01-01";

    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",
        "Example Task",
        "--slug",
        `${otherPrefix}-example-task`,
        "--assignee",
        "test-dev",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("date prefix");
    expect(result.stderr).toContain("--slug example-task");
    const tasksDir = path.join(tmpDir, ".coding", "tasks");
    const created = fs.existsSync(tasksDir) ? fs.readdirSync(tasksDir) : [];
    expect(created.filter((d) => d.endsWith("example-task"))).toEqual([]);
  });

  it("[issue-377] task.py create leaves non-date numeric slug prefixes untouched", () => {
    writeCodingScripts();
    writeProjectFile(
      path.join(".coding", ".developer"),
      "name=test-dev\ninitialized_at=2026-03-27T00:00:00\n",
    );
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const now = new Date();
    const todayPrefix = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 13-45 is not a valid MM-DD date, so it is part of the slug body.
    const result = spawnSync(
      pythonCmd,
      [
        taskScriptPath,
        "create",
        "Example Task",
        "--slug",
        "13-45-example-task",
        "--assignee",
        "test-dev",
      ],
      { cwd: tmpDir, encoding: "utf-8", env: sessionEnv() },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("normalized to");
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".coding",
          "tasks",
          `${todayPrefix}-13-45-example-task`,
        ),
      ),
    ).toBe(true);
  });

  it("[task-input-contract] task.py archive accepts task name, relative path, and absolute path", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    // Create three additional task directories for the three input forms.
    const taskNames = ["issue-201", "issue-202", "issue-203"];
    for (const name of taskNames) {
      writeProjectFile(
        path.join(".coding", "tasks", name, "task.json"),
        JSON.stringify(
          {
            title: `Task ${name}`,
            status: "in_progress",
            package: null,
          },
          null,
          2,
        ),
      );
    }

    // Form 1: bare slug
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${taskNames[0]} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    // Form 2: relative path
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${JSON.stringify(`.coding/tasks/${taskNames[1]}`)} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    // Form 3: absolute path
    const absPath = path.join(tmpDir, ".coding", "tasks", taskNames[2]);
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} archive ${JSON.stringify(absPath)} --no-commit`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv(),
      },
    );

    // All three task dirs should be removed from active tasks/.
    for (const name of taskNames) {
      expect(
        fs.existsSync(path.join(tmpDir, ".coding", "tasks", name)),
        `task ${name} should no longer exist in active tasks/`,
      ).toBe(false);
    }

    // All three should appear under archive/<YYYY-MM>/.
    const archiveRoot = path.join(tmpDir, ".coding", "tasks", "archive");
    expect(fs.existsSync(archiveRoot)).toBe(true);
    const archivedNames = new Set<string>();
    for (const monthDir of fs.readdirSync(archiveRoot)) {
      const monthPath = path.join(archiveRoot, monthDir);
      if (fs.statSync(monthPath).isDirectory()) {
        for (const taskDir of fs.readdirSync(monthPath)) {
          archivedNames.add(taskDir);
        }
      }
    }
    for (const name of taskNames) {
      expect(archivedNames.has(name), `task ${name} should be archived`).toBe(
        true,
      );
    }
  });

  it("[session-current-task] task.py start also uses platform-native session env when available", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} start ${JSON.stringify(".coding/tasks/issue-106")}`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CLAUDE_SESSION_ID: "native-a" }),
      },
    );

    expect(output).toContain("Source: session:claude_native-a");
    const contextPath = path.join(
      tmpDir,
      ".coding",
      ".runtime",
      "sessions",
      "claude_native-a.json",
    );
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8")) as {
      current_task: string;
    };
    expect(context.current_task).toBe(".coding/tasks/issue-106");
  });

  it("[session-current-task] task.py finish ignores legacy .current-task when no session task is set", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".coding/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} finish`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "session-fallback" }),
      },
    );

    expect(output).toContain("No current task set");
    expect(fs.existsSync(path.join(tmpDir, ".coding", ".current-task"))).toBe(
      true,
    );
  });

  it("[session-current-task] task.py current ignores legacy .current-task without context key", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".coding/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    let output = "";
    let status = 0;
    try {
      execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv(),
        },
      );
    } catch (error) {
      status =
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : 1;
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }

    expect(status).toBe(1);
    expect(output).toContain("Current task: (none)");
    expect(output).toContain("Source: none");
  });

  it("[session-current-task] stale session task does not fall back to legacy .current-task", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".coding/tasks/issue-106");
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", "session-b.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/missing-task", platform: "test" },
        null,
        2,
      ),
    );
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    const output = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`,
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "session-b" }),
      },
    );

    expect(output).toContain("Current task: .coding/tasks/missing-task");
    expect(output).toContain("Source: session:session-b");
    expect(output).toContain("State: stale");
    expect(output).not.toContain("issue-106");
  });

  it("[loop-feedback] set-check rejects a stale active-task pointer", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", "stale-session.json"),
      JSON.stringify(
        { current_task: ".coding/tasks/missing-task", platform: "claude" },
        null,
        2,
      ),
    );
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "set-check", "fail"],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "stale-session" }),
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("stale");
  });

  it("[loop-feedback] set-check pass writes meta.loop.check_status", () => {
    setupTaskRepo();
    writeSessionContext("loop-session", ".coding/tasks/issue-106");
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");

    const result = spawnSync(
      pythonCmd,
      [taskScriptPath, "set-check", "pass"],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: sessionEnv({ CODING_CONTEXT_ID: "loop-session" }),
      },
    );

    expect(result.status).toBe(0);

    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".coding", "tasks", "issue-106", "task.json"),
        "utf-8",
      ),
    );
    expect(taskJson.meta.loop.check_status).toBe("pass");
    expect(taskJson.meta.loop.iteration_count).toBe(0);
  });

  it("[session-current-task] Claude statusline uses session-scoped task when session_id is present", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".coding/tasks/issue-106");
    writeProjectFile(
      path.join(".coding", "tasks", "session-task", "task.json"),
      JSON.stringify(
        {
          title: "Session scoped task",
          status: "in_progress",
          priority: "P1",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", "claude_status-a.json"),
      JSON.stringify(
        {
          current_task: ".coding/tasks/session-task",
          platform: "claude",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    const nowSecs = Math.floor(Date.now() / 1000);
    const output = runPython(
      path.join(".claude", "hooks", "statusline.py"),
      JSON.stringify({
        session_id: "status-a",
        model: { display_name: "Test" },
        context_window: { used_percentage: 1, context_window_size: 1000 },
        cost: { total_duration_ms: 0 },
        rate_limits: {
          five_hour: {
            used_percentage: 17,
            resets_at: nowSecs + 4 * 3600 + 31 * 60 + 60,
          },
          seven_day: {
            used_percentage: 19,
            resets_at: nowSecs + 2 * 86400 + 11 * 3600 + 60,
          },
        },
      }),
    );

    expect(output).toContain("Session scoped task");
    expect(output).toContain("[session]");
    expect(output).not.toContain("Issue 106 task");
    // Rate-limit display with reset countdown (opt-in statusline enhancement)
    expect(output).toContain("5h 17%");
    expect(output).toMatch(/\(reset 4h3[12]m\)/);
    expect(output).toContain("7d 19%");
    expect(output).toContain("(reset 2d11h)");
  });

  it("[session-current-task] Claude statusline ignores legacy .current-task without session context", () => {
    setupTaskRepo();
    writeLegacyCurrentTask(".coding/tasks/issue-106");
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    const output = runPython(
      path.join(".claude", "hooks", "statusline.py"),
      JSON.stringify({
        model: { display_name: "Test" },
        context_window: { used_percentage: 1, context_window_size: 1000 },
        cost: { total_duration_ms: 0 },
      }),
    );

    expect(output).not.toContain("Issue 106 task");
    expect(output).not.toContain("[global]");
  });

  it("[statusline-opt-in] Claude statusline tolerates ISO-8601 resets_at and missing seven_day (no crash)", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    // resets_at wire format is not pinned across Claude Code versions:
    // epoch seconds and ISO-8601 strings have both been observed. The
    // statusline must render the countdown for ISO too — and never crash.
    const isoReset = new Date(
      Date.now() + (4 * 3600 + 31 * 60 + 90) * 1000,
    ).toISOString();
    const output = runPython(
      path.join(".claude", "hooks", "statusline.py"),
      JSON.stringify({
        model: { display_name: "Test" },
        context_window: { used_percentage: 1, context_window_size: 1000 },
        cost: { total_duration_ms: 0 },
        rate_limits: {
          five_hour: { used_percentage: 17, resets_at: isoReset },
          // seven_day intentionally absent
        },
      }),
    );

    expect(output).toContain("5h 17%");
    expect(output).toMatch(/\(reset 4h3[12]m\)/);
    expect(output).not.toContain("7d");
  });

  function statuslineRateLimitPayload(): string {
    const nowSecs = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      model: { display_name: "Test" },
      context_window: { used_percentage: 1, context_window_size: 1000 },
      cost: { total_duration_ms: 0 },
      rate_limits: {
        five_hour: {
          used_percentage: 17,
          resets_at: nowSecs + 4 * 3600 + 31 * 60 + 60,
        },
        seven_day: {
          used_percentage: 19,
          resets_at: nowSecs + 2 * 86400 + 11 * 3600 + 60,
        },
      },
    });
  }

  it("[statusline-opt-in] Claude statusline moves rate limits to their own line when COLUMNS is narrow", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    // COLUMNS is injected by Claude Code v2.1.153+. The split must be an
    // explicit "\n": the status bar counts only newlines for its height,
    // so relying on terminal auto-wrap misaligns rows.
    const output = runPython(
      path.join(".claude", "hooks", "statusline.py"),
      statuslineRateLimitPayload(),
      { COLUMNS: "60" },
    );

    const lines = output.trimEnd().split("\n");
    expect(lines.length).toBe(2);
    const [infoLine, rateLine] = lines;
    expect(infoLine).not.toContain("5h");
    expect(infoLine).not.toContain("7d");
    expect(rateLine).toContain("5h 17%");
    expect(rateLine).toContain("7d 19%");
  });

  it("[statusline-opt-in] Claude statusline stays single-line when COLUMNS is wide or unset", () => {
    setupTaskRepo();
    writeProjectFile(
      path.join(".claude", "hooks", "statusline.py"),
      getStatuslineHook(),
    );

    for (const env of [{ COLUMNS: "500" }, { COLUMNS: undefined }]) {
      const output = runPython(
        path.join(".claude", "hooks", "statusline.py"),
        statuslineRateLimitPayload(),
        env,
      );
      const lines = output.trimEnd().split("\n");
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain("5h 17%");
      expect(lines[0]).toContain("7d 19%");
    }
  });

  it("[session-current-task] Python session-start hooks resolve session backslash refs without stale pointer", () => {
    setupTaskRepo();
    writeSessionContext("claude_session-a", ".coding\\tasks\\issue-106");

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );

    const claudeOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({ cwd: tmpDir, session_id: "session-a" }),
    );

    expect(claudeOutput).toContain("Status: IN_PROGRESS");
    expect(claudeOutput).not.toContain("STALE POINTER");
  });

  it("[session-current-task] Claude SessionStart persists CODING_CONTEXT_ID for Bash commands", () => {
    setupTaskRepo();
    const sessionStartScript = getSharedHookScripts().find(
      (hook) => hook.name === "session-start.py",
    )?.content;
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(sessionStartScript, "claude session-start"),
    );
    const envFile = path.join(tmpDir, "claude-env.sh");

    runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({
        session_id: "bash-start-a",
        transcript_path: path.join(tmpDir, "transcript.jsonl"),
        cwd: tmpDir,
        hook_event_name: "SessionStart",
      }),
      { CLAUDE_ENV_FILE: envFile },
    );

    expect(fs.readFileSync(envFile, "utf-8")).toContain(
      "export CODING_CONTEXT_ID=claude_bash-start-a",
    );
  });

  it("[session-start-proof] shared context includes one-shot first-reply notice without changing payload shape", () => {
    setupTaskRepo();

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );

    const sharedPayload = JSON.parse(
      runPython(path.join(".claude", "hooks", "session-start.py")),
    ) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    for (const payload of [sharedPayload]) {
      expect(Object.keys(payload)).not.toContain("firstReplyNotice");
      expect(Object.keys(payload.hookSpecificOutput)).toEqual([
        "hookEventName",
        "additionalContext",
      ]);
      expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");

      const ctx = payload.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("<first-reply-notice>");
      expect(ctx).toMatch(
        /first visible assistant reply|First visible reply|Coding SessionStart 已注入/,
      );
      expect(ctx).toMatch(/one-shot/i);
      expect(ctx.indexOf("<first-reply-notice>")).toBeLessThan(
        ctx.indexOf("<current-state>"),
      );
    }
  });

  it("[workflow-v2] shared session-start summarizes in-progress context without auto-dispatch approval", () => {
    setupTaskRepo();
    writeSessionContext("claude_session-a", ".coding/tasks/issue-106");

    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "claude session-start"),
    );

    const rawOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      JSON.stringify({ cwd: tmpDir, session_id: "session-a" }),
    );
    expect(rawOutput).toContain("Status: IN_PROGRESS");
    expect(rawOutput).toContain("Implementation/check context order");
    expect(rawOutput).toContain("prd.md");
    expect(rawOutput).toContain("design.md if present");
    expect(rawOutput).toContain("implement.md if present");
    expect(rawOutput).not.toContain("if you stay in the main session");
    expect(rawOutput).not.toContain("Next required action: dispatch");
    expect(rawOutput).not.toContain("If there is an active task, ask whether");
    expect(rawOutput).toContain("load details on demand");
  });

  it("[coding-hooks-env] runtime: shared hooks emit no additionalContext when CODING_HOOKS=0", () => {
    setupTaskRepo();
    writeSessionContext("claude_session-a", ".coding/tasks/issue-106");

    const claudeSession = expectTemplateContent(
      claudeSessionStart,
      "claude session-start",
    );
    const workflowState = expectTemplateContent(
      getSharedHookScripts().find((h) => h.name === "inject-workflow-state.py")
        ?.content,
      "inject-workflow-state",
    );
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      claudeSession,
    );
    writeProjectFile(
      path.join(".claude", "hooks", "inject-workflow-state.py"),
      workflowState,
    );

    const stdinPayload = JSON.stringify({
      cwd: tmpDir,
      session_id: "session-a",
    });

    // Baseline: gate off, hooks emit content (sanity check)
    const baselineSession = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      stdinPayload,
    );
    expect(baselineSession).toContain("hookSpecificOutput");

    // With CODING_HOOKS=0: shared hooks short-circuit with empty stdout
    const gatedSession = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      stdinPayload,
      { CODING_HOOKS: "0" },
    );
    expect(gatedSession.trim()).toBe("");

    const gatedWorkflow = runPython(
      path.join(".claude", "hooks", "inject-workflow-state.py"),
      stdinPayload,
      { CODING_HOOKS: "0" },
    );
    expect(gatedWorkflow.trim()).toBe("");

    // CODING_DISABLE_HOOKS=1 has the same effect
    const gatedAlt = runPython(
      path.join(".claude", "hooks", "session-start.py"),
      stdinPayload,
      { CODING_DISABLE_HOOKS: "1" },
    );
    expect(gatedAlt.trim()).toBe("");
  });

  // ------------------------------------------------------------
  // Single-session fallback (issue #225 — class-2 sub-agents)
  // ------------------------------------------------------------

  function runTaskCurrent(envOverrides: NodeJS.ProcessEnv = {}): {
    output: string;
    status: number;
  } {
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    let output = "";
    let status = 0;
    try {
      output = execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} current --source`,
        {
          cwd: tmpDir,
          encoding: "utf-8",
          env: sessionEnv(envOverrides),
        },
      );
    } catch (error) {
      status =
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : 1;
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }
    return { output, status };
  }

  it("[session-fallback] single session file — fallback returns its task with session-fallback source", () => {
    setupTaskRepo();
    writeSessionContext("codex_session_parent", ".coding/tasks/issue-106");

    const { output, status } = runTaskCurrent();
    expect(status).toBe(0);
    expect(output).toContain("Current task: .coding/tasks/issue-106");
    expect(output).toContain("Source: session-fallback:codex_session_parent");
  });

  it("[session-fallback] zero session files — no fallback, returns none", () => {
    setupTaskRepo();
    // No session files written

    const { output, status } = runTaskCurrent();
    expect(status).toBe(1);
    expect(output).toContain("Current task: (none)");
    expect(output).toContain("Source: none");
  });

  it("[session-fallback] multiple session files — refuses to guess, returns none", () => {
    setupTaskRepo();
    writeSessionContext("codex_session_a", ".coding/tasks/issue-106");
    writeProjectFile(
      path.join(".coding", "tasks", "other-task", "task.json"),
      JSON.stringify({ title: "other", status: "in_progress" }, null, 2),
    );
    writeSessionContext("codex_session_b", ".coding/tasks/other-task");

    const { output, status } = runTaskCurrent();
    expect(status).toBe(1);
    expect(output).toContain("Current task: (none)");
    expect(output).toContain("Source: none");
  });

  it("[session-fallback] explicit context-key match takes precedence over fallback", () => {
    setupTaskRepo();
    writeSessionContext("codex_session_explicit", ".coding/tasks/issue-106");

    const { output, status } = runTaskCurrent({
      CODING_CONTEXT_ID: "codex_session_explicit",
    });
    expect(status).toBe(0);
    expect(output).toContain("Current task: .coding/tasks/issue-106");
    // Source should be "session:" (precise match), not "session-fallback:"
    expect(output).toContain("Source: session:codex_session_explicit");
    expect(output).not.toContain("session-fallback");
  });

  // ------------------------------------------------------------
  // inject-workflow-state.py hook (workflow-enforcement-v2)
  // ------------------------------------------------------------

  const injectWorkflowStateScript = getSharedHookScripts().find(
    (hook) => hook.name === "inject-workflow-state.py",
  )?.content;

  function writeWorkflowStateHook(): void {
    writeProjectFile(
      path.join(".coding", "hooks", "inject-workflow-state.py"),
      expectTemplateContent(injectWorkflowStateScript, "inject-workflow-state"),
    );
  }

  function setStatus(status: string): void {
    const taskJsonPath = path.join(
      tmpDir,
      ".coding",
      "tasks",
      "issue-106",
      "task.json",
    );
    const data = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8")) as {
      status: string;
    };
    data.status = status;
    fs.writeFileSync(taskJsonPath, JSON.stringify(data, null, 2));
  }

  function writeWorkflowMd(body: string): void {
    writeProjectFile(path.join(".coding", "workflow.md"), body);
  }

  function runInjectWorkflowState(cwdOverride?: string): string {
    return runInjectWorkflowStateWithInput({
      cwd: cwdOverride ?? tmpDir,
      session_id: "workflow-a",
    });
  }

  function runInjectWorkflowStateWithInput(inputData: object): string {
    return runPython(
      path.join(".coding", "hooks", "inject-workflow-state.py"),
      JSON.stringify(inputData),
    );
  }

  it("[workflow-state] missing/empty workflow.md degrades to generic line (post-R5: no fallback dict)", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".coding/tasks/issue-106");
    writeWorkflowStateHook();
    // overwrite workflow.md with empty content (no tag blocks). After
    // v0.5.0-rc.0 the fallback dict was removed — the hook now degrades
    // to the generic "Refer to workflow.md" line so users see (and fix) the
    // broken state instead of being silently masked by hardcoded text.
    writeWorkflowMd("# Empty\n");

    const output = runInjectWorkflowState();
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106 (in_progress)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Refer to workflow.md",
    );
    // Hardcoded fallback wording must NOT appear post-R5
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
      "coding-implement → coding-check",
    );
  });

  it("[workflow-state] in_progress tag in workflow.md mentions Phase 3.4 commit (R1 invariant)", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".coding/tasks/issue-106");
    writeWorkflowStateHook();
    // Write a workflow.md containing only the in_progress tag with the
    // canonical Phase 3.4 commit reminder. This guards against future
    // regressions that omit Phase 3.4 from the per-turn breadcrumb.
    writeWorkflowMd(
      "[workflow-state:in_progress]\n" +
        "Flow: coding-implement → coding-check → coding-update-spec → commit (Phase 3.4) → /coding:finish-work\n" +
        "[/workflow-state:in_progress]\n",
    );

    const parsed = JSON.parse(runInjectWorkflowState()) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "commit (Phase 3.4)",
    );
  });

  it("[workflow-state] workflow.md tag overrides hardcoded fallback", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".coding/tasks/issue-106");
    writeWorkflowStateHook();
    writeWorkflowMd(
      "[workflow-state:in_progress]\nCUSTOM BODY from workflow.md\n[/workflow-state:in_progress]\n",
    );

    const parsed = JSON.parse(runInjectWorkflowState()) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "CUSTOM BODY from workflow.md",
    );
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
      "coding-implement → coding-check",
    );
  });

  it("[workflow-state-r5] inject-workflow-state.py contains no _FALLBACK_BREADCRUMBS dict (post-rc.0 collapse)", () => {
    // R5: the fallback breadcrumb dict was removed in v0.5.0-rc.0 to
    // collapse three sources (workflow.md / py / js) to one. This test
    // guards against accidental re-introduction.
    const py = injectWorkflowStateScript ?? "";
    expect(py).not.toMatch(/_FALLBACK_BREADCRUMBS\s*=\s*\{/);
  });

  it("[workflow-state] custom status with hyphen matches via regex", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".coding/tasks/issue-106");
    writeWorkflowStateHook();
    setStatus("in-review");
    writeWorkflowMd(
      "[workflow-state:in-review]\nTeam review pending\n[/workflow-state:in-review]\n",
    );

    const parsed = JSON.parse(runInjectWorkflowState()) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106 (in-review)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Team review pending",
    );
  });

  it("[workflow-state] unknown status with no tag emits generic fallback, not silent", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".coding/tasks/issue-106");
    writeWorkflowStateHook();
    setStatus("weirdstate");
    writeWorkflowMd("# no matching tags\n");

    const output = runInjectWorkflowState();
    expect(output.trim()).not.toBe("");
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106 (weirdstate)",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Refer to workflow.md",
    );
  });

  it("[workflow-state] CWD drift: hook finds .coding/ when invoked from subdirectory", () => {
    setupTaskRepo();
    writeSessionContext("session_workflow-a", ".coding/tasks/issue-106");
    writeWorkflowStateHook();
    // Create a subdirectory and invoke hook with that CWD
    const subDir = path.join(tmpDir, "packages", "cli");
    fs.mkdirSync(subDir, { recursive: true });

    const parsed = JSON.parse(runInjectWorkflowState(subDir)) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Task: issue-106",
    );
  });

  it("[workflow-state] no_task breadcrumb emitted when no session active task exists", () => {
    writeCodingScripts();
    writeProjectFile(path.join(".coding", ".developer"), "name=test\n");
    // Post-R5: breadcrumb body is read exclusively from workflow.md tag
    // blocks. Provide a minimal no_task tag so the test can assert the
    // routing to coding-brainstorm content surfaces.
    writeProjectFile(
      path.join(".coding", "workflow.md"),
      "[workflow-state:no_task]\n" +
        "No active task. Load `coding-brainstorm` skill to start.\n" +
        "[/workflow-state:no_task]\n",
    );
    writeLegacyCurrentTask(".coding/tasks/issue-106");
    writeWorkflowStateHook();
    // Legacy repo-global state must not suppress the session no_task breadcrumb.
    const output = runInjectWorkflowState();
    expect(output.trim()).not.toBe("");
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "Status: no_task",
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      "coding-brainstorm",
    );
  });

  it("[workflow-state] silent exit 0 when not a Coding project (no .coding/ dir)", () => {
    // No .coding/ at all — hook should silently exit
    writeWorkflowStateHook();
    fs.rmSync(path.join(tmpDir, ".coding"), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpDir, ".coding", "hooks"), { recursive: true });
    fs.copyFileSync(
      path.join(
        __dirname,
        "..",
        "src",
        "templates",
        "shared-hooks",
        "inject-workflow-state.py",
      ),
      path.join(tmpDir, ".coding", "hooks", "inject-workflow-state.py"),
    );
    // Now .coding/ exists only as a parent for the hook script — need to move
    // the hook out of .coding/ so root-finding fails. Use a fully separate dir.
    const nonCodingDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "non-coding-"),
    );
    try {
      const hookPath = path.join(nonCodingDir, "hook.py");
      fs.copyFileSync(
        path.join(
          __dirname,
          "..",
          "src",
          "templates",
          "shared-hooks",
          "inject-workflow-state.py",
        ),
        hookPath,
      );
      const result = execSync(`${pythonCmd} ${JSON.stringify(hookPath)}`, {
        cwd: nonCodingDir,
        input: JSON.stringify({ cwd: nonCodingDir }),
        encoding: "utf-8",
      });
      expect(result.trim()).toBe("");
    } finally {
      fs.rmSync(nonCodingDir, { recursive: true, force: true });
    }
  });

  it("[#356] inject-workflow-state.py exits when host leaves stdin open with no payload", async () => {
    setupTaskRepo();
    writeWorkflowStateHook();

    const hookPath = path.join(
      tmpDir,
      ".coding",
      "hooks",
      "inject-workflow-state.py",
    );
    const child = spawn(pythonCmd, [hookPath], {
      cwd: tmpDir,
      env: sessionEnv({ KIRO_PROJECT_DIR: tmpDir }),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
      timedOut: boolean;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ code: null, signal: "SIGKILL", timedOut: true });
      }, 1500);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, timedOut: false });
      });
    });

    expect(result.timedOut, stderr).toBe(false);
    expect(result.code).toBe(0);
    expect(stdout).toContain("<workflow-state>");
  });

  // ------------------------------------------------------------
  // Legacy current_phase / next_action field removal (FP round 3 cleanup)
  // ------------------------------------------------------------

  it("[workflow-v2] task.py create does NOT write legacy current_phase / next_action fields", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "dummy task" --slug dummy-task --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    // Locate the newly created task dir
    const tasksDir = path.join(tmpDir, ".coding", "tasks");
    const newDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.includes("dummy-task"));
    expect(newDirs.length).toBeGreaterThan(0);
    const newTaskJsonPath = path.join(tasksDir, newDirs[0], "task.json");
    const data = JSON.parse(fs.readFileSync(newTaskJsonPath, "utf-8")) as {
      current_phase?: unknown;
      next_action?: unknown;
    };
    expect(data.current_phase).toBeUndefined();
    expect(data.next_action).toBeUndefined();
  });

  // ------------------------------------------------------------
  // v0.5.0-beta.12: init-context removal + jsonl seeding on task create
  // ------------------------------------------------------------

  it("[init-context-removal] task.py create does NOT seed jsonl when no sub-agent platform configured", () => {
    setupTaskRepo();
    // setupTaskRepo does not create any .{platform}/ dir → agent-less mode
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "plain task" --slug plain-task --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const tasksDir = path.join(tmpDir, ".coding", "tasks");
    const newDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.includes("plain-task"));
    expect(newDirs.length).toBeGreaterThan(0);
    const taskDir = path.join(tasksDir, newDirs[0]);
    expect(fs.existsSync(path.join(taskDir, "implement.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(taskDir, "check.jsonl"))).toBe(false);
  });

  it("[init-context-removal] task.py create seeds jsonl when a sub-agent platform dir exists", () => {
    setupTaskRepo();
    // Simulate a Claude Code install
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seeded task" --slug seeded-task --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const tasksDir = path.join(tmpDir, ".coding", "tasks");
    const newDirs = fs
      .readdirSync(tasksDir)
      .filter((d) => d.includes("seeded-task"));
    expect(newDirs.length).toBeGreaterThan(0);
    const taskDir = path.join(tasksDir, newDirs[0]);

    for (const jsonlName of ["implement.jsonl", "check.jsonl"]) {
      const jsonlPath = path.join(taskDir, jsonlName);
      expect(fs.existsSync(jsonlPath), `${jsonlName} should exist`).toBe(true);
      const content = fs.readFileSync(jsonlPath, "utf-8").trim();
      // One line of self-describing seed with `_example` and no `file` field.
      const lines = content.split("\n");
      expect(lines.length).toBe(1);
      const row = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(row._example).toBeDefined();
      expect(row.file).toBeUndefined();
    }
  });

  it("[init-context-removal] task.py init-context is deprecated with clear pointer to planning artifacts", () => {
    setupTaskRepo();
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    let threw = false;
    let stderr = "";
    try {
      execSync(
        `${pythonCmd} ${JSON.stringify(taskScriptPath)} init-context .coding/tasks/issue-106 fullstack`,
        { cwd: tmpDir, encoding: "utf-8" },
      );
    } catch (err) {
      threw = true;
      const e = err as { stderr?: string; status?: number };
      stderr = e.stderr ?? "";
      expect(e.status).toBe(2);
    }
    expect(threw).toBe(true);
    expect(stderr).toContain("v0.5.0-beta.12");
    expect(stderr).toContain("planning artifact guidance");
    expect(stderr).toContain("add-context");
  });

  it("[init-context-removal] inject-subagent-context.py skips seed rows (no `file` field)", () => {
    // Hook's read_jsonl_entries should return empty list when jsonl contains
    // only a seed row — not crash, not treat `_example` as a path.
    const hookContent = getSharedHookScripts().find(
      (h) => h.name === "inject-subagent-context.py",
    )?.content;
    expect(hookContent).toBeDefined();
    const hookPath = path.join(tmpDir, "hook.py");
    fs.writeFileSync(hookPath, hookContent as string, "utf-8");

    // Minimal fake jsonl with only seed
    const jsonlDir = path.join(tmpDir, "repo");
    fs.mkdirSync(jsonlDir, { recursive: true });
    fs.writeFileSync(
      path.join(jsonlDir, "seed.jsonl"),
      JSON.stringify({ _example: "seed row" }) + "\n",
      "utf-8",
    );

    // Run a tiny Python snippet that imports the hook module and calls
    // read_jsonl_entries. Capturing the stderr warning proves the code path.
    const probeScript = `
import sys, importlib.util
spec = importlib.util.spec_from_file_location("h", ${JSON.stringify(hookPath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
entries = mod.read_jsonl_entries(${JSON.stringify(jsonlDir)}, "seed.jsonl")
print(len(entries))
`;
    const probePath = path.join(tmpDir, "probe.py");
    fs.writeFileSync(probePath, probeScript, "utf-8");
    const result = execSync(`${pythonCmd} ${JSON.stringify(probePath)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(result.trim()).toBe("0");
  });

  it("[init-context-removal] task.py validate treats seed-only jsonl as 0 errors", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seed-only" --slug seed-only-task --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".coding", "tasks"))
      .find((d) => d.includes("seed-only-task"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".coding", "tasks", taskDir as string);

    const result = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} validate ${relTaskDir}`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    // Exit 0 (no error raised) plus success marker in output.
    expect(result).toContain("All validations passed");
  });

  it("[init-context-removal] task.py list-context prints 'no curated entries yet' for seed-only jsonl", () => {
    setupTaskRepo();
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} create "seed-list" --slug seed-list-task --assignee test-dev`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    const taskDir = fs
      .readdirSync(path.join(tmpDir, ".coding", "tasks"))
      .find((d) => d.includes("seed-list-task"));
    expect(taskDir).toBeDefined();
    const relTaskDir = path.posix.join(".coding", "tasks", taskDir as string);

    const result = execSync(
      `${pythonCmd} ${JSON.stringify(taskScriptPath)} list-context ${relTaskDir}`,
      { cwd: tmpDir, encoding: "utf-8" },
    );
    // Sentinel message proves the seed-detection branch ran.
    expect(result).toContain("no curated entries yet");
  });

  // ------------------------------------------------------------
  // workflow_phase.get_phase_index() expansion (FP round 3)
  //   Now returns Phase Index + Phase 1/2/3 bodies (was Phase Index only).
  // ------------------------------------------------------------

  function templateWorkflowMd(): string {
    const { readFileSync } = fs;
    const { dirname, join: pathJoin } = path;
    const templatePath = pathJoin(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
      "coding",
      "workflow.md",
    );
    return readFileSync(templatePath, "utf-8");
  }

  it("[workflow-state-r1] template workflow.md [workflow-state:in_progress] mentions commit (Phase 3.4)", () => {
    const wf = templateWorkflowMd();
    const match = wf.match(
      /\[workflow-state:in_progress\]([\s\S]*?)\[\/workflow-state:in_progress\]/,
    );
    expect(match).toBeTruthy();
    const body = match?.[1] ?? "";
    expect(body).toMatch(/commit \(Phase 3\.4\)/i);
  });

  it("[issue-237] all implement/check agent templates contain recursion guards", () => {
    const templateRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
    );
    const agentFiles = [
      "claude/agents/coding-implement.md",
      "claude/agents/coding-check.md",
    ];

    for (const relativePath of agentFiles) {
      const content = fs.readFileSync(
        path.join(templateRoot, relativePath),
        "utf-8",
      );
      expect(content, `${relativePath} should mention recursion guard`).toMatch(
        /Recursion guard|Recursion Guard/,
      );
      expect(
        content,
        `${relativePath} should scope dispatch to main session`,
      ).toContain("main session");
      expect(
        content,
        `${relativePath} should mention workflow-state safety`,
      ).toMatch(/workflow-state breadcrumbs|workflow.md/);

      if (relativePath.includes("implement")) {
        expect(
          content,
          `${relativePath} should forbid nested implement`,
        ).toContain("spawn another `coding-implement`");
        expect(content, `${relativePath} should forbid nested check`).toContain(
          "`coding-check`",
        );
      } else {
        expect(content, `${relativePath} should forbid nested check`).toContain(
          "spawn another `coding-check`",
        );
        expect(
          content,
          `${relativePath} should forbid nested implement`,
        ).toContain("`coding-implement`");
      }
    }
  });

  it("[workflow-state-r2] template workflow.md [workflow-state:planning] mentions artifact gates + required jsonl curation", () => {
    const wf = templateWorkflowMd();
    const match = wf.match(
      /\[workflow-state:planning\]([\s\S]*?)\[\/workflow-state:planning\]/,
    );
    expect(match).toBeTruthy();
    const body = match?.[1] ?? "";
    expect(body).toMatch(/Lightweight: `prd\.md` can be enough/);
    expect(body).toMatch(
      /Complex: finish `prd\.md`, `design\.md`, and `implement\.md`/,
    );
    expect(body).toContain(
      "curate `implement.jsonl` and `check.jsonl` as spec/research manifests before start",
    );
  });

  it("[#292] workflow and brainstorm templates treat seed-only jsonl as not planning-ready", () => {
    const wf = templateWorkflowMd();
    expect(wf).not.toContain("seed-only manifests are tolerated by consumers");
    expect(wf).not.toContain(
      "curated when extra spec or research context is needed",
    );
    expect(wf).toContain(
      'Ready gate: both `implement.jsonl` and `check.jsonl` must contain at least one real `{"file": "...", "reason": "..."}` entry before `task.py start`.',
    );
    expect(wf).toContain(
      "Runtime consumers tolerate missing or seed-only manifests for compatibility, but that tolerance is not a planning-ready state.",
    );
    expect(wf).toContain(
      "`implement.jsonl` and `check.jsonl` each contain at least one real curated entry (seed row does not count)",
    );

    const templateRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
    );
    const brainstormFiles = ["common/skills/brainstorm.md"];

    for (const relativePath of brainstormFiles) {
      const content = fs.readFileSync(
        path.join(templateRoot, relativePath),
        "utf-8",
      );
      expect(content, relativePath).toContain(
        "Sub-agent-dispatch tasks have real curated entries in both `implement.jsonl` and `check.jsonl`; seed-only manifests are not ready.",
      );
    }
  });

  it("[#320] brainstorm templates require lossless PRD convergence before start", () => {
    const templateRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "templates",
    );
    const brainstormFiles = ["common/skills/brainstorm.md"];

    for (const relativePath of brainstormFiles) {
      const content = fs.readFileSync(
        path.join(templateRoot, relativePath),
        "utf-8",
      );
      expect(content, relativePath).toContain(
        "Before final review or `task.py start`, run the PRD convergence pass below.",
      );
      expect(content, relativePath).toContain("## PRD Convergence Pass");
      expect(content, relativePath).toContain(
        "Fold temporary brainstorm sections such as `What I already know`, `Assumptions`, and resolved `Open Questions`",
      );
      expect(content, relativePath).toContain(
        "Preserve every file:line anchor, decision, constraint, requirement ID, and acceptance-criteria mapping.",
      );
      expect(content, relativePath).toContain(
        "no unresolved temporary brainstorm sections, no duplicate facts across sections",
      );
    }
  });

  it("[workflow-state-r3-no_task] template workflow.md [workflow-state:no_task] block is present and well-formed", () => {
    const wf = templateWorkflowMd();
    expect(wf).toMatch(
      /\[workflow-state:no_task\]\s*\n[\s\S]+?\n\s*\[\/workflow-state:no_task\]/,
    );
  });

  it("[loop-feedback] template workflow.md no longer contains the dead [workflow-state:completed] block", () => {
    // Decision #3=B: the completed breadcrumb was DEAD in normal flow
    // (cmd_archive writes status=completed and moves the dir in one call, so the
    // resolver loses the pointer and the block never fires). It was removed to
    // stop misleading customizers. Data-model completed writes/reads are kept.
    const wf = templateWorkflowMd();
    expect(wf).not.toContain("workflow-state:completed");
  });

  it("[strip-breadcrumb] _strip_breadcrumb_tag_blocks only strips matched STATUS pairs (backreference parity with parser)", () => {
    // Finding 1: the strip regex previously used [A-Za-z0-9_-]+ on both ends,
    // accepting [workflow-state:A]...[/workflow-state:B]. The parser uses \1
    // backreference to require matched STATUS. Tightening the strip regex to
    // use the same backreference closes the contract gap.
    const sessionStartScript = getSharedHookScripts().find(
      (hook) => hook.name === "session-start.py",
    )?.content;
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(sessionStartScript, "shared session-start"),
    );

    // Each probe writes a fenced result so newlines in stripped output are
    // preserved; the JS side parses by splitting on the END marker.
    const probe = [
      "import importlib.util, pathlib, json",
      "spec = importlib.util.spec_from_file_location('ss', pathlib.Path('.claude/hooks/session-start.py'))",
      "mod = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(mod)",
      "matched = '[workflow-state:planning]\\nbody\\n[/workflow-state:planning]'",
      "mismatched = '[workflow-state:planning]\\nbody\\n[/workflow-state:in_progress]'",
      "nested_orphan = '[workflow-state:planning]\\nbody1\\n[/workflow-state:other]\\ntail\\n[/workflow-state:planning]'",
      "result = {'M': mod._strip_breadcrumb_tag_blocks(matched), 'X': mod._strip_breadcrumb_tag_blocks(mismatched), 'N': mod._strip_breadcrumb_tag_blocks(nested_orphan)}",
      "print(json.dumps(result))",
    ].join("; ");
    const output = execSync(`${pythonCmd} -c ${JSON.stringify(probe)}`, {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    const lastLine = output
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .pop();
    const result = JSON.parse(lastLine ?? "{}") as Record<string, string>;

    // Matched pair: stripped (empty string).
    expect(result.M).toBe("");
    // Mismatched pair: NOT stripped — full input preserved.
    expect(result.X).toContain("[workflow-state:planning]");
    expect(result.X).toContain("[/workflow-state:in_progress]");
    // Nested orphan: outer pair matches via \1 backreference and gets
    // stripped as one unit. Either fully stripped or fully preserved —
    // never partial (no dangling [/workflow-state:other] orphan).
    if (result.N !== "") {
      expect(result.N).toContain("[workflow-state:planning]");
      expect(result.N).toContain("[/workflow-state:planning]");
    }
  });

  it("[workflow-v2] get_context.py --mode phase returns compact Phase Index only", () => {
    writeCodingScripts();
    writeProjectFile(path.join(".coding", ".developer"), "name=test\n");
    writeProjectFile(
      path.join(".coding", "workflow.md"),
      templateWorkflowMd(),
    );

    const contextScript = path.join(
      tmpDir,
      ".coding",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("## Phase Index");
    expect(output).toContain("### Request Triage");
    expect(output).toContain("### Planning Artifacts");
    expect(output).toContain("### Loading Step Detail");
    expect(output).not.toMatch(/^## Phase 1: Plan/m);
    expect(output).not.toContain("#### 1.1 Requirement exploration");
    expect(output).not.toContain("#### 2.1 Implement");
  });

  it("[workflow-v2] --mode phase --platform claude surfaces sub-agent routing", () => {
    writeCodingScripts();
    writeProjectFile(path.join(".coding", ".developer"), "name=test\n");
    writeProjectFile(
      path.join(".coding", "workflow.md"),
      templateWorkflowMd(),
    );

    const contextScript = path.join(
      tmpDir,
      ".coding",
      "scripts",
      "get_context.py",
    );
    const output = execSync(
      `${pythonCmd} ${JSON.stringify(contextScript)} --mode phase --platform claude`,
      { cwd: tmpDir, encoding: "utf-8" },
    );

    expect(output).toContain("coding-implement");
    expect(output).not.toContain(
      "| About to write code / start implementing | coding-before-dev |",
    );
    expect(output).not.toContain("before-dev takes under a minute");
  });

  // ------------------------------------------------------------
  // session-start.py <coding-workflow> + <guidelines> compact context
  // ------------------------------------------------------------

  it("[workflow-v2] session-start.py <coding-workflow> block contains compact Phase Index", () => {
    writeCodingScripts();
    writeProjectFile(path.join(".coding", ".developer"), "name=test\n");
    writeProjectFile(
      path.join(".coding", "workflow.md"),
      templateWorkflowMd(),
    );
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "shared session-start"),
    );

    const rawOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
    );
    const payload = JSON.parse(rawOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const ctx = payload.hookSpecificOutput.additionalContext;

    const workflowMatch =
      /<coding-workflow>([\s\S]*?)<\/coding-workflow>/.exec(ctx);
    if (!workflowMatch) throw new Error("workflow block not found in payload");
    const workflowBlock = workflowMatch[1];

    expect(workflowBlock).toContain("## Phase Index");
    expect(workflowBlock).toContain("### Request Triage");
    expect(workflowBlock).toContain("### Planning Artifacts");
    expect(workflowBlock).toContain("### Loading Step Detail");
    expect(workflowBlock).not.toMatch(/^## Phase 1: Plan/m);
    expect(workflowBlock).not.toContain("#### 1.1 Requirement exploration");
    // Breadcrumb tag BLOCKS (matched opening + closing pair) excluded — they're
    // consumed by inject-workflow-state.py. Inline `[workflow-state:planning]`
    // mentions in narrative prose are fine; only complete blocks are stripped.
    const tagBlockRe =
      /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n[\s\S]*?\n\s*\[\/workflow-state:\1\]/;
    expect(tagBlockRe.test(workflowBlock)).toBe(false);
  });

  it("[workflow-v2] session-start.py <guidelines> block lists context order and spec paths", () => {
    writeCodingScripts();
    writeProjectFile(path.join(".coding", ".developer"), "name=test\n");
    writeProjectFile(
      path.join(".coding", "workflow.md"),
      templateWorkflowMd(),
    );
    // Guides are no longer inlined in compact SessionStart.
    writeProjectFile(
      path.join(".coding", "spec", "guides", "index.md"),
      "# Thinking Guides\n\nGUIDES_INLINE_MARKER\n",
    );
    // Package index — must be paths-only (content should NOT appear)
    writeProjectFile(
      path.join(".coding", "spec", "cli", "backend", "index.md"),
      "# Backend\n\nBACKEND_INDEX_CONTENT_SHOULD_NOT_APPEAR\n",
    );
    writeProjectFile(
      path.join(".claude", "hooks", "session-start.py"),
      expectTemplateContent(claudeSessionStart, "shared session-start"),
    );

    const rawOutput = runPython(
      path.join(".claude", "hooks", "session-start.py"),
    );
    const payload = JSON.parse(rawOutput) as {
      hookSpecificOutput: { additionalContext: string };
    };
    const ctx = payload.hookSpecificOutput.additionalContext;

    const guidelinesMatch = /<guidelines>([\s\S]*?)<\/guidelines>/.exec(ctx);
    if (!guidelinesMatch)
      throw new Error("guidelines block not found in payload");
    const guidelinesBlock = guidelinesMatch[1];

    expect(guidelinesBlock).toContain("Task context order");
    expect(guidelinesBlock).not.toContain("GUIDES_INLINE_MARKER");
    expect(guidelinesBlock).toContain(".coding/spec/cli/backend/index.md");
    expect(guidelinesBlock).not.toContain(
      "BACKEND_INDEX_CONTENT_SHOULD_NOT_APPEAR",
    );
    // Pointer to discovery command
    expect(guidelinesBlock).toContain("--mode packages");
  });

  // ------------------------------------------------------------
  // inject-subagent-context.py update_current_phase() removal
  //   Hook must NOT write current_phase back to task.json on spawn.
  // ------------------------------------------------------------

  it("[workflow-v2] inject-subagent-context.py does NOT write current_phase when implement spawns", () => {
    const sharedInject = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;

    writeCodingScripts();
    writeProjectFile(path.join(".coding", ".developer"), "name=test\n");
    writeProjectFile(path.join(".coding", "workflow.md"), "# Minimal\n");
    // Session active task WITHOUT current_phase field (post-migration state)
    writeProjectFile(
      path.join(".coding", ".runtime", "sessions", "claude_phase-a.json"),
      JSON.stringify(
        {
          current_task: ".coding/tasks/issue-106",
          platform: "claude",
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".coding", "tasks", "issue-106", "task.json"),
      JSON.stringify(
        {
          id: "issue-106",
          title: "Issue 106",
          status: "in_progress",
          package: null,
        },
        null,
        2,
      ),
    );
    writeProjectFile(
      path.join(".coding", "tasks", "issue-106", "prd.md"),
      "# PRD\n",
    );
    writeProjectFile(
      path.join(".coding", "tasks", "issue-106", "implement.jsonl"),
      '{"file":"src/example.ts","reason":"spec"}\n',
    );
    writeProjectFile(
      path.join(".claude", "hooks", "inject-subagent-context.py"),
      expectTemplateContent(sharedInject, "shared inject-subagent-context"),
    );

    // Simulate Task tool spawn (Claude-style input)
    const input = JSON.stringify({
      tool_name: "Task",
      tool_input: {
        subagent_type: "coding-implement",
        prompt: "do work",
      },
      cwd: tmpDir,
      session_id: "phase-a",
    });
    runPython(
      path.join(".claude", "hooks", "inject-subagent-context.py"),
      input,
    );

    // Assert task.json is NOT modified with current_phase
    const taskJson = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".coding", "tasks", "issue-106", "task.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;
    expect(taskJson.current_phase).toBeUndefined();
    expect(taskJson.next_action).toBeUndefined();
    // Sanity: other fields intact
    expect(taskJson.status).toBe("in_progress");
  });

  it("[workflow-v2] inject-subagent-context.py source does NOT contain update_current_phase function", () => {
    const sharedInject = getSharedHookScripts().find(
      (hook) => hook.name === "inject-subagent-context.py",
    )?.content;
    expect(sharedInject).toBeTruthy();
    expect(sharedInject).not.toContain("def update_current_phase");
    expect(sharedInject).not.toContain("update_current_phase(");
    // AGENTS_NO_PHASE_UPDATE constant was only used by the removed function
    expect(sharedInject).not.toContain("AGENTS_NO_PHASE_UPDATE");
  });

});

describe("regression: backslash in markdown templates (beta.12)", () => {
  it("[beta.12] Common command/skill templates do not contain problematic backslash sequences", () => {
    const templates = [...getCommandTemplates(), ...getSkillTemplates()];
    for (const tmpl of templates) {
      expect(tmpl.content).not.toContain("\\--");
      expect(tmpl.content).not.toContain("\\->");
    }
  });

  it("[beta.12] Claude agent templates do not contain problematic backslash sequences", () => {
    const agents = getClaudeAgents();
    for (const agent of agents) {
      expect(agent.content).not.toContain("\\--");
      expect(agent.content).not.toContain("\\->");
    }
  });

  it("[beta.12] Shared hook templates do not contain problematic backslash sequences", () => {
    const hooks = getSharedHookScripts();
    for (const hook of hooks) {
      expect(hook.content).not.toContain("\\--");
      expect(hook.content).not.toContain("\\->");
    }
  });
});

// =============================================================================
// 5. Platform Registry Regressions
// =============================================================================

describe("regression: platform additions (beta.9, beta.13, beta.16)", () => {
  it("[claude] Claude Code platform is registered", () => {
    expect(AI_TOOLS).toHaveProperty("claude-code");
    expect(AI_TOOLS["claude-code"].configDir).toBe(".claude");
  });

  it("[beta.9] all platforms have consistent required fields", () => {
    for (const id of PLATFORM_IDS) {
      const tool = AI_TOOLS[id];
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.configDir.startsWith(".")).toBe(true);
      expect(tool.cliFlag.length).toBeGreaterThan(0);
      expect(Array.isArray(tool.templateDirs)).toBe(true);
      expect(tool.templateDirs).toContain("common");
      expect(typeof tool.defaultChecked).toBe("boolean");
      expect(typeof tool.hasPythonHooks).toBe("boolean");
    }
  });
});

describe("regression: task planning context seeding (init-context-removal)", () => {
  // v0.5.0-beta.12 removed `task.py init-context`; jsonl manifests are now
  // curated during planning when needed. The subparser, cmd_init_context, and get_check_context
  // helpers are all gone. task.py still guards against old invocations with
  // a clear deprecation message so users who muscle-memory-type the old
  // command get pointed at the new workflow.
  it("[init-context-removal] task.py no longer registers init-context subparser", () => {
    const taskScript = getAllScripts().get("task.py");
    expect(taskScript).toBeDefined();
    expect(taskScript as string).not.toMatch(
      /subparsers\.add_parser\(\s*"init-context"/,
    );
  });

  it("[init-context-removal] task.py emits deprecation message on init-context invocation", () => {
    const taskScript = getAllScripts().get("task.py");
    expect(taskScript).toBeDefined();
    // Guard fires before argparse so user sees the real reason (not argparse's
    // generic "invalid choice" error).
    expect(taskScript as string).toMatch(
      /sys\.argv\[1\]\s*==\s*"init-context"/,
    );
    expect(taskScript as string).toContain("v0.5.0-beta.12");
    expect(taskScript as string).toContain("planning artifact guidance");
  });

  it("[init-context-removal] common/task_context.py removes cmd_init_context + get_check_context helpers", () => {
    const taskContext = getAllScripts().get("common/task_context.py");
    expect(taskContext).toBeDefined();
    // Mechanical-fill path gone; only curate helpers remain.
    expect(taskContext as string).not.toMatch(/def cmd_init_context\b/);
    expect(taskContext as string).not.toMatch(/def get_check_context\b/);
    expect(taskContext as string).not.toMatch(/def get_implement_backend\b/);
    expect(taskContext as string).not.toMatch(/def get_implement_frontend\b/);
    // Remaining surface — still callable by task.py.
    expect(taskContext as string).toMatch(/def cmd_add_context\b/);
    expect(taskContext as string).toMatch(/def cmd_validate\b/);
    expect(taskContext as string).toMatch(/def cmd_list_context\b/);
  });

  it("[init-context-removal] task_store.cmd_create seeds jsonl for sub-agent platforms", () => {
    const taskStore = getAllScripts().get("common/task_store.py");
    expect(taskStore).toBeDefined();
    // Sub-agent platform probe.
    expect(taskStore as string).toMatch(/_SUBAGENT_CONFIG_DIRS/);
    expect(taskStore as string).toContain('".claude"');
    // Seed row is self-describing and has no `file` field (so consumers skip
    // it naturally).
    expect(taskStore as string).toMatch(/_write_seed_jsonl/);
    expect(taskStore as string).toContain('"_example"');
    // cmd_create calls into the seed path.
    expect(taskStore as string).toMatch(/_has_subagent_platform\(repo_root\)/);
  });

  it("[init-context-removal] start command template no longer references init-context", () => {
    // v0.5.0-beta.12 removed `task.py init-context`. The start command template
    // was updated to describe planning-time context curation instead. It must
    // not reference the deleted subcommand.
    const pkgRoot = path.resolve(__dirname, "..");
    const start = fs.readFileSync(
      path.join(pkgRoot, "src/templates/common/commands/start.md"),
      "utf-8",
    );
    expect(start).not.toContain("task.py init-context");
  });
});

// =============================================================================
// 7. collectTemplates Path Consistency
// =============================================================================

describe("regression: collectTemplates paths match init directory structure (0.3.1)", () => {
  it("[0.3.1] all platforms with commands use consistent coding/ subdirectory", () => {
    const platformsWithCommands = ["claude-code"] as const;
    for (const id of platformsWithCommands) {
      const templates = collectPlatformTemplates(id);
      if (!templates) continue;
      const commandKeys = [...templates.keys()].filter((k) =>
        k.includes("/commands/"),
      );
      for (const key of commandKeys) {
        expect(
          key,
          `${id} command path should include coding/ subdirectory: ${key}`,
        ).toContain("/commands/coding/");
      }
    }
  });
});

// =============================================================================
// YAML Quote Stripping (0.3.8)
// =============================================================================

describe("regression: parse_simple_yaml uses _unquote not greedy strip (0.3.8)", () => {
  it("config.py defines _unquote helper", () => {
    expect(commonConfig).toContain("def _unquote(s: str) -> str:");
  });

  it("config.py uses _unquote for list items, not .strip('\"')", () => {
    // The bug: .strip('"').strip("'") greedily eats nested quotes
    // e.g. "echo 'hello'" -> strip("'") -> echo 'hello (broken!)
    expect(commonConfig).not.toContain(".strip('\"').strip(\"'\")");
    expect(commonConfig).toContain("_unquote(stripped[2:].strip())");
  });

  it("config.py uses _unquote for key-value, not .strip('\"')", () => {
    // 0.5.11: parse path now strips inline comments first, then unquotes —
    // mirrors coding_config.py so YAML `key: false  # comment` parses
    // correctly. The forbidden `.strip('"').strip("'")` greedy chain still
    // must not appear.
    expect(commonConfig).not.toContain(".strip('\"').strip(\"'\")");
    expect(commonConfig).toContain("_unquote(value)");
    expect(commonConfig).toContain("_strip_inline_comment(value)");
  });
});

describe("regression: parse_simple_yaml Python execution (0.3.8)", () => {
  // Extract _unquote + _parse_yaml_block + _next_content_line + parse_simple_yaml
  // from commonConfig and run them in an isolated Python process.
  // We can't import config.py directly because it has `from .paths import ...`
  let tmpDir: string;
  let extractedPy: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-yaml-py-"));
    // Extract _unquote + parse_simple_yaml + _parse_yaml_block + _next_content_line
    // These 4 functions have no external imports — safe to run standalone.
    const fnStart = commonConfig.indexOf("def _unquote(");
    const fnEnd = commonConfig.indexOf("\n# Defaults");
    extractedPy = commonConfig.substring(fnStart, fnEnd);
    fs.writeFileSync(path.join(tmpDir, "yaml_parser.py"), extractedPy);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Run parse_simple_yaml via Python subprocess and return parsed result */
  function runPythonYaml(yamlContent: string): unknown {
    const scriptFile = path.join(tmpDir, "_test.py");
    const script = [
      "import sys, json",
      `sys.path.insert(0, ${JSON.stringify(tmpDir)})`,
      "from yaml_parser import parse_simple_yaml",
      `result = parse_simple_yaml(${JSON.stringify(yamlContent)})`,
      "print(json.dumps(result))",
    ].join("\n");
    fs.writeFileSync(scriptFile, script);
    const out = execSync(`python3 ${JSON.stringify(scriptFile)}`, {
      encoding: "utf-8",
    });
    return JSON.parse(out.trim());
  }

  it("nested single quotes inside double quotes are preserved", () => {
    const result = runPythonYaml("key: \"echo 'hello'\"");
    expect(result).toEqual({ key: "echo 'hello'" });
  });

  it("nested double quotes inside single quotes are preserved", () => {
    const result = runPythonYaml("key: 'say \"hi\"'");
    expect(result).toEqual({ key: 'say "hi"' });
  });

  it("list items with nested quotes are preserved", () => {
    const result = runPythonYaml(
      "hooks:\n  after_create:\n    - \"echo 'Task created'\"",
    );
    expect(result).toEqual({
      hooks: { after_create: ["echo 'Task created'"] },
    });
  });

  it("simple quoted values work", () => {
    const result = runPythonYaml("a: \"hello\"\nb: 'world'");
    expect(result).toEqual({ a: "hello", b: "world" });
  });

  it("unquoted values are unchanged", () => {
    const result = runPythonYaml("key: plain value");
    expect(result).toEqual({ key: "plain value" });
  });

  it("mismatched quotes are left as-is", () => {
    const result = runPythonYaml("key: \"hello'");
    expect(result).toEqual({ key: "\"hello'" });
  });
});

// =============================================================================
// 8. Dead Code / Template Content Regressions
// =============================================================================

// =============================================================================
// S4: Submodule + PR Awareness (beta.1)
// =============================================================================

// submodule awareness in multi_agent scripts tests removed — multi_agent pipeline removed

describe("regression: cross-platform-thinking-guide dead code removed (0.3.1)", () => {
  it("[0.3.1] guidesCrossPlatformThinkingGuideContent is not exported from markdown/index", () => {
    expect(markdownExports).not.toHaveProperty(
      "guidesCrossPlatformThinkingGuideContent",
    );
  });
});

// =============================================================================
// Research agent must persist findings (0.5)
// =============================================================================

describe("regression: research agent persists findings to task dir", () => {
  // Every platform's research agent must:
  //   1. Have a Write tool (or platform equivalent) — otherwise it cannot
  //      fulfill workflow.md step 1.2 "调研产出必须写入文件".
  //   2. Explicitly tell the agent to write under {TASK_DIR}/research/.
  //   3. NOT have "Modify any files" as a blanket forbidden rule (that
  //      contradicts the persist requirement).
  //
  // Before 0.5, research agents were read-only and only emitted chat
  // replies, which got compacted away.
  const markdownPlatforms = [
    "packages/cli/src/templates/claude/agents/coding-research.md",
  ];

  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname2, "../../..");

  for (const rel of markdownPlatforms) {
    it(`[${rel}] has Write tool and persist instruction`, () => {
      const content = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      // Frontmatter tool list must include Write (capitalized form)
      const fm = content.split("---\n")[1] ?? "";
      expect(fm).toMatch(/tools:\s*[^\n]*\bWrite\b/);
      // Body must reference persist target
      expect(content).toContain("{TASK_DIR}/research/");
      expect(content).toMatch(/PERSIST|[Pp]ersist/);
      // Must not have blanket "Modify any files" forbidden rule
      expect(content).not.toMatch(/^- Modify any files\s*$/m);
    });
  }
});

describe("regression: templates/markdown/spec contains only .md.txt files (0.5.0-beta.9)", () => {
  // Invariant: packages/cli/src/templates/markdown/spec/ is for user-facing
  // placeholder templates only — markdown/index.ts reads .md.txt via
  // readLocalTemplate, so bare .md files there are orphans (ship to dist as
  // dead weight, never land on user disks). Documented in
  // .coding/spec/cli/backend/directory-structure.md "Don't: Leak dogfood
  // spec into templates/markdown/spec/". Captured while cleaning up ~2-year-old
  // leakage in task 04-21-task-schema-unify.
  it("every file under templates/markdown/spec ends in .md.txt", () => {
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.isFile()) out.push(full);
      }
      return out;
    }
    const __dirname3 = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname3, "../../..");
    const specRoot = path.join(
      repoRoot,
      "packages/cli/src/templates/markdown/spec",
    );
    const files = walk(specRoot);
    const orphans = files.filter((f) => !f.endsWith(".md.txt"));
    expect(
      orphans,
      `Orphan non-.md.txt files in templates/markdown/spec/: ${orphans.join(", ")}`,
    ).toEqual([]);
  });
});

describe("regression: hook templates honor CODING_HOOKS gate", () => {
  it("[coding-hooks-env] all hook templates honor CODING_HOOKS=0 / CODING_DISABLE_HOOKS=1", () => {
    // All shipped hook scripts must early-return when the operator sets
    // CODING_HOOKS=0 (or CODING_DISABLE_HOOKS=1), so subprocess wrappers
    // and casual-chat scenarios can disable Coding injection without
    // editing config or restarting under different settings.
    const sharedHookTargets = [
      "session-start.py",
      "inject-workflow-state.py",
      "inject-subagent-context.py",
    ];
    for (const name of sharedHookTargets) {
      const script = getSharedHookScripts().find(
        (h) => h.name === name,
      )?.content;
      expect(script, `shared-hooks/${name} should exist`).toBeTruthy();
      expect(script).toContain('os.environ.get("CODING_HOOKS") == "0"');
      expect(script).toContain(
        'os.environ.get("CODING_DISABLE_HOOKS") == "1"',
      );
    }
  });
});

describe("regression: session-start.py f-string Python <=3.11 compat (0.5.2)", () => {
  // PEP 498 (Python <=3.11) forbids backslashes inside the *expression* part
  // of an f-string. Coding 0.5.0/0.5.1 shipped session-start hooks with
  //   `f"{drive}:\\{rest.replace('/', '\\')}"`
  // which crashes on parse with `SyntaxError: f-string expression part cannot
  // include a backslash`. PEP 701 (Python 3.12+) lifted this restriction, so
  // the bug only manifests for users on the macOS system Python 3.9 / older
  // Linux distros. The fix moves the `.replace(...)` call to a separate
  // statement before the f-string interpolation.
  //
  // This regression scans the source files (no Python runtime needed) and
  // asserts no f-string contains a backslash inside its `{...}` expression.
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname2, "../../..");
  const HOOK_FILES = [
    "packages/cli/src/templates/shared-hooks/session-start.py",
  ];
  // Match an f-string (f"..." or f'...') whose `{...}` body contains a `\`.
  // Backslash inside expression part is illegal under PEP 498.
  const F_STRING_BACKSLASH =
    /f(?:"[^"\n]*\{[^}\n]*\\[^}\n]*\}[^"\n]*"|'[^'\n]*\{[^}\n]*\\[^}\n]*\}[^'\n]*')/;

  for (const rel of HOOK_FILES) {
    it(`${rel} has no backslash inside any f-string expression part`, () => {
      const content = fs.readFileSync(path.join(repoRoot, rel), "utf-8");
      const m = content.match(F_STRING_BACKSLASH);
      expect(
        m,
        `Found f-string with backslash in expression part — Python <=3.11 will fail to parse this file:\n  ${m?.[0] ?? ""}`,
      ).toBeNull();
    });

    it(`${rel} parses cleanly with python3 -m py_compile`, () => {
      // Belt-and-braces: ask the host Python to parse the file. On Python
      // 3.12+ this won't catch the regression (PEP 701 allows it), so the
      // regex test above is the primary gate. On macOS system Python 3.9 or
      // any CI runner with python3 < 3.12 this is a hard catch.
      const r = spawnSync(
        "python3",
        [
          "-c",
          `import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read()); print('OK')`,
          path.join(repoRoot, rel),
        ],
        { encoding: "utf-8" },
      );
      // If python3 is unavailable on the runner, skip silently — the regex
      // assertion above already covers the regression deterministically.
      if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT")
        return;
      expect(
        r.status,
        `python3 ast.parse failed for ${rel}:\n${r.stderr ?? ""}`,
      ).toBe(0);
      expect(r.stdout ?? "").toContain("OK");
    });
  }
});

describe("regression: sub-agent context injection fallback (0.5.3)", () => {
  // 0.5.3 hotfix: class-1 platforms (claude / cursor / opencode / kiro /
  // codebuddy / droid) used to rely entirely on PreToolUse hook injection for
  // sub-agent task context. When the hook silently failed (Windows + Claude
  // Code issue #53254 / #25981 / #36156, --continue resume, fork
  // distributions, hooks disabled) sub-agents received the dispatch prompt
  // without prd / spec / jsonl context, with no recovery path.
  //
  // The fix: hook output now begins with a `<!-- coding-hook-injected -->`
  // marker, and every class-1 coding-implement / coding-check definition
  // file carries a Coding Context Loading Protocol section telling the
  // sub-agent to load context itself when the marker is absent.
  const HOOK_INJECTED_MARKER = "<!-- coding-hook-injected -->";

  it("inject-subagent-context.py emits the marker for implement / check / finish", () => {
    const hook = getSharedHookScripts().find(
      (h) => h.name === "inject-subagent-context.py",
    );
    expect(hook).toBeDefined();
    const src = hook?.content ?? "";
    // Marker must appear in build_implement_prompt / build_check_prompt /
    // build_finish_prompt (research is intentionally NOT marker'd — it has no
    // task binding).
    expect(src).toContain(HOOK_INJECTED_MARKER);
    // Must appear at least three times (one per implement / check / finish).
    const matches = src.match(/<!--\s*coding-hook-injected\s*-->/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  // 5 markdown class-1 platforms × 2 agents = 10 markdown files.
  // Kiro is a JSON file (separate test below).
  const CLASS1_MD_AGENT_FILES: {
    platform: string;
    rel: string;
    agent: "implement" | "check";
  }[] = [
    {
      platform: "claude",
      rel: "packages/cli/src/templates/claude/agents/coding-implement.md",
      agent: "implement",
    },
    {
      platform: "claude",
      rel: "packages/cli/src/templates/claude/agents/coding-check.md",
      agent: "check",
    },
  ];

  const __dirnameFb = path.dirname(fileURLToPath(import.meta.url));
  const repoRootFb = path.resolve(__dirnameFb, "../../..");

  function expectTaskArtifactContract(content: string): void {
    expect(content).toContain("prd.md");
    expect(content).toContain("design.md");
    expect(content).toContain("implement.md");
    expect(content).not.toMatch(/prd\.md`?\s+(?:if present|if exists)/i);
    expect(content).toMatch(/design\.md[^\n.]*(?:if present|if exists)/i);
    expect(content).toMatch(/implement\.md[^\n.]*(?:if present|if exists)/i);
  }

  for (const { platform, rel, agent } of CLASS1_MD_AGENT_FILES) {
    it(`${platform}/${agent} markdown agent file carries marker + fallback protocol`, () => {
      const content = fs.readFileSync(path.join(repoRootFb, rel), "utf-8");
      // 1. References the marker
      expect(content).toContain(HOOK_INJECTED_MARKER);
      // 2. Has the protocol heading
      expect(content).toContain("Coding Context Loading Protocol");
      // 3. Tells AI how to find the active task path
      expect(content).toContain("Active task:");
      // 4. Tells AI which task files to Read in fallback path
      expectTaskArtifactContract(content);
      const expectedJsonl =
        agent === "implement" ? "implement.jsonl" : "check.jsonl";
      expect(content).toContain(expectedJsonl);
    });
  }
});

// =============================================================================
// safe-commit: gitignored .coding/ recovery (0.5.10 → 0.5.11)
// =============================================================================
//
// Real user incident: project .gitignore listed `.coding/`. add_session.py's
// auto-commit ran `git add .coding/workspace .coding/tasks`, got `ignored
// by .gitignore`, fell back to a hint suggesting `git add .coding &&
// commit`. The AI agent driving the workflow extrapolated that to
// `git add -f .coding/`, which forced in `.coding/.backup-*/`,
// `.coding/worktrees/`, `.coding/.template-hashes.json`, etc. — 548 files
// / 83474 lines of caches/backups committed.
//
// 0.5.10 fix (since reverted):
//   - Scripts only stage SPECIFIC product paths.
//   - On `ignored by` the scripts retried with `git add -f <specific paths>`.
// That auto-`-f` was an over-fix — when a user gitignores `.coding/` they
// mean "keep .coding/ local-only", and forcing the commit through (even on
// narrow paths) violates user intent. Group-chat report: a finish-work auto
// committed `.coding/workspace/` straight into a repo whose .gitignore
// excluded `.coding/`.
//
// 0.5.11 fix (current):
//   - Plain `git add <specific>` is tried once. On `ignored by`, the script
//     warns and skips the auto-commit — never `-f`.
//   - New `session_auto_commit: false` config opts the user out of auto-stage
//     and auto-commit entirely (issue #245).
//   - The warning explicitly says ``Do NOT use `git add -f .coding/```` so
//     AI re-reading the log doesn't reinvent the bug, and points at the new
//     `session_auto_commit: false` knob.
//
// These tests synthesize a tmp git repo with `.coding/` gitignored and
// verify (a) on `ignored by` the script warns + skips (no commit, no -f),
// (b) `session_auto_commit: false` skips git entirely in any state, and
// (c) the negative-rule warning + new config hint are reachable.
// =============================================================================

describe("regression: safe auto-commit when .coding/ is gitignored (0.5.10 → 0.5.11)", () => {
  let tmpDir: string;
  const pyCmd = process.platform === "win32" ? "python" : "python3";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-safe-commit-"));
    execSync("git init -q -b main", { cwd: tmpDir });
    // Configure user so git commit succeeds in CI sandboxes.
    execSync('git config user.email "test@coding.local"', { cwd: tmpDir });
    execSync('git config user.name "Coding Test"', { cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
  }

  function writeCodingScripts(): void {
    const scriptsDir = path.join(tmpDir, ".coding", "scripts");
    for (const [rel, content] of getAllScripts()) {
      const abs = path.join(scriptsDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf-8");
    }
  }

  function writeWorkspaceIndex(): void {
    writeFile(
      ".coding/workspace/test-dev/index.md",
      [
        "# Workspace Index - test-dev",
        "",
        "## Current Status",
        "",
        "<!-- @@@auto:current-status -->",
        "- **Active File**: `journal-1.md`",
        "- **Total Sessions**: 0",
        "- **Last Active**: -",
        "<!-- @@@/auto:current-status -->",
        "",
        "## Active Documents",
        "",
        "<!-- @@@auto:active-documents -->",
        "| File | Lines | Status |",
        "|------|-------|--------|",
        "| `journal-1.md` | ~0 | Active |",
        "<!-- @@@/auto:active-documents -->",
        "",
        "## Session History",
        "",
        "<!-- @@@auto:session-history -->",
        "| # | Date | Title | Commits | Branch |",
        "|---|------|-------|---------|--------|",
        "<!-- @@@/auto:session-history -->",
        "",
      ].join("\n"),
    );
  }

  function setupRepo(options?: { gitignoreCoding?: boolean }): void {
    writeCodingScripts();
    writeFile(
      ".coding/.developer",
      "name=test-dev\ninitialized_at=2026-05-09T00:00:00\n",
    );
    writeFile(
      ".coding/workspace/test-dev/journal-1.md",
      "# Journal - test-dev (Part 1)\n\n---\n",
    );
    writeWorkspaceIndex();
    // Ignored caches/backups must exist on disk to prove they don't get
    // staged when -f is forced on specific paths.
    writeFile(
      ".coding/.backup-2026-05-09/should-not-be-committed.txt",
      "secret-backup\n",
    );
    writeFile(
      ".coding/worktrees/wt-a/should-not-be-committed.txt",
      "secret-worktree\n",
    );
    writeFile(
      ".coding/.template-hashes.json",
      '{"_": "should-not-be-committed"}\n',
    );
    writeFile(
      ".coding/.runtime/sessions/should-not-be-committed.json",
      "{}\n",
    );

    if (options?.gitignoreCoding) {
      writeFile(".gitignore", ".coding/\n");
    }
    // Seed an initial commit so HEAD exists.
    writeFile("README.md", "test\n");
    execSync("git add README.md", { cwd: tmpDir });
    if (options?.gitignoreCoding) {
      execSync("git add .gitignore", { cwd: tmpDir });
    }
    execSync('git commit -q -m "init"', { cwd: tmpDir });
  }

  function runAddSession(): { stdout: string; stderr: string } {
    const scriptPath = path.join(
      tmpDir,
      ".coding",
      "scripts",
      "add_session.py",
    );
    const result = spawnSync(
      pyCmd,
      [scriptPath, "--title", "Test", "--summary", "Test"],
      {
        cwd: tmpDir,
        encoding: "utf-8",
        env: { ...process.env, CODING_CONTEXT_ID: "session-a" },
      },
    );
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }

  function listCommittedFiles(): string[] {
    const out = execSync("git ls-tree -r --name-only HEAD", {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    return out.split("\n").filter((l) => l.length > 0);
  }

  it("[gitignore-coding] add_session warns and skips when .coding/ is ignored (default mode)", () => {
    setupRepo({ gitignoreCoding: true });
    const { stderr } = runAddSession();

    // Plain add fails with "ignored by". 0.5.11 must NOT retry with -f.
    // Instead the script warns and skips the entire auto-commit. So no
    // "Auto-committed" line, and the warning fires.
    expect(stderr).not.toContain("Auto-committed");
    expect(stderr).toContain("ignored by your .gitignore");
    expect(stderr).toContain("Do NOT use `git add -f .coding/`");
    expect(stderr).toContain("session_auto_commit: false");

    // Nothing under .coding/ should be tracked: the user's .gitignore
    // intent is preserved.
    const tracked = listCommittedFiles();
    for (const tracked_path of tracked) {
      expect(
        tracked_path.startsWith(".coding/"),
        `should not commit anything under .coding/ (got: ${tracked_path})`,
      ).toBe(false);
    }

    // The journal + index files are still on disk (the script wrote them
    // before attempting auto-commit) — only git was untouched.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".coding/workspace/test-dev/journal-1.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".coding/workspace/test-dev/index.md")),
    ).toBe(true);
  });

  it("[gitignore-coding] add_session works normally when .coding/ is NOT ignored", () => {
    // Regression guard: pre-existing behavior must not change for users
    // whose .gitignore does not exclude .coding/.
    setupRepo({ gitignoreCoding: false });
    const { stderr } = runAddSession();
    expect(stderr).toContain("Auto-committed");

    const tracked = listCommittedFiles();
    expect(tracked).toContain(".coding/workspace/test-dev/journal-1.md");
  });

  it("[gitignore-coding] safe_commit module ships and contains the negative warning + new config hint", () => {
    // The warning's exact text matters because AI agents read it.
    // Specifically the negative example must appear verbatim so any future
    // refactor that removes it will fail this test. 0.5.11 also adds the
    // new session_auto_commit hint.
    const safeCommit = getAllScripts().get("common/safe_commit.py");
    expect(safeCommit).toBeTruthy();
    expect(safeCommit).toContain("Do NOT use `git add -f .coding/`");
    expect(safeCommit).toContain("safe_coding_paths_to_add");
    expect(safeCommit).toContain("safe_archive_paths_to_add");
    expect(safeCommit).toContain("safe_git_add");
    // 0.5.11: new hint pointing users at the config knob.
    expect(safeCommit).toContain("session_auto_commit: false");
    // 0.5.11: auto -f retry must be gone. The function body should no
    // longer issue `git add -f`.
    expect(safeCommit).not.toMatch(/\["add", "-f", "--",/);
  });

  it("[gitignore-coding] task.py archive warns and skips when .coding/ is ignored (default mode)", () => {
    setupRepo({ gitignoreCoding: true });
    // Create a task to archive.
    writeFile(
      ".coding/tasks/issue-500/task.json",
      JSON.stringify(
        { title: "Test archive", status: "in_progress", package: null },
        null,
        2,
      ),
    );
    writeFile(".coding/tasks/issue-500/prd.md", "# PRD\n");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const result = spawnSync(pyCmd, [taskScriptPath, "archive", "issue-500"], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: { ...process.env, CODING_CONTEXT_ID: "session-arch" },
    });
    const stderr = result.stderr ?? "";
    // 0.5.11: must NOT retry with -f, must NOT auto-commit. Warning must
    // surface so the user knows their .gitignore won.
    expect(stderr).not.toContain("Auto-committed");
    expect(stderr).toContain("ignored by your .gitignore");
    expect(stderr).toContain("Do NOT use `git add -f .coding/`");

    const tracked = listCommittedFiles();
    // Nothing under .coding/ should be tracked.
    for (const t of tracked) {
      expect(
        t.startsWith(".coding/"),
        `should not commit anything under .coding/ (got: ${t})`,
      ).toBe(false);
    }

    // The archive directory move on disk still happened — only git was
    // untouched.
    const archiveExists = fs
      .readdirSync(path.join(tmpDir, ".coding/tasks/archive"))
      .some((monthDir) => {
        const monthPath = path.join(tmpDir, ".coding/tasks/archive", monthDir);
        return (
          fs.statSync(monthPath).isDirectory() &&
          fs.existsSync(path.join(monthPath, "issue-500"))
        );
      });
    expect(archiveExists).toBe(true);
  });

  // ===========================================================================
  // 0.5.11: session_auto_commit config (issue #245 + screenshot user)
  // ===========================================================================

  function writeConfigYaml(content: string): void {
    writeFile(".coding/config.yaml", content);
  }

  it("[session_auto_commit=false] add_session skips git entirely (no add, no commit)", () => {
    // User wants journal/task files written to disk but no auto-staging
    // and no auto-commit. Issue #245 + screenshot user use case.
    setupRepo({ gitignoreCoding: false });
    writeConfigYaml("session_auto_commit: false\n");

    const { stderr } = runAddSession();
    expect(stderr).not.toContain("Auto-committed");
    expect(stderr).toContain("session_auto_commit: false");

    // No new commits beyond the initial "init" commit.
    const log = execSync("git log --oneline", {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    expect(log.trim().split("\n").length).toBe(1);

    // No staged changes either — `git add` was never called.
    const staged = execSync("git diff --cached --name-only", {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    expect(staged.trim()).toBe("");

    // Files were still written to disk.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".coding/workspace/test-dev/journal-1.md"),
      ),
    ).toBe(true);
  });

  it("[session_auto_commit=false] task.py archive skips git entirely", () => {
    setupRepo({ gitignoreCoding: false });
    writeConfigYaml("session_auto_commit: false\n");

    writeFile(
      ".coding/tasks/issue-600/task.json",
      JSON.stringify(
        { title: "Test archive", status: "in_progress", package: null },
        null,
        2,
      ),
    );
    writeFile(".coding/tasks/issue-600/prd.md", "# PRD\n");

    const taskScriptPath = path.join(tmpDir, ".coding", "scripts", "task.py");
    const result = spawnSync(pyCmd, [taskScriptPath, "archive", "issue-600"], {
      cwd: tmpDir,
      encoding: "utf-8",
      env: { ...process.env, CODING_CONTEXT_ID: "session-arch-2" },
    });
    const stderr = result.stderr ?? "";
    expect(stderr).not.toContain("Auto-committed");
    expect(stderr).toContain("session_auto_commit: false");

    const log = execSync("git log --oneline", {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    expect(log.trim().split("\n").length).toBe(1);

    // Archive directory move still happened on disk.
    const archiveExists = fs
      .readdirSync(path.join(tmpDir, ".coding/tasks/archive"))
      .some((monthDir) => {
        const monthPath = path.join(tmpDir, ".coding/tasks/archive", monthDir);
        return (
          fs.statSync(monthPath).isDirectory() &&
          fs.existsSync(path.join(monthPath, "issue-600"))
        );
      });
    expect(archiveExists).toBe(true);
  });

  it("[session_auto_commit] inline comment is stripped before parsing", () => {
    // YAML inline-comment trap: `key: false  # comment` previously broke in
    // common/config.py because parse_simple_yaml didn't strip ` #`. This
    // verifies the helper is shared with coding_config.py's parser.
    setupRepo({ gitignoreCoding: false });
    writeConfigYaml("session_auto_commit: false  # disable for this project\n");

    const { stderr } = runAddSession();
    expect(stderr).toContain("session_auto_commit: false");
    expect(stderr).not.toContain("Auto-committed");
    expect(stderr).not.toContain("invalid session_auto_commit");

    const log = execSync("git log --oneline", {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    expect(log.trim().split("\n").length).toBe(1);
  });

  it("[session_auto_commit] string variants resolve to false", () => {
    // The helper must accept lowercase / uppercase / synonym forms.
    // Spot-check `FALSE` (uppercase) and `no` here; `0` and `off` follow
    // the same code path (the lowercase set in get_session_auto_commit).
    for (const variant of ["FALSE", "no", "off", "0"]) {
      setupRepo({ gitignoreCoding: false });
      writeConfigYaml(`session_auto_commit: ${variant}\n`);

      const { stderr } = runAddSession();
      expect(
        stderr.includes("session_auto_commit: false"),
        `variant=${variant}`,
      ).toBe(true);

      // Reset for next iteration.
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-safe-commit-"));
      execSync("git init -q -b main", { cwd: tmpDir });
      execSync('git config user.email "test@coding.local"', { cwd: tmpDir });
      execSync('git config user.name "Coding Test"', { cwd: tmpDir });
    }
  });

  it("[session_auto_commit] invalid value falls back to true with stderr warn", () => {
    setupRepo({ gitignoreCoding: false });
    writeConfigYaml("session_auto_commit: maybe\n");

    const { stderr } = runAddSession();
    // Warning fires.
    expect(stderr).toContain("invalid session_auto_commit value");
    // Falls back to true → auto-commit happens.
    expect(stderr).toContain("Auto-committed");
  });
});
