import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryContextPrompt,
  getShortTermMemory,
  MemoryStore,
} from "./memory-store.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blackpearl-memory-"));
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("MemoryStore", () => {
  it("stores and retrieves relevant long-term memories", async () => {
    const store = new MemoryStore(workspaceRoot);

    await store.rememberConversation("我喜欢用 DeepSeek 做推理任务", "已经记住。");
    await store.rememberConversation("天气很好", "是的。");

    const results = await store.search("DeepSeek 推理");

    expect(results[0]?.summary).toContain("DeepSeek");
  });

  it("formats short-term and long-term memory context", () => {
    const prompt = createMemoryContextPrompt({
      shortTerm: getShortTermMemory([
        { role: "user", content: "第一条", createdAt: "2026-01-01T00:00:00.000Z" },
        { role: "assistant", content: "第二条", createdAt: "2026-01-01T00:00:01.000Z" },
      ]),
      longTerm: [
        {
          id: "memory-1",
          createdAt: "2026-01-01T00:00:02.000Z",
          source: "conversation",
          summary: "User prefers TypeScript.",
          keywords: ["typescript"],
        },
      ],
    });

    expect(prompt).toContain("Long-term memory candidates");
    expect(prompt).toContain("Recent conversation");
  });
});
