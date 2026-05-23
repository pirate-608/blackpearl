import fs from "node:fs/promises";
import path from "node:path";
import type { AgentEvent } from "../agent/events.js";

export type TranscriptRecord =
  | {
      kind: "event";
      sessionId: string;
      createdAt: string;
      event: AgentEvent;
    }
  | {
      kind: "message";
      sessionId: string;
      createdAt: string;
      role: "user" | "assistant";
      content: string;
    };

export class TranscriptStore {
  private readonly filePath: string;

  constructor(workspaceRoot: string, sessionId: string) {
    this.filePath = TranscriptStore.getFilePath(workspaceRoot, sessionId);
  }

  static getFilePath(workspaceRoot: string, sessionId: string): string {
    return path.join(workspaceRoot, ".agent-sessions", `${sessionId}.jsonl`);
  }

  async append(record: TranscriptRecord): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  static async readSession(
    workspaceRoot: string,
    sessionId: string,
  ): Promise<TranscriptRecord[]> {
    const filePath = TranscriptStore.getFilePath(workspaceRoot, sessionId);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TranscriptRecord);
    } catch (error) {
      if (isNodeFileNotFound(error)) {
        return [];
      }
      throw error;
    }
  }
}

function isNodeFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
