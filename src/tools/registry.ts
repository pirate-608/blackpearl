import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolExecutionError } from "../shared/errors.js";
import type { AnyToolDefinition, McpToolDefinition, ToolContext, ToolDefinition } from "./types.js";
import { toChatCompletionTools } from "../llm/chat-completions-runner.js";
import { toClaudeTools } from "../llm/claude-runner.js";

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition | McpToolDefinition>();

  constructor(private readonly context: ToolContext) {}

  register(tool: AnyToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  /** Register an MCP-discovered tool (no Zod schema, uses raw JSON Schema) */
  registerMcpTool(tool: McpToolDefinition): void {
    // Allow overwriting MCP tools (server reconnection scenario)
    this.tools.set(tool.name, tool);
  }

  /** Remove a tool by name (for MCP server disconnect) */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  list(): (AnyToolDefinition | McpToolDefinition)[] {
    return [...this.tools.values()];
  }

  getOpenAITools(): Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown> | null;
    strict: boolean;
  }> {
    return this.list().map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.jsonSchema,
      strict: false,
    }));
  }

  getChatCompletionTools() {
    return toChatCompletionTools(this.getOpenAITools());
  }

  getClaudeTools() {
    return toClaudeTools(this.getOpenAITools());
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new ToolExecutionError(name, "Unknown tool");
    }

    try {
      // MCP tools: no Zod schema, pass raw input
      if (!tool.schema) {
        return await (tool as McpToolDefinition).execute(input, this.context);
      }

      // Regular tools: Zod parse first
      const parsed = tool.schema.safeParse(input);
      if (!parsed.success) {
        throw new ToolExecutionError(name, parsed.error.message);
      }

      return await tool.execute(parsed.data, this.context);
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }

      throw new ToolExecutionError(name, "Execution failed", error);
    }
  }
}

export function createToolDefinition<TSchema extends z.ZodTypeAny>(
  tool: Omit<ToolDefinition<TSchema>, "jsonSchema">,
): ToolDefinition<TSchema> {
  return {
    ...tool,
    jsonSchema: sanitizeToolJsonSchema(
      zodToJsonSchema(tool.schema, {
        $refStrategy: "none",
        target: "jsonSchema7",
      }) as Record<string, unknown>,
    ),
  };
}

export function sanitizeToolJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return stripUnsupportedSchemaFields(schema) as Record<string, unknown>;
}

function stripUnsupportedSchemaFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedSchemaFields);
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema") {
      continue;
    }

    sanitized[key] = stripUnsupportedSchemaFields(child);
  }

  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
