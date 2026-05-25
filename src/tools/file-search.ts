import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createToolDefinition } from "./registry.js";
import {
  assertReadableWorkspacePath,
  getWorkspaceRelativePath,
  shouldSkipWorkspacePath,
} from "./path-safety.js";

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".cts",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const schema = z.object({
  query: z.string().min(1).describe("Literal text to search for."),
  path: z
    .string()
    .default(".")
    .describe("Workspace-relative directory or file path to search."),
  caseSensitive: z
    .boolean()
    .default(false)
    .describe("Whether the search should be case-sensitive."),
  maxMatches: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(50)
    .describe("Maximum number of matches to return."),
});

export const fileSearchTool = createToolDefinition({
  name: "file_search",
  description: "Search literal text across workspace text files and return file paths with line numbers.",
  schema,
  async execute(input, context) {
    const target = assertReadableWorkspacePath(
      "file_search",
      context.workspaceRoot,
      input.path,
    );
    const stat = await fs.stat(target);
    const files = stat.isDirectory()
      ? await collectTextFiles(context.workspaceRoot, target, input.maxMatches * 20)
      : [target];
    const matches: Array<{ path: string; line: number; text: string }> = [];
    const needle = input.caseSensitive ? input.query : input.query.toLowerCase();

    for (const file of files) {
      if (matches.length >= input.maxMatches) {
        break;
      }

      if (!isTextLikeFile(file)) {
        continue;
      }

      const content = await fs.readFile(file, "utf8").catch(() => undefined);

      if (content === undefined) {
        continue;
      }

      const lines = content.split(/\r?\n/);

      for (let index = 0; index < lines.length; index++) {
        const lineText = lines[index] ?? "";
        const haystack = input.caseSensitive ? lineText : lineText.toLowerCase();

        if (!haystack.includes(needle)) {
          continue;
        }

        matches.push({
          path: getWorkspaceRelativePath(context.workspaceRoot, file),
          line: index + 1,
          text: lineText.slice(0, 300),
        });

        if (matches.length >= input.maxMatches) {
          break;
        }
      }
    }

    return {
      query: input.query,
      matches,
      truncated: matches.length >= input.maxMatches,
    };
  },
});

async function collectTextFiles(
  workspaceRoot: string,
  directory: string,
  maxFiles: number,
): Promise<string[]> {
  const files: string[] = [];
  await walk(directory);
  return files;

  async function walk(currentDirectory: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }

    const dirents = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const dirent of dirents) {
      if (files.length >= maxFiles) {
        return;
      }

      const resolved = path.join(currentDirectory, dirent.name);
      const relativePath = getWorkspaceRelativePath(workspaceRoot, resolved);

      if (shouldSkipWorkspacePath(relativePath)) {
        continue;
      }

      if (dirent.isDirectory()) {
        await walk(resolved);
      } else if (dirent.isFile() && isTextLikeFile(resolved)) {
        files.push(resolved);
      }
    }
  }
}

function isTextLikeFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  const basename = path.basename(filePath).toLowerCase();
  return basename === "readme" || basename === "license" || basename === "dockerfile";
}
