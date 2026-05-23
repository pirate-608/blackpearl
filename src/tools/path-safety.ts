import path from "node:path";
import { ToolExecutionError } from "../shared/errors.js";

export function resolveWorkspacePath(
  toolName: string,
  workspaceRoot: string,
  requestedPath: string,
): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ToolExecutionError(toolName, "Path is outside the workspace.");
  }

  return resolved;
}
