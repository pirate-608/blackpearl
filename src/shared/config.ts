import "dotenv/config";
import type { ProviderId } from "../llm/providers.js";

export type ApiMode = "responses" | "chat_completions";

export type AppConfig = {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  subagentModel: string | undefined;
  provider: ProviderId;
  apiMode: ApiMode;
  maxSteps: number;
  workspaceRoot: string;
};

const DEFAULT_MODEL = "gpt-4.1-mini";

export function loadConfig(): AppConfig {
  const maxSteps = Number.parseInt(process.env.AGENT_MAX_STEPS ?? "6", 10);
  const apiMode = parseApiMode(
    process.env.BLACKPEARL_API_MODE ?? process.env.OPENAI_API_MODE,
  );

  return {
    apiKey: readOptionalEnv("BLACKPEARL_API_KEY") ?? readOptionalEnv("OPENAI_API_KEY"),
    baseUrl:
      readOptionalEnv("BLACKPEARL_BASE_URL") ?? readOptionalEnv("OPENAI_BASE_URL"),
    model: readOptionalEnv("BLACKPEARL_MODEL") ?? readOptionalEnv("OPENAI_MODEL") ?? DEFAULT_MODEL,
    subagentModel: readOptionalEnv("BLACKPEARL_SUBAGENT_MODEL"),
    provider: parseProvider(process.env.BLACKPEARL_PROVIDER),
    apiMode,
    maxSteps: Number.isFinite(maxSteps) ? maxSteps : 6,
    workspaceRoot: process.cwd(),
  };
}

function parseProvider(value: string | undefined): ProviderId {
  if (
    value === "openai" ||
    value === "gemini" ||
    value === "claude" ||
    value === "deepseek" ||
    value === "ollama"
  ) {
    return value;
  }

  return "openai";
}

function parseApiMode(value: string | undefined): ApiMode {
  if (value === "chat_completions" || value === "responses") {
    return value;
  }

  return "responses";
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
