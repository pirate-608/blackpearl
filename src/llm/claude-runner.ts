import type Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
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
      const response = await createClaudeMessage(
        this.options.client,
        {
          model: this.options.model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages,
          tools: this.options.toolRegistry.getClaudeTools(),
        },
        emit,
      );

      const toolUses = response.content.filter(isToolUseBlock);

      if (toolUses.length === 0) {
        const finalText = response.content
          .filter(isTextBlock)
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

type ClaudeCreateParams = Parameters<Anthropic["messages"]["create"]>[0];

async function createClaudeMessage(
  client: Anthropic,
  request: ClaudeCreateParams,
  emit: EmitEvent,
): Promise<{ content: ContentBlock[] }> {
  const stream = await client.messages.create({
    ...request,
    stream: true,
  });
  const contentBlocks = new Map<number, ContentBlock>();

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      contentBlocks.set(event.index, event.content_block);
    }

    if (event.type === "content_block_delta") {
      const block = contentBlocks.get(event.index);

      if (event.delta.type === "text_delta") {
        emit({ type: "assistant_delta", content: event.delta.text });

        if (isTextBlock(block)) {
          block.text += event.delta.text;
        }
      }

      if (event.delta.type === "input_json_delta" && isToolUseBlock(block)) {
        const currentInput = typeof block.input === "string" ? block.input : "";
        block.input = currentInput + event.delta.partial_json;
      }
    }
  }

  return {
    content: [...contentBlocks.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, block]) => normalizeClaudeContentBlock(block)),
  };
}

function normalizeClaudeContentBlock(block: ContentBlock): ContentBlock {
  if (isToolUseBlock(block) && typeof block.input === "string") {
    return {
      ...block,
      input: parseToolArguments(block.input),
    };
  }

  return block;
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

function isTextBlock(block: unknown): block is TextBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    (block as { type?: unknown }).type === "text"
  );
}

function parseToolArguments(raw: string): unknown {
  if (raw.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new AgentError("Anthropic stream returned invalid JSON tool arguments.", error);
  }
}
