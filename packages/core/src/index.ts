// Root barrel — re-exports the task public API so callers
// can `import { ... } from "@limenglin/coding-core"`. Sub-path
// imports (`@limenglin/coding-core/task`) remain the
// recommended form for tree-shake-friendly consumption.

export * from "./task/index.js";
