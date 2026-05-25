import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  it("defaults to responses mode", () => {
    delete process.env.BLACKPEARL_API_MODE;
    delete process.env.OPENAI_API_MODE;
    delete process.env.BLACKPEARL_PROVIDER;

    expect(loadConfig().apiMode).toBe("responses");
    expect(loadConfig().provider).toBe("openai");
  });

  it("accepts chat_completions mode", () => {
    process.env.BLACKPEARL_API_MODE = "chat_completions";

    expect(loadConfig().apiMode).toBe("chat_completions");
  });

  it("falls back to responses for unknown modes", () => {
    process.env.BLACKPEARL_API_MODE = "unknown";

    expect(loadConfig().apiMode).toBe("responses");
  });

  it("prefers BLACKPEARL model configuration over legacy OpenAI variables", () => {
    process.env.BLACKPEARL_API_KEY = "blackpearl-key";
    process.env.BLACKPEARL_BASE_URL = "https://blackpearl.example/v1";
    process.env.BLACKPEARL_MODEL = "blackpearl-model";
    process.env.BLACKPEARL_SUBAGENT_MODEL = "blackpearl-subagent";
    process.env.OPENAI_API_KEY = "legacy-key";
    process.env.OPENAI_BASE_URL = "https://legacy.example/v1";
    process.env.OPENAI_MODEL = "legacy-model";

    expect(loadConfig()).toMatchObject({
      apiKey: "blackpearl-key",
      baseUrl: "https://blackpearl.example/v1",
      model: "blackpearl-model",
      subagentModel: "blackpearl-subagent",
    });
  });

  it("keeps legacy OpenAI environment variables as fallback", () => {
    delete process.env.BLACKPEARL_API_KEY;
    delete process.env.BLACKPEARL_BASE_URL;
    delete process.env.BLACKPEARL_MODEL;
    process.env.OPENAI_API_KEY = "legacy-key";
    process.env.OPENAI_BASE_URL = "https://legacy.example/v1";
    process.env.OPENAI_MODEL = "legacy-model";

    expect(loadConfig()).toMatchObject({
      apiKey: "legacy-key",
      baseUrl: "https://legacy.example/v1",
      model: "legacy-model",
    });
  });
});
