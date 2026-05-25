import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "./registry.js";
import { fileEditTool } from "./file-edit.js";
import { fileListTool } from "./file-list.js";
import { fileReadTool } from "./file-read.js";
import { fileSearchTool } from "./file-search.js";
import { fileWriteTool } from "./file-write.js";
import { shellCommandTool } from "./shell-command.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blackpearl-tools-"));
});

afterEach(async () => {
  await fs.rm(workspaceRoot, {
    recursive: true,
    force: true,
  });
});

describe("coding tools", () => {
  it("lists, searches, reads, writes, and edits workspace files", async () => {
    const registry = createRegistry();
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "example.ts"),
      "export const value = 1;\n",
      "utf8",
    );

    await expect(
      registry.execute("file_list", {
        path: ".",
        recursive: true,
      }),
    ).resolves.toMatchObject({
      entries: [
        {
          path: "src",
          type: "directory",
        },
        {
          path: "src/example.ts",
          type: "file",
        },
      ],
    });

    await expect(
      registry.execute("file_search", {
        query: "value",
      }),
    ).resolves.toMatchObject({
      matches: [
        {
          path: "src/example.ts",
          line: 1,
        },
      ],
    });

    await expect(
      registry.execute("file_read", {
        path: "src/example.ts",
        maxChars: 6,
      }),
    ).resolves.toMatchObject({
      path: "src/example.ts",
      content: "export",
      truncated: true,
    });

    await expect(
      registry.execute("file_edit", {
        path: "src/example.ts",
        oldText: "value = 1",
        newText: "value = 2",
      }),
    ).resolves.toMatchObject({
      path: "src/example.ts",
    });

    await expect(
      fs.readFile(path.join(workspaceRoot, "src", "example.ts"), "utf8"),
    ).resolves.toBe("export const value = 2;\n");

    await expect(
      registry.execute("file_write", {
        path: "notes/demo.md",
        content: "# Demo\n",
      }),
    ).resolves.toMatchObject({
      path: "notes/demo.md",
      mode: "create",
    });
  });

  it("blocks secret env writes", async () => {
    const registry = createRegistry();

    await expect(
      registry.execute("file_write", {
        path: ".env",
        content: "OPENAI_API_KEY=test",
      }),
    ).rejects.toThrow("Writing this workspace path is not allowed");
  });

  it("runs non-interactive shell commands without shell operators", async () => {
    const registry = createRegistry();

    await expect(
      registry.execute("shell_command", {
        command: "node",
        args: ["--version"],
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
    });

    await expect(
      registry.execute("shell_command", {
        command: "cmd",
        args: ["/c", "dir"],
      }),
    ).rejects.toThrow("Command is blocked");
  });
});

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry({
    workspaceRoot,
  });

  registry.register(fileListTool);
  registry.register(fileReadTool);
  registry.register(fileSearchTool);
  registry.register(fileEditTool);
  registry.register(fileWriteTool);
  registry.register(shellCommandTool);

  return registry;
}
