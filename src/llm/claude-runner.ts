import type Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { SYSTEM_PROMPT } from "../agent/prompts.js";
import { AgentError } from "../shared/errors.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AgentRunner, EmitEvent } from "./types.js";

export type ClaudeRunnerOptions = {
  client: Anthropic;
  model: string;
  maxSteps: number;
  toolRegistry: ToolRegistry;
};

export class ClaudeRunner implements AgentRunner {
  constructor(private readonly options: ClaudeRunnerOptions) {}

  async run(userInput: string, emit: EmitEvent): Promise<string> {
    const messages: MessageParam[] = [
      {
        role: "user",
        content: userInput,
      },
    ];

    for (let step = 0; step < this.options.maxSteps; step++) {
      const response = await this.options.client.messages.create({
        model: this.options.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages,
        tools: this.options.toolRegistry.getClaudeTools(),
      });

      const toolUses = response.content.filter(isToolUseBlock);

      if (toolUses.length === 0) {
        const finalText = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();

        const content = finalText || "我没有得到可展示的最终回复。";
        emit({ type: "assistant_message", content });
        return content;
      }

      messages.push({
        role: "assistant",
        content: response.content,
      });

      const toolResults = [];

      for (const toolUse of toolUses) {
        const startedAt = Date.now();
        emit({
          type: "tool_call_started",
          toolName: toolUse.name,
          callId: toolUse.id,
          args: toolUse.input,
        });

        try {
          const result = await this.options.toolRegistry.execute(toolUse.name, toolUse.input);
          emit({
            type: "tool_call_finished",
            toolName: toolUse.name,
            callId: toolUse.id,
            result,
            elapsedMs: Date.now() - startedAt,
          });

          toolResults.push({
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({
            type: "tool_call_failed",
            toolName: toolUse.name,
            callId: toolUse.id,
            message,
          });

          toolResults.push({
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: message }),
            is_error: true,
          });
        }
      }

      messages.push({
        role: "user",
        content: toolResults,
      });
    }

    throw new AgentError(`Agent exceeded max steps (${this.options.maxSteps}).`);
  }
}

export function toClaudeTools(
  tools: ReturnType<ToolRegistry["getOpenAITools"]>,
): Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: (tool.parameters ?? { type: "object", properties: {} }) as Tool.InputSchema,
  }));
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    (block as { type?: unknown }).type === "tool_use"
  );
}
