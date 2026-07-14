/**
 * `coding uninstall` — remove every file written by `coding init` / `update`
 * from the current project, plus the `.coding/` directory itself.
 *
 * The single source of truth for "what coding wrote" is
 * `.coding/.template-hashes.json`. Files outside that manifest are never
 * touched (e.g. user-added hooks under `.cursor/hooks/`).
 *
 * Manifest-listed files split into two groups:
 *   A. Opaque content files (`.py` / `.md` / `.ts` / etc.) — unlinked outright.
 *   B. Structured config files (settings.json / hooks.json / config.toml /
 *      package.json) — passed through a scrubber that strips just the coding
 *      fields, leaving user-added neighbors intact. If the scrubber says the
 *      file is fully empty afterwards, we delete it.
 *
 * Whether the user has modified a manifest-listed file or not, it is removed
 * (per the PRD: "全删"). The `.coding/` tree is removed unconditionally.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, FILE_NAMES } from "../constants/paths.js";
import { loadHashes } from "../utils/template-hash.js";
import {
  cleanupEmptyDirs,
  CODING_BLOCK_START,
  CODING_BLOCK_END,
} from "./update.js";
import {
  ALL_MANAGED_DIRS,
  getConfiguredPlatforms,
} from "../configurators/index.js";
import { pruneOrphanManifestKeys } from "../utils/manifest-prune.js";
import {
  isCwdHomedir,
  homedirGuardMessage,
  homedirBypassEnabled,
} from "../utils/cwd-guard.js";
import {
  scrubHooksJson,
  scrubManagedMarkdownBlock,
  type ScrubResult,
} from "../utils/uninstall-scrubbers.js";

export interface UninstallOptions {
  yes?: boolean;
  dryRun?: boolean;
}

/** A manifest-listed file we know is structured. */
interface StructuredFileSpec {
  /** Manifest path (POSIX). */
  posixPath: string;
  /** Short reason shown to the user under "Will be modified". */
  reason: string;
  /**
   * Run the scrubber. `deletedPaths` is the full list of POSIX paths that this
   * uninstall is going to delete; hooks-json scrubbers use it to identify
   * coding-managed `command` strings.
   */
  scrub: (content: string, deletedPaths: readonly string[]) => ScrubResult;
}

/**
 * Build the dispatch table for structured config scrubbers.
 *
 * Keys are POSIX paths exactly as they appear in `.template-hashes.json`.
 */
function buildStructuredFileSpecs(): Map<string, StructuredFileSpec> {
  const specs: StructuredFileSpec[] = [
    // Nested hooks.{Event}.[].hooks.[] schema
    {
      posixPath: ".claude/settings.json",
      reason: "Strip coding hooks; preserve user fields",
      scrub: (content, deletedPaths) =>
        scrubHooksJson(content, deletedPaths, "nested"),
    },
    {
      // AGENTS.md is a mixed-ownership file: Coding owns the
      // <!-- CODING:START/END --> block, the user owns everything around
      // it (update.ts preserves that outer content). Strip only the block;
      // delete the file only when nothing user-authored remains.
      posixPath: FILE_NAMES.AGENTS,
      reason: "Strip Coding managed block; preserve user instructions",
      scrub: (content) =>
        scrubManagedMarkdownBlock(
          content,
          CODING_BLOCK_START,
          CODING_BLOCK_END,
        ),
    },
  ];
  const map = new Map<string, StructuredFileSpec>();
  for (const spec of specs) {
    map.set(spec.posixPath, spec);
  }
  return map;
}

/**
 * What the planner decides for each manifest-listed path.
 */
interface PlannedDeletion {
  posixPath: string;
  /** Absolute filesystem path. */
  absPath: string;
  /** True when the file is missing on disk — nothing to delete. */
  missing: boolean;
}

interface PlannedModification {
  posixPath: string;
  absPath: string;
  reason: string;
  /** Pre-computed scrub result. */
  result: ScrubResult;
}

interface UninstallPlan {
  deletions: PlannedDeletion[];
  modifications: PlannedModification[];
  /** Whether `.coding/` directory itself will be removed. */
  removeCodingDir: boolean;
}

/**
 * Walk through the manifest and decide, for each entry, whether it is a plain
 * deletion or a structured modification (or fully-empty modification → still
 * a deletion at the end).
 */
function buildPlan(cwd: string, hashes: Record<string, string>): UninstallPlan {
  const structured = buildStructuredFileSpecs();
  const allPosixPaths = Object.keys(hashes);

  const deletions: PlannedDeletion[] = [];
  const modifications: PlannedModification[] = [];

  for (const posixPath of allPosixPaths) {
    const absPath = path.join(cwd, ...posixPath.split("/"));
    const spec = structured.get(posixPath);

    if (!spec) {
      deletions.push({
        posixPath,
        absPath,
        missing: !fs.existsSync(absPath),
      });
      continue;
    }

    if (!fs.existsSync(absPath)) {
      // Structured file expected by manifest is gone — nothing to do for it.
      deletions.push({ posixPath, absPath, missing: true });
      continue;
    }

    const content = fs.readFileSync(absPath, "utf-8");
    const result = spec.scrub(content, allPosixPaths);

    if (result.fullyEmpty) {
      // Strip + delete: nothing meaningful left in the file.
      deletions.push({ posixPath, absPath, missing: false });
    } else {
      modifications.push({
        posixPath,
        absPath,
        reason: spec.reason,
        result,
      });
    }
  }

  return {
    deletions,
    modifications,
    removeCodingDir: true,
  };
}

/**
 * Render the two-column uninstall plan to stdout.
 */
function renderPlan(cwd: string, plan: UninstallPlan): void {
  const codingDir = path.join(cwd, DIR_NAMES.WORKFLOW);

  console.log(chalk.bold("\nCoding uninstall plan\n"));

  const deletePaths = plan.deletions
    .filter((d) => !d.missing)
    .map((d) => d.posixPath);

  console.log(
    chalk.red.bold(`Will be deleted (${deletePaths.length + 1} entries):`),
  );
  for (const p of deletePaths) {
    console.log(`  ${chalk.red("-")} ${p}`);
  }
  if (plan.removeCodingDir && fs.existsSync(codingDir)) {
    console.log(
      `  ${chalk.red("-")} ${DIR_NAMES.WORKFLOW}/  ${chalk.gray(
        "(entire directory — including your specs, task PRDs, journals, and memory)",
      )}`,
    );
  }

  if (plan.modifications.length > 0) {
    console.log();
    console.log(
      chalk.yellow.bold(
        `Will be modified (${plan.modifications.length} files):`,
      ),
    );
    for (const m of plan.modifications) {
      console.log(
        `  ${chalk.yellow("~")} ${m.posixPath}  ${chalk.gray(`(${m.reason})`)}`,
      );
    }
  }

  const skipped = plan.deletions.filter((d) => d.missing);
  if (skipped.length > 0) {
    console.log();
    console.log(
      chalk.gray(
        `(${skipped.length} manifest entries already missing on disk — skipped.)`,
      ),
    );
  }

  console.log();
}

/**
 * Prompt `Continue? [Y/n]` with default = yes. Returns true if user agrees.
 *
 * We use `inquirer` to match update.ts so the CLI behaves consistently and
 * tests can mock the same library.
 */
async function promptContinue(): Promise<boolean> {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message: "Continue?",
      default: true,
    },
  ]);
  return proceed;
}

/**
 * Execute the plan: write modifications, unlink deletions, remove `.coding/`,
 * then prune empty managed directories.
 *
 * Returns counts for the summary.
 */
function executePlan(
  cwd: string,
  plan: UninstallPlan,
): { deletedFiles: number; modifiedFiles: number; deletedDirs: number } {
  let deletedFiles = 0;
  let modifiedFiles = 0;

  // 1. Modifications first (preserve user data even if a later step fails).
  for (const mod of plan.modifications) {
    fs.writeFileSync(mod.absPath, mod.result.content);
    modifiedFiles += 1;
  }

  // 2. Deletions (skip already-missing entries).
  const deletedDirCandidates = new Set<string>();
  for (const del of plan.deletions) {
    if (del.missing) continue;
    try {
      fs.unlinkSync(del.absPath);
      deletedFiles += 1;
    } catch {
      // Best-effort: a file that can't be unlinked (e.g. perm error) is
      // surfaced via the summary mismatch, but we don't want to abort
      // halfway through.
      continue;
    }
    deletedDirCandidates.add(path.posix.dirname(del.posixPath));
  }

  // 3. Drop `.coding/` entirely.
  let deletedDirs = 0;
  if (plan.removeCodingDir) {
    const codingDir = path.join(cwd, DIR_NAMES.WORKFLOW);
    if (fs.existsSync(codingDir)) {
      fs.rmSync(codingDir, { recursive: true, force: true });
      deletedDirs += 1;
    }
  }

  // 4. Recursively clean up now-empty managed subdirectories (e.g. empty
  // `.claude/hooks/` after every file inside was removed). This will not
  // touch managed root dirs themselves (`.claude`, `.cursor`, etc.) — those
  // are guarded by `isManagedRootDir` inside `cleanupEmptyDirs`.
  for (const dirPosix of deletedDirCandidates) {
    if (dirPosix === "." || dirPosix === "") continue;
    cleanupEmptyDirs(cwd, dirPosix);
  }

  // 5. Final pass: remove any platform root dir (`.claude`, `.cursor`,
  // `.agents/skills`, …) that is now empty. We deliberately handle this here
  // — `cleanupEmptyDirs` refuses to touch managed root dirs because in normal
  // `update` flow they must persist. During uninstall, an empty platform root
  // has no purpose. `.coding` is already gone (step 3), so we skip it.
  // Process deepest-first so that nested managed dirs (e.g. `.agents/skills`)
  // are removed before their parents (`.agents`).
  const sortedManagedDirs = [...ALL_MANAGED_DIRS]
    .filter((d) => d !== DIR_NAMES.WORKFLOW)
    .sort((a, b) => b.split("/").length - a.split("/").length);
  for (const managedDir of sortedManagedDirs) {
    const abs = path.join(cwd, ...managedDir.split("/"));
    if (!fs.existsSync(abs)) continue;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isDirectory()) continue;
      if (fs.readdirSync(abs).length === 0) {
        fs.rmdirSync(abs);
        deletedDirs += 1;
        // After removing a nested dir, its parent may now be empty. Walk up
        // until we hit something non-empty or leave the cwd. We keep this
        // loop bounded to managed-dir territory by checking that the next
        // parent posix path is still a managed dir (or an ancestor of one).
        let parentPosix = managedDir.split("/").slice(0, -1).join("/");
        while (parentPosix.length > 0) {
          const parentAbs = path.join(cwd, ...parentPosix.split("/"));
          if (!fs.existsSync(parentAbs)) break;
          if (fs.readdirSync(parentAbs).length !== 0) break;
          fs.rmdirSync(parentAbs);
          deletedDirs += 1;
          parentPosix = parentPosix.split("/").slice(0, -1).join("/");
        }
      }
    } catch {
      // Best-effort cleanup; ignore permission/race errors.
    }
  }

  return { deletedFiles, modifiedFiles, deletedDirs };
}

/**
 * List uncommitted (modified, staged, or untracked) files under the
 * user-data subdirectories of `.coding/` — spec/, tasks/, workspace/ — which
 * hold user-authored specs, task PRDs, and journals that `update.ts` marks as
 * PROTECTED. Uninstall deletes the whole `.coding/` tree with no backup, so
 * these are surfaced before the destructive step. Returns `[]` when this is
 * not a git repo or git is unavailable (nothing we can check).
 */
export function collectUncommittedCodingData(cwd: string): string[] {
  const w = DIR_NAMES.WORKFLOW;
  const userDataDirs = [
    `${w}/${DIR_NAMES.SPEC}`,
    `${w}/${DIR_NAMES.TASKS}`,
    `${w}/${DIR_NAMES.WORKSPACE}`,
  ];
  try {
    const out = execFileSync(
      "git",
      ["-C", cwd, "status", "--porcelain", "--", ...userDataDirs],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return (
      out
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        // Strip the 2-char status code, then keep the post-rename path if any.
        .map((line) => line.replace(/^\S+\s+/, "").replace(/^.*\s->\s/, ""))
    );
  } catch {
    return [];
  }
}

/** Whether the uncommitted-data guard has been explicitly overridden. */
function dirtyUninstallBypassEnabled(): boolean {
  return process.env.CODING_ALLOW_DIRTY_UNINSTALL === "1";
}

/**
 * Entry point.
 */
export async function uninstall(options: UninstallOptions = {}): Promise<void> {
  // Refuse to run in $HOME — same reasoning as init. A manifest poisoned by
  // a prior buggy init would otherwise unlink global platform runtime data
  // (chat history, session JSONLs).
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage("uninstall")));
    process.exit(1);
  }

  const cwd = process.cwd();
  const codingDir = path.join(cwd, DIR_NAMES.WORKFLOW);

  // Pre-check 1: must have a `.coding/` directory.
  if (!fs.existsSync(codingDir)) {
    console.log(
      chalk.gray(
        "Coding is not installed in this project (no .coding/ directory found).",
      ),
    );
    return;
  }

  // Pre-check 2: must have a manifest. Without it we cannot determine which
  // platform files are coding-owned vs user-owned.
  const hashes = loadHashes(cwd);
  if (Object.keys(hashes).length === 0) {
    console.error(
      chalk.red(
        "Coding directory found but manifest is missing — cannot determine which platform files to remove. " +
          "You can manually delete .coding/ if needed.",
      ),
    );
    process.exit(1);
  }

  // Self-heal poisoned manifests from buggy init versions: prune any manifest
  // entry that no current configurator owns. Runs BEFORE buildPlan so the
  // user-owned paths (.codex/sessions/, .claude/projects/, pre-existing
  // AGENTS.md, etc.) never reach the deletion list. See PRD R3.
  //
  // Dry-run: still compute the pruned hashes (so the plan reflects post-prune
  // reality) but pass `persist: false` so no disk write happens. The actual
  // disk write defers to executePlan time, where we'd be rewriting the
  // manifest only to delete the whole .coding/ dir anyway — but the
  // computation must remain to keep the rendered plan honest.
  const configuredPlatforms = getConfiguredPlatforms(cwd);
  const { pruned, hashes: prunedHashes } = pruneOrphanManifestKeys(
    cwd,
    [...configuredPlatforms],
    hashes,
    { persist: !options.dryRun },
  );
  if (pruned.length > 0) {
    // Surface counts only — listing every poisoned entry would alarm users
    // without giving them an actionable signal.
    console.log(
      chalk.gray(
        `   Pruned ${pruned.length} orphan manifest entries (user-owned files coding did not write).`,
      ),
    );
  }

  const plan = buildPlan(cwd, prunedHashes);
  renderPlan(cwd, plan);

  // .coding/ holds user-authored specs, task PRDs, and journals that have no
  // backup here. Surface any uncommitted such files before deleting the tree,
  // and — for scripted `--yes` runs where nobody reads the warning — fail
  // closed unless explicitly overridden.
  const uncommitted = collectUncommittedCodingData(cwd);
  if (uncommitted.length > 0) {
    console.warn(
      chalk.red.bold(
        `\n⚠ ${uncommitted.length} uncommitted file(s) under .coding/ (spec/tasks/workspace) ` +
          `will be permanently deleted with no backup:`,
      ),
    );
    for (const p of uncommitted.slice(0, 20)) {
      console.warn(chalk.red(`    ${p}`));
    }
    if (uncommitted.length > 20) {
      console.warn(chalk.red(`    … and ${uncommitted.length - 20} more`));
    }
    console.warn(
      chalk.yellow("Commit or stash them first if you want to keep them.\n"),
    );
  }

  if (options.dryRun) {
    console.log(chalk.gray("Dry run — no files were modified."));
    return;
  }

  if (uncommitted.length > 0 && options.yes && !dirtyUninstallBypassEnabled()) {
    console.error(
      chalk.red(
        "Refusing to uninstall with --yes while .coding/ has uncommitted user data " +
          "(spec/tasks/workspace). Commit or stash it, re-run without --yes to confirm " +
          "interactively, or set CODING_ALLOW_DIRTY_UNINSTALL=1 to override.",
      ),
    );
    process.exit(1);
  }

  if (!options.yes) {
    // Make sure stdin is in a usable state for the prompt; in scripted
    // environments that closed stdin, inquirer would otherwise raise. We
    // honor the same UX as `coding update` (which also fails closed in
    // that case).
    if (!process.stdin.isTTY) {
      console.error(
        chalk.red(
          "Refusing to prompt for confirmation in a non-interactive shell. " +
            "Pass --yes/-y to confirm or --dry-run to preview.",
        ),
      );
      // Try to release the readline ref if anything else opened stdin.
      readline.createInterface({ input: process.stdin }).close();
      process.exit(1);
    }

    const ok = await promptContinue();
    if (!ok) {
      console.log(chalk.yellow("Uninstall cancelled. No files modified."));
      return;
    }
  }

  const summary = executePlan(cwd, plan);

  console.log();
  console.log(
    chalk.green(
      `Uninstalled coding: ${summary.deletedFiles} files deleted, ` +
        `${summary.modifiedFiles} files modified, ` +
        `${summary.deletedDirs} directories removed.`,
    ),
  );
}
