import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  it("defaults to responses mode", () => {
    delete process.env.OPENAI_API_MODE;
    delete process.env.BLACKPEARL_PROVIDER;

    expect(loadConfig().apiMode).toBe("responses");
    expect(loadConfig().provider).toBe("openai");
  });

  it("accepts chat_completions mode", () => {
    process.env.OPENAI_API_MODE = "chat_completions";

    expect(loadConfig().apiMode).toBe("chat_completions");
  });

  it("falls back to responses for unknown modes", () => {
    process.env.OPENAI_API_MODE = "unknown";

    expect(loadConfig().apiMode).toBe("responses");
  });
});
