import fs from "node:fs/promises";
import { z } from "zod";
import { ToolExecutionError } from "../shared/errors.js";
import { createToolDefinition } from "./registry.js";
import { assertWritableWorkspacePath } from "./path-safety.js";

const schema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Workspace-relative UTF-8 text file path to edit."),
  oldText: z.string().min(1).describe("Exact text to replace. Must appear exactly once."),
  newText: z.string().describe("Replacement text."),
});

export const fileEditTool = createToolDefinition({
  name: "file_edit",
  description: "Replace one exact text block in a workspace file. Fails unless oldText appears exactly once.",
  schema,
  async execute(input, context) {
    const resolved = assertWritableWorkspacePath(
      "file_edit",
      context.workspaceRoot,
      input.path,
    );
    const content = await fs.readFile(resolved, "utf8");
    const firstIndex = content.indexOf(input.oldText);

    if (firstIndex === -1) {
      throw new ToolExecutionError("file_edit", "oldText was not found.");
    }

    if (content.indexOf(input.oldText, firstIndex + input.oldText.length) !== -1) {
      throw new ToolExecutionError(
        "file_edit",
        "oldText appears more than once. Use a more specific block.",
      );
    }

    const nextContent =
      content.slice(0, firstIndex) +
      input.newText +
      content.slice(firstIndex + input.oldText.length);
    await fs.writeFile(resolved, nextContent, "utf8");

    return {
      path: input.path,
      replacedAt: firstIndex,
      oldBytes: Buffer.byteLength(input.oldText, "utf8"),
      newBytes: Buffer.byteLength(input.newText, "utf8"),
    };
  },
});
