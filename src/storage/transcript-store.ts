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
    this.filePath = path.join(workspaceRoot, ".agent-sessions", `${sessionId}.jsonl`);
  }

  async append(record: TranscriptRecord): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }
}
