/**
 * Default home-based session roots for the persisted-session adapters.
 *
 * `HOME` is captured once at module load — consumers that need to point the
 * adapters at a fake home (tests) must mock `node:os` before importing any
 * mem module.
 */

import * as os from "node:os";
import * as path from "node:path";

export const HOME = os.homedir();
export const CLAUDE_PROJECTS = path.join(HOME, ".claude", "projects");

/** Claude sanitizes a cwd into its on-disk project dir name by replacing
 * every path separator (`/` and Windows `\`), drive colon (`:`), `_`, and `.`
 * with `-`. Confirmed empirically against `~/.claude/projects/`:
 * `/Users/x/.codex/...` → `-Users-x--codex-...`, `snap_note` → `snap-note`. */
export function claudeProjectDirFromCwd(cwd: string): string {
  return path.join(CLAUDE_PROJECTS, cwd.replace(/[/\\:_.]/g, "-"));
}
