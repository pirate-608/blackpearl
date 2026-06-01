import type { z } from "zod";

export type ToolContext = {
  workspaceRoot: string;
};

export type ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: TInput;
  jsonSchema: Record<string, unknown> | null;
  execute: (input: z.infer<TInput>, context: ToolContext) => Promise<unknown>;
};

export type AnyToolDefinition = ToolDefinition<z.ZodTypeAny>;

/** A tool registered from an MCP server without a Zod schema */
export type McpToolDefinition = {
  name: string;
  description: string;
  schema?: undefined;
  jsonSchema: Record<string, unknown> | null;
  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
};

export type ToolExecutionRecord = {
  toolName: string;
  input: unknown;
  output: unknown;
  elapsedMs: number;
};
