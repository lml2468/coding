import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getConfiguredPlatforms,
  configurePlatform,
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";
import { AI_TOOLS } from "../../src/types/ai-tools.js";
import { setWriteMode } from "../../src/utils/file-writer.js";
import {
  settingsTemplate as claudeSettingsTemplate,
  getStatuslineHook,
} from "../../src/templates/claude/index.js";
import {
  resolvePlaceholders,
  replacePythonCommandLiterals,
} from "../../src/configurators/shared.js";

const BUNDLED_SKILL_NAMES = [
  "coding-meta",
  "coding-session-insight",
  "coding-spec-bootstrap",
];
const BUNDLED_SKILL_NAME = "coding-meta";
const BUNDLED_REFERENCE = path.join(
  BUNDLED_SKILL_NAME,
  "references",
  "local-architecture",
  "overview.md",
);

function readConfiguredFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf-8");
}

// =============================================================================
// getConfiguredPlatforms — detects existing platform directories
// =============================================================================

describe("getConfiguredPlatforms", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-platforms-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty set when no platform dirs exist", () => {
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.size).toBe(0);
  });

  it("detects .claude directory as claude-code", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("claude-code")).toBe(true);
  });

  it("detects multiple platforms simultaneously", () => {
    for (const id of PLATFORM_IDS) {
      fs.mkdirSync(path.join(tmpDir, AI_TOOLS[id].configDir), {
        recursive: true,
      });
    }
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.size).toBe(PLATFORM_IDS.length);
    for (const id of PLATFORM_IDS) {
      expect(result.has(id)).toBe(true);
    }
  });

  it("ignores unrelated directories", () => {
    fs.mkdirSync(path.join(tmpDir, ".vscode"));
    fs.mkdirSync(path.join(tmpDir, ".git"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.size).toBe(0);
  });
});

// =============================================================================
// configurePlatform — copies templates to target directory
// =============================================================================

describe("configurePlatform", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-configure-"));
    // Use force mode to avoid interactive prompts
    setWriteMode("force");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setWriteMode("ask");
  });

  it("configurePlatform('claude-code') creates .claude directory", async () => {
    await configurePlatform("claude-code", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
  });

  it("configurePlatform writes collected templates byte-for-byte for every platform", async () => {
    for (const id of PLATFORM_IDS) {
      const platformDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `coding-parity-${id}-`),
      );
      try {
        await configurePlatform(id, platformDir);
        const templates = collectPlatformTemplates(id);
        expect(
          templates,
          `${id} should expose template tracking`,
        ).toBeInstanceOf(Map);
        if (!templates) {
          throw new Error(`${id} did not expose template tracking`);
        }

        for (const [relativePath, expectedContent] of templates) {
          const targetPath = path.join(platformDir, ...relativePath.split("/"));
          expect(
            fs.existsSync(targetPath),
            `${id} should write ${relativePath}`,
          ).toBe(true);
          expect(readConfiguredFile(platformDir, relativePath)).toBe(
            expectedContent,
          );
        }
      } finally {
        fs.rmSync(platformDir, { recursive: true, force: true });
      }
    }
  });

  it("claude-code writes bundled built-in skills", async () => {
    await configurePlatform("claude-code", tmpDir);
    const skillsRoot = path.join(tmpDir, ".claude", "skills");
    for (const name of BUNDLED_SKILL_NAMES) {
      expect(fs.existsSync(path.join(skillsRoot, name, "SKILL.md"))).toBe(true);
    }
    expect(fs.existsSync(path.join(skillsRoot, BUNDLED_REFERENCE))).toBe(true);
  });

  it("claude-code configuration includes commands directory", async () => {
    await configurePlatform("claude-code", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".claude", "commands"))).toBe(true);
  });

  it("claude-code configuration includes settings.json", async () => {
    await configurePlatform("claude-code", tmpDir);
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);
    // Should be valid JSON
    const content = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    expect(settings).not.toHaveProperty("statusLine");
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "hooks", "statusline.py")),
    ).toBe(false);
  });

  it("claude-code default settings.json is byte-identical to the resolved template (statusline off)", async () => {
    await configurePlatform("claude-code", tmpDir, { withStatusline: false });
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      "utf-8",
    );
    expect(content).toBe(resolvePlaceholders(claudeSettingsTemplate));
    expect(content).not.toContain("statusLine");
  });

  it("claude-code with statusline opt-in installs statusline.py and statusLine settings entry", async () => {
    await configurePlatform("claude-code", tmpDir, { withStatusline: true });

    const hookPath = path.join(tmpDir, ".claude", "hooks", "statusline.py");
    expect(fs.existsSync(hookPath)).toBe(true);
    expect(fs.readFileSync(hookPath, "utf-8")).toBe(
      replacePythonCommandLiterals(getStatuslineHook()),
    );

    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      "utf-8",
    );
    expect(content).not.toContain("{{PYTHON_CMD}}");
    const settings = JSON.parse(content) as Record<string, unknown>;
    expect(settings.statusLine).toEqual({
      type: "command",
      command: replacePythonCommandLiterals(
        "python3 .claude/hooks/statusline.py",
      ),
    });
    // statusLine is appended at the END — byte-parity with update's
    // preserveExistingClaudeStatusLine (parse → assign → stringify), so a
    // fresh opted-in project shows zero settings.json diff on update
    expect(Object.keys(settings)).toEqual([
      "env",
      "hooks",
      "enabledPlugins",
      "statusLine",
    ]);
    // Everything besides statusLine is unchanged from the default template
    const expected = JSON.parse(
      resolvePlaceholders(claudeSettingsTemplate),
    ) as Record<string, unknown>;
    expect(settings.env).toEqual(expected.env);
    expect(settings.hooks).toEqual(expected.hooks);
    expect(settings.enabledPlugins).toEqual(expected.enabledPlugins);
  });

  it("does not throw for any platform", async () => {
    for (const id of PLATFORM_IDS) {
      const platformDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `coding-cfg-${id}-`),
      );
      try {
        setWriteMode("force");
        await expect(configurePlatform(id, platformDir)).resolves.not.toThrow();
      } finally {
        fs.rmSync(platformDir, { recursive: true, force: true });
      }
    }
  });
});
