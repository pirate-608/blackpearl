import { randomUUID } from "node:crypto";
import type { AgentEvent } from "./events.js";

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
  readonly id = randomUUID();
  readonly messages: ConversationMessage[] = [];
  readonly activities: ActivityItem[] = [];

  addUserMessage(content: string): void {
    this.messages.push({
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    });
  }

  addAssistantMessage(content: string): void {
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

    if (event.type === "error") {
      this.addActivity("error", event.message);
    }
  }
}

function summarizeValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) {
    return "";
  }

  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
