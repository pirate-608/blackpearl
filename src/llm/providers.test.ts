import { describe, expect, it } from "vitest";
import { defaultConnectionFor, getProviderProfile, providerProfiles } from "./providers.js";

describe("providerProfiles", () => {
  it("defines the five supported backends", () => {
    expect(providerProfiles.map((profile) => profile.id)).toEqual([
      "openai",
      "gemini",
      "claude",
      "deepseek",
      "ollama",
    ]);
  });

  it("uses Anthropic-compatible mode for DeepSeek", () => {
    const connection = defaultConnectionFor("deepseek");

    expect(getProviderProfile("deepseek").kind).toBe("anthropic");
    expect(connection.apiMode).toBe("chat_completions");
    expect(connection.baseUrl).toBe("https://api.deepseek.com/anthropic");
  });
});
