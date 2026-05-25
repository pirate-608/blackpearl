import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolExecutionError } from "../shared/errors.js";
import { createToolDefinition } from "./registry.js";
import {
  assertReadableWorkspacePath,
  getWorkspaceRelativePath,
  shouldSkipWorkspacePath,
} from "./path-safety.js";

const schema = z.object({
  path: z
    .string()
    .default(".")
    .describe("Workspace-relative directory path to list."),
  recursive: z
    .boolean()
    .default(false)
    .describe("Whether to list files recursively."),
  maxEntries: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(120)
    .describe("Maximum number of directory entries to return."),
});

export const fileListTool = createToolDefinition({
  name: "file_list",
  description: "List files and directories inside the workspace.",
  schema,
  async execute(input, context) {
    const root = assertReadableWorkspacePath(
      "file_list",
      context.workspaceRoot,
      input.path,
    );
    const stats = await fs.stat(root);

    if (!stats.isDirectory()) {
      throw new ToolExecutionError("file_list", "Path is not a directory.");
    }

    const entries: Array<{ path: string; type: "file" | "directory"; bytes?: number }> = [];
    await collectEntries({
      workspaceRoot: context.workspaceRoot,
      directory: root,
      recursive: input.recursive,
      maxEntries: input.maxEntries,
      entries,
    });

    return {
      path: input.path,
      recursive: input.recursive,
      entries,
      truncated: entries.length >= input.maxEntries,
    };
  },
});

async function collectEntries(options: {
  workspaceRoot: string;
  directory: string;
  recursive: boolean;
  maxEntries: number;
  entries: Array<{ path: string; type: "file" | "directory"; bytes?: number }>;
}): Promise<void> {
  const dirents = await fs.readdir(options.directory, {
    withFileTypes: true,
  });

  dirents.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  for (const dirent of dirents) {
    if (options.entries.length >= options.maxEntries) {
      return;
    }

    const resolved = path.join(options.directory, dirent.name);
    const relativePath = getWorkspaceRelativePath(options.workspaceRoot, resolved);

    if (shouldSkipWorkspacePath(relativePath)) {
      continue;
    }

    const isDirectory = dirent.isDirectory();
    const entry: { path: string; type: "file" | "directory"; bytes?: number } = {
      path: relativePath,
      type: isDirectory ? "directory" : "file",
    };

    if (!isDirectory) {
      const stat = await fs.stat(resolved);
      entry.bytes = stat.size;
    }

    options.entries.push(entry);

    if (isDirectory && options.recursive) {
      await collectEntries({
        ...options,
        directory: resolved,
      });
    }
  }
}
