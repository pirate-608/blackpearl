import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { ToolExecutionError } from "../shared/errors.js";
import { createToolDefinition } from "./registry.js";
import { resolveWorkspacePath } from "./path-safety.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 12000;

const BLOCKED_COMMANDS = new Set([
  "cmd",
  "del",
  "erase",
  "format",
  "powershell",
  "pwsh",
  "rd",
  "reg",
  "Remove-Item",
  "rm",
  "rmdir",
  "shutdown",
  "sudo",
]);

const schema = z.object({
  command: z
    .string()
    .min(1)
    .describe("Executable command name, without shell operators."),
  args: z
    .array(z.string())
    .default([])
    .describe("Command arguments. Shell operators like pipes and redirects are not supported."),
  cwd: z
    .string()
    .default(".")
    .describe("Workspace-relative working directory."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(30000)
    .default(10000)
    .describe("Maximum command runtime in milliseconds."),
});

export const shellCommandTool = createToolDefinition({
  name: "shell_command",
  description:
    "Run a non-interactive command inside the workspace without shell expansion. Use for tests, builds, git status, and inspections.",
  schema,
  async execute(input, context) {
    assertAllowedCommand(input.command, input.args);
    const cwd = resolveWorkspacePath("shell_command", context.workspaceRoot, input.cwd);

    try {
      const result = await execFileAsync(input.command, input.args, {
        cwd,
        encoding: "utf8",
        timeout: input.timeoutMs,
        maxBuffer: 1024 * 1024 * 2,
        windowsHide: true,
      });

      return {
        command: formatCommand(input.command, input.args),
        cwd: input.cwd,
        exitCode: 0,
        stdout: truncateOutput(result.stdout),
        stderr: truncateOutput(result.stderr),
      };
    } catch (error) {
      const failed = error as {
        code?: number | string;
        signal?: string;
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        message?: string;
      };

      return {
        command: formatCommand(input.command, input.args),
        cwd: input.cwd,
        exitCode: typeof failed.code === "number" ? failed.code : null,
        signal: failed.signal,
        timedOut: Boolean(failed.killed),
        stdout: truncateOutput(failed.stdout ?? ""),
        stderr: truncateOutput(failed.stderr ?? failed.message ?? ""),
      };
    }
  },
});

function assertAllowedCommand(command: string, args: string[]): void {
  if (command.includes("/") || command.includes("\\") || command.includes("&")) {
    throw new ToolExecutionError(
      "shell_command",
      "Command must be an executable name, not a shell expression or path.",
    );
  }

  if (BLOCKED_COMMANDS.has(command) || BLOCKED_COMMANDS.has(command.toLowerCase())) {
    throw new ToolExecutionError("shell_command", `Command is blocked: ${command}`);
  }

  const forbiddenArg = args.find((arg) => /[|&;<>\n\r]/.test(arg));

  if (forbiddenArg) {
    throw new ToolExecutionError(
      "shell_command",
      `Shell operators are not allowed in args: ${forbiddenArg}`,
    );
  }
}

function truncateOutput(value: string): { content: string; truncated: boolean; totalChars: number } {
  return {
    content: value.length > MAX_OUTPUT_CHARS ? value.slice(0, MAX_OUTPUT_CHARS) : value,
    truncated: value.length > MAX_OUTPUT_CHARS,
    totalChars: value.length,
  };
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}
