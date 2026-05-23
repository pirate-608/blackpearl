import fs from "node:fs/promises";
import { z } from "zod";
import { createToolDefinition } from "./registry.js";
import { resolveWorkspacePath } from "./path-safety.js";

const schema = z.object({
  path: z.string().min(1).describe("Workspace-relative file path to read."),
  maxChars: z
    .number()
    .int()
    .positive()
    .max(12000)
    .default(4000)
    .describe("Maximum number of characters to return."),
});

export const fileReadTool = createToolDefinition({
  name: "file_read",
  description: "Read a UTF-8 text file from inside the workspace.",
  schema,
  async execute(input, context) {
    const resolved = resolveWorkspacePath("file_read", context.workspaceRoot, input.path);
    const content = await fs.readFile(resolved, "utf8");
    const truncated = content.length > input.maxChars;

    return {
      path: input.path,
      content: truncated ? content.slice(0, input.maxChars) : content,
      truncated,
      totalChars: content.length,
    };
  },
});
