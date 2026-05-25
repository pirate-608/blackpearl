import fs from "node:fs/promises";
import { z } from "zod";
import { createToolDefinition } from "./registry.js";
import { assertReadableWorkspacePath } from "./path-safety.js";

const schema = z.object({
  path: z.string().min(1).describe("Workspace-relative file path to read."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Character offset to start reading from."),
  maxChars: z
    .number()
    .int()
    .positive()
    .max(20000)
    .default(8000)
    .describe("Maximum number of characters to return."),
});

export const fileReadTool = createToolDefinition({
  name: "file_read",
  description: "Read a UTF-8 text file from inside the workspace, optionally from a character offset.",
  schema,
  async execute(input, context) {
    const resolved = assertReadableWorkspacePath(
      "file_read",
      context.workspaceRoot,
      input.path,
    );
    const content = await fs.readFile(resolved, "utf8");
    const start = Math.min(input.offset, content.length);
    const end = Math.min(start + input.maxChars, content.length);
    const truncated = end < content.length;

    return {
      path: input.path,
      offset: start,
      content: content.slice(start, end),
      truncated,
      totalChars: content.length,
    };
  },
});
