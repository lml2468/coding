import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  getCodingTemplatePath,
  getClaudeTemplatePath,
  getCodingSourcePath,
  readCodingFile,
  readTemplate,
  readScript,
  readMarkdown,
} from "../../src/templates/extract.js";

// =============================================================================
// getXxxTemplatePath — returns existing directory paths
// =============================================================================

describe("template path functions", () => {
  it("getCodingTemplatePath returns existing directory", () => {
    const p = getCodingTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getClaudeTemplatePath returns existing directory", () => {
    const p = getClaudeTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });
});

// =============================================================================
// Deprecated aliases return same result
// =============================================================================

describe("deprecated source path aliases", () => {
  it("getCodingSourcePath equals getCodingTemplatePath", () => {
    expect(getCodingSourcePath()).toBe(getCodingTemplatePath());
  });
});

// =============================================================================
// readCodingFile — reads files from coding template directory
// =============================================================================

describe("readCodingFile", () => {
  it("reads workflow.md from coding templates", () => {
    const content = readCodingFile("workflow.md");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("#");
  });

  it("reads a script file", () => {
    const content = readCodingFile("scripts/task.py");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  it("throws for nonexistent file", () => {
    expect(() => readCodingFile("nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readTemplate — reads from category subdirectories
// =============================================================================

describe("readTemplate", () => {
  it("throws for nonexistent category/file", () => {
    expect(() => readTemplate("scripts", "nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readScript / readMarkdown helpers
// =============================================================================

describe("readScript", () => {
  it("reads a Python script from scripts/", () => {
    const content = readScript("task.py");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });
});

describe("readMarkdown", () => {
  it("reads workflow.md", () => {
    const content = readMarkdown("workflow.md");
    expect(typeof content).toBe("string");
    expect(content).toContain("#");
  });
});
