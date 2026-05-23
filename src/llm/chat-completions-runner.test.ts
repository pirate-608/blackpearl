import { describe, expect, it } from "vitest";
import {
  toAssistantToolCallMessage,
  toChatCompletionTools,
} from "./chat-completions-runner.js";

describe("toChatCompletionTools", () => {
  it("converts response-style function tools to chat completions tools", () => {
    const tools = toChatCompletionTools([
      {
        type: "function",
        name: "calculator",
        description: "Safely evaluate a mathematical expression.",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
            },
          },
        },
        strict: false,
      },
    ]);

    expect(tools).toEqual([
      {
        type: "function",
        function: {
          name: "calculator",
          description: "Safely evaluate a mathematical expression.",
          parameters: {
            type: "object",
            properties: {
              expression: {
                type: "string",
              },
            },
          },
          strict: false,
        },
      },
    ]);
  });
});

describe("toAssistantToolCallMessage", () => {
  it("converts tool-call messages for chat-completions followups", () => {
    const message = toAssistantToolCallMessage(
      {
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "calculator",
              arguments: "{\"expression\":\"1+1\"}",
            },
          },
        ],
      },
    );

    expect(message.tool_calls?.[0]?.id).toBe("call_1");
  });
});
