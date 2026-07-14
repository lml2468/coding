import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";
import type { AITool } from "../types/ai-tools.js";
import { VERSION, PACKAGE_NAME } from "../constants/version.js";
import type { TemplateHashes } from "../types/migration.js";
import {
  loadHashes,
  updateHashes,
  computeHash,
} from "../utils/template-hash.js";
import { compareVersions } from "../utils/compare-versions.js";
import { setupProxy } from "../utils/proxy.js";

// Import templates for comparison
import {
  getAllScripts,
  // Configuration
  configYamlTemplate,
  gitignoreTemplate,
  workflowMdTemplate,
} from "../templates/coding/index.js";
import { agentsMdContent } from "../templates/markdown/index.js";

import {
  ALL_MANAGED_DIRS,
  getConfiguredPlatforms,
  collectPlatformTemplates,
  isManagedPath,
  isManagedRootDir,
} from "../configurators/index.js";
import { replacePythonCommandLiterals } from "../configurators/shared.js";
import { pruneOrphanManifestKeys } from "../utils/manifest-prune.js";
import {
  fetchRegistrySpecTemplates,
  collectDirectoryFiles,
  removeDirectory,
  parseRegistrySource,
  probeRegistryIndex,
  downloadTemplateById,
  type RegistrySource,
} from "../utils/template-fetcher.js";
import { loadSpecRegistryConfig } from "../utils/registry-config.js";

export interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
  allowDowngrade?: boolean;
}

interface FileChange {
  path: string;
  relativePath: string;
  newContent: string;
  status: "new" | "unchanged" | "changed";
}

interface ChangeAnalysis {
  newFiles: FileChange[];
  unchangedFiles: FileChange[];
  autoUpdateFiles: FileChange[]; // Template updated, user didn't modify
  changedFiles: FileChange[]; // User modified, needs confirmation
  userDeletedFiles: FileChange[]; // User deleted (hash exists but file missing)
  protectedPaths: string[];
}

type ConflictAction = "overwrite" | "skip" | "create-new";

const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
export const CODING_BLOCK_START = "<!-- CODING:START -->";
export const CODING_BLOCK_END = "<!-- CODING:END -->";
const LEGACY_UNTRACKED_AGENTS_MD_BLOCK_HASHES = new Set<string>([
  // v0.5.0-beta.17 and earlier wrote AGENTS.md but did not hash-track it.
  // This hash is the pristine Coding-managed block before the Subagents
  // section was added, so old untouched projects can be updated without a
  // false "modified by you" conflict.
  "c1f511b1cfc1902f2147da159f09cc51f380b0c9e341cdb3ac5dea5233f3e307",
]);

// Paths that should never be touched (true user data)
// spec/ is user-customized content created during init; update should never modify it
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`, // workspace/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`, // tasks/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`, // spec/
  `${DIR_NAMES.WORKFLOW}/.developer`,
  `${DIR_NAMES.WORKFLOW}/.current-task`,
];

function getManagedBlock(
  content: string,
  startMarker: string,
  endMarker: string,
): string | null {
  const start = content.indexOf(startMarker);
  if (start === -1) {
    return null;
  }

  const end = content.indexOf(endMarker, start);
  if (end === -1) {
    return null;
  }

  return content.slice(start, end + endMarker.length);
}

function getCodingManagedBlock(content: string): string | null {
  return getManagedBlock(content, CODING_BLOCK_START, CODING_BLOCK_END);
}

function replaceManagedBlock(
  existingContent: string,
  templateContent: string,
  startMarker: string,
  endMarker: string,
): string | null {
  const existingStart = existingContent.indexOf(startMarker);
  if (existingStart === -1) {
    return null;
  }

  const existingEnd = existingContent.indexOf(endMarker, existingStart);
  if (existingEnd === -1) {
    return null;
  }

  const templateBlock = getManagedBlock(
    templateContent,
    startMarker,
    endMarker,
  );
  if (!templateBlock) {
    return null;
  }

  return (
    existingContent.slice(0, existingStart) +
    templateBlock +
    existingContent.slice(existingEnd + endMarker.length)
  );
}

function mergeManagedBlockContent(
  existingContent: string,
  templateContent: string,
  startMarker: string,
  endMarker: string,
): string {
  const replaced = replaceManagedBlock(
    existingContent,
    templateContent,
    startMarker,
    endMarker,
  );
  if (replaced !== null) {
    return replaced;
  }

  const templateBlock = getManagedBlock(
    templateContent,
    startMarker,
    endMarker,
  );
  if (!templateBlock) {
    return templateContent;
  }

  const trimmed = existingContent.replace(/\s+$/, "");
  return `${trimmed}\n\n${templateBlock}\n`;
}

function buildManagedBlockTemplate(
  cwd: string,
  relativePath: string,
  templateContent: string,
  startMarker: string,
  endMarker: string,
): string {
  const fullPath = path.join(cwd, ...relativePath.split("/"));
  if (!fs.existsSync(fullPath)) {
    return templateContent;
  }

  const existingContent = fs.readFileSync(fullPath, "utf-8");
  return mergeManagedBlockContent(
    existingContent,
    templateContent,
    startMarker,
    endMarker,
  );
}

function buildAgentsMdTemplate(cwd: string): string {
  return buildManagedBlockTemplate(
    cwd,
    FILE_NAMES.AGENTS,
    agentsMdContent,
    CODING_BLOCK_START,
    CODING_BLOCK_END,
  );
}

function isKnownUntrackedTemplate(
  relativePath: string,
  existingContent: string,
): boolean {
  if (relativePath !== FILE_NAMES.AGENTS) {
    return false;
  }

  const managedBlock = getCodingManagedBlock(existingContent);
  if (!managedBlock) {
    return false;
  }

  return LEGACY_UNTRACKED_AGENTS_MD_BLOCK_HASHES.has(computeHash(managedBlock));
}

/**
 * Load update.skip paths from .coding/config.yaml
 *
 * Parses simple YAML structure:
 *   update:
 *     skip:
 *       - path1
 *       - path2
 *
 * @internal Exported for testing only
 */
export function loadUpdateSkipPaths(cwd: string): string[] {
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  if (!fs.existsSync(configPath)) return [];

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const lines = content.split("\n");
    const paths: string[] = [];
    let inUpdate = false;
    let inSkip = false;

    for (const line of lines) {
      const trimmed = line.trimEnd();

      // Check for "update:" section (no indentation or at root level)
      if (/^update:\s*$/.test(trimmed)) {
        inUpdate = true;
        inSkip = false;
        continue;
      }

      // Check for "skip:" under update (indented)
      if (inUpdate && /^\s+skip:\s*$/.test(trimmed)) {
        inSkip = true;
        continue;
      }

      // Collect list items under skip
      if (inSkip) {
        const match = trimmed.match(/^\s+-\s+(.+)$/);
        if (match) {
          paths.push(match[1].trim().replace(/^['"]|['"]$/g, ""));
          continue;
        }
        // If line is non-empty and not a list item, we've left the skip section
        if (trimmed !== "" && !trimmed.startsWith("#")) {
          inSkip = false;
          inUpdate = false;
        }
      }

      // If we're in update but hit a non-indented line, we've left the update section
      if (
        inUpdate &&
        trimmed !== "" &&
        !trimmed.startsWith(" ") &&
        !trimmed.startsWith("#")
      ) {
        inUpdate = false;
        inSkip = false;
      }
    }

    return paths;
  } catch {
    // Config exists but failed to parse — warn user that skip rules won't apply
    console.warn(
      `Warning: failed to parse ${configPath}, update.skip rules will not be applied`,
    );
    return [];
  }
}

/**
 * Collect all template files that should be managed by update
 * Only collects templates for platforms that are already configured (have directories)
 */
function preserveExistingClaudeStatusLine(
  cwd: string,
  templates: Map<string, string>,
): void {
  const newSettingsContent = templates.get(CLAUDE_SETTINGS_PATH);
  if (!newSettingsContent) return;

  const settingsPath = path.join(cwd, CLAUDE_SETTINGS_PATH);
  if (!fs.existsSync(settingsPath)) return;

  try {
    const existingSettings = JSON.parse(
      fs.readFileSync(settingsPath, "utf-8"),
    ) as Record<string, unknown>;

    if (!Object.prototype.hasOwnProperty.call(existingSettings, "statusLine")) {
      return;
    }

    const newSettings = JSON.parse(newSettingsContent) as Record<
      string,
      unknown
    >;

    if (Object.prototype.hasOwnProperty.call(newSettings, "statusLine")) {
      return;
    }

    newSettings.statusLine = existingSettings.statusLine;
    templates.set(
      CLAUDE_SETTINGS_PATH,
      `${JSON.stringify(newSettings, null, 2)}\n`,
    );
  } catch {
    // Invalid local JSON is handled by the normal conflict path.
  }
}

function preserveExistingRegistryConfig(cwd: string, template: string): string {
  const registry = loadSpecRegistryConfig(cwd);
  if (!registry) return template;
  return (
    template.trimEnd() +
    "\n\n" +
    "#-------------------------------------------------------------------------------\n" +
    "# Registry\n" +
    "#-------------------------------------------------------------------------------\n\n" +
    "# Source used to install .coding/spec. coding update refreshes this\n" +
    "# hash-tracked spec template while preserving local edits through the\n" +
    "# normal update conflict flow.\n" +
    "registry:\n" +
    "  spec:\n" +
    `    source: ${registry.source}\n` +
    (registry.template ? `    template: ${registry.template}\n` : "")
  );
}

async function collectRegistrySpecTemplates(
  cwd: string,
): Promise<Map<string, string>> {
  const config = loadSpecRegistryConfig(cwd);
  if (!config) return new Map();

  let registry: RegistrySource;
  try {
    registry = parseRegistrySource(config.source);
  } catch (error) {
    console.log(
      chalk.yellow(
        `Warning: invalid registry.spec.source in .coding/config.yaml: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    return new Map();
  }

  const probe = await probeRegistryIndex(
    `${registry.rawBaseUrl}/index.json`,
    registry,
  );
  if (probe.templates.length > 0) {
    if (!config.template) {
      console.log(
        chalk.gray(
          "Registry spec update skipped: marketplace registries require registry.spec.template.",
        ),
      );
      return new Map();
    }
    const template = probe.templates.find(
      (candidate) => candidate.id === config.template,
    );
    if (!template) {
      console.log(
        chalk.yellow(
          `Warning: registry spec update skipped: template "${config.template}" was not found in registry index.`,
        ),
      );
      return new Map();
    }
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "coding-registry-template-"),
    );
    try {
      const result = await downloadTemplateById(
        tempRoot,
        config.template,
        "overwrite",
        template,
        registry,
        undefined,
        probe.backend,
      );
      if (!result.success) {
        console.log(
          chalk.yellow(
            `Warning: registry spec update skipped: ${result.message}`,
          ),
        );
        return new Map();
      }
      return collectDirectoryFiles(path.join(tempRoot, PATHS.SPEC), PATHS.SPEC);
    } finally {
      await removeDirectory(tempRoot);
    }
  }
  if (!probe.isNotFound) {
    console.log(
      chalk.yellow(
        `Warning: registry spec update skipped: ${
          probe.error?.message ?? "could not reach registry"
        }`,
      ),
    );
    return new Map();
  }

  const result = await fetchRegistrySpecTemplates(registry, probe.backend);
  if (!result.success) {
    console.log(
      chalk.yellow(
        `Warning: registry spec update skipped: ${result.message ?? "download failed"}`,
      ),
    );
    return new Map();
  }
  return result.files;
}

async function collectTemplateFiles(
  cwd: string,
  extraPlatforms?: Set<AITool>,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const platforms = getConfiguredPlatforms(cwd);
  if (extraPlatforms) {
    for (const p of extraPlatforms) {
      platforms.add(p);
    }
  }

  // Python scripts (single source of truth: getAllScripts())
  for (const [scriptPath, content] of getAllScripts()) {
    files.set(`${PATHS.SCRIPTS}/${scriptPath}`, content);
  }

  // Configuration
  files.set(
    `${DIR_NAMES.WORKFLOW}/config.yaml`,
    preserveExistingRegistryConfig(cwd, configYamlTemplate),
  );
  files.set(`${DIR_NAMES.WORKFLOW}/.gitignore`, gitignoreTemplate);
  // workflow.md is included here because it is runtime-parsed by
  // get_context.py and shared hooks. Keep it on the normal template update
  // path: if the installed file still matches the tracked hash, update the
  // whole file. If the user edited it, the standard modified-file prompt /
  // --force behavior applies. Partial tag-block merging is unsafe because
  // platform routing markers outside [workflow-state:*] blocks are also
  // script-consumed.
  files.set(`${DIR_NAMES.WORKFLOW}/workflow.md`, workflowMdTemplate);
  // workspace/index.md stays excluded — it's runtime-appended by add_session.py
  // (journal index) and has no script-parsed structure.
  files.set(FILE_NAMES.AGENTS, buildAgentsMdTemplate(cwd));

  // Platform-specific templates (only for configured platforms)
  for (const platformId of platforms) {
    const platformFiles = collectPlatformTemplates(platformId);
    if (platformFiles) {
      for (const [filePath, content] of platformFiles) {
        files.set(filePath, content);
      }
    }
  }

  preserveExistingClaudeStatusLine(cwd, files);

  for (const [filePath, content] of await collectRegistrySpecTemplates(cwd)) {
    files.set(filePath, content);
  }

  // Apply update.skip from config.yaml
  const skipPaths = loadUpdateSkipPaths(cwd);
  if (skipPaths.length > 0) {
    for (const [filePath] of [...files]) {
      if (
        skipPaths.some(
          (skip) =>
            filePath === skip ||
            filePath.startsWith(skip.endsWith("/") ? skip : skip + "/"),
        )
      ) {
        files.delete(filePath);
      }
    }
  }

  // Apply python3→python replacement for Windows consistency with init-time writes
  for (const [filePath, content] of files) {
    files.set(filePath, replacePythonCommandLiterals(content));
  }

  return files;
}

/**
 * Analyze changes between current files and templates
 *
 * Uses hash tracking to distinguish between:
 * - User didn't modify + template same = skip (unchangedFiles)
 * - User didn't modify + template updated = auto-update (autoUpdateFiles)
 * - User modified = needs confirmation (changedFiles)
 */
function analyzeChanges(
  cwd: string,
  hashes: TemplateHashes,
  templates: Map<string, string>,
): ChangeAnalysis {
  const result: ChangeAnalysis = {
    newFiles: [],
    unchangedFiles: [],
    autoUpdateFiles: [],
    changedFiles: [],
    userDeletedFiles: [],
    protectedPaths: PROTECTED_PATHS,
  };

  for (const [relativePath, newContent] of templates) {
    const fullPath = path.join(cwd, relativePath);
    const exists = fs.existsSync(fullPath);

    const change: FileChange = {
      path: fullPath,
      relativePath,
      newContent,
      status: "new",
    };

    if (!exists) {
      const storedHash = hashes[relativePath];
      if (storedHash) {
        // Previously installed but user deleted — respect deletion
        result.userDeletedFiles.push(change);
      } else {
        change.status = "new";
        result.newFiles.push(change);
      }
    } else {
      const existingContent = fs.readFileSync(fullPath, "utf-8");
      if (existingContent === newContent) {
        // Content same as template - already up to date
        change.status = "unchanged";
        result.unchangedFiles.push(change);
      } else {
        // Content differs - check if user modified or template updated
        const storedHash = hashes[relativePath];
        const currentHash = computeHash(existingContent);

        if (
          (storedHash && storedHash === currentHash) ||
          (!storedHash &&
            isKnownUntrackedTemplate(relativePath, existingContent))
        ) {
          // Either the tracked hash matches, or this is a known pristine template
          // from before the path was hash-tracked. Safe to auto-update.
          change.status = "changed";
          result.autoUpdateFiles.push(change);
        } else {
          // Hash differs (or no stored hash) - user modified the file
          // Needs confirmation
          change.status = "changed";
          result.changedFiles.push(change);
        }
      }
    }
  }

  return result;
}

function collectMissingManagedFileHashes(
  changes: ChangeAnalysis,
  hashes: TemplateHashes,
): Map<string, string> {
  const files = new Map<string, string>();
  const managedFiles = new Set<string>([FILE_NAMES.AGENTS]);

  for (const file of changes.unchangedFiles) {
    if (managedFiles.has(file.relativePath) && !hashes[file.relativePath]) {
      files.set(file.relativePath, file.newContent);
    }
  }

  return files;
}

/**
 * Print change summary
 */
function printChangeSummary(changes: ChangeAnalysis): void {
  console.log("\nScanning for changes...\n");

  if (changes.newFiles.length > 0) {
    console.log(chalk.green("  New files (will add):"));
    for (const file of changes.newFiles) {
      console.log(chalk.green(`    + ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.autoUpdateFiles.length > 0) {
    console.log(chalk.cyan("  Template updated (will auto-update):"));
    for (const file of changes.autoUpdateFiles) {
      console.log(chalk.cyan(`    ↑ ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.unchangedFiles.length > 0) {
    console.log(chalk.gray("  Unchanged files (will skip):"));
    for (const file of changes.unchangedFiles.slice(0, 5)) {
      console.log(chalk.gray(`    ○ ${file.relativePath}`));
    }
    if (changes.unchangedFiles.length > 5) {
      console.log(
        chalk.gray(`    ... and ${changes.unchangedFiles.length - 5} more`),
      );
    }
    console.log("");
  }

  if (changes.changedFiles.length > 0) {
    console.log(chalk.yellow("  Modified by you (need your decision):"));
    for (const file of changes.changedFiles) {
      console.log(chalk.yellow(`    ? ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.userDeletedFiles.length > 0) {
    console.log(chalk.gray("  Deleted by you (preserved):"));
    for (const file of changes.userDeletedFiles) {
      console.log(chalk.gray(`    ✕ ${file.relativePath}`));
    }
    console.log("");
  }

  // Only show protected paths that actually exist
  const existingProtectedPaths = changes.protectedPaths.filter((p) => {
    const fullPath = path.join(process.cwd(), p);
    return fs.existsSync(fullPath);
  });

  if (existingProtectedPaths.length > 0) {
    console.log(chalk.gray("  User data (preserved):"));
    for (const protectedPath of existingProtectedPaths) {
      console.log(chalk.gray(`    ○ ${protectedPath}/`));
    }
    console.log("");
  }
}

/**
 * Prompt user for conflict resolution
 */
async function promptConflictResolution(
  file: FileChange,
  options: UpdateOptions,
  applyToAll: { action: ConflictAction | null },
): Promise<ConflictAction> {
  // If we have a batch action, use it
  if (applyToAll.action) {
    return applyToAll.action;
  }

  // Check command-line options
  if (options.force) {
    return "overwrite";
  }
  if (options.skipAll) {
    return "skip";
  }
  if (options.createNew) {
    return "create-new";
  }

  // Interactive prompt
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "list",
      name: "action",
      message: `${file.relativePath} has changes.`,
      choices: [
        {
          name: "[1] Overwrite - Replace with new version",
          value: "overwrite",
        },
        { name: "[2] Skip - Keep your current version", value: "skip" },
        {
          name: "[3] Create copy - Save new version as .new",
          value: "create-new",
        },
        { name: "[a] Apply Overwrite to all", value: "overwrite-all" },
        { name: "[s] Apply Skip to all", value: "skip-all" },
        { name: "[n] Apply Create copy to all", value: "create-new-all" },
      ],
      default: "skip",
    },
  ]);

  if (action === "overwrite-all") {
    applyToAll.action = "overwrite";
    return "overwrite";
  }
  if (action === "skip-all") {
    applyToAll.action = "skip";
    return "skip";
  }
  if (action === "create-new-all") {
    applyToAll.action = "create-new";
    return "create-new";
  }

  return action as ConflictAction;
}

/**
 * Create a timestamped backup directory path
 */
function createBackupDirPath(cwd: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(cwd, DIR_NAMES.WORKFLOW, `.backup-${timestamp}`);
}

/**
 * Backup a single file to the backup directory
 */
function backupFile(
  cwd: string,
  backupDir: string,
  relativePath: string,
): void {
  const srcPath = path.join(cwd, relativePath);
  if (!fs.existsSync(srcPath)) return;

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(srcPath, backupPath);
}

/**
 * Directories to backup as complete snapshot (derived from platform registry)
 */
const BACKUP_DIRS = ALL_MANAGED_DIRS;

/** Root-level managed files to include in update backups. */
const BACKUP_FILES = [FILE_NAMES.AGENTS] as const;

/**
 * Patterns to exclude from backup (user data that shouldn't be backed up)
 */
const BACKUP_EXCLUDE_PATTERNS = [
  ".backup-", // Previous backups
  "/node_modules", // Installed dependencies; restore via package manager
  "/workspace/", // Developer workspace (user data)
  "/tasks/", // Task data (user data)
  "/spec/", // Spec files (user-customized content)
  "/backlog/", // Backlog data (user data)
  "/agent-traces/", // Agent traces (user data, legacy name)
  // Platform-native worktree dirs — these are full sub-repos the CLI
  // spawns for parallel sessions. Backing them up on every update would
  // snapshot the entire nested working tree. Confirmed conventions:
  //   Claude Code: .claude/worktrees/
  //   Cursor CLI:  .cursor/worktrees/
  //   Gemini CLI:  .gemini/worktrees/
  // Matches any platform using the same convention (future-proof).
  "/worktrees/",
  "/worktree/",
];

/**
 * Check if a path should be excluded from backup
 * @internal Exported for testing only
 */
export function shouldExcludeFromBackup(relativePath: string): boolean {
  // Normalize Windows backslashes to forward slashes so patterns like
  // "/worktrees/" / "/tasks/" match regardless of host OS. Without this,
  // Windows `path.relative` returns `.claude\worktrees\...` and none of
  // the slash-prefixed exclude patterns trigger — which causes
  // `collectAllFiles` to descend into platform worktrees (full nested
  // project copies) and explode the scan. Same normalization pattern
  // used by `isManagedPath` in configurators/index.ts.
  const normalized = relativePath.replace(/\\/g, "/");
  for (const pattern of BACKUP_EXCLUDE_PATTERNS) {
    if (normalized.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Create complete snapshot backup of all managed directories
 * Backs up all managed platform/workflow directories entirely
 * (excluding user data like workspace/, tasks/, backlog/)
 */
function createFullBackup(cwd: string): string | null {
  const backupDir = createBackupDirPath(cwd);
  let hasFiles = false;

  for (const dir of BACKUP_DIRS) {
    const dirPath = path.join(cwd, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = collectAllFiles(dirPath, cwd);
    for (const fullPath of files) {
      const relativePath = path.relative(cwd, fullPath);

      // Skip excluded paths
      if (shouldExcludeFromBackup(relativePath)) continue;

      // Create backup
      if (!hasFiles) {
        fs.mkdirSync(backupDir, { recursive: true });
        hasFiles = true;
      }
      backupFile(cwd, backupDir, relativePath);
    }
  }

  for (const relativePath of BACKUP_FILES) {
    const fullPath = path.join(cwd, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    if (shouldExcludeFromBackup(relativePath)) continue;

    if (!hasFiles) {
      fs.mkdirSync(backupDir, { recursive: true });
      hasFiles = true;
    }
    backupFile(cwd, backupDir, relativePath);
  }

  return hasFiles ? backupDir : null;
}

/**
 * Update version file
 */
function updateVersionFile(cwd: string): void {
  const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
  fs.writeFileSync(versionPath, VERSION);
}

/**
 * Get current installed version
 */
function getInstalledVersion(cwd: string): string {
  const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
  if (fs.existsSync(versionPath)) {
    return fs.readFileSync(versionPath, "utf-8").trim();
  }
  return "unknown";
}

/**
 * Fetch latest version from npm registry
 */
async function getLatestNpmVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Recursively collect all files in a directory
 */
function collectAllFiles(dirPath: string, cwd = process.cwd()): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const rootStat = fs.statSync(dirPath);
  if (rootStat.isFile()) {
    return [dirPath];
  }
  if (!rootStat.isDirectory()) {
    return [];
  }

  const files: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(cwd, fullPath);

      // Never follow symlinks / Windows directory junctions — a junction
      // pointing at an ancestor would loop the scan forever. Node's
      // `isSymbolicLink()` returns true for NTFS junctions since v12.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (!shouldExcludeFromBackup(relativePath)) {
          stack.push(fullPath);
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Clean up empty directories after file operations
 * Recursively removes empty parent directories up to .coding root
 */
/** @internal Exported for testing only */
export function cleanupEmptyDirs(cwd: string, dirPath: string): void {
  const fullPath = path.join(cwd, dirPath);

  // Safety: don't delete outside of managed directories
  if (!isManagedPath(dirPath)) {
    return;
  }

  // Safety: never delete managed root directories themselves (e.g., .claude, .coding)
  if (isManagedRootDir(dirPath)) {
    return;
  }

  // Check if directory exists and is empty
  if (!fs.existsSync(fullPath)) return;

  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) return;

    const contents = fs.readdirSync(fullPath);
    if (contents.length === 0) {
      fs.rmdirSync(fullPath);
      // Recursively check parent (but stop at root directories)
      const parent = path.dirname(dirPath);
      if (parent !== "." && parent !== dirPath && !isManagedRootDir(parent)) {
        cleanupEmptyDirs(cwd, parent);
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }
}

/**
 * Main update command
 */
export async function update(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();

  // Check if Coding is initialized
  if (!fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW))) {
    console.log(chalk.red("Error: Coding not initialized in this directory."));
    console.log(chalk.gray("Run 'coding init' first."));
    return;
  }

  console.log(chalk.cyan("\nCoding Update"));
  console.log(chalk.cyan("══════════════\n"));

  // Set up proxy before any network calls (npm version check)
  setupProxy();

  // Get versions
  const projectVersion = getInstalledVersion(cwd);
  const cliVersion = VERSION;
  const latestNpmVersion = await getLatestNpmVersion();

  // Version comparison
  const cliVsProject = compareVersions(cliVersion, projectVersion);
  const cliVsNpm = latestNpmVersion
    ? compareVersions(cliVersion, latestNpmVersion)
    : 0;

  // Display versions with context
  console.log(`Project version: ${chalk.white(projectVersion)}`);
  console.log(`CLI version:     ${chalk.white(cliVersion)}`);
  if (latestNpmVersion) {
    console.log(`Latest on npm:   ${chalk.white(latestNpmVersion)}`);
  } else {
    console.log(chalk.gray("Latest on npm:   (unable to fetch)"));
  }
  console.log("");

  // Check if CLI is outdated compared to npm
  if (cliVsNpm < 0 && latestNpmVersion) {
    console.log(
      chalk.yellow(
        `⚠️  Your CLI (${cliVersion}) is behind npm (${latestNpmVersion}).`,
      ),
    );
    console.log(chalk.yellow(`   Run: coding upgrade\n`));
  }

  // Check for downgrade situation
  if (cliVsProject < 0) {
    console.log(
      chalk.red(
        `❌ Cannot update: CLI version (${cliVersion}) < project version (${projectVersion})`,
      ),
    );
    console.log(chalk.red(`   This would DOWNGRADE your project!\n`));

    if (!options.allowDowngrade) {
      console.log(chalk.gray("Solutions:"));
      console.log(chalk.gray(`  1. Update your CLI: coding upgrade`));
      console.log(
        chalk.gray(`  2. Force downgrade: coding update --allow-downgrade\n`),
      );
      return;
    }

    console.log(
      chalk.yellow(
        "⚠️  --allow-downgrade flag set. Proceeding with downgrade...\n",
      ),
    );
  }

  // Load template hashes for modification detection
  let hashes = loadHashes(cwd);
  const isFirstHashTracking = Object.keys(hashes).length === 0;

  // Handle unknown version
  const isUnknownVersion = projectVersion === "unknown";
  if (isUnknownVersion) {
    console.log(
      chalk.yellow(
        "⚠️  No version file found. Run coding init to fix.",
      ),
    );
    console.log(chalk.gray("   Template updates will still be applied.\n"));
  }

  // Self-heal poisoned manifests: prune entries that no current platform
  // configurator owns. This silently removes user-owned paths that early
  // buggy versions of `coding init` over-hashed.
  {
    const configuredPlatforms = new Set<AITool>(getConfiguredPlatforms(cwd));
    const prune = pruneOrphanManifestKeys(
      cwd,
      [...configuredPlatforms],
      hashes,
    );
    if (prune.pruned.length > 0) {
      console.log(
        chalk.gray(
          `   Pruned ${prune.pruned.length} orphan manifest entries from .template-hashes.json`,
        ),
      );
      hashes = prune.hashes;
    }
  }

  // Collect templates for change analysis
  const templates = await collectTemplateFiles(cwd);

  // Analyze changes (pass hashes for modification detection)
  const changes = analyzeChanges(cwd, hashes, templates);
  const missingManagedFileHashes = collectMissingManagedFileHashes(
    changes,
    hashes,
  );

  // Print summary
  printChangeSummary(changes);

  // First-time hash tracking hint
  if (isFirstHashTracking && changes.changedFiles.length > 0) {
    console.log(chalk.cyan("ℹ️  First update with hash tracking enabled."));
    console.log(
      chalk.gray(
        "   Changed files shown above may not be actual user modifications.",
      ),
    );
    console.log(
      chalk.gray(
        "   After this update, hash tracking will accurately detect changes.\n",
      ),
    );
  }

  // Check if there's anything to do
  const isUpgrade = cliVsProject > 0;
  const isDowngrade = cliVsProject < 0;
  const isSameVersion = cliVsProject === 0;

  if (
    changes.newFiles.length === 0 &&
    changes.autoUpdateFiles.length === 0 &&
    changes.changedFiles.length === 0
  ) {
    if (!options.dryRun && missingManagedFileHashes.size > 0) {
      updateHashes(cwd, missingManagedFileHashes);
    }

    if (isSameVersion) {
      console.log(chalk.green("✓ Already up to date!"));
    } else {
      // Version changed but no file changes needed — still update the version stamp
      if (!options.dryRun) {
        updateVersionFile(cwd);
      }
      if (isUpgrade) {
        console.log(
          chalk.green(
            `✓ No file changes needed for ${projectVersion} → ${cliVersion}`,
          ),
        );
      } else if (isDowngrade) {
        console.log(
          chalk.green(
            `✓ No file changes needed for ${projectVersion} → ${cliVersion} (downgrade)`,
          ),
        );
      }
    }
    return;
  }

  // Show what this operation will do
  if (isUpgrade) {
    console.log(
      chalk.green(`This will UPGRADE: ${projectVersion} → ${cliVersion}\n`),
    );
  } else if (isDowngrade) {
    console.log(
      chalk.red(`⚠️  This will DOWNGRADE: ${projectVersion} → ${cliVersion}\n`),
    );
  }

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.gray("[Dry run] No changes made."));
    return;
  }

  // Batch-resolution flags are explicit consent for non-interactive runs.
  // Prompting here breaks CI and `node ... update --force` smoke tests.
  if (!options.force && !options.skipAll && !options.createNew) {
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message: "Proceed?",
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(chalk.yellow("Update cancelled."));
      return;
    }
  }

  // Create complete backup of all managed platform/workflow directories
  const backupDir = createFullBackup(cwd);

  if (backupDir) {
    console.log(
      chalk.gray(`\nBackup created: ${path.relative(cwd, backupDir)}/`),
    );
  }

  // Track results
  let added = 0;
  let autoUpdated = 0;
  let updated = 0;
  let skipped = 0;
  let createdNew = 0;

  // Add new files
  if (changes.newFiles.length > 0) {
    console.log(chalk.blue("\nAdding new files..."));
    for (const file of changes.newFiles) {
      const dir = path.dirname(file.path);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file.path, file.newContent);

      // Make scripts executable
      if (
        file.relativePath.endsWith(".sh") ||
        file.relativePath.endsWith(".py")
      ) {
        fs.chmodSync(file.path, "755");
      }

      console.log(chalk.green(`  + ${file.relativePath}`));
      added++;
    }
  }

  // Auto-update files (template updated, user didn't modify)
  if (changes.autoUpdateFiles.length > 0) {
    console.log(chalk.blue("\nAuto-updating template files..."));
    for (const file of changes.autoUpdateFiles) {
      fs.writeFileSync(file.path, file.newContent);

      // Make scripts executable
      if (
        file.relativePath.endsWith(".sh") ||
        file.relativePath.endsWith(".py")
      ) {
        fs.chmodSync(file.path, "755");
      }

      console.log(chalk.cyan(`  ↑ ${file.relativePath}`));
      autoUpdated++;
    }
  }

  // Handle changed files
  if (changes.changedFiles.length > 0) {
    console.log(chalk.blue("\n--- Resolving conflicts ---\n"));

    const applyToAll: { action: ConflictAction | null } = { action: null };

    for (const file of changes.changedFiles) {
      const action = await promptConflictResolution(file, options, applyToAll);

      if (action === "overwrite") {
        fs.writeFileSync(file.path, file.newContent);
        if (
          file.relativePath.endsWith(".sh") ||
          file.relativePath.endsWith(".py")
        ) {
          fs.chmodSync(file.path, "755");
        }
        console.log(chalk.yellow(`  ✓ Overwritten: ${file.relativePath}`));
        updated++;
      } else if (action === "create-new") {
        const newPath = file.path + ".new";
        fs.writeFileSync(newPath, file.newContent);
        console.log(chalk.blue(`  ✓ Created: ${file.relativePath}.new`));
        createdNew++;
      } else {
        console.log(chalk.gray(`  ○ Skipped: ${file.relativePath}`));
        skipped++;
      }
    }
  }

  // Update version file
  updateVersionFile(cwd);

  // Update template hashes for new, auto-updated, and overwritten files
  const filesToHash = new Map<string, string>(missingManagedFileHashes);
  for (const file of changes.newFiles) {
    filesToHash.set(file.relativePath, file.newContent);
  }
  // Auto-updated files always get new hash
  for (const file of changes.autoUpdateFiles) {
    filesToHash.set(file.relativePath, file.newContent);
  }
  // Only hash overwritten files (not skipped or .new copies)
  for (const file of changes.changedFiles) {
    const fullPath = path.join(cwd, file.relativePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content === file.newContent) {
        filesToHash.set(file.relativePath, file.newContent);
      }
    }
  }
  if (filesToHash.size > 0) {
    updateHashes(cwd, filesToHash);
  }

  // Print summary
  console.log(chalk.cyan("\n--- Summary ---\n"));
  if (added > 0) {
    console.log(`  Added: ${added} file(s)`);
  }
  if (autoUpdated > 0) {
    console.log(`  Auto-updated: ${autoUpdated} file(s)`);
  }
  if (updated > 0) {
    console.log(`  Updated: ${updated} file(s)`);
  }
  if (skipped > 0) {
    console.log(`  Skipped: ${skipped} file(s)`);
  }
  if (createdNew > 0) {
    console.log(`  Created .new copies: ${createdNew} file(s)`);
  }
  if (backupDir) {
    console.log(`  Backup: ${path.relative(cwd, backupDir)}/`);
  }

  const actionWord = isDowngrade ? "Downgrade" : "Update";
  console.log(
    chalk.green(
      `\n✅ ${actionWord} complete! (${projectVersion} → ${cliVersion})`,
    ),
  );

  if (createdNew > 0) {
    console.log(
      chalk.gray(
        "\nTip: Review .new files and merge changes manually if needed.",
      ),
    );
  }
}
