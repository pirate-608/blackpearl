import type OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInput,
} from "openai/resources/responses/responses";
import { SYSTEM_PROMPT } from "../agent/prompts.js";
import { AgentError } from "../shared/errors.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AgentRunner, EmitEvent } from "./types.js";

type ResponseOutputItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

type ResponseLike = {
  id?: string;
  output?: ResponseOutputItem[];
  output_text?: string;
};

export type ResponseRunnerOptions = {
  client: OpenAI;
  model: string;
  maxSteps: number;
  toolRegistry: ToolRegistry;
};

export class ResponseRunner implements AgentRunner {
  constructor(private readonly options: ResponseRunnerOptions) {}

  async run(userInput: string, emit: EmitEvent, options?: Parameters<AgentRunner["run"]>[2]): Promise<string> {
    const instructions = options?.instructions ?? SYSTEM_PROMPT;
    const tools = options?.tools ?? this.options.toolRegistry.getOpenAITools();
    const maxSteps = options?.maxSteps ?? this.options.maxSteps;

    let previousResponseId: string | undefined;
    let pendingInput: string | ResponseInput = userInput;

    for (let step = 0; step < maxSteps; step++) {
      const request: ResponseCreateParamsNonStreaming = {
        model: this.options.model,
        instructions,
        input: pendingInput,
        tools,
        parallel_tool_calls: false,
      };

      if (previousResponseId) {
        request.previous_response_id = previousResponseId;
      }

      const response = await createResponse(this.options.client, request, emit);

      previousResponseId = response.id;
      const toolCalls = (response.output ?? []).filter(
        (item) => item.type === "function_call",
      );

      if (toolCalls.length === 0) {
        const finalText = response.output_text?.trim() || "我没有得到可展示的最终回复。";
        emit({ type: "assistant_message", content: finalText });
        return finalText;
      }

      const toolOutputs: ResponseInput = [];

      for (const call of toolCalls) {
        if (!call.name || !call.call_id) {
          throw new AgentError("Model returned an invalid tool call.");
        }

        const args = parseToolArguments(call.arguments);
        const startedAt = Date.now();
        emit({
          type: "tool_call_started",
          toolName: call.name,
          callId: call.call_id,
          args,
        });

        try {
          const result = await this.options.toolRegistry.execute(call.name, args);
          emit({
            type: "tool_call_finished",
            toolName: call.name,
            callId: call.call_id,
            result,
            elapsedMs: Date.now() - startedAt,
          });

          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(result),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({
            type: "tool_call_failed",
            toolName: call.name,
            callId: call.call_id,
            message,
          });

          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: message }),
          });
        }
      }

      pendingInput = toolOutputs;
    }

    throw new AgentError(`Agent exceeded max steps (${maxSteps}).`);
  }
}

async function createResponse(
  client: OpenAI,
  request: ResponseCreateParamsNonStreaming,
  emit: EmitEvent,
): Promise<ResponseLike> {
  const streamingRequest: ResponseCreateParamsStreaming = {
    ...request,
    stream: true,
  };
  const stream = await client.responses.create(streamingRequest);
  let completedResponse: ResponseLike | undefined;

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      emit({ type: "assistant_delta", content: event.delta });
    }

    if (event.type === "response.completed") {
      completedResponse = event.response as ResponseLike;
    }
  }

  if (!completedResponse) {
    throw new AgentError("Responses stream ended without a completed response.");
  }

  return completedResponse;
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
