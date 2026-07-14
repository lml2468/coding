import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { replacePythonCommandLiterals } from "../configurators/shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TemplateCategory = "scripts" | "markdown" | "commands";

/**
 * Get the path to the coding templates directory (.coding/ scaffolding).
 */
export function getCodingTemplatePath(): string {
  const templatePath = path.join(__dirname, "coding");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }
  throw new Error(
    "Could not find coding templates directory. Expected at templates/coding/",
  );
}

/** @deprecated Use getCodingTemplatePath() instead. */
export function getCodingSourcePath(): string {
  return getCodingTemplatePath();
}

/**
 * Get the path to the claude templates directory (hooks, agents, settings).
 */
export function getClaudeTemplatePath(): string {
  const templatePath = path.join(__dirname, "claude");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }
  throw new Error(
    "Could not find claude templates directory. Expected at templates/claude/",
  );
}

/**
 * Read a file from the coding template directory.
 */
export function readCodingFile(relativePath: string): string {
  const codingPath = getCodingSourcePath();
  const filePath = path.join(codingPath, relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Read template content from a category directory.
 */
export function readTemplate(
  category: TemplateCategory,
  filename: string,
): string {
  const templatePath = path.join(__dirname, category, filename);
  return fs.readFileSync(templatePath, "utf-8");
}

export function readScript(relativePath: string): string {
  return readCodingFile(`scripts/${relativePath}`);
}

export function readMarkdown(relativePath: string): string {
  return readCodingFile(relativePath);
}

export function readCommand(filename: string): string {
  return readTemplate("commands", filename);
}

/**
 * Copy a directory from coding templates to target, making scripts executable.
 */
export async function copyCodingDir(
  srcRelativePath: string,
  destPath: string,
  options?: { executable?: boolean },
): Promise<void> {
  const codingPath = getCodingSourcePath();
  const srcPath = path.join(codingPath, srcRelativePath);
  await copyDirRecursive(srcPath, destPath, options);
}

async function copyDirRecursive(
  src: string,
  dest: string,
  options?: { executable?: boolean },
): Promise<void> {
  ensureDir(dest);

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      await copyDirRecursive(srcPath, destPath, options);
    } else {
      const content = fs.readFileSync(srcPath, "utf-8");
      const isExecutable =
        options?.executable && (entry.endsWith(".sh") || entry.endsWith(".py"));
      await writeFile(destPath, replacePythonCommandLiterals(content), {
        executable: isExecutable,
      });
    }
  }
}
