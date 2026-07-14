/**
 * Canonical task.json shape — single source of truth shared by all TS
 * writers. The canonical types and factory now live in the
 * `@limenglin/coding-core` task API; this module re-exports them under
 * the legacy `TaskJson` / `emptyTaskJson` names for CLI call sites.
 *
 * New code should prefer `CodingTaskRecord` / `emptyTaskRecord` from
 * `@limenglin/coding-core/task` directly.
 */

import {
  emptyTaskRecord,
  type CodingTaskRecord,
} from "@limenglin/coding-core/task";

export type TaskJson = CodingTaskRecord;

export const emptyTaskJson = emptyTaskRecord;
