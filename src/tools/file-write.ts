import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolExecutionError } from "../shared/errors.js";
import { createToolDefinition } from "./registry.js";
import { resolveWorkspacePath } from "./path-safety.js";

const ALLOWED_WRITE_DIRS = ["artifacts", "notes"];

const schema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Workspace-relative output path. Must be under artifacts/ or notes/."),
  content: z.string().describe("UTF-8 text content to write."),
});

export const fileWriteTool = createToolDefinition({
  name: "file_write",
  description: "Write a UTF-8 text file under artifacts/ or notes/.",
  schema,
  async execute(input, context) {
    const firstSegment = input.path.split(/[\\/]/)[0];

    if (!firstSegment || !ALLOWED_WRITE_DIRS.includes(firstSegment)) {
      throw new ToolExecutionError(
        "file_write",
        `Writes are limited to: ${ALLOWED_WRITE_DIRS.join(", ")}`,
      );
    }

    const resolved = resolveWorkspacePath("file_write", context.workspaceRoot, input.path);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, input.content, "utf8");

    return {
      path: input.path,
      bytes: Buffer.byteLength(input.content, "utf8"),
    };
  },
});
