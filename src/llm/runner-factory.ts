import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ToolRegistry } from "../tools/registry.js";
import { ChatCompletionsRunner } from "./chat-completions-runner.js";
import { ClaudeRunner } from "./claude-runner.js";
import { ResponseRunner } from "./response-runner.js";
import type { AgentRunner } from "./types.js";
import { getProviderProfile, type ModelConnection } from "./providers.js";

export type RunnerFactoryOptions = {
  connection: ModelConnection;
  maxSteps: number;
  toolRegistry: ToolRegistry;
};

export function createRunner(options: RunnerFactoryOptions): AgentRunner {
  const profile = getProviderProfile(options.connection.provider);

  if (profile.kind === "anthropic") {
    return new ClaudeRunner({
      client: new Anthropic({
        apiKey: options.connection.apiKey,
        baseURL: options.connection.baseUrl,
      }),
      model: options.connection.model,
      maxSteps: options.maxSteps,
      toolRegistry: options.toolRegistry,
    });
  }

  const client = new OpenAI({
    apiKey: options.connection.apiKey || "ollama",
    baseURL: options.connection.baseUrl,
  });

  if (options.connection.apiMode === "chat_completions") {
    return new ChatCompletionsRunner({
      client,
      model: options.connection.model,
      maxSteps: options.maxSteps,
      toolRegistry: options.toolRegistry,
    });
  }

  return new ResponseRunner({
    client,
    model: options.connection.model,
    maxSteps: options.maxSteps,
    toolRegistry: options.toolRegistry,
  });
}
