// Public task API surface — canonical task record shape, factory,
// schema, I/O helpers, directory validation, and phase inference.

export type {
  CodingTaskRecord,
  TaskRecordField,
} from "./schema.js";

export {
  TASK_RECORD_FIELD_ORDER,
  emptyTaskRecord,
  taskRecordSchema,
} from "./schema.js";

export type {
  LoadTaskRecordOptions,
  WriteTaskRecordOptions,
} from "./records.js";

export {
  loadTaskRecord,
  writeTaskRecord,
} from "./records.js";

export type { TaskDirParts } from "./paths.js";
export { validateTaskDirName, isValidTaskDirName } from "./paths.js";

export type { CodingTaskPhase } from "./phase.js";
export { inferTaskPhase } from "./phase.js";
