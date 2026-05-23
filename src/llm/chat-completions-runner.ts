import type OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { SYSTEM_PROMPT } from "../agent/prompts.js";
import { AgentError } from "../shared/errors.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AgentRunner, EmitEvent } from "./types.js";

export type ChatCompletionsRunnerOptions = {
  client: OpenAI;
  model: string;
  maxSteps: number;
  toolRegistry: ToolRegistry;
};

export class ChatCompletionsRunner implements AgentRunner {
  constructor(private readonly options: ChatCompletionsRunnerOptions) {}

  async run(userInput: string, emit: EmitEvent): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userInput,
      },
    ];

    for (let step = 0; step < this.options.maxSteps; step++) {
      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.options.model,
        messages,
        tools: this.options.toolRegistry.getChatCompletionTools(),
        tool_choice: "auto",
        parallel_tool_calls: false,
      };

      const completion = await this.options.client.chat.completions.create(request);
      const message = completion.choices[0]?.message;

      if (!message) {
        throw new AgentError("Chat completions returned no message.");
      }

      const toolCalls = message.tool_calls?.filter(
        (toolCall): toolCall is ChatCompletionMessageFunctionToolCall =>
          toolCall.type === "function",
      );

      if (!toolCalls || toolCalls.length === 0) {
        const finalText = readChatMessageContent(message.content);
        emit({ type: "assistant_message", content: finalText });
        return finalText;
      }

      messages.push(toAssistantToolCallMessage(message));

      for (const call of toolCalls) {
        const args = parseToolArguments(call.function.arguments);
        const startedAt = Date.now();
        emit({
          type: "tool_call_started",
          toolName: call.function.name,
          callId: call.id,
          args,
        });

        try {
          const result = await this.options.toolRegistry.execute(call.function.name, args);
          emit({
            type: "tool_call_finished",
            toolName: call.function.name,
            callId: call.id,
            result,
            elapsedMs: Date.now() - startedAt,
          });

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          emit({
            type: "tool_call_failed",
            toolName: call.function.name,
            callId: call.id,
            message: errorMessage,
          });

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: errorMessage }),
          });
        }
      }
    }

    throw new AgentError(`Agent exceeded max steps (${this.options.maxSteps}).`);
  }
}

function readChatMessageContent(content: unknown): string {
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  return "我没有得到可展示的最终回复。";
}

function parseToolArguments(raw: string | undefined): unknown {
  if (!raw || raw.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new AgentError("Model returned invalid JSON tool arguments.", error);
  }
}

export function toAssistantToolCallMessage(message: {
  content?: ChatCompletionAssistantMessageParam["content"];
  tool_calls?: ChatCompletionMessageToolCall[];
}): ChatCompletionAssistantMessageParam {
  const assistantMessage: ChatCompletionAssistantMessageParam = {
    role: "assistant",
    content: message.content ?? null,
  };

  if (message.tool_calls) {
    assistantMessage.tool_calls = message.tool_calls;
  }

  return assistantMessage;
}

export function toChatCompletionTools(
  tools: ReturnType<ToolRegistry["getOpenAITools"]>,
): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? {},
      strict: tool.strict,
    },
  }));
}
