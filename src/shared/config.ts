import "dotenv/config";
import type { ProviderId } from "../llm/providers.js";

export type ApiMode = "responses" | "chat_completions";

export type AppConfig = {
  openaiApiKey: string | undefined;
  openaiBaseUrl: string | undefined;
  openaiModel: string;
  provider: ProviderId;
  apiMode: ApiMode;
  maxSteps: number;
  workspaceRoot: string;
};

const DEFAULT_MODEL = "gpt-4.1-mini";

export function loadConfig(): AppConfig {
  const maxSteps = Number.parseInt(process.env.AGENT_MAX_STEPS ?? "6", 10);
  const apiMode = parseApiMode(process.env.OPENAI_API_MODE);

  return {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
    openaiModel: process.env.OPENAI_MODEL || DEFAULT_MODEL,
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
