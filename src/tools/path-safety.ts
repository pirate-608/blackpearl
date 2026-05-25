import path from "node:path";
import { ToolExecutionError } from "../shared/errors.js";

const PRIVATE_DIRS = new Set([".git", ".blackpearl"]);
const GENERATED_DIRS = new Set([
  "node_modules",
  "dist",
  "site",
  ".venv",
  "coverage",
]);

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

export function assertReadableWorkspacePath(
  toolName: string,
  workspaceRoot: string,
  requestedPath: string,
): string {
  const resolved = resolveWorkspacePath(toolName, workspaceRoot, requestedPath);
  const relativePath = getWorkspaceRelativePath(workspaceRoot, resolved);

  if (isPrivateWorkspacePath(relativePath)) {
    throw new ToolExecutionError(toolName, "Reading this workspace path is not allowed.");
  }

  return resolved;
}

export function assertWritableWorkspacePath(
  toolName: string,
  workspaceRoot: string,
  requestedPath: string,
): string {
  const resolved = resolveWorkspacePath(toolName, workspaceRoot, requestedPath);
  const relativePath = getWorkspaceRelativePath(workspaceRoot, resolved);

  if (relativePath === ".") {
    throw new ToolExecutionError(toolName, "Writing the workspace root is not allowed.");
  }

  if (isProtectedWritePath(relativePath)) {
    throw new ToolExecutionError(toolName, "Writing this workspace path is not allowed.");
  }

  return resolved;
}

export function getWorkspaceRelativePath(workspaceRoot: string, resolvedPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(resolvedPath);
  const relative = path.relative(root, resolved);
  return relative ? normalizeRelativePath(relative) : ".";
}

export function shouldSkipWorkspacePath(relativePath: string): boolean {
  const segments = getPathSegments(relativePath);
  return segments.some(
    (segment) => PRIVATE_DIRS.has(segment) || GENERATED_DIRS.has(segment),
  );
}

function isPrivateWorkspacePath(relativePath: string): boolean {
  const segments = getPathSegments(relativePath);
  return (
    segments.some((segment) => PRIVATE_DIRS.has(segment)) ||
    isSecretEnvFile(segments.at(-1))
  );
}

function isProtectedWritePath(relativePath: string): boolean {
  const segments = getPathSegments(relativePath);
  return (
    segments.some(
      (segment) => PRIVATE_DIRS.has(segment) || GENERATED_DIRS.has(segment),
    ) || isSecretEnvFile(segments.at(-1))
  );
}

function isSecretEnvFile(fileName: string | undefined): boolean {
  if (!fileName) {
    return false;
  }

  if (fileName === ".env.example") {
    return false;
  }

  return fileName === ".env" || fileName.startsWith(".env.");
}

function getPathSegments(relativePath: string): string[] {
  if (relativePath === ".") {
    return [];
  }

  return normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
