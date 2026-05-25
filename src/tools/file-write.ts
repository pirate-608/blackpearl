import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createToolDefinition } from "./registry.js";
import { assertWritableWorkspacePath } from "./path-safety.js";

const schema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Workspace-relative output path. Protected directories and secret env files are blocked."),
  content: z.string().describe("UTF-8 text content to write."),
  mode: z
    .enum(["create", "overwrite", "append"])
    .default("create")
    .describe("Write mode. create fails if the file already exists."),
});

export const fileWriteTool = createToolDefinition({
  name: "file_write",
  description: "Create, overwrite, or append a UTF-8 text file inside the workspace.",
  schema,
  async execute(input, context) {
    const resolved = assertWritableWorkspacePath(
      "file_write",
      context.workspaceRoot,
      input.path,
    );
    await fs.mkdir(path.dirname(resolved), { recursive: true });

    if (input.mode === "append") {
      await fs.appendFile(resolved, input.content, "utf8");
    } else {
      await fs.writeFile(resolved, input.content, {
        encoding: "utf8",
        flag: input.mode === "create" ? "wx" : "w",
      });
    }

    return {
      path: input.path,
      mode: input.mode,
      bytes: Buffer.byteLength(input.content, "utf8"),
    };
  },
});
