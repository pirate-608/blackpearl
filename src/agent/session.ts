import { randomUUID } from "node:crypto";
import type { AgentEvent } from "./events.js";
import type { TranscriptRecord } from "../storage/transcript-store.js";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ActivityItem = {
  id: string;
  label: string;
  detail?: string;
  createdAt: string;
};

export class AgentSession {
  readonly id: string;
  readonly messages: ConversationMessage[] = [];
  readonly activities: ActivityItem[] = [];
  private streamingAssistantIndex: number | undefined;

  constructor(sessionId?: string) {
    this.id = sessionId ?? randomUUID();
  }

  addUserMessage(content: string): void {
    this.messages.push({
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    });
  }

  addAssistantMessage(content: string): void {
    if (this.streamingAssistantIndex !== undefined) {
      const streamingMessage = this.messages[this.streamingAssistantIndex];

      if (streamingMessage?.role === "assistant") {
        streamingMessage.content = content;
        this.streamingAssistantIndex = undefined;
        return;
      }
    }

    this.messages.push({
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
    });
  }

  addActivity(label: string, detail?: string): void {
    const item: ActivityItem = {
      id: randomUUID(),
      label,
      createdAt: new Date().toISOString(),
    };

    if (detail !== undefined) {
      item.detail = detail;
    }

    this.activities.push(item);
  }

  applyEvent(event: AgentEvent): void {
    if (event.type === "tool_call_started") {
      this.streamingAssistantIndex = undefined;
      this.addActivity(`tool: ${event.toolName}`, JSON.stringify(event.args));
      return;
    }

    if (event.type === "tool_call_finished") {
      this.addActivity(
        `done: ${event.toolName}`,
        `${event.elapsedMs}ms ${summarizeValue(event.result)}`,
      );
      return;
    }

    if (event.type === "tool_call_failed") {
      this.addActivity(`failed: ${event.toolName}`, event.message);
      return;
    }

    if (event.type === "assistant_delta") {
      this.appendAssistantDelta(event.content);
      return;
    }

    if (event.type === "assistant_message") {
      this.addAssistantMessage(event.content);
      return;
    }

    if (event.type === "plan_created") {
      this.streamingAssistantIndex = undefined;
      this.addActivity("plan", event.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
      return;
    }

    if (event.type === "step_started") {
      this.addActivity(`[${event.stepIndex + 1}/${event.totalSteps}] ${event.step}`);
      return;
    }

    if (event.type === "step_completed") {
      this.addActivity(`done [${event.stepIndex + 1}/${event.totalSteps}]`, summarizeValue(event.result));
      return;
    }

    if (event.type === "error") {
      this.streamingAssistantIndex = undefined;
      this.addActivity("error", event.message);
    }
  }

  /** Replace the current session content with a loaded transcript */
  switchTo(sessionId: string, records: TranscriptRecord[]): void {
    (this.id as string) = sessionId;
    this.messages.splice(0);
    this.activities.splice(0);
    this.streamingAssistantIndex = undefined;

    for (const record of records) {
      if (record.kind === "message") {
        this.messages.push({
          role: record.role,
          content: record.content,
          createdAt: record.createdAt,
        });
      } else if (record.kind === "event") {
        this.applyEvent(record.event);
      }
    }
  }

  private appendAssistantDelta(content: string): void {
    if (!content) {
      return;
    }

    if (this.streamingAssistantIndex === undefined) {
      this.messages.push({
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      });
      this.streamingAssistantIndex = this.messages.length - 1;
      return;
    }

    const message = this.messages[this.streamingAssistantIndex];

    if (!message || message.role !== "assistant") {
      this.streamingAssistantIndex = undefined;
      this.appendAssistantDelta(content);
      return;
    }

    message.content += content;
  }
}

function summarizeValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) {
    return "";
  }

  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
