/**
 * Platform Registry — Single source of truth for platform functions and derived helpers
 *
 * All platform-specific lists (backup dirs, template dirs, configured platforms, etc.)
 * are derived from AI_TOOLS in types/ai-tools.ts. Adding a new platform requires:
 * 1. Adding to AI_TOOLS (data)
 * 2. Adding to PLATFORM_FUNCTIONS below (behavior)
 * 3. Creating the configurator file + template directory
 */

import fs from "node:fs";
import path from "node:path";
import {
  AI_TOOLS,
  getManagedPaths,
  type AITool,
  type CliFlag,
} from "../types/ai-tools.js";

// Platform configurators
import { configureClaude } from "./claude.js";

// Shared utilities
import {
  replacePythonCommandLiterals,
  resolvePlaceholders,
  resolveBundledSkills,
  resolveCommands,
  resolveSkills,
  collectSkillTemplates,
  type PlatformConfigureOptions,
} from "./shared.js";

// Platform-specific template content (hooks, agents, settings — NOT commands/skills)
import {
  getAllAgents as getClaudeAgents,
  getSettingsTemplate as getClaudeSettings,
} from "../templates/claude/index.js";
import {
  getSharedHookScriptsForPlatform,
  type SharedHookPlatform,
} from "../templates/shared-hooks/index.js";

// =============================================================================
// Platform Functions Registry
// =============================================================================

interface PlatformFunctions {
  /** Configure platform during init (copy templates to project) */
  configure: (cwd: string, options?: PlatformConfigureOptions) => Promise<void>;
  /** Collect template files for update tracking. Undefined = platform skipped during update. */
  collectTemplates?: () => Map<string, string>;
}

/**
 * Platform functions registry — maps each AITool to its behavior.
 * When adding a new platform, add an entry here.
 */
/** Helper: collect the shared hook scripts that `platform` actually
 *  registers. Keyed off SHARED_HOOKS_BY_PLATFORM so runtime install
 *  (writeSharedHooks) and update diff (collectSharedHooks) never drift.
 */
function collectSharedHooks(
  hooksPath: string,
  platform: SharedHookPlatform,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const hook of getSharedHookScriptsForPlatform(platform)) {
    files.set(`${hooksPath}/${hook.name}`, hook.content);
  }
  return files;
}

/** Apply python3→python replacement to all content in a template map. */
function replaceInMap(map: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, content] of map) {
    result.set(key, replacePythonCommandLiterals(content));
  }
  return result;
}

/** Helper: collect commands + skills for "both" platforms */
function collectBothTemplates(
  ctx: import("../types/ai-tools.js").TemplateContext,
  cmdPath: (name: string) => string,
  skillRoot: string,
  wrapCmd?: (filePath: string, content: string) => string,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const cmd of resolveCommands(ctx)) {
    const filePath = cmdPath(cmd.name);
    files.set(filePath, wrapCmd ? wrapCmd(filePath, cmd.content) : cmd.content);
  }
  for (const [filePath, content] of collectSkillTemplates(
    skillRoot,
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }
  return files;
}

const PLATFORM_FUNCTIONS: Record<AITool, PlatformFunctions> = {
  "claude-code": {
    configure: configureClaude,
    collectTemplates: () => {
      const ctx = AI_TOOLS["claude-code"].templateContext;
      const files = collectBothTemplates(
        ctx,
        (n) => `.claude/commands/coding/${n}.md`,
        ".claude/skills",
      );
      for (const agent of getClaudeAgents()) {
        files.set(`.claude/agents/${agent.name}.md`, agent.content);
      }
      for (const [k, v] of collectSharedHooks(".claude/hooks", "claude")) {
        files.set(k, v);
      }
      const settings = getClaudeSettings();
      files.set(
        `.claude/${settings.targetPath}`,
        resolvePlaceholders(settings.content),
      );
      return files;
    },
  },
};

// =============================================================================
// Derived Helpers — all derived from AI_TOOLS registry
// =============================================================================

/** All platform IDs */
export const PLATFORM_IDS = Object.keys(AI_TOOLS) as AITool[];

/** All platform config directory names (e.g., [".claude", ".cursor", ".opencode"]) */
export const CONFIG_DIRS = PLATFORM_IDS.map((id) => AI_TOOLS[id].configDir);

/** All managed paths for every platform (primary configDir + extra managed paths). */
export const PLATFORM_MANAGED_DIRS = PLATFORM_IDS.flatMap((id) =>
  getManagedPaths(id),
);

/** All directories managed by Coding (including .coding itself) */
export const ALL_MANAGED_DIRS = [".coding", ...new Set(PLATFORM_MANAGED_DIRS)];

/**
 * Detect which platforms are configured by checking for configDir existence.
 *
 * Note: Detection uses only `configDir` (the platform-specific directory),
 * NOT shared layers like `.agents/skills/`. This prevents false positives
 * where a shared directory triggers detection of a specific platform.
 */
export function getConfiguredPlatforms(cwd: string): Set<AITool> {
  const platforms = new Set<AITool>();
  for (const id of PLATFORM_IDS) {
    if (fs.existsSync(path.join(cwd, AI_TOOLS[id].configDir))) {
      platforms.add(id);
    }
  }
  return platforms;
}

/**
 * Get platform IDs that have Python hooks (for Windows encoding detection)
 */
export function getPlatformsWithPythonHooks(): AITool[] {
  return PLATFORM_IDS.filter((id) => AI_TOOLS[id].hasPythonHooks);
}

/**
 * Check if a path starts with any managed directory
 */
export function isManagedPath(dirPath: string): boolean {
  // Normalize Windows backslashes to forward slashes for consistent matching
  const normalized = dirPath.replace(/\\/g, "/");
  return ALL_MANAGED_DIRS.some(
    (d) => normalized.startsWith(d + "/") || normalized === d,
  );
}

/**
 * Check if a directory name is a managed root directory (should not be deleted)
 */
export function isManagedRootDir(dirName: string): boolean {
  return ALL_MANAGED_DIRS.includes(dirName);
}

/**
 * Get all managed paths for a platform.
 */
export function getPlatformManagedPaths(platformId: AITool): string[] {
  return getManagedPaths(platformId);
}

/**
 * Get the configure function for a platform
 */
export function configurePlatform(
  platformId: AITool,
  cwd: string,
  options?: PlatformConfigureOptions,
): Promise<void> {
  return PLATFORM_FUNCTIONS[platformId].configure(cwd, options);
}

/**
 * Collect template files for a specific platform (for update tracking).
 * Returns undefined if the platform doesn't support template tracking.
 */
export function collectPlatformTemplates(
  platformId: AITool,
): Map<string, string> | undefined {
  const map = PLATFORM_FUNCTIONS[platformId].collectTemplates?.();
  return map ? replaceInMap(map) : map;
}

/**
 * Build TOOLS array for interactive init prompt, derived from AI_TOOLS registry
 */
export function getInitToolChoices(): {
  key: CliFlag;
  name: string;
  defaultChecked: boolean;
  platformId: AITool;
}[] {
  return PLATFORM_IDS.map((id) => ({
    key: AI_TOOLS[id].cliFlag,
    name: AI_TOOLS[id].name,
    defaultChecked: AI_TOOLS[id].defaultChecked,
    platformId: id,
  }));
}

/**
 * Resolve CLI flag name to AITool id (e.g., "claude" → "claude-code")
 */
export function resolveCliFlag(flag: string): AITool | undefined {
  return PLATFORM_IDS.find((id) => AI_TOOLS[id].cliFlag === flag);
}
