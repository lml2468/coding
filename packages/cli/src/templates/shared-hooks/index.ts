/**
 * Shared hook templates — platform-independent Python hook scripts.
 *
 * These scripts read only from .coding/ paths (JSONL, prd.md, spec/) and
 * have no platform-specific placeholders. They can be written as-is to any
 * platform's hooks directory.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

export interface HookScript {
  /** Filename (e.g., "session-start.py") */
  name: string;
  /** Script content — no placeholders, ready to write directly */
  content: string;
}

export type SharedHookName =
  | "session-start.py"
  | "inject-workflow-state.py"
  | "inject-subagent-context.py"
  | "inject-commit-gate.py";

export type SharedHookPlatform = "claude";

/**
 * Which shared hooks each platform actually invokes. Single source of truth
 * for shared-hook distribution — both `writeSharedHooks` (runtime install)
 * and `collectSharedHooks` (`coding update` diff) read from this table.
 *
 * Claude Code registers all four shared hooks:
 * - `session-start.py` — SessionStart overview.
 * - `inject-workflow-state.py` — per-turn UserPromptSubmit breadcrumb.
 * - `inject-subagent-context.py` — PreToolUse sub-agent prompt injection.
 * - `inject-commit-gate.py` — PreToolUse Bash commit gate.
 *
 * Claude Code `statusLine` is intentionally not installed by default. Users
 * can add their own statusLine command in `.claude/settings.json`, or opt in
 * to the Coding one via `coding init --with-statusline` (installed from
 * `templates/claude/hooks/`, not from this table).
 */
export const SHARED_HOOKS_BY_PLATFORM: Record<
  SharedHookPlatform,
  readonly SharedHookName[]
> = {
  claude: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
    "inject-commit-gate.py",
  ],
};

/**
 * Get all shared hook scripts. Content is platform-independent and can be
 * written directly without placeholder resolution.
 */
export function getSharedHookScripts(): HookScript[] {
  const scripts: HookScript[] = [];
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith(".py"))
    .sort();

  for (const file of files) {
    scripts.push({ name: file, content: readTemplate(file) });
  }

  return scripts;
}

/**
 * Get the shared hook scripts that a given platform actually registers.
 * Drives both `writeSharedHooks` and `collectSharedHooks` so distribution
 * never drifts from the per-platform capability declared above.
 */
export function getSharedHookScriptsForPlatform(
  platform: SharedHookPlatform,
): HookScript[] {
  const allowed = new Set<string>(SHARED_HOOKS_BY_PLATFORM[platform]);
  return getSharedHookScripts().filter((h) => allowed.has(h.name));
}
