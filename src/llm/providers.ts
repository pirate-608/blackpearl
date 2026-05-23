import path from "node:path";
import type { ApiMode } from "../shared/config.js";

export type ProviderId = "openai" | "gemini" | "claude" | "deepseek" | "ollama";

export type ProviderKind = "openai_compatible" | "anthropic";

export type ProviderProfile = {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  defaultBaseUrl?: string;
  defaultModel: string;
  defaultApiMode: ApiMode;
  requiresApiKey: boolean;
  notes: string;
};

export type ModelConnection = {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  apiMode: ApiMode;
};

export const providerProfiles: ProviderProfile[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai_compatible",
    defaultModel: "gpt-4.1-mini",
    defaultApiMode: "responses",
    requiresApiKey: true,
    notes: "Default provider. Uses Responses API unless changed.",
  },
  {
    id: "gemini",
    label: "Gemini",
    kind: "openai_compatible",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    defaultApiMode: "chat_completions",
    requiresApiKey: true,
    notes: "Uses Google's OpenAI-compatible endpoint.",
  },
  {
    id: "claude",
    label: "Claude",
    kind: "anthropic",
    defaultModel: "claude-sonnet-4-5",
    defaultApiMode: "chat_completions",
    requiresApiKey: true,
    notes: "Uses Anthropic Messages API.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "anthropic",
    defaultBaseUrl: "https://api.deepseek.com/anthropic",
    defaultModel: "deepseek-v4-pro",
    defaultApiMode: "chat_completions",
    requiresApiKey: true,
    notes: "Uses DeepSeek's Anthropic-compatible endpoint for thinking-mode compatibility.",
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "openai_compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:3b",
    defaultApiMode: "chat_completions",
    requiresApiKey: false,
    notes: "Local OpenAI-compatible Ollama endpoint.",
  },
];

export function getProviderProfile(provider: ProviderId): ProviderProfile {
  const profile = providerProfiles.find((candidate) => candidate.id === provider);

  if (!profile) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return profile;
}

export function isProviderId(value: string): value is ProviderId {
  return providerProfiles.some((profile) => profile.id === value);
}

export function defaultConnectionFor(provider: ProviderId): ModelConnection {
  const profile = getProviderProfile(provider);
  const connection: ModelConnection = {
    provider,
    model: profile.defaultModel,
    apiMode: profile.defaultApiMode,
  };

  if (profile.defaultBaseUrl) {
    connection.baseUrl = profile.defaultBaseUrl;
  }

  return connection;
}

export function getConnectionLabel(connection: ModelConnection): string {
  return `${connection.provider}:${connection.model}`;
}

export function getConnectionsFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".blackpearl", "connections.json");
}
