import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConnectionStore } from "./connection-store.js";
import { defaultConnectionFor, getConnectionsFilePath } from "./providers.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blackpearl-agent-"));
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("ConnectionStore", () => {
  it("migrates legacy official DeepSeek endpoints to the Anthropic-compatible endpoint", async () => {
    const filePath = getConnectionsFilePath(workspaceRoot);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      `${JSON.stringify({
        activeProvider: "deepseek",
        connections: {
          deepseek: {
            provider: "deepseek",
            apiKey: "test-key",
            model: "deepseek-v4-pro",
            baseUrl: "https://api.deepseek.com/v1",
            apiMode: "chat_completions",
          },
        },
      })}\n`,
      "utf8",
    );

    const store = new ConnectionStore(workspaceRoot, defaultConnectionFor("openai"));
    await store.load();

    expect(store.getActiveConnection()).toMatchObject({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/anthropic",
    });
  });

  it("keeps custom DeepSeek proxy endpoints intact", async () => {
    const store = new ConnectionStore(workspaceRoot, defaultConnectionFor("openai"));
    await store.saveConnection({
      provider: "deepseek",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      baseUrl: "https://proxy.example.com/deepseek/anthropic",
      apiMode: "chat_completions",
    });

    expect(store.getActiveConnection().baseUrl).toBe(
      "https://proxy.example.com/deepseek/anthropic",
    );
  });
});
