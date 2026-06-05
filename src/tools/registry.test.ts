import { describe, expect, it } from "vitest";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import { createDefaultToolRegistry } from "./index.js";

describe("ToolRegistry schema generation", () => {
  it("emits JSON Schema compatible numeric bounds for file_read", () => {
    const registry = createDefaultToolRegistry({
      apiKey: undefined,
      baseUrl: undefined,
      model: "test-model",
      subagentModel: undefined,
      provider: "deepseek",
      apiMode: "chat_completions",
      maxSteps: 6,
      workspaceRoot: process.cwd(),
    });

    const fileReadTool = registry
      .getChatCompletionTools()
      .find(
        (tool): tool is ChatCompletionFunctionTool =>
          tool.type === "function" && tool.function.name === "file_read",
      );

    expect(fileReadTool).toBeDefined();

    const parameters = fileReadTool?.function.parameters as {
      properties?: {
        maxChars?: {
          exclusiveMinimum?: unknown;
          maximum?: unknown;
        };
      };
    };

    expect(parameters.properties?.maxChars?.exclusiveMinimum).toBe(0);
    expect(parameters.properties?.maxChars?.maximum).toBe(20000);
  });

  it("registers coding agent tools", () => {
    const registry = createDefaultToolRegistry({
      apiKey: undefined,
      baseUrl: undefined,
      model: "test-model",
      subagentModel: undefined,
      provider: "openai",
      apiMode: "responses",
      maxSteps: 6,
      workspaceRoot: process.cwd(),
    });

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "baidu_search",
      "calculator",
      "wiki_search",
      "file_list",
      "file_read",
      "file_search",
      "file_edit",
      "file_write",
      "shell_command",
    ]);
  });
});
