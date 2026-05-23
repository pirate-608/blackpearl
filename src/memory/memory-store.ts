import fs from "node:fs/promises";
import path from "node:path";
import type { ConversationMessage } from "../agent/session.js";

export type MemoryRecord = {
  id: string;
  createdAt: string;
  source: "conversation";
  summary: string;
  keywords: string[];
};

export type MemoryContext = {
  shortTerm: ConversationMessage[];
  longTerm: MemoryRecord[];
};

const MAX_LONG_TERM_RESULTS = 5;
const MAX_KEYWORDS = 12;
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "you",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  "what",
  "when",
  "where",
  "which",
  "然后",
  "一下",
  "这个",
  "那个",
  "请你",
  "我们",
  "你们",
  "他们",
]);

export class MemoryStore {
  private readonly filePath: string;

  constructor(workspaceRoot: string) {
    this.filePath = path.join(workspaceRoot, ".blackpearl", "memory.jsonl");
  }

  async search(query: string, limit = MAX_LONG_TERM_RESULTS): Promise<MemoryRecord[]> {
    const records = await this.readAll();
    const queryKeywords = extractKeywords(query);

    if (queryKeywords.length === 0) {
      return records.slice(-limit).reverse();
    }

    return records
      .map((record) => ({
        record,
        score: scoreMemory(record, queryKeywords),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.record);
  }

  async rememberConversation(userInput: string, assistantOutput: string): Promise<void> {
    const summary = summarizeExchange(userInput, assistantOutput);

    if (!summary) {
      return;
    }

    const record: MemoryRecord = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      source: "conversation",
      summary,
      keywords: extractKeywords(`${userInput} ${assistantOutput}`),
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  private async readAll(): Promise<MemoryRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");

      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown)
        .filter(isMemoryRecord);
    } catch (error) {
      if (isNodeFileNotFound(error)) {
        return [];
      }

      throw error;
    }
  }
}

export function createMemoryContextPrompt(context: MemoryContext): string {
  const parts: string[] = [];

  if (context.longTerm.length > 0) {
    parts.push(
      [
        "Long-term memory candidates:",
        ...context.longTerm.map((memory, index) => `${index + 1}. ${memory.summary}`),
      ].join("\n"),
    );
  }

  if (context.shortTerm.length > 0) {
    parts.push(
      [
        "Recent conversation:",
        ...context.shortTerm.map(
          (message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
        ),
      ].join("\n"),
    );
  }

  if (parts.length === 0) {
    return "";
  }

  return [
    "Use the following memory context only when it is relevant. Do not mention the memory system unless asked.",
    ...parts,
  ].join("\n\n");
}

export function getShortTermMemory(messages: ConversationMessage[], limit = 8): ConversationMessage[] {
  return messages.slice(-limit);
}

function summarizeExchange(userInput: string, assistantOutput: string): string {
  const user = collapseWhitespace(userInput);
  const assistant = collapseWhitespace(assistantOutput);

  if (!user && !assistant) {
    return "";
  }

  return `User asked: ${truncate(user, 220)} | Assistant answered: ${truncate(assistant, 360)}`;
}

function scoreMemory(record: MemoryRecord, queryKeywords: string[]): number {
  const memoryKeywords = new Set(record.keywords);
  let score = 0;

  for (const keyword of queryKeywords) {
    if (memoryKeywords.has(keyword)) {
      score += 3;
    }

    if (record.summary.toLowerCase().includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

function extractKeywords(text: string): string[] {
  const words = collapseWhitespace(text)
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]{2,}/gu);

  if (!words) {
    return [];
  }

  return [...new Set(words)]
    .filter((word) => !STOP_WORDS.has(word))
    .slice(0, MAX_KEYWORDS);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function isMemoryRecord(value: unknown): value is MemoryRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    value.source === "conversation" &&
    typeof value.summary === "string" &&
    Array.isArray(value.keywords)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
